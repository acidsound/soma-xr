import * as THREE from 'three';

const _head = new THREE.Vector3();
const _delta = new THREE.Vector3();
const _targetCamera = new THREE.Vector3();
const _headBefore = new THREE.Vector3();
const _headAfter = new THREE.Vector3();
const _yawAxis = new THREE.Vector3(0, 1, 0);
const _yawQuat = new THREE.Quaternion();
const _lineOrigin = new THREE.Vector3();

/**
 * Point-and-go locomotion for immersive WebXR and the desktop XR simulator.
 *
 * WebXR owns the camera pose from the headset reference space. We therefore
 * never write `camera.position` directly while presenting: instead the camera
 * is re-parented under a zeroed "player rig" Group. Moving that rig offsets the
 * headset pose while preserving the user's real-world room-scale movement.
 * Three.js' WebXRManager already compensates for camera parents, so the rig
 * works for both eyes and for the mono `xb.core.camera` proxy.
 */
export class XrLocomotion {
  public readonly rig = new THREE.Group();
  public readonly marker = new THREE.Group();

  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly getSimulator: () =>
    | { moveUser(position: THREE.Vector3): void }
    | undefined;
  private readonly isSimulatorRunning: () => boolean;
  private readonly getBoundsHalfSize: (() => number) | undefined;

  private originalCameraParent: THREE.Object3D | null = null;
  private aiming = false;
  private readonly aimPoint = new THREE.Vector3();
  private readonly ringMaterial: THREE.MeshBasicMaterial;
  private readonly discMaterial: THREE.MeshBasicMaterial;
  private readonly aimLine: THREE.Line;
  private readonly aimLineMaterial: THREE.LineBasicMaterial;
  private readonly aimLinePositions = new Float32Array(6);
  private aimRayOrigin: THREE.Vector3 | null = null;

  constructor(options: {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    getSimulator: () =>
      | { moveUser(position: THREE.Vector3): void }
      | undefined;
    isSimulatorRunning: () => boolean;
    /** Half-extent of the walkable playground, in metres. */
    getBoundsHalfSize?: () => number;
  }) {
    this.scene = options.scene;
    this.camera = options.camera;
    this.getSimulator = options.getSimulator;
    this.isSimulatorRunning = options.isSimulatorRunning;
    this.getBoundsHalfSize = options.getBoundsHalfSize;

    this.rig.name = 'XrPlayerRig';
    this.scene.add(this.rig);

    const ringGeo = new THREE.RingGeometry(0.24, 0.31, 40);
    ringGeo.rotateX(-Math.PI / 2);
    this.ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x3ee0ff,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, this.ringMaterial);
    ring.renderOrder = 10;

    const discGeo = new THREE.CircleGeometry(0.23, 32);
    discGeo.rotateX(-Math.PI / 2);
    this.discMaterial = new THREE.MeshBasicMaterial({
      color: 0x3ee0ff,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const disc = new THREE.Mesh(discGeo, this.discMaterial);
    disc.renderOrder = 9;

    this.marker.name = 'XrTeleportTarget';
    this.marker.add(disc, ring);
    this.marker.position.y = 0.022;
    this.marker.visible = false;
    this.marker.userData.noInteraction = true;
    this.scene.add(this.marker);

    // Straight aim line from the pointing hand to the landing spot. It makes
    // stick teleport legible even when no reticle is drawn for the scenery.
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.aimLinePositions, 3),
    );
    this.aimLineMaterial = new THREE.LineBasicMaterial({
      color: 0x3ee0ff,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    this.aimLine = new THREE.Line(lineGeo, this.aimLineMaterial);
    this.aimLine.name = 'XrTeleportArc';
    this.aimLine.visible = false;
    this.aimLine.frustumCulled = false;
    this.aimLine.renderOrder = 9;
    this.aimLine.userData.noInteraction = true;
    this.scene.add(this.aimLine);
  }

  public get isAiming(): boolean {
    return this.aiming;
  }

  public getAimPoint(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.aimPoint);
  }

  /** Parent the headset camera under the rig without changing its world pose. */
  public onXrSessionStarted(): void {
    if (this.camera.parent === this.rig) return;
    this.rig.position.set(0, 0, 0);
    this.rig.quaternion.identity();
    this.rig.updateMatrixWorld(true);
    this.originalCameraParent = this.camera.parent;
    this.rig.attach(this.camera);
  }

  /** Restore the desktop camera hierarchy when leaving XR. */
  public onXrSessionEnded(): void {
    this.cancelAim();
    if (this.camera.parent !== this.rig) return;
    if (this.originalCameraParent) {
      this.originalCameraParent.attach(this.camera);
    } else {
      this.scene.attach(this.camera);
    }
    this.rig.position.set(0, 0, 0);
    this.rig.quaternion.identity();
    this.rig.updateMatrixWorld(true);
  }

  public beginAim(point: THREE.Vector3): void {
    this.aiming = true;
    this.aimPoint.copy(point);
    this.marker.position.set(point.x, 0.022, point.z);
    this.marker.visible = true;
    this.syncAimLine();
  }

  public updateAim(point: THREE.Vector3): void {
    if (!this.aiming) return;
    this.aimPoint.copy(point);
    this.marker.position.set(point.x, 0.022, point.z);
    this.marker.visible = true;
    this.syncAimLine();
  }

  /** Draw the aim line from the hand that is pointing at the landing spot. */
  public setAimRayOrigin(origin: THREE.Vector3 | null): void {
    if (!origin) {
      this.aimRayOrigin = null;
      this.aimLine.visible = false;
      return;
    }
    this.aimRayOrigin = origin;
    this.syncAimLine();
  }

  public setAimVisible(visible: boolean): void {
    this.aiming = visible;
    this.marker.visible = visible;
    if (!visible) this.aimLine.visible = false;
  }

  public cancelAim(): void {
    this.aiming = false;
    this.marker.visible = false;
    this.aimLine.visible = false;
  }

  /** Move the user so the headset lands over the aimed floor point. */
  public commitAim(): void {
    if (!this.aiming) return;
    const targetX = this.aimPoint.x;
    const targetZ = this.aimPoint.z;

    this.camera.getWorldPosition(_head);
    const simulator = this.isSimulatorRunning() ? this.getSimulator() : undefined;
    if (simulator) {
      _targetCamera.set(targetX, _head.y, targetZ);
      simulator.moveUser(_targetCamera);
    } else if (this.camera.parent === this.rig) {
      // Keep the headset's offset inside the playspace, only offset the rig.
      _delta.set(targetX - _head.x, 0, targetZ - _head.z);
      this.rig.position.add(_delta);
      this.rig.updateMatrixWorld(true);
      this.clampHeadToBounds();
    } else {
      // Safety net: a select happened outside a running XR/simulator session.
      this.camera.position.x = targetX;
      this.camera.position.z = targetZ;
    }

    this.cancelAim();
  }

  /**
   * Continuous (stick) locomotion. The offset is applied to the player rig so
   * the headset keeps its real room-scale offset, exactly like `commitAim`.
   */
  public translateBy(dx: number, dz: number): void {
    if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) return;

    if (this.camera.parent === this.rig) {
      this.rig.position.x += dx;
      this.rig.position.z += dz;
      this.rig.updateMatrixWorld(true);
      this.clampHeadToBounds();
      return;
    }

    const simulator = this.isSimulatorRunning() ? this.getSimulator() : undefined;
    if (simulator) {
      this.camera.getWorldPosition(_head);
      _targetCamera.set(_head.x + dx, _head.y, _head.z + dz);
      simulator.moveUser(_targetCamera);
      return;
    }

    this.camera.position.x += dx;
    this.camera.position.z += dz;
  }

  /**
   * Snap turn around the headset, not around the rig origin: in room-scale the
   * head is rarely on the rig pivot, so rotating the pivot would also shove the
   * user sideways. Rotate the rig, then translate it back so the head stays put.
   */
  public snapTurn(angleRad: number): void {
    if (Math.abs(angleRad) < 1e-6) return;

    if (this.camera.parent !== this.rig) {
      // Desktop / simulator: the camera is not rig-parented, so yaw it in place.
      this.camera.rotateOnWorldAxis(_yawAxis, angleRad);
      return;
    }

    this.camera.getWorldPosition(_headBefore);
    _yawQuat.setFromAxisAngle(_yawAxis, angleRad);
    this.rig.quaternion.premultiply(_yawQuat);
    this.rig.updateMatrixWorld(true);
    this.camera.getWorldPosition(_headAfter);
    this.rig.position.x += _headBefore.x - _headAfter.x;
    this.rig.position.z += _headBefore.z - _headAfter.z;
    this.rig.updateMatrixWorld(true);
  }

  /**
   * Keep the head inside the fenced playground. Only the rig is corrected, so
   * the real room-scale offset still applies at the edges.
   */
  private clampHeadToBounds(): void {
    const limit = this.getBoundsHalfSize?.();
    if (!limit || limit <= 0) return;
    this.camera.getWorldPosition(_head);
    const cx = THREE.MathUtils.clamp(_head.x, -limit, limit);
    const cz = THREE.MathUtils.clamp(_head.z, -limit, limit);
    if (cx === _head.x && cz === _head.z) return;
    this.rig.position.x += cx - _head.x;
    this.rig.position.z += cz - _head.z;
    this.rig.updateMatrixWorld(true);
  }

  private syncAimLine(): void {
    if (!this.aiming || !this.aimRayOrigin) {
      this.aimLine.visible = false;
      return;
    }
    _lineOrigin.copy(this.aimRayOrigin);
    this.aimLinePositions[0] = _lineOrigin.x;
    this.aimLinePositions[1] = _lineOrigin.y;
    this.aimLinePositions[2] = _lineOrigin.z;
    this.aimLinePositions[3] = this.aimPoint.x;
    this.aimLinePositions[4] = 0.06;
    this.aimLinePositions[5] = this.aimPoint.z;
    const attribute = this.aimLine.geometry.getAttribute(
      'position',
    ) as THREE.BufferAttribute;
    attribute.needsUpdate = true;
    this.aimLine.geometry.computeBoundingSphere();
    this.aimLine.visible = true;
  }

  /** Gentle pulse so the landing spot is legible on busy playground tiles. */
  public update(elapsedSec: number): void {
    if (!this.marker.visible) return;
    const pulse = 1 + Math.sin(elapsedSec * 7.5) * 0.08;
    this.marker.scale.set(pulse, 1, pulse);
    this.ringMaterial.opacity = 0.78 + Math.sin(elapsedSec * 7.5) * 0.16;
  }

  public dispose(): void {
    this.onXrSessionEnded();
    this.scene.remove(this.rig, this.marker, this.aimLine);
    this.marker.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
      }
    });
    this.aimLine.geometry.dispose();
    this.aimLineMaterial.dispose();
    this.ringMaterial.dispose();
    this.discMaterial.dispose();
  }
}
