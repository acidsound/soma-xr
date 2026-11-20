import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  VRM,
  VRMHumanBoneName,
  VRMLoaderPlugin,
  VRMUtils,
} from '@pixiv/three-vrm';
import type {
  AvatarRuntimeStatus,
  GazeMode,
  NpcEmotionType,
  PersonaProfile,
  PlaygroundAvatarActivity,
  SomaMotionStyle,
} from '../types';
import { DEFAULT_VRM_URL } from '../constants';
import {
  computeGazeAngles,
  mapEmotionToExpressionWeights,
} from '../sim/romanceEngine';
import {
  SOMA_JOINT_NAMES,
  SOMA_TO_VRM_BONE,
  type SomaPoseFrame,
} from '../sim/somaRig';
import { SomaVrmRetargeter } from '../soma/somaVrmRetargeter';
import { ProceduralVrmAvatar } from './ProceduralVrmAvatar';
import { SomaOnnxEngine } from './SomaOnnxEngine';

const _headWorldPos = new THREE.Vector3();
const _targetWorldPos = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _camUp = new THREE.Vector3();
const _avatarForward = new THREE.Vector3();
const _toTarget = new THREE.Vector3();
const _leftHandPos = new THREE.Vector3();
const _rightHandPos = new THREE.Vector3();
const _axisX = new THREE.Vector3(1, 0, 0);
const _axisY = new THREE.Vector3(0, 1, 0);
const _tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const _tmpQuat = new THREE.Quaternion();
const _qPitch = new THREE.Quaternion();
const _qYaw = new THREE.Quaternion();
const _qTarget = new THREE.Quaternion();

export class VrmAvatarController extends THREE.Group {
  public readonly somaEngine = new SomaOnnxEngine();

  private proceduralAvatar: ProceduralVrmAvatar;
  private externalVrm: VRM | null = null;
  private externalVrmLabel = 'mech_girl.vrm';
  private somaRetargeter: SomaVrmRetargeter | null = null;
  private lookAtAnchor = new THREE.Object3D();

  private activePersona: PersonaProfile;
  private currentNpcEmotion: NpcEmotionType = 'happy';
  private gazeMode: GazeMode = 'lock_eyes';
  private gazeTrackingEnabled = true;

  // Real-time gaze input offsets (desktop cursor NDC or webcam face offset)
  private pointerNdc = { x: 0, y: 0 };
  private webcamFaceOffset: { x: number; y: number } | null = null;

  // Smoothed state
  private smoothedHeadYaw = 0;
  private smoothedHeadPitch = 0;
  private smoothedEyeYaw = 0;
  private smoothedEyePitch = 0;
  private blinkTimer = 2.4;
  private blinkAmount = 0;
  private currentExpressions = {
    happy: 0.2,
    sad: 0,
    angry: 0,
    relaxed: 0.6,
    surprised: 0,
    blush: 0.15,
  };
  private smoothedBones = new Map<string, { x: number; y: number; z: number }>();

  public onRuntimeChanged?: () => void;

  constructor(initialPersona: PersonaProfile) {
    super();
    this.name = 'AvatarControllerRoot';
    this.activePersona = initialPersona;
    this.proceduralAvatar = new ProceduralVrmAvatar(initialPersona);
    // The procedural rig is kept for pose/expression plumbing only. The initial
    // screen must show mech_girl.vrm alone, so it is never added to the scene.
    this.proceduralAvatar.visible = false;
    this.lookAtAnchor.position.set(0, 1.5, 2.0);
  }

  /**
   * Initializes both the MotionBricks SOMA-77 runtime datasets and the default
   * VRM avatar (`/assets/vrm/mech_girl.vrm`) in parallel, automatically wiring
   * up the exact SOMA-77 -> VRM retargeter once both are loaded.
   */
  public async initDefaultAssets(): Promise<void> {
    await Promise.allSettled([
      this.somaEngine.initMotionBricksRuntime(),
      this.loadVrmFromUrl(DEFAULT_VRM_URL, 'mech_girl.vrm'),
    ]);
    this.rebuildSomaRetargeter();
    this.onRuntimeChanged?.();
  }

  public getRuntimeStatus(): AvatarRuntimeStatus {
    const meta = this.externalVrm?.meta;
    const metaName =
      meta && 'name' in meta && meta.name
        ? meta.name
        : meta && 'title' in meta && meta.title
          ? meta.title
          : '';
    const label = metaName
      ? `${metaName} (${this.externalVrmLabel})`
      : this.externalVrmLabel;
    return {
      kind: this.externalVrm ? 'external-vrm' : 'builtin-vrm-rig',
      name: this.externalVrm ? label : this.activePersona.name,
      lookAtActive: this.gazeTrackingEnabled,
    };
  }

  public setPersona(persona: PersonaProfile): void {
    this.activePersona = persona;
    this.proceduralAvatar.applyPersonaPalette(persona);
  }

  public setEmotionAndMotion(
    npcEmotion: NpcEmotionType,
    somaStyle: SomaMotionStyle,
    gazeMode: GazeMode,
  ): void {
    this.currentNpcEmotion = npcEmotion;
    this.gazeMode = gazeMode;
    this.somaEngine.setStyle(somaStyle);
  }

  public setGazeTrackingEnabled(enabled: boolean): void {
    this.gazeTrackingEnabled = enabled;
  }

  public setGazeMode(mode: GazeMode): void {
    this.gazeMode = mode;
  }

  public setPointerNdc(x: number, y: number): void {
    this.pointerNdc.x = THREE.MathUtils.clamp(x, -1, 1);
    this.pointerNdc.y = THREE.MathUtils.clamp(y, -1, 1);
  }

  public setWebcamFaceOffset(offset: { x: number; y: number } | null): void {
    this.webcamFaceOffset = offset;
  }

  public async loadVrmFromUrl(
    url: string,
    displayName = 'mech_girl.vrm',
  ): Promise<AvatarRuntimeStatus> {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await loader.loadAsync(url);
    const vrm = gltf.userData.vrm as VRM | undefined;
    if (!vrm) {
      throw new Error('유효한 VRM 아바타 데이터가 파일에 없습니다.');
    }

    if (vrm.meta?.metaVersion === '0') {
      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.combineSkeletons(gltf.scene);
      VRMUtils.rotateVRM0(vrm);
    }

    this.clearExternalVrm();
    this.externalVrm = vrm;
    this.externalVrmLabel = displayName;

    // Normalize avatar height to standard ~1.56m playground scale and ground feet at y=0
    vrm.scene.updateMatrixWorld(true);
    const rawBox = new THREE.Box3().setFromObject(vrm.scene);
    const rawHeight = rawBox.max.y - rawBox.min.y;
    if (rawHeight > 0.2 && (rawHeight < 1.35 || rawHeight > 1.85)) {
      const targetHeight = 1.56;
      const scaleFactor = targetHeight / rawHeight;
      vrm.scene.scale.setScalar(scaleFactor);
      vrm.scene.updateMatrixWorld(true);
    }
    const groundedBox = new THREE.Box3().setFromObject(vrm.scene);
    if (Number.isFinite(groundedBox.min.y)) {
      vrm.scene.position.y -= groundedBox.min.y;
    }

    vrm.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        obj.frustumCulled = false;
        const lowerName = obj.name.toLowerCase();
        if (lowerName.includes('head') || lowerName.includes('hair') || lowerName.includes('face')) {
          obj.userData.interactionZone = 'head';
        } else {
          obj.userData.interactionZone = 'body';
        }
      }
    });

    if (vrm.lookAt) {
      vrm.lookAt.target = this.lookAtAnchor;
    }

    this.proceduralAvatar.visible = false;
    this.add(vrm.scene);
    this.smoothedBones.clear();
    this.rebuildSomaRetargeter();
    this.onRuntimeChanged?.();
    return this.getRuntimeStatus();
  }

  public async loadVrmFromFile(file: File): Promise<AvatarRuntimeStatus> {
    const url = URL.createObjectURL(file);
    try {
      return await this.loadVrmFromUrl(url, file.name);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  public async resetToDefaultVrm(): Promise<AvatarRuntimeStatus> {
    try {
      return await this.loadVrmFromUrl(DEFAULT_VRM_URL, 'mech_girl.vrm');
    } catch {
      return this.resetToBuiltinAvatar();
    }
  }

  public resetToBuiltinAvatar(): AvatarRuntimeStatus {
    this.clearExternalVrm();
    // Never reveal the procedural rig on screen; mech_girl.vrm is the only avatar.
    this.proceduralAvatar.visible = false;
    this.smoothedBones.clear();
    this.onRuntimeChanged?.();
    return this.getRuntimeStatus();
  }

  private rebuildSomaRetargeter(): void {
    const sk = this.somaEngine.getSkeleton();
    if (this.externalVrm && sk) {
      // Reset normalized bones to rest pose before capturing rest transforms
      this.externalVrm.humanoid?.resetNormalizedPose();
      this.externalVrm.scene.updateMatrixWorld(true);
      this.somaRetargeter = new SomaVrmRetargeter(sk, this.externalVrm);
    } else {
      this.somaRetargeter = null;
    }
  }

  private clearExternalVrm(): void {
    this.somaRetargeter = null;
    if (!this.externalVrm) return;
    this.remove(this.externalVrm.scene);
    VRMUtils.deepDispose(this.externalVrm.scene);
    this.externalVrm = null;
  }

  public updateFrame(params: {
    dt: number;
    elapsedSec: number;
    camera: THREE.Camera;
    affection: number;
    emotionIntensity: number;
    speakingEnergy: number;
    playgroundActivity: PlaygroundAvatarActivity;
    playgroundPhase: number;
  }): void {
    const dt = Math.min(Math.max(params.dt, 0.001), 0.05);

    // 1. Compute real-time gaze target in world space (camera + cursor/webcam offset)
    const headNode = this.getBoneNode('head');
    if (headNode) {
      headNode.getWorldPosition(_headWorldPos);
    } else {
      _headWorldPos.set(this.position.x, this.position.y + 1.48, this.position.z);
    }

    params.camera.getWorldPosition(_targetWorldPos);
    _camRight.set(1, 0, 0).applyQuaternion(params.camera.quaternion);
    _camUp.set(0, 1, 0).applyQuaternion(params.camera.quaternion);

    const gazeSourceX = this.webcamFaceOffset
      ? this.webcamFaceOffset.x
      : this.pointerNdc.x * 0.55;
    const gazeSourceY = this.webcamFaceOffset
      ? this.webcamFaceOffset.y
      : this.pointerNdc.y * 0.35;

    if (this.gazeTrackingEnabled) {
      _targetWorldPos.addScaledVector(_camRight, gazeSourceX);
      _targetWorldPos.addScaledVector(_camUp, gazeSourceY);
    } else {
      _avatarForward.set(0, 0, 2.0).applyQuaternion(this.quaternion);
      _targetWorldPos.copy(_headWorldPos).add(_avatarForward);
    }

    this.lookAtAnchor.position.copy(_targetWorldPos);

    // Transform target position into avatar-local space so gaze angles remain natural
    // regardless of which direction the avatar faces across the playground
    _toTarget.copy(_targetWorldPos).sub(_headWorldPos);
    const invAvatarQuat = this.quaternion.clone().invert();
    _toTarget.applyQuaternion(invAvatarQuat);

    // Reduce gaze head turn while actively vaulting / climbing / walking so motion looks natural
    const gazeWeight =
      params.playgroundActivity === 'vault_bench' ||
      params.playgroundActivity === 'vault_seesaw' ||
      params.playgroundActivity === 'vault_box' ||
      params.playgroundActivity === 'climb_slide'
        ? 0.25
        : params.playgroundActivity === 'walk' || params.playgroundActivity === 'run'
          ? 0.45
          : 1.0;

    const gaze = computeGazeAngles({
      headPos: { x: 0, y: 0, z: 0 },
      targetPos: { x: _toTarget.x, y: _toTarget.y, z: Math.max(0.4, _toTarget.z) },
      gazeMode: this.gazeTrackingEnabled ? this.gazeMode : 'lock_eyes',
      timeSec: params.elapsedSec,
    });

    const gazeLambda = 8.5;
    this.smoothedHeadYaw = THREE.MathUtils.damp(
      this.smoothedHeadYaw,
      this.gazeTrackingEnabled ? gaze.headYaw * gazeWeight : 0,
      gazeLambda,
      dt,
    );
    this.smoothedHeadPitch = THREE.MathUtils.damp(
      this.smoothedHeadPitch,
      this.gazeTrackingEnabled ? gaze.headPitch * gazeWeight : 0,
      gazeLambda,
      dt,
    );
    this.smoothedEyeYaw = THREE.MathUtils.damp(
      this.smoothedEyeYaw,
      this.gazeTrackingEnabled ? gaze.eyeYaw : 0,
      14,
      dt,
    );
    this.smoothedEyePitch = THREE.MathUtils.damp(
      this.smoothedEyePitch,
      this.gazeTrackingEnabled ? gaze.eyePitch : 0,
      14,
      dt,
    );

    // 2. Apply MotionBricks SOMA-77 pose (when VRM + SOMA-77 dataset active)
    //    or fall back to SOMA-30 procedural synthesizer for procedural rig
    const soma77Pose = this.somaEngine.sampleSoma77Pose({
      activity: params.playgroundActivity,
      phase: params.playgroundPhase,
      timeSec: params.elapsedSec,
      dt,
    });

    if (this.externalVrm && this.somaRetargeter && soma77Pose) {
      this.somaRetargeter.applyPose(soma77Pose, {
        headYaw: this.smoothedHeadYaw,
        headPitch: this.smoothedHeadPitch,
      });

      // Layer subtle expressive arm/torso gesture when idle so romance styles remain visible
      if (params.playgroundActivity === 'idle') {
        this.applyEmotionalIdleAccent(params.elapsedSec, params.speakingEnergy);
      } else if (
        params.playgroundActivity === 'pickup_ball' ||
        params.playgroundActivity === 'throw_ball'
      ) {
        this.applyBasketballHoldAndThrowOverlay(
          params.playgroundActivity,
          params.playgroundPhase,
        );
      } else if (params.playgroundActivity === 'sit_swing') {
        this.applySwingChainGripOverlay(params.playgroundPhase);
      }
    } else {
      const poseFrame = this.somaEngine.step({
        timeSec: params.elapsedSec,
        emotionIntensity: params.emotionIntensity,
        affection: params.affection,
        speakingEnergy: params.speakingEnergy,
      });
      this.applySomaPoseToBones(
        poseFrame,
        dt,
        params.playgroundActivity,
        params.elapsedSec,
      );
    }

    // 3. Blink + Expressions + Lip-sync
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      if (this.blinkTimer < -0.14) {
        this.blinkTimer = 2.6 + Math.random() * 2.4;
        this.blinkAmount = 0;
      } else {
        const phase = -this.blinkTimer / 0.14;
        this.blinkAmount = Math.sin(phase * Math.PI);
      }
    } else {
      this.blinkAmount = 0;
    }

    const targetExp = mapEmotionToExpressionWeights(this.currentNpcEmotion);
    const expLambda = 7;
    this.currentExpressions.happy = THREE.MathUtils.damp(
      this.currentExpressions.happy,
      targetExp.happy,
      expLambda,
      dt,
    );
    this.currentExpressions.sad = THREE.MathUtils.damp(
      this.currentExpressions.sad,
      targetExp.sad,
      expLambda,
      dt,
    );
    this.currentExpressions.angry = THREE.MathUtils.damp(
      this.currentExpressions.angry,
      targetExp.angry,
      expLambda,
      dt,
    );
    this.currentExpressions.relaxed = THREE.MathUtils.damp(
      this.currentExpressions.relaxed,
      targetExp.relaxed,
      expLambda,
      dt,
    );
    this.currentExpressions.surprised = THREE.MathUtils.damp(
      this.currentExpressions.surprised,
      targetExp.surprised,
      expLambda,
      dt,
    );
    this.currentExpressions.blush = THREE.MathUtils.damp(
      this.currentExpressions.blush,
      targetExp.blush,
      expLambda,
      dt,
    );

    if (this.externalVrm) {
      const em = this.externalVrm.expressionManager;
      if (em) {
        em.setValue('happy', this.currentExpressions.happy);
        em.setValue('sad', this.currentExpressions.sad);
        em.setValue('angry', this.currentExpressions.angry);
        em.setValue('relaxed', this.currentExpressions.relaxed);
        em.setValue('surprised', this.currentExpressions.surprised);
        em.setValue('blink', this.blinkAmount);
        em.setValue('aa', params.speakingEnergy * 0.85);
        em.setValue('oh', params.speakingEnergy * 0.25);
      }
      if (this.externalVrm.lookAt) {
        this.externalVrm.lookAt.target = this.gazeTrackingEnabled
          ? this.lookAtAnchor
          : undefined;
      }
      this.externalVrm.update(dt);
    } else {
      this.proceduralAvatar.setEyeGaze(this.smoothedEyeYaw, this.smoothedEyePitch);
      this.proceduralAvatar.setExpressions(
        {
          ...this.currentExpressions,
          blink: this.blinkAmount,
          mouthOpen: params.speakingEnergy,
        },
        params.elapsedSec,
      );
    }
  }

  /**
   * Computes the live world-space center between the avatar's two hands so a held
   * basketball stays cupped cleanly between her palms during pickup and throw windup.
   */
  public getHandsBallHoldWorldPosition(out: THREE.Vector3): boolean {
    const leftHand = this.getBoneNode('leftHand') || this.getBoneNode('leftLowerArm');
    const rightHand = this.getBoneNode('rightHand') || this.getBoneNode('rightLowerArm');
    if (!leftHand || !rightHand) return false;

    this.updateWorldMatrix(true, true);
    leftHand.getWorldPosition(_leftHandPos);
    rightHand.getWorldPosition(_rightHandPos);
    out.copy(_leftHandPos).add(_rightHandPos).multiplyScalar(0.5);

    // Offset slightly forward along avatar facing so the 0.22m ball sits cleanly in front of palms
    _avatarForward.set(0, 0, 0.14).applyQuaternion(this.quaternion);
    out.add(_avatarForward);
    // Keep basketball above ground radius
    out.y = Math.max(0.22, out.y);
    return true;
  }

  private applyBasketballHoldAndThrowOverlay(
    activity: 'pickup_ball' | 'throw_ball',
    phase: number,
  ): void {
    const humanoid = this.externalVrm?.humanoid;
    if (!humanoid) return;

    const leftUpper = humanoid.getNormalizedBoneNode('leftUpperArm');
    const rightUpper = humanoid.getNormalizedBoneNode('rightUpperArm');
    const leftLower = humanoid.getNormalizedBoneNode('leftLowerArm');
    const rightLower = humanoid.getNormalizedBoneNode('rightLowerArm');
    const spine = humanoid.getNormalizedBoneNode('spine');

    let blend = 0;
    let armPitch = 0; // negative = lift upward overhead, positive = reach down
    let armInward = 1.24; // swing arms forward (+Z) to cradle ball
    let elbowBend = 0.42;
    let spinePitch = 0;

    if (activity === 'pickup_ball') {
      // SOMA ardy:pickup bends the body down (0..0.44); smoothly bring both arms
      // together to scoop the basketball and lift it up to chest height (0.44..1.0).
      if (phase < 0.28) {
        blend = THREE.MathUtils.smoothstep(phase, 0.08, 0.28) * 0.55;
        armPitch = 0.55;
        elbowBend = 0.24;
      } else if (phase < 0.48) {
        blend = 0.55 + THREE.MathUtils.smoothstep(phase, 0.28, 0.48) * 0.45;
        armPitch = THREE.MathUtils.lerp(0.55, 0.38, (phase - 0.28) / 0.2);
        elbowBend = 0.36;
      } else {
        blend = 1.0;
        const liftT = THREE.MathUtils.smoothstep(phase, 0.48, 1.0);
        armPitch = THREE.MathUtils.lerp(0.38, -0.14, liftT);
        elbowBend = THREE.MathUtils.lerp(0.36, 0.48, liftT);
      }
    } else {
      // throw_ball: overhead two-handed basketball pass/shot
      if (phase < 0.36) {
        // Wind up lifting ball overhead
        const u = THREE.MathUtils.smoothstep(phase, 0.0, 0.36);
        blend = 1.0;
        armPitch = THREE.MathUtils.lerp(-0.14, -1.16, u);
        armInward = THREE.MathUtils.lerp(1.24, 1.18, u);
        elbowBend = THREE.MathUtils.lerp(0.48, 0.62, u);
        spinePitch = THREE.MathUtils.lerp(0.0, -0.12, u);
      } else if (phase < 0.58) {
        // Explosive forward-upward throw & release at phase=0.42
        const u = THREE.MathUtils.smoothstep(phase, 0.36, 0.54);
        blend = 1.0;
        armPitch = THREE.MathUtils.lerp(-1.16, -0.42, u);
        armInward = THREE.MathUtils.lerp(1.18, 1.32, u);
        elbowBend = THREE.MathUtils.lerp(0.62, 0.08, u);
        spinePitch = THREE.MathUtils.lerp(-0.12, 0.14, u);
      } else {
        // Follow-through relax back into SOMA idle stance
        const u = THREE.MathUtils.smoothstep(phase, 0.58, 1.0);
        blend = 1.0 - u;
        armPitch = -0.42;
        armInward = 1.32;
        elbowBend = 0.08;
        spinePitch = 0.14 * (1 - u);
      }
    }

    if (blend <= 0.001) return;

    _qPitch.setFromAxisAngle(_axisX, armPitch);
    if (leftUpper) {
      _qYaw.setFromAxisAngle(_axisY, -armInward);
      _qTarget.copy(_qPitch).multiply(_qYaw);
      leftUpper.quaternion.slerp(_qTarget, blend);
    }
    if (rightUpper) {
      _qYaw.setFromAxisAngle(_axisY, armInward);
      _qTarget.copy(_qPitch).multiply(_qYaw);
      rightUpper.quaternion.slerp(_qTarget, blend);
    }
    if (leftLower) {
      _qTarget.setFromAxisAngle(_axisY, -elbowBend);
      leftLower.quaternion.slerp(_qTarget, blend);
    }
    if (rightLower) {
      _qTarget.setFromAxisAngle(_axisY, elbowBend);
      rightLower.quaternion.slerp(_qTarget, blend);
    }
    if (spine && Math.abs(spinePitch) > 0.001) {
      _tmpEuler.set(spinePitch * blend, 0, 0, 'YXZ');
      _tmpQuat.setFromEuler(_tmpEuler);
      spine.quaternion.multiply(_tmpQuat);
    }
  }

  private applySwingChainGripOverlay(phase: number): void {
    const humanoid = this.externalVrm?.humanoid;
    if (!humanoid) return;
    const blend = THREE.MathUtils.smoothstep(phase, 0.25, 1.0);
    if (blend <= 0.001) return;

    const leftUpper = humanoid.getNormalizedBoneNode('leftUpperArm');
    const rightUpper = humanoid.getNormalizedBoneNode('rightUpperArm');
    const leftLower = humanoid.getNormalizedBoneNode('leftLowerArm');
    const rightLower = humanoid.getNormalizedBoneNode('rightLowerArm');

    // Bring both arms slightly forward and bent at elbows to grip the twin swing chains at x=±0.27m
    _qPitch.setFromAxisAngle(_axisX, -0.32);
    if (leftUpper) {
      _qYaw.setFromAxisAngle(_axisY, -0.82);
      _qTarget.copy(_qPitch).multiply(_qYaw);
      leftUpper.quaternion.slerp(_qTarget, blend * 0.78);
    }
    if (rightUpper) {
      _qYaw.setFromAxisAngle(_axisY, 0.82);
      _qTarget.copy(_qPitch).multiply(_qYaw);
      rightUpper.quaternion.slerp(_qTarget, blend * 0.78);
    }
    if (leftLower) {
      _qTarget.setFromAxisAngle(_axisY, -0.68);
      leftLower.quaternion.slerp(_qTarget, blend * 0.78);
    }
    if (rightLower) {
      _qTarget.setFromAxisAngle(_axisY, 0.68);
      rightLower.quaternion.slerp(_qTarget, blend * 0.78);
    }
  }

  private applyEmotionalIdleAccent(timeSec: number, speakingEnergy: number): void {
    if (!this.externalVrm?.humanoid) return;
    const style = this.somaEngine.getStyle();
    const rightUpper = this.externalVrm.humanoid.getNormalizedBoneNode('rightUpperArm');
    const rightLower = this.externalVrm.humanoid.getNormalizedBoneNode('rightLowerArm');
    const head = this.externalVrm.humanoid.getNormalizedBoneNode('head');

    if (style === 'wave_greet' && rightUpper && rightLower) {
      const wave = Math.sin(timeSec * 5.2) * 0.28;
      rightUpper.rotation.z -= 1.05;
      rightUpper.rotation.x += 0.3;
      rightLower.rotation.z -= 0.7 + wave;
    } else if (style === 'head_tilt_curious' && head) {
      head.rotation.z += 0.16;
    } else if (style === 'nod_listen' && head) {
      head.rotation.x += Math.sin(timeSec * 3.8) * 0.12;
    } else if (speakingEnergy > 0.08 && head) {
      head.rotation.x += Math.sin(timeSec * 6.0) * speakingEnergy * 0.06;
    }
  }

  private getBoneNode(vrmBoneName: string): THREE.Object3D | null {
    if (this.externalVrm?.humanoid) {
      return (
        this.externalVrm.humanoid.getNormalizedBoneNode(
          vrmBoneName as VRMHumanBoneName,
        ) || null
      );
    }
    return this.proceduralAvatar.bones[vrmBoneName] || null;
  }

  private applySomaPoseToBones(
    pose: SomaPoseFrame,
    dt: number,
    activity: PlaygroundAvatarActivity,
    elapsedSec: number,
  ): void {
    const boneLambda = 11;
    for (const joint of SOMA_JOINT_NAMES) {
      const vrmBoneName = SOMA_TO_VRM_BONE[joint];
      if (!vrmBoneName) continue;
      const node = this.getBoneNode(vrmBoneName);
      if (!node) continue;

      let targetX = pose[joint].x;
      let targetY = pose[joint].y;
      let targetZ = pose[joint].z;

      // Procedural fallback locomotion cues if external VRM is unavailable
      if (activity === 'walk' || activity === 'run') {
        const freq = activity === 'run' ? 9.0 : 5.6;
        const amp = activity === 'run' ? 0.58 : 0.34;
        const swing = Math.sin(elapsedSec * freq) * amp;
        if (vrmBoneName === 'leftUpperLeg') targetX += swing;
        if (vrmBoneName === 'rightUpperLeg') targetX -= swing;
        if (vrmBoneName === 'leftUpperArm') targetX -= swing * 0.65;
        if (vrmBoneName === 'rightUpperArm') targetX += swing * 0.65;
      } else if (
        activity === 'sit_bench' ||
        activity === 'sit_seesaw' ||
        activity === 'sit_swing' ||
        activity === 'slide_down'
      ) {
        if (vrmBoneName === 'leftUpperLeg' || vrmBoneName === 'rightUpperLeg') {
          targetX = -1.35;
        }
        if (vrmBoneName === 'leftLowerLeg' || vrmBoneName === 'rightLowerLeg') {
          targetX = 1.25;
        }
      }

      if (vrmBoneName === 'neck') {
        targetY += this.smoothedHeadYaw * 0.38;
        targetX += -this.smoothedHeadPitch * 0.35;
      } else if (vrmBoneName === 'head') {
        targetY += this.smoothedHeadYaw * 0.62;
        targetX += -this.smoothedHeadPitch * 0.65;
      }

      const prev = this.smoothedBones.get(vrmBoneName) || {
        x: targetX,
        y: targetY,
        z: targetZ,
      };
      prev.x = THREE.MathUtils.damp(prev.x, targetX, boneLambda, dt);
      prev.y = THREE.MathUtils.damp(prev.y, targetY, boneLambda, dt);
      prev.z = THREE.MathUtils.damp(prev.z, targetZ, boneLambda, dt);
      this.smoothedBones.set(vrmBoneName, prev);

      node.rotation.set(prev.x, prev.y, prev.z, 'XYZ');
    }
  }

  public dispose(): void {
    this.somaEngine.dispose();
    this.clearExternalVrm();
    this.proceduralAvatar.dispose();
  }
}
