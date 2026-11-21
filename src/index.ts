import * as THREE from 'three';
import * as xb from 'xrblocks';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import type {
  ChatTurn,
  GazeMode,
  NpcEmotionType,
  PersonaProfile,
  PlaygroundCommand,
  PlaygroundCommandType,
  PlaygroundObjectId,
  RelationshipState,
  SomaMotionStyle,
} from './types';
import {
  DEFAULT_QUICK_CHOICES,
  INITIAL_RELATIONSHIP,
  PERSONAS,
} from './constants';
import {
  analyzeLocalEmotionSignal,
  applyRelationshipDelta,
  defaultSomaStyleForEmotion,
} from './sim/romanceEngine';
import {
  PlaygroundSimulation,
  parsePlaygroundCommand,
} from './sim/playgroundSim';
import { VrmAvatarController } from './avatar/VrmAvatarController';
import { PlaygroundEnvironment } from './scene/PlaygroundEnvironment';
import { SpatialSanctuaryUI } from './ui/SpatialSanctuaryUI';
import { SandboxHud } from './ui/SandboxHud';
import { TtsLipSyncPlayer, requestNpcResponse } from './services/apiClient';
import { WebcamGazeTracker } from './vision/WebcamGazeTracker';
import { XrInteractionBridge } from './xr/XrInteractionBridge';

/**
 * WebXR requires a secure context. A plain http://<LAN-IP> URL makes
 * `navigator.xr` disappear entirely on Quest Browser, which looks like a
 * permission failure but is actually a browser security restriction.
 */
function isWebXrAvailable(): boolean {
  return window.isSecureContext && 'xr' in navigator && !!navigator.xr;
}

/**
 * Pick a session mode before xrblocks initializes its session manager. The
 * manager only probes the single configured mode; guessing wrong makes it
 * dispatch UNSUPPORTED and silently fall back to the desktop simulator.
 * VR is preferred on Quest because it does not depend on passthrough consent.
 */
async function resolveXrSessionMode(): Promise<XRSessionMode> {
  const override = new URLSearchParams(window.location.search).get('xrmode');
  if (override === 'ar') return 'immersive-ar';
  if (override === 'vr') return 'immersive-vr';
  if (!isWebXrAvailable()) return 'immersive-vr';
  try {
    if (await navigator.xr!.isSessionSupported('immersive-vr')) {
      return 'immersive-vr';
    }
    if (await navigator.xr!.isSessionSupported('immersive-ar')) {
      return 'immersive-ar';
    }
  } catch {
    // Fall through to the VR default.
  }
  return 'immersive-vr';
}

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

const IS_SOFTWARE_GL = detectSoftwareWebGL();
let selectedXrMode: XRSessionMode = 'immersive-vr';

class SomaPlaygroundSandbox extends xb.Script {
  private environment!: PlaygroundEnvironment;
  private sim = new PlaygroundSimulation();
  private avatar!: VrmAvatarController;
  private spatialUI!: SpatialSanctuaryUI;
  private xrBridge!: XrInteractionBridge;
  private hud!: SandboxHud;
  private ttsPlayer = new TtsLipSyncPlayer();
  private webcamGaze = new WebcamGazeTracker();

  private readonly onXrSessionError = (event: { error: unknown }): void => {
    const detail =
      event.error instanceof Error
        ? `${event.error.name}: ${event.error.message}`
        : String(event.error);
    this.hud.setError(
      `XR 세션 시작 실패 (${selectedXrMode}): ${detail}`,
    );
  };

  private appState: 'title' | 'playing' | 'paused' = 'title';
  private activePersona: PersonaProfile = PERSONAS[0];
  private relationship: RelationshipState = { ...INITIAL_RELATIONSHIP };
  private history: ChatTurn[] = [];
  private currentReply = PERSONAS[0].greeting;
  private currentChoices: string[] = [...DEFAULT_QUICK_CHOICES];
  private currentNpcEmotion: NpcEmotionType = 'happy';
  private currentGazeMode: GazeMode = 'lock_eyes';

  private obstacleClickMode: 'sit' | 'vault' = 'sit';
  private ttsEnabled = false;
  private gazeEnabled = true;
  private spatialCardVisible = false;
  private xrModeEngaged = false;
  private isBusy = false;

  // Voice recording
  private isRecording = false;
  private mediaRecorder: MediaRecorder | null = null;
  private mediaStream: MediaStream | null = null;
  private audioChunks: BlobPart[] = [];
  private speechRecognition: SpeechRecognition | null = null;
  private interimTranscript = '';

  // Camera orbit & raycasting
  private desktopRaycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2(0, 0);
  private camYaw = 0.04;
  private camPitch = 0.26;
  private camDist = 6.7;
  private isOrbitDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private pointerDownPos = { x: 0, y: 0 };
  private targetCamPos = new THREE.Vector3(0.3, 2.75, 7.6);
  private targetLookAt = new THREE.Vector3(0.2, 1.0, -0.8);
  private heldBallWorldPos = new THREE.Vector3();
  private lastHudActivity = '';
  private lastHudClip = '';

  init(): void {
    const scene = xb.core.scene;
    const renderer = xb.core.renderer as unknown as THREE.WebGLRenderer;

    xb.core.webXRSessionManager?.addEventListener(
      xb.WebXRSessionEventType.SESSION_ERROR,
      this.onXrSessionError,
    );

    if (renderer) {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.94;
      renderer.setPixelRatio(
        IS_SOFTWARE_GL ? 1 : Math.min(window.devicePixelRatio || 1, 2),
      );
      if ('shadowMap' in renderer && renderer.shadowMap) {
        renderer.shadowMap.enabled = !IS_SOFTWARE_GL;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      }

      try {
        const pmrem = new THREE.PMREMGenerator(renderer);
        scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        pmrem.dispose();
      } catch (err) {
        console.warn('[SomaPlaygroundSandbox] RoomEnvironment skipped:', err);
      }
    }

    // Horizon-matched golden-hour park fog
    scene.fog = new THREE.FogExp2(0xe6cfb6, 0.018);

    this.environment = new PlaygroundEnvironment({ isSoftwareGl: IS_SOFTWARE_GL });
    this.add(this.environment);

    this.avatar = new VrmAvatarController(this.activePersona);
    const snap = this.sim.getSnapshot();
    this.avatar.position.set(snap.avatar.x, snap.avatar.y, snap.avatar.z);
    this.avatar.rotation.y = snap.avatar.yaw;
    this.avatar.onRuntimeChanged = () => this.syncAllUI();
    this.avatar.somaEngine.onStatusChange = () => this.syncAllUI();
    this.add(this.avatar);

    // Load default /assets/vrm/mech_girl.vrm + MotionBricks SOMA-77 runtime datasets
    void this.avatar.initDefaultAssets();

    this.spatialUI = new SpatialSanctuaryUI({
      onPlaygroundAction: (cmd) => this.triggerPlaygroundCommand(cmd),
      onVoiceToggle: () => void this.toggleVoiceRecording(),
    });
    this.add(this.spatialUI);

    this.xrBridge = new XrInteractionBridge({
      isPlaying: () => this.appState === 'playing',
      isXrActive: () => this.isXrActive(),
      isMovementAllowed: () => this.isMovementAllowed(),
      onSummonUI: () => this.summonSpatialUI(),
      onPlaygroundAction: (cmd) => this.triggerPlaygroundCommand(cmd),
      onPlaygroundObject: (id) => this.handlePlaygroundObjectInteraction(id, false),
      onMoveAvatar: (x, z) => {
        // Ground select while teleport is not armed: send the NPC there.
        this.sim.issueCommand({ type: 'move_to', targetX: x, targetZ: z });
        this.syncAllUI();
      },
      onHeadPat: () => {
        this.avatar.setEmotionAndMotion('blush', 'shy_fidget', 'shy_avert');
        void this.sendUserMessage('(다정하게 머리를 쓰다듬어 준다)', 'head_pat');
      },
      onDebug: (tag, data) => {
        void fetch('/api/xr-debug', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag, ...data }),
        }).catch(() => undefined);
      },
      onVoiceToggle: () => void this.toggleVoiceRecording(),
      onCallAvatar: () => this.callAvatarToUser(),
    });
    this.add(this.xrBridge);

    const rootEl = document.getElementById('root') || document.body;
    this.hud = new SandboxHud(rootEl, {
      onStartGame: () => this.enterPlaying(),
      onPauseToggle: () => this.togglePause(),
      onResetRelationship: () => this.resetRelationship(),
      onResetPlayground: () => this.resetPlayground(),
      onReturnTitle: () => this.enterTitle(),
      onSendMessage: (text) => void this.sendUserMessage(text, 'text_chat'),
      onTriggerPlaygroundCommand: (cmd, prompt) =>
        this.triggerPlaygroundCommand(cmd, prompt),
      onToggleObstacleClickMode: () => this.toggleObstacleClickMode(),
      onToggleVoiceRecording: () => void this.toggleVoiceRecording(),
      onToggleTts: () => this.toggleTts(),
      onToggleGazeTracking: () => this.toggleGazeTracking(),
      onToggleWebcamGaze: () => void this.toggleWebcamGaze(),
      onChangeGazeMode: (mode) => this.changeGazeMode(mode),
      onSelectSomaStyle: (style) => this.selectSomaStyle(style),
      onSelectPersona: (id) => this.selectPersona(id),
      onLoadVrmFile: (file) => void this.loadVrmFile(file),
      onResetVrm: () => void this.resetVrm(),
      onLoadCloudOnnx: () => void this.loadCloudOnnx(),
      onLoadOnnxFile: (file) => void this.loadOnnxFile(file),
      onResetOnnx: () => this.resetOnnx(),
      onToggleSpatialCard: () => this.toggleSpatialCard(),
      onEnterXR: () => void this.enterXrOrSimulator(),
    });

    this.bindPointerAndCameraControls();
    this.exposeDebugHooks();

    const autostart = new URLSearchParams(window.location.search).has('autostart');
    if (autostart) {
      this.enterPlaying();
    } else {
      this.enterTitle();
    }
    this.syncAllUI();
    this.syncToggles();
  }

  private exposeDebugHooks(): void {
    (window as unknown as Record<string, unknown>).__playground = {
      getSnapshot: () => this.sim.getSnapshot(),
      issueCommand: (cmd: PlaygroundCommand) => {
        this.sim.issueCommand(cmd);
        this.syncAllUI();
      },
      setCameraOrbit: (yaw: number, pitch: number, dist: number) => {
        this.camYaw = yaw;
        this.camPitch = pitch;
        this.camDist = dist;
      },
      getAvatarStatus: () => this.avatar.getRuntimeStatus(),
      getSomaStatus: () => this.avatar.somaEngine.getStatus(),
      getXrStatus: () => ({
        simulatorRunning: xb.core.simulatorRunning,
        presenting: !!xb.core.renderer?.xr?.isPresenting,
        xrSupported: xb.core.webXRSessionManager?.isXRSupported() ?? null,
        sessionMode: selectedXrMode,
        movementAllowed: this.isMovementAllowed(),
        secureContext: window.isSecureContext,
        navigatorXr: isWebXrAvailable(),
        xrModeEngaged: this.xrModeEngaged,
        menuOpen: this.xrBridge.isMenuOpen,
        aiming: this.xrBridge.isTeleportAiming,
        stickTeleportAiming: this.xrBridge.isStickTeleportAiming,
        sticks: this.xrBridge.stickState,
        counters: this.xrBridge.debugCounters,
        cardVisible: this.spatialUI.isCardVisible,
        cameraPosition: (() => {
          const p = new THREE.Vector3();
          xb.core.camera.getWorldPosition(p);
          return [p.x, p.y, p.z];
        })(),
        cameraYaw: (() => {
          const q = new THREE.Quaternion();
          xb.core.camera.getWorldQuaternion(q);
          return +new THREE.Euler().setFromQuaternion(q, 'YXZ').y.toFixed(3);
        })(),
      }),
      summonUI: () => this.summonSpatialUI(),
      teleportTo: (x: number, z: number) => this.xrBridge.teleportToPoint(x, z),
      // Synthetic thumbstick input: [x, y] with y = -1 pushed forward.
      setSticks: (
        left: { x: number; y: number } | null,
        right: { x: number; y: number } | null,
      ) => this.xrBridge.setVirtualSticks(left, right),
      resetPlayground: () => this.resetPlayground(),
    };
  }

  private bindPointerAndCameraControls(): void {
    window.addEventListener('contextmenu', (e) => {
      const target = e.target as HTMLElement | null;
      if (!target || !target.closest('#root')) {
        e.preventDefault();
      }
    });

    window.addEventListener('pointermove', (e) => {
      const nx = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      const ny = -(e.clientY / Math.max(1, window.innerHeight)) * 2 + 1;
      this.pointerNdc.set(nx, ny);
      this.avatar.setPointerNdc(nx, ny);

      if (this.isOrbitDragging) {
        const dx = e.clientX - this.dragStartX;
        const dy = e.clientY - this.dragStartY;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.camYaw -= dx * 0.0065;
        this.camPitch = THREE.MathUtils.clamp(
          this.camPitch + dy * 0.005,
          0.08,
          1.12,
        );
      }
    });

    window.addEventListener('pointerdown', (e) => {
      if (this.appState !== 'playing') return;
      const target = e.target as HTMLElement | null;
      if (target && target.closest('#root')) return;

      this.pointerDownPos = { x: e.clientX, y: e.clientY };

      // Right-click or middle-click drags orbit camera
      if (e.button === 2 || e.button === 1) {
        this.isOrbitDragging = true;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        return;
      }
    });

    window.addEventListener('pointerup', (e) => {
      if (this.isOrbitDragging) {
        this.isOrbitDragging = false;
        return;
      }
      if (this.appState !== 'playing' || e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (target && target.closest('#root')) return;

      // Ignore accidental drags
      const moved = Math.hypot(
        e.clientX - this.pointerDownPos.x,
        e.clientY - this.pointerDownPos.y,
      );
      if (moved > 8) return;

      this.handleSceneClick(e.clientX, e.clientY, e.shiftKey);
    });

    window.addEventListener(
      'wheel',
      (e) => {
        if (this.appState !== 'playing') return;
        const target = e.target as HTMLElement | null;
        if (target && target.closest('#root')) return;
        this.camDist = THREE.MathUtils.clamp(
          this.camDist + e.deltaY * 0.004,
          2.6,
          14.5,
        );
      },
      { passive: true },
    );
  }

  private handleSceneClick(
    clientX: number,
    clientY: number,
    shiftHeld: boolean,
  ): void {
    const nx = (clientX / Math.max(1, window.innerWidth)) * 2 - 1;
    const ny = -(clientY / Math.max(1, window.innerHeight)) * 2 + 1;
    this.desktopRaycaster.setFromCamera(
      this.pointerNdc.set(nx, ny),
      xb.core.camera,
    );

    const hits = this.desktopRaycaster.intersectObjects(
      [this.environment, this.avatar],
      true,
    );

    for (const hit of hits) {
      const pgObj = hit.object.userData.playgroundObjectId as
        | PlaygroundObjectId
        | undefined;
      if (pgObj) {
        this.handlePlaygroundObjectInteraction(pgObj, shiftHeld);
        return;
      }

      const zone = hit.object.userData.interactionZone as string | undefined;
      if (zone === 'head') {
        this.avatar.setEmotionAndMotion('blush', 'shy_fidget', 'shy_avert');
        void this.sendUserMessage('(다정하게 머리를 쓰다듬어 준다)', 'head_pat');
        return;
      }

      if (hit.object.userData.playgroundGround) {
        this.sim.issueCommand({
          type: 'move_to',
          targetX: hit.point.x,
          targetZ: hit.point.z,
          run: shiftHeld ? true : undefined,
        });
        this.syncAllUI();
        return;
      }
    }
  }

  private handlePlaygroundObjectInteraction(
    objId: PlaygroundObjectId,
    forceVault: boolean,
  ): void {
    const useVault = forceVault || this.obstacleClickMode === 'vault';
    switch (objId) {
      case 'bench':
        this.triggerPlaygroundCommand(
          useVault ? 'vault_bench' : 'sit_bench',
          useVault ? '(벤치를 클릭해 타넘고 지나가라고 지시함)' : '(벤치를 클릭해 앉아 쉬자고 지시함)',
        );
        break;
      case 'seesaw':
        this.triggerPlaygroundCommand(
          useVault ? 'vault_seesaw' : 'sit_seesaw',
          useVault ? '(시소를 클릭해 타넘어 보라고 지시함)' : '(시소를 클릭해 함께 타자고 지시함)',
        );
        break;
      case 'slide':
        this.triggerPlaygroundCommand('ride_slide', '(미끄럼틀을 클릭해 타 보라고 지시함)');
        break;
      case 'swing':
        this.triggerPlaygroundCommand('ride_swing', '(그네를 클릭해 신나게 타 보라고 지시함)');
        break;
      case 'vault_box_1':
        this.triggerPlaygroundCommand('vault_box_1', '(1단 뜀틀을 클릭해 뛰어넘어 보라고 지시함)');
        break;
      case 'vault_box_2':
        this.triggerPlaygroundCommand('vault_box_2', '(2단 뜀틀을 클릭해 뛰어넘어 보라고 지시함)');
        break;
      case 'vault_box_3':
        this.triggerPlaygroundCommand('vault_box_3', '(3단 뜀틀을 클릭해 뛰어넘어 보라고 지시함)');
        break;
      case 'soccer_ball':
        this.triggerPlaygroundCommand('kick_soccer', '(축구공을 클릭해 힘차게 차 보라고 지시함)');
        break;
      case 'basketball':
        this.triggerPlaygroundCommand(
          'throw_basketball',
          '(농구공을 클릭해 손으로 주워서 멋지게 던져보라고 지시함)',
        );
        break;
      case 'sandbox':
        this.triggerPlaygroundCommand('play_sandbox', '(모래놀이터를 클릭해 모래놀이 하자고 지시함)');
        break;
    }
  }

  onXRSessionStarted(): void {
    const isAR = xb.core.environmentBlendMode === 'alpha-blend';
    this.xrModeEngaged = true;
    this.environment.setPassthroughMode(isAR);
    this.spatialCardVisible = true;
    // Let WebXR update the headset pose for one frame before placing the card.
    requestAnimationFrame(() => this.spatialUI.summonInFront(xb.core.camera));
    this.syncToggles();
  }

  onXRSessionEnded(): void {
    this.xrModeEngaged = false;
    this.environment.setPassthroughMode(false);
    this.syncToggles();
  }

  onSimulatorStarted(): void {
    this.syncToggles();
  }

  onSelectStart(event: xb.SelectEvent): void {
    if (this.appState !== 'playing') return;
    // In explicitly-entered XR / simulator mode the bridge turns floor selects
    // into user teleportation; plain desktop keeps "move the NPC" behaviour.
    if (this.isXrActive()) return;
    const obj = event.surface || event.target;
    if (!obj) return;

    const pgObj = obj.userData?.playgroundObjectId as PlaygroundObjectId | undefined;
    if (pgObj) {
      this.handlePlaygroundObjectInteraction(pgObj, false);
      event.stopPropagation();
      return;
    }

    if (obj.userData?.playgroundGround && event.intersection) {
      this.sim.issueCommand({
        type: 'move_to',
        targetX: event.intersection.point.x,
        targetZ: event.intersection.point.z,
      });
      event.stopPropagation();
    }
  }

  update(): void {
    const dt = Math.min(xb.getDeltaTime() || 0.016, 0.05);
    const elapsed = xb.core.elapsedTime || performance.now() * 0.001;
    const camera = xb.core.camera;

    // 1. Step pure playground locomotion, seesaw & ball physics
    const snap = this.sim.step(dt);
    this.avatar.position.set(snap.avatar.x, snap.avatar.y, snap.avatar.z);
    this.avatar.rotation.y = snap.avatar.yaw;

    // 2. Smooth orbital / follow camera on desktop when XR / Simulator is not driving it
    if (!xb.core.simulatorRunning && !xb.core.renderer?.xr?.isPresenting) {
      if (this.appState === 'title') {
        // Wide hero overview showing avatar + all 8 playground zones cleanly
        this.targetLookAt.set(0.25, 1.0, -0.85);
        this.targetCamPos.set(0.35, 2.75, 7.6);
      } else {
        // Gentle follow focus biased between playground center and avatar
        const focusX = snap.avatar.x * 0.55;
        const focusZ = snap.avatar.z * 0.55 - 0.55;
        const focusY = 0.95 + snap.avatar.y * 0.35;
        this.targetLookAt.set(focusX, focusY, focusZ);

        const horiz = Math.cos(this.camPitch) * this.camDist;
        const camX = focusX + Math.sin(this.camYaw) * horiz;
        const camY = Math.max(0.85, focusY + Math.sin(this.camPitch) * this.camDist);
        const camZ = focusZ + Math.cos(this.camYaw) * horiz;
        this.targetCamPos.set(camX, camY, camZ);
      }
      const dampAmt = 1 - Math.exp(-5.5 * dt);
      camera.position.lerp(this.targetCamPos, dampAmt);
      camera.lookAt(this.targetLookAt);
    }

    if (this.webcamGaze.isRunning) {
      const offset = this.webcamGaze.sampleOffset();
      this.avatar.setWebcamFaceOffset(offset);
    }

    // 3. Update avatar bones FIRST so live hand midpoint matches this exact frame
    const speakingEnergy = this.ttsPlayer.getSpeakingEnergy();
    this.avatar.updateFrame({
      dt,
      elapsedSec: elapsed,
      camera,
      affection: this.relationship.affection,
      emotionIntensity: this.relationship.lastUserEmotion.intensity,
      speakingEnergy,
      playgroundActivity: snap.avatar.activity,
      playgroundPhase: snap.avatar.phase,
    });

    // 4. Sync playground meshes (snapping basketball into hands while held)
    let heldBasketballPos: THREE.Vector3 | null = null;
    if (
      snap.basketball.heldByAvatar &&
      this.avatar.getHandsBallHoldWorldPosition(this.heldBallWorldPos)
    ) {
      heldBasketballPos = this.heldBallWorldPos;
    }
    this.environment.syncFromSimulation(snap, elapsed, heldBasketballPos);

    // Update lightweight activity / SOMA clip badges only when text changes
    const clip = this.avatar.somaEngine.getActiveClip();
    if (
      snap.avatar.statusLabelKo !== this.lastHudActivity ||
      clip !== this.lastHudClip
    ) {
      this.lastHudActivity = snap.avatar.statusLabelKo;
      this.lastHudClip = clip;
      this.hud.updateActivityBadge(snap.avatar.statusLabelKo, clip);
      document.body.dataset.activity = snap.avatar.activity;
      document.body.dataset.vrm = this.avatar.getRuntimeStatus().name;
    }
  }

  private enterTitle(): void {
    this.appState = 'title';
    this.hud.setAppState('title');
    this.avatar.setEmotionAndMotion('happy', 'wave_greet', 'lock_eyes');
  }

  private enterPlaying(): void {
    this.appState = 'playing';
    this.hud.setAppState('playing');
    this.avatar.setEmotionAndMotion(
      this.currentNpcEmotion,
      this.avatar.somaEngine.getStyle(),
      this.currentGazeMode,
    );
    this.syncToggles();
  }

  private togglePause(): void {
    if (this.appState === 'playing') {
      this.appState = 'paused';
      this.hud.setAppState('paused');
    } else if (this.appState === 'paused') {
      this.appState = 'playing';
      this.hud.setAppState('playing');
    }
  }

  private resetPlayground(): void {
    this.sim.reset();
    this.camYaw = 0.04;
    this.camPitch = 0.26;
    this.camDist = 6.7;
    this.syncAllUI();
  }

  private resetRelationship(): void {
    this.relationship = { ...INITIAL_RELATIONSHIP };
    this.history = [];
    this.currentReply = this.activePersona.greeting;
    this.currentChoices = [...DEFAULT_QUICK_CHOICES];
    this.currentNpcEmotion = 'happy';
    this.currentGazeMode = 'lock_eyes';
    this.avatar.setEmotionAndMotion('happy', 'idle_gentle', 'lock_eyes');
    this.hud.setError(null);
    this.syncAllUI();
  }

  private selectPersona(personaId: string): void {
    const found = PERSONAS.find((p) => p.id === personaId);
    if (!found) return;
    this.activePersona = found;
    this.avatar.setPersona(found);
    this.history = [];
    this.currentReply = found.greeting;
    this.currentNpcEmotion = 'happy';
    this.avatar.setEmotionAndMotion('happy', 'wave_greet', 'lock_eyes');
    this.syncAllUI();
    if (this.ttsEnabled) {
      void this.speakReply(found.greeting, 'happy');
    }
  }

  private selectSomaStyle(style: SomaMotionStyle): void {
    this.avatar.somaEngine.setStyle(style);
    this.syncAllUI();
  }

  private toggleObstacleClickMode(): void {
    this.obstacleClickMode = this.obstacleClickMode === 'sit' ? 'vault' : 'sit';
    this.syncToggles();
  }

  private changeGazeMode(mode: GazeMode): void {
    this.currentGazeMode = mode;
    this.avatar.setGazeMode(mode);
    this.syncToggles();
  }

  private toggleTts(): void {
    this.ttsEnabled = !this.ttsEnabled;
    if (!this.ttsEnabled) {
      this.ttsPlayer.stop();
    }
    this.syncToggles();
  }

  private toggleGazeTracking(): void {
    this.gazeEnabled = !this.gazeEnabled;
    this.avatar.setGazeTrackingEnabled(this.gazeEnabled);
    this.syncToggles();
  }

  private async toggleWebcamGaze(): Promise<void> {
    if (this.webcamGaze.isRunning) {
      this.webcamGaze.stop();
      this.avatar.setWebcamFaceOffset(null);
      this.syncToggles();
      return;
    }

    try {
      this.hud.setError(null);
      await this.webcamGaze.start();
      this.gazeEnabled = true;
      this.avatar.setGazeTrackingEnabled(true);
      this.syncToggles();
    } catch (err) {
      this.hud.setError(
        err instanceof Error ? err.message : '웹캠 시선 추적을 시작할 수 없습니다.',
      );
    }
  }

  private toggleSpatialCard(): void {
    this.spatialCardVisible = !this.spatialCardVisible;
    if (this.spatialCardVisible && this.isXrActive()) {
      this.spatialUI.summonInFront(xb.core.camera);
    } else {
      this.spatialUI.setVisible(this.spatialCardVisible);
    }
    this.syncToggles();
  }

  private summonSpatialUI(): void {
    this.spatialCardVisible = true;
    this.spatialUI.summonInFront(xb.core.camera);
    this.syncToggles();
  }

  private callAvatarToUser(): void {
    const head = new THREE.Vector3();
    xb.core.camera.getWorldPosition(head);
    this.sim.issueCommand({
      type: 'move_to',
      targetX: head.x,
      targetZ: head.z,
    });
    this.syncAllUI();
  }

  private isXrActive(): boolean {
    return this.xrModeEngaged || !!xb.core.renderer?.xr?.isPresenting;
  }

  /**
   * Movement is natural in VR but awkward in AR, so player movement is
   * disabled in AR sessions. The runtime blend mode is authoritative for a
   * live session; the configured mode is the fallback for the simulator and
   * the pre-session screen (the simulator does not set environmentBlendMode).
   */
  private isMovementAllowed(): boolean {
    if (xb.core.environmentBlendMode === 'alpha-blend') return false;
    return selectedXrMode !== 'immersive-ar';
  }

  private getXrLaunchState(): { label: string; hint: string } {
    const manager = xb.core.webXRSessionManager;
    const movementDisabled = !this.isMovementAllowed();
    if (manager?.currentSession) {
      return {
        label: 'Exit XR',
        hint: movementDisabled
          ? 'AR 모드 – 플레이어 이동 비활성화'
          : '왼스틱 이동 · 오른스틱 좌우 스냅턴 · 뒤로 당겨 텔레포트',
      };
    }
    if (!window.isSecureContext) {
      return {
        label: 'WebXR 사용 불가',
        hint: '현재 HTTP 주소 – HTTPS 또는 localhost 필요',
      };
    }
    if (!isWebXrAvailable()) {
      return {
        label: 'XR 시뮬레이터',
        hint: movementDisabled
          ? '이 브라우저에는 WebXR API가 없습니다 · AR – 이동 비활성화'
          : '이 브라우저에는 WebXR API가 없습니다',
      };
    }
    if (manager?.isXRSupported() !== true) {
      return {
        label: 'XR 시뮬레이터',
        hint: movementDisabled
          ? '헤드셋 미연결 – 시뮬레이터로 미리보기 · AR – 이동 비활성화'
          : '헤드셋 미연결 – 시뮬레이터로 미리보기',
      };
    }
    return {
      label: `Enter XR (${selectedXrMode === 'immersive-ar' ? 'AR' : 'VR'})`,
      hint: movementDisabled ? 'AR – 플레이어 이동 비활성화' : 'WebXR 세션 시작',
    };
  }

  private enterXrOrSimulator(): void {
    // WebXR is gated on a secure context. Quest Browser does not even expose
    // navigator.xr on http://<LAN-IP>, so this is the first thing to check.
    if (!window.isSecureContext) {
      this.hud.setError(
        'WebXR은 HTTPS 또는 localhost에서만 동작합니다. 현재 주소는 안전한 컨텍스트가 아니어서 Quest Browser가 XR API를 제공하지 않습니다. ' +
          'Tailscale HTTPS(https://<노드>.<테일넷>.ts.net), adb reverse 후 http://localhost:3000, 또는 HTTPS 터널로 접속해 주세요.',
      );
      return;
    }

    const manager = xb.core.webXRSessionManager;
    if (manager?.currentSession) {
      void manager.endSession();
      return;
    }
    if (isWebXrAvailable() && manager?.isXRSupported() === true) {
      try {
        // Keep this call synchronous inside the click handler: WebXR
        // requestSession requires transient user activation.
        manager.startSession();
      } catch (err) {
        this.hud.setError(
          err instanceof Error ? err.message : 'XR 세션 요청에 실패했습니다.',
        );
      }
      // onXRSessionStarted() owns xrModeEngaged and card placement.
      return;
    }

    // Desktop browser with no headset: keep the simulator as the XR preview so
    // stick locomotion and controller interaction stay testable without one.
    if (isWebXrAvailable()) {
      this.hud.setError(
        '연결된 WebXR 기기가 없어 시뮬레이터로 실행합니다. 헤드셋에서는 immersive-vr 권한을 확인하고, ' +
          'AR이 필요하면 주소에 ?xrmode=ar 을 붙여 다시 열어 주세요.',
      );
    }
    void this.startSimulatorFallback();
  }

  private async startSimulatorFallback(): Promise<void> {
    try {
      if (!xb.core.simulatorRunning) await xb.core.startSimulator();
      this.xrModeEngaged = true;
      this.spatialCardVisible = true;
      this.spatialUI.summonInFront(xb.core.camera);
      this.syncToggles();
    } catch (err) {
      this.hud.setError(
        err instanceof Error ? err.message : 'XR 시뮬레이터 실행 중 오류가 발생했습니다.',
      );
    }
  }

  private triggerPlaygroundCommand(
    command: PlaygroundCommandType,
    promptText?: string,
  ): void {
    // 1. Execute SOMA playground locomotion/interaction immediately
    this.sim.issueCommand({ type: command });
    if (
      command === 'kick_soccer' ||
      command === 'kick_basketball' ||
      command === 'throw_basketball' ||
      command === 'ride_slide' ||
      command === 'ride_swing'
    ) {
      this.avatar.setEmotionAndMotion('playful', 'happy_bounce', 'lock_eyes');
    } else if (
      command === 'vault_bench' ||
      command === 'vault_seesaw' ||
      command === 'vault_box_1' ||
      command === 'vault_box_2' ||
      command === 'vault_box_3' ||
      command === 'vault_boxes_all'
    ) {
      this.avatar.setEmotionAndMotion('happy', 'happy_bounce', 'lock_eyes');
    } else {
      this.avatar.setEmotionAndMotion('happy', 'idle_gentle', 'lock_eyes');
    }
    this.syncAllUI();

    // 2. Also send conversational context to LLM when not already busy
    if (promptText && !this.isBusy) {
      void this.sendUserMessage(promptText, `playground_${command}`, true);
    }
  }

  private async sendUserMessage(
    message: string,
    interactionType: string,
    commandAlreadyExecuted = false,
  ): Promise<void> {
    if (!message.trim()) return;

    // Immediately parse & execute natural-language playground directives
    let executedLocalCommand = commandAlreadyExecuted;
    if (!executedLocalCommand) {
      const parsedCmd = parsePlaygroundCommand(message);
      if (parsedCmd) {
        this.sim.issueCommand(parsedCmd);
        executedLocalCommand = true;
      }
    }

    if (this.isBusy) {
      this.syncAllUI();
      return;
    }

    this.isBusy = true;
    this.hud.setBusy(true);
    this.hud.setError(null);

    const localHint = analyzeLocalEmotionSignal(message);
    this.relationship = {
      ...this.relationship,
      lastUserEmotion: localHint,
    };
    this.syncAllUI();

    try {
      const payload = await requestNpcResponse({
        message,
        interactionType,
        localEmotionHint: localHint,
        relationship: this.relationship,
        persona: this.activePersona,
        history: this.history,
      });

      this.history.push({
        role: 'user',
        text: message,
        emotionLabel: payload.userEmotion.labelKo,
        timestamp: Date.now(),
      });
      this.history.push({
        role: 'npc',
        text: payload.npcReply,
        timestamp: Date.now(),
      });

      this.relationship = applyRelationshipDelta(this.relationship, {
        affectionDelta: payload.affectionDelta,
        trustDelta: payload.trustDelta,
        moodDelta: payload.moodDelta,
        userEmotion: payload.userEmotion,
        npcEmotion: payload.npcEmotion,
        innerThought: payload.innerThought,
      });

      this.currentReply = payload.npcReply;
      this.currentNpcEmotion = payload.npcEmotion;
      this.currentGazeMode = payload.gazeMode;
      this.currentChoices =
        payload.suggestedChoices?.length > 0
          ? payload.suggestedChoices
          : [...DEFAULT_QUICK_CHOICES];

      // Execute LLM-suggested playground command if user didn't already trigger one
      if (
        !executedLocalCommand &&
        payload.playgroundCommand &&
        payload.playgroundCommand !== 'none'
      ) {
        this.sim.issueCommand({ type: payload.playgroundCommand });
      }

      const motionStyle =
        payload.somaMotionStyle || defaultSomaStyleForEmotion(payload.npcEmotion);
      this.avatar.setEmotionAndMotion(
        payload.npcEmotion,
        motionStyle,
        payload.gazeMode,
      );
      this.syncAllUI();
      this.syncToggles();

      if (this.ttsEnabled) {
        await this.speakReply(payload.npcReply, payload.npcEmotion);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.hud.setError(msg);
    } finally {
      this.isBusy = false;
      this.hud.setBusy(false);
    }
  }

  private async speakReply(
    text: string,
    npcEmotion: NpcEmotionType,
  ): Promise<void> {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    utterance.rate = 0.98;
    utterance.pitch =
      npcEmotion === 'sad' || npcEmotion === 'concerned'
        ? 0.9
        : npcEmotion === 'playful'
          ? 1.15
          : 1;
    window.speechSynthesis.speak(utterance);
  }

  private async toggleVoiceRecording(): Promise<void> {
    if (this.isRecording) {
      this.stopVoiceRecording();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      this.hud.setError('이 브라우저에서는 마이크 음성 입력을 지원하지 않습니다.');
      return;
    }

    try {
      this.hud.setError(null);
      this.interimTranscript = '';
      this.audioChunks = [];
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(this.mediaStream);

      this.mediaRecorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) this.audioChunks.push(ev.data);
      };

      this.mediaRecorder.onstop = async () => {
        const blob = new Blob(this.audioChunks, {
          type: this.mediaRecorder?.mimeType || 'audio/webm',
        });
        this.cleanupMicStream();
        if (blob.size < 256 && !this.interimTranscript.trim()) {
          return;
        }
        const finalText = this.interimTranscript.trim();
        if (finalText) {
          await this.sendUserMessage(finalText, 'voice_chat');
        } else {
          this.hud.setError(
            '음성 인식 결과가 없습니다. 브라우저 음성 인식 권한을 확인해 주세요.',
          );
        }
        this.hud.setBusy(false);
      };

      const SpeechRec =
        window.SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition })
          .webkitSpeechRecognition;
      if (SpeechRec) {
        try {
          const rec = new SpeechRec();
          rec.lang = 'ko-KR';
          rec.continuous = true;
          rec.interimResults = true;
          rec.onresult = (ev) => {
            let txt = '';
            for (let i = 0; i < ev.results.length; i++) {
              txt += ev.results[i][0].transcript;
            }
            this.interimTranscript = txt;
            this.hud.setRecordingState(true, txt);
          };
          rec.start();
          this.speechRecognition = rec;
        } catch {
          this.speechRecognition = null;
        }
      }

      this.mediaRecorder.start();
      this.isRecording = true;
      this.avatar.setEmotionAndMotion('calm', 'nod_listen', 'lock_eyes');
      this.hud.setRecordingState(true);
    } catch (err) {
      this.cleanupMicStream();
      this.hud.setError(
        err instanceof Error ? err.message : '마이크 권한을 허용해 주세요.',
      );
    }
  }

  private stopVoiceRecording(): void {
    this.isRecording = false;
    this.hud.setRecordingState(false);
    try {
      this.speechRecognition?.stop();
    } catch {
      // ignore
    }
    this.speechRecognition = null;
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    } else {
      this.cleanupMicStream();
    }
  }

  private cleanupMicStream(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
  }

  private async loadVrmFile(file: File): Promise<void> {
    try {
      this.hud.setError(null);
      await this.avatar.loadVrmFromFile(file);
      this.syncAllUI();
    } catch (err) {
      this.hud.setError(
        err instanceof Error ? err.message : 'VRM 아바타 로드에 실패했습니다.',
      );
    }
  }

  private async resetVrm(): Promise<void> {
    try {
      this.hud.setError(null);
      await this.avatar.resetToDefaultVrm();
      this.syncAllUI();
    } catch (err) {
      this.hud.setError(
        err instanceof Error ? err.message : '기본 VRM 로드에 실패했습니다.',
      );
    }
  }

  private async loadCloudOnnx(): Promise<void> {
    try {
      this.hud.setError(null);
      await this.avatar.somaEngine.loadMotionBricksCloudOnnx();
      this.syncAllUI();
    } catch (err) {
      this.hud.setError(
        err instanceof Error
          ? err.message
          : 'MotionBricks WebGPU ONNX 로드에 실패했습니다.',
      );
      this.syncAllUI();
    }
  }

  private async loadOnnxFile(file: File): Promise<void> {
    try {
      this.hud.setError(null);
      const buf = await file.arrayBuffer();
      await this.avatar.somaEngine.loadOnnxModelFromBuffer(buf, file.name);
      this.syncAllUI();
    } catch (err) {
      this.hud.setError(
        err instanceof Error
          ? err.message
          : 'MotionBricks SOMA ONNX 모델 로드에 실패했습니다.',
      );
    }
  }

  private resetOnnx(): void {
    this.avatar.somaEngine.resetToBuiltin();
    this.syncAllUI();
  }

  private syncAllUI(): void {
    const somaStatus = this.avatar.somaEngine.getStatus();
    const avatarStatus = this.avatar.getRuntimeStatus();
    const snap = this.sim.getSnapshot();

    document.body.dataset.activity = snap.avatar.activity;
    document.body.dataset.vrm = avatarStatus.name;

    this.hud.syncState({
      persona: this.activePersona,
      relationship: this.relationship,
      userEmotion: this.relationship.lastUserEmotion,
      somaStatus,
      avatarStatus,
      activityLabelKo: snap.avatar.statusLabelKo,
      reply: this.currentReply,
      choices: this.currentChoices,
    });

    this.spatialUI.syncState({
      personaName: this.activePersona.name,
      relationship: this.relationship,
      userEmotion: this.relationship.lastUserEmotion,
      somaStyle: somaStatus.activeStyle,
      somaClip: somaStatus.activeClip,
      reply: this.currentReply,
    });
  }

  private syncToggles(): void {
    this.hud.setToggles({
      ttsEnabled: this.ttsEnabled,
      gazeEnabled: this.gazeEnabled,
      webcamGazeActive: this.webcamGaze.isRunning,
      spatialCardVisible: this.spatialCardVisible,
      gazeMode: this.currentGazeMode,
      obstacleClickMode: this.obstacleClickMode,
    });
    this.hud.setXrLaunchState(this.getXrLaunchState());
  }

  dispose(): void {
    xb.core.webXRSessionManager?.removeEventListener(
      xb.WebXRSessionEventType.SESSION_ERROR,
      this.onXrSessionError,
    );
    this.stopVoiceRecording();
    this.ttsPlayer.dispose();
    this.webcamGaze.stop();
    this.avatar.dispose();
    this.environment.dispose();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  void (async () => {
    const options = new xb.Options();
    options.antialias = !IS_SOFTWARE_GL;
    options.usePostprocessing = false;
    // A modest XR render-scale reduction buys steadier 72/90 Hz frame pacing on
    // standalone headsets while remaining visually clean on this stylized scene.
    options.setFramebufferScaleFactor(0.9);
    options.enableReticles();
    options.enableGestures();
    // Fist detection does not need 30 Hz sampling; 60 ms keeps it responsive
    // without adding avoidable joint-matrix work to every render frame.
    options.gestures.updateIntervalMs = 60;
    options.xrSessionMode = await resolveXrSessionMode();
    selectedXrMode = options.xrSessionMode;
    // Keep the session request minimal for standalone headsets. xrblocks
    // defaults include bounded-floor/unbounded, and Quest Browser rejects the
    // whole request with NotSupportedError when an optional feature is unknown.
    options.webxrRequiredFeatures = [];
    options.webxrOptionalFeatures = ['local-floor', 'hand-tracking'];
    options.xrButton.enabled = false;
    options.simulator.instructions.enabled = false;
    options.simulator.instructions.overlayEnabled = false;
    options.setAppTitle('SOMA·Heart XR Playground Sandbox');
    options.setAppDescription(
      'MotionBricks SOMA & mech_girl.vrm 기반 놀이터 인터랙션 · 실시간 감정 LLM · 음성 대화 · 시선 추적 XR 샌드박스',
    );

    xb.add(new SomaPlaygroundSandbox());
    void xb.init(options);
  })();
});
