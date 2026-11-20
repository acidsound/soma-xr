/**
 * Exact SOMA-77 -> VRM Normalized Bone Retargeter
 * Ported from https://huggingface.co/spaces/monoradio/motionbricks-live/blob/main/viewer/live.html
 * and generalized to work in vrm.scene-local space so rotating/moving the parent
 * VrmAvatarController across the playground never distorts bone orientations.
 *
 * Performance: the per-frame path is allocation-free. The original lifted every
 * bone target into world space (`sceneWorldQ * localTarget`) and then divided by
 * the parent's *world* quaternion (`parent.getWorldQuaternion()` after a full
 * `updateWorldMatrix(true, false)` ancestor recompute). Because every bone lives
 * under vrm.scene, `parentWorldQ === sceneWorldQ * parentSceneLocalQ`, so the
 * sceneWorldQ factor cancels exactly:
 *   node.quaternion = parentSceneLocalQ^-1 * localTarget.
 * We therefore keep the identical scene-local target math but read the parent's
 * scene-local orientation from a cache updated as we walk the (parent-first)
 * bone list — no world-matrix recomputes, no matrix decompositions, no garbage.
 */

import * as THREE from 'three';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import type { SomaSkeleton } from './motionBricksRuntime';

interface MappedBone {
  vrmName: VRMHumanBoneName;
  node: THREE.Object3D;
  somaIndex: number;
  childVrmName: VRMHumanBoneName | null;
  TrestLocal: THREE.Quaternion;
  C: THREE.Quaternion;
  /** Nearest mapped ancestor (used to read this frame's parent orientation). */
  parentMapped: MappedBone | null;
  /** Rest orientation of the unmapped bones between this bone and parentMapped
   *  (or up to vrm.scene when parentMapped is null), composed top-down. */
  intermediateRestQ: THREE.Quaternion;
  /** This bone's orientation relative to vrm.scene, refreshed every frame. */
  sceneLocal: THREE.Quaternion;
}

const SOMA_VRM_MAP: Array<[VRMHumanBoneName, string, VRMHumanBoneName | null]> = [
  ['hips', 'Hips', 'spine'],
  ['spine', 'Spine1', 'chest'],
  ['chest', 'Spine2', 'upperChest'],
  ['upperChest', 'Chest', 'neck'],
  ['neck', 'Neck1', 'head'],
  ['head', 'Head', null],
  ['leftShoulder', 'LeftShoulder', 'leftUpperArm'],
  ['leftUpperArm', 'LeftArm', 'leftLowerArm'],
  ['leftLowerArm', 'LeftForeArm', 'leftHand'],
  ['leftHand', 'LeftHand', null],
  ['leftUpperLeg', 'LeftLeg', 'leftLowerLeg'],
  ['leftLowerLeg', 'LeftShin', 'leftFoot'],
  ['leftFoot', 'LeftFoot', 'leftToes'],
  ['leftToes', 'LeftToeBase', null],
  ['rightShoulder', 'RightShoulder', 'rightUpperArm'],
  ['rightUpperArm', 'RightArm', 'rightLowerArm'],
  ['rightLowerArm', 'RightForeArm', 'rightHand'],
  ['rightHand', 'RightHand', null],
  ['rightUpperLeg', 'RightLeg', 'rightLowerLeg'],
  ['rightLowerLeg', 'RightShin', 'rightFoot'],
  ['rightFoot', 'RightFoot', 'rightToes'],
  ['rightToes', 'RightToeBase', null],
];

const _up = new THREE.Vector3(0, 1, 0);
const _identityQ = new THREE.Quaternion();
const _localTargetQ = new THREE.Quaternion();
const _parentSceneLocalQ = new THREE.Quaternion();
const _tmpQ = new THREE.Quaternion();
const _gazeQ = new THREE.Quaternion();
const _gazeEuler = new THREE.Euler(0, 0, 0, 'YXZ');

function v3(a: readonly number[]): THREE.Vector3 {
  return new THREE.Vector3(a[0], a[1], a[2]);
}

function q4(a: readonly number[]): THREE.Quaternion {
  return new THREE.Quaternion(a[0], a[1], a[2], a[3]);
}

function facingFromLegs(l: THREE.Vector3, r: THREE.Vector3): THREE.Vector3 {
  const f = l.clone().sub(r).cross(_up);
  f.y = 0;
  return f.lengthSq() > 1e-8 ? f.normalize() : new THREE.Vector3(0, 0, 1);
}

export class SomaVrmRetargeter {
  private readonly sk: SomaSkeleton;
  private readonly vrm: VRM;
  private readonly G: THREE.Quaternion;
  private readonly restQinv: THREE.Quaternion[];
  private readonly bones: MappedBone[];
  private readonly hipsNode: THREE.Object3D | null;
  private readonly hipScaleLocal: number;
  private readonly restHipYLocal: number;
  private readonly worldPos: Float64Array;
  private readonly worldQuat: Float64Array;

  constructor(sk: SomaSkeleton, vrm: VRM) {
    this.sk = sk;
    this.vrm = vrm;
    this.worldPos = new Float64Array(sk.J * 3);
    this.worldQuat = new Float64Array(sk.J * 4);

    // Ensure VRM world matrices are up to date in rest T-pose
    vrm.scene.updateMatrixWorld(true);
    const sceneInvQ = vrm.scene
      .getWorldQuaternion(new THREE.Quaternion())
      .invert();

    const getNode = (b: VRMHumanBoneName): THREE.Object3D | null =>
      vrm.humanoid?.getNormalizedBoneNode(b) || null;

    // Positions & quaternions strictly in vrm.scene-local space!
    const lpos = (b: VRMHumanBoneName): THREE.Vector3 => {
      const n = getNode(b);
      if (!n) return new THREE.Vector3();
      const wp = n.getWorldPosition(new THREE.Vector3());
      return vrm.scene.worldToLocal(wp);
    };
    const lquat = (b: VRMHumanBoneName): THREE.Quaternion => {
      const n = getNode(b);
      if (!n) return new THREE.Quaternion();
      const wq = n.getWorldQuaternion(new THREE.Quaternion());
      return sceneInvQ.clone().multiply(wq);
    };

    const restW = sk.world(sk.reference);
    const fS = facingFromLegs(
      v3(restW[sk.index('LeftLeg')].p),
      v3(restW[sk.index('RightLeg')].p),
    );
    const fT = facingFromLegs(lpos('leftUpperLeg'), lpos('rightUpperLeg'));

    this.G = new THREE.Quaternion().setFromUnitVectors(fS, fT);
    const restPos = restW.map((t) => v3(t.p).applyQuaternion(this.G));
    this.restQinv = restW.map((t) =>
      this.G.clone().multiply(q4(t.q)).invert(),
    );

    const mapped: MappedBone[] = [];
    for (const [vrmName, somaName, childVrmName] of SOMA_VRM_MAP) {
      const node = getNode(vrmName);
      const somaIndex = sk.index(somaName);
      if (!node || somaIndex < 0) continue;
      mapped.push({
        vrmName,
        node,
        somaIndex,
        childVrmName,
        TrestLocal: lquat(vrmName),
        C: new THREE.Quaternion(),
        parentMapped: null,
        intermediateRestQ: new THREE.Quaternion(),
        sceneLocal: new THREE.Quaternion(),
      });
    }

    const byName = new Map<VRMHumanBoneName, MappedBone>(
      mapped.map((m) => [m.vrmName, m]),
    );
    const hasC = new Set<VRMHumanBoneName>();

    for (const x of mapped) {
      const c = x.childVrmName ? byName.get(x.childVrmName) : undefined;
      if (c) {
        const vrmDir = lpos(c.vrmName).sub(lpos(x.vrmName));
        const somaDir = restPos[c.somaIndex].clone().sub(restPos[x.somaIndex]);
        if (vrmDir.lengthSq() > 1e-8 && somaDir.lengthSq() > 1e-8) {
          x.C.setFromUnitVectors(vrmDir.normalize(), somaDir.normalize());
          hasC.add(x.vrmName);
        }
      }
    }

    for (const x of mapped) {
      if (hasC.has(x.vrmName)) continue;
      let p = x.node.parent;
      while (p && !mapped.find((y) => y.node === p)) {
        p = p.parent;
      }
      const parentMapped = p ? mapped.find((y) => y.node === p) : undefined;
      if (parentMapped) {
        x.C.copy(parentMapped.C);
      }
    }

    // Precompute the scene-local parent chain for the allocation-free hot path.
    const byNode = new Map<THREE.Object3D, MappedBone>(
      mapped.map((m) => [m.node, m]),
    );
    for (const x of mapped) {
      let p = x.node.parent;
      const chain: THREE.Object3D[] = [];
      while (p && p !== vrm.scene) {
        const e = byNode.get(p);
        if (e) {
          x.parentMapped = e;
          break;
        }
        chain.push(p);
        p = p.parent;
      }
      // chain is bottom-up; compose the unmapped rest quaternions top-down.
      for (let k = chain.length - 1; k >= 0; k--) {
        x.intermediateRestQ.multiply(chain[k].quaternion);
      }
    }
    // Seed rest scene-local orientations (parents precede children in the map).
    for (const x of mapped) {
      _parentSceneLocalQ
        .copy(x.parentMapped ? x.parentMapped.sceneLocal : _identityQ)
        .multiply(x.intermediateRestQ);
      x.sceneLocal.copy(_parentSceneLocalQ).multiply(x.node.quaternion);
    }

    this.bones = mapped;
    this.hipsNode = getNode('hips');
    const vrmHipYLocal = this.hipsNode ? lpos('hips').y : 0.9;
    const somaHipY = Math.max(0.2, restPos[0].y);
    this.hipScaleLocal = vrmHipYLocal / somaHipY;
    this.restHipYLocal = vrmHipYLocal;
  }

  /**
   * Applies a local-frame SOMA-77 pose (XZ centered at 0) onto the VRM
   * normalized bones in vrm.scene-local space (fully invariant to avatar world yaw!),
   * plus additive real-time gaze (head/neck yaw & pitch).
   */
  public applyPose(
    flatPose: Float32Array,
    gazeOverlay?: { headYaw: number; headPitch: number },
  ): void {
    this.sk.worldInto(flatPose, this.worldPos, this.worldQuat);
    const wq = this.worldQuat;

    for (const x of this.bones) {
      const o = x.somaIndex * 4;
      _tmpQ.set(wq[o], wq[o + 1], wq[o + 2], wq[o + 3]);

      // Target orientation in vrm.scene-local space (identical to the original).
      _localTargetQ
        .copy(this.G)
        .multiply(_tmpQ)
        .multiply(this.restQinv[x.somaIndex])
        .multiply(x.C)
        .multiply(x.TrestLocal);

      // Parent's scene-local orientation: fresh for mapped ancestors (walked
      // parent-first), constant rest chain for unmapped ancestors.
      _parentSceneLocalQ
        .copy(x.parentMapped ? x.parentMapped.sceneLocal : _identityQ)
        .multiply(x.intermediateRestQ);

      // node.quaternion = parentSceneLocal^-1 * localTarget  (sceneWorldQ cancels)
      x.node.quaternion
        .copy(_parentSceneLocalQ)
        .invert()
        .multiply(_localTargetQ);

      // Layer real-time gaze tracking smoothly onto neck & head
      if (gazeOverlay && (x.vrmName === 'neck' || x.vrmName === 'head')) {
        const wYaw = x.vrmName === 'neck' ? 0.36 : 0.64;
        const wPitch = x.vrmName === 'neck' ? 0.34 : 0.66;
        _gazeEuler.set(
          -gazeOverlay.headPitch * wPitch,
          gazeOverlay.headYaw * wYaw,
          0,
          'YXZ',
        );
        _gazeQ.setFromEuler(_gazeEuler);
        x.node.quaternion.multiply(_gazeQ);
      }

      // Refresh this bone's scene-local orientation for its children.
      x.sceneLocal.copy(_parentSceneLocalQ).multiply(x.node.quaternion);
    }

    if (this.hipsNode) {
      const hipY = Math.max(
        this.restHipYLocal * 0.45,
        this.worldPos[1] * this.hipScaleLocal,
      );
      this.hipsNode.position.set(0, hipY, 0);
    }
  }
}
