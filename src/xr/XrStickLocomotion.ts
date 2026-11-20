import * as THREE from 'three';
import { XrLocomotion } from './XrLocomotion';

const _camQuat = new THREE.Quaternion();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();
const _head = new THREE.Vector3();
const _aim = new THREE.Vector3();

/** Deadzone applied before any stick axis is used. Quest sticks drift a bit. */
const STICK_DEADZONE = 0.16;
/** Right stick must pass this to fire one snap turn... */
const SNAP_ENTER = 0.72;
/** ...and fall back below this before the next snap can fire. */
const SNAP_RELEASE = 0.34;
/** Right stick pulled back past this starts the teleport aim. */
const TELEPORT_ENTER = 0.68;
/** ...and released below this commits it. */
const TELEPORT_RELEASE = 0.26;
/** Never teleport closer than this (metres) to the current head position. */
const MIN_TELEPORT_DISTANCE = 0.35;
/** Keep the landing spot reachable. */
const MAX_TELEPORT_DISTANCE = 14;

export interface StickAxes {
  x: number;
  y: number;
}

const ZERO_STICK: StickAxes = { x: 0, y: 0 };

type StickController = THREE.Object3D & {
  gamepad?: Gamepad | null;
  inputSource?: { handedness?: string } | null;
};

export interface XrStickLocomotionOptions {
  camera: THREE.PerspectiveCamera;
  locomotion: XrLocomotion;
  getControllers: () => StickController[];
  /** Controller ray for a hand; null when that hand has no tracked ray. */
  getRayForHand: (hand: 'left' | 'right') => THREE.Ray | null;
  /** Head-gaze ray, used when there is no controller (hand tracking). */
  getGazeRay: () => THREE.Ray | null;
  /** Raycast the playground floor (and props) for a teleport landing spot. */
  raycastGround: (ray: THREE.Ray, out: THREE.Vector3) => boolean;
  /** True while the user may move at all (playing + XR/simulator engaged). */
  isActive: () => boolean;
  /** True while something else owns input (wrist menu open). */
  isBlocked: () => boolean;
}

function applyDeadzone(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (Math.abs(value) < STICK_DEADZONE) return 0;
  const sign = Math.sign(value);
  const scaled = (Math.abs(value) - STICK_DEADZONE) / (1 - STICK_DEADZONE);
  return sign * Math.min(1, scaled);
}

/** xr-standard puts the thumbstick on axes 2/3 (forward is negative Y). */
function readControllerStick(gamepad: Gamepad): StickAxes {
  const flat = gamepad.mapping !== 'xr-standard' && gamepad.axes.length < 4;
  const offset = flat ? 0 : 2;
  return {
    x: applyDeadzone(gamepad.axes[offset] ?? 0),
    y: applyDeadzone(gamepad.axes[offset + 1] ?? 0),
  };
}

/**
 * VRChat-style thumbstick locomotion for immersive WebXR.
 *
 *  - Left stick: smooth locomotion relative to where the headset is looking.
 *  - Right stick left/right: one snap turn per deflection (30° by default).
 *  - Right stick pulled back: point-and-teleport, committed on release.
 *
 * All movement is applied through `XrLocomotion`, so the player rig moves
 * instead of the camera and the real room-scale offset is preserved.
 */
export class XrStickLocomotion {
  private readonly options: XrStickLocomotionOptions;

  /** Metres per second at full deflection. */
  public moveSpeed = 2.2;
  /** Snap turn step. VRChat defaults to 30-45°; 30° is gentler in room-scale. */
  public snapTurnDegrees = 30;

  private readonly velocity = new THREE.Vector3();
  private snapArmed = true;
  private teleportActive = false;
  private hasTeleportAim = false;
  private readonly teleportPoint = new THREE.Vector3();
  private leftStick: StickAxes = ZERO_STICK;
  private rightStick: StickAxes = ZERO_STICK;
  private virtualLeft: StickAxes | null = null;
  private virtualRight: StickAxes | null = null;
  private snapTurns = 0;
  private teleports = 0;

  constructor(options: XrStickLocomotionOptions) {
    this.options = options;
  }

  public get isTeleportAiming(): boolean {
    return this.teleportActive;
  }

  public get debugState(): Record<string, unknown> {
    return {
      left: [this.leftStick.x, this.leftStick.y],
      right: [this.rightStick.x, this.rightStick.y],
      velocity: [
        +this.velocity.x.toFixed(3),
        +this.velocity.z.toFixed(3),
      ],
      teleportAiming: this.teleportActive,
      snapTurns: this.snapTurns,
      teleports: this.teleports,
    };
  }

  /**
   * Test/QA hook: feed synthetic stick values instead of reading a gamepad.
   * Pass null for a hand to go back to reading the real controller.
   */
  public setVirtualSticks(
    left: StickAxes | null,
    right: StickAxes | null,
  ): void {
    this.virtualLeft = left;
    this.virtualRight = right;
  }

  public update(dt: number): void {
    const step = Math.min(Math.max(dt, 0), 0.1);
    this.leftStick = this.virtualLeft ?? this.readStick('left');
    this.rightStick = this.virtualRight ?? this.readStick('right');

    if (!this.options.isActive() || this.options.isBlocked()) {
      this.velocity.set(0, 0, 0);
      this.snapArmed = true;
      this.abortTeleport();
      return;
    }

    this.updateTeleport(this.rightStick);
    this.updateSnapTurn(this.rightStick);
    this.updateMove(this.leftStick, step);
  }

  private updateMove(stick: StickAxes, dt: number): void {
    // Walking while a landing spot is being aimed would drag the marker away
    // from the user's feet, so freeze smooth locomotion during any aim.
    if (this.teleportActive || this.options.locomotion.isAiming) {
      this.velocity.set(0, 0, 0);
      return;
    }

    const magnitude = Math.min(1, Math.hypot(stick.x, stick.y));
    const camera = this.options.camera;

    if (magnitude < 1e-3) {
      // Glide to a stop instead of snapping the rig, which is jarring in VR.
      const decay = Math.exp(-12 * dt);
      this.velocity.multiplyScalar(decay);
      if (this.velocity.lengthSq() < 1e-5) {
        this.velocity.set(0, 0, 0);
        return;
      }
    } else {
      camera.getWorldQuaternion(_camQuat);
      _forward.set(0, 0, -1).applyQuaternion(_camQuat).setY(0);
      if (_forward.lengthSq() < 1e-6) _forward.set(0, 0, -1);
      _forward.normalize();
      _right.set(1, 0, 0).applyQuaternion(_camQuat).setY(0);
      if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0);
      _right.normalize();

      // Stick up is negative Y on xr-standard, hence `-stick.y` forward.
      _move
        .set(0, 0, 0)
        .addScaledVector(_right, stick.x)
        .addScaledVector(_forward, -stick.y)
        .normalize()
        .multiplyScalar(this.moveSpeed * magnitude);

      // ~0.1 s ramp so a flicked stick does not lurch.
      this.velocity.lerp(_move, 1 - Math.exp(-14 * dt));
    }

    this.options.locomotion.translateBy(
      this.velocity.x * dt,
      this.velocity.z * dt,
    );
  }

  private updateSnapTurn(stick: StickAxes): void {
    if (this.snapArmed) {
      const step = THREE.MathUtils.degToRad(this.snapTurnDegrees);
      if (stick.x >= SNAP_ENTER) {
        this.options.locomotion.snapTurn(-step); // +X is right, so yaw negative
        this.snapArmed = false;
        this.snapTurns++;
      } else if (stick.x <= -SNAP_ENTER) {
        this.options.locomotion.snapTurn(step);
        this.snapArmed = false;
        this.snapTurns++;
      }
      return;
    }
    if (Math.abs(stick.x) <= SNAP_RELEASE) this.snapArmed = true;
  }

  private updateTeleport(stick: StickAxes): void {
    if (!this.teleportActive) {
      if (stick.y < TELEPORT_ENTER) return;
      this.teleportActive = true;
      this.hasTeleportAim = false;
      this.refreshTeleportAim();
      return;
    }

    if (stick.y <= TELEPORT_RELEASE) {
      this.teleportActive = false;
      if (this.hasTeleportAim) {
        this.options.locomotion.commitAim();
        this.teleports++;
      } else {
        this.options.locomotion.cancelAim();
      }
      this.hasTeleportAim = false;
      this.options.locomotion.setAimRayOrigin(null);
      return;
    }

    this.refreshTeleportAim();
  }

  private refreshTeleportAim(): void {
    const locomotion = this.options.locomotion;
    const ray = this.options.getRayForHand('right') ?? this.options.getGazeRay();
    if (!ray) {
      this.dropTeleportAim();
      return;
    }

    let resolved = this.options.raycastGround(ray, _aim);
    if (!resolved) resolved = this.intersectFloorPlane(ray, _aim);
    if (!resolved) {
      this.dropTeleportAim();
      return;
    }

    this.options.camera.getWorldPosition(_head);
    const dx = _aim.x - _head.x;
    const dz = _aim.z - _head.z;
    const distance = Math.hypot(dx, dz);
    if (distance < MIN_TELEPORT_DISTANCE) {
      this.dropTeleportAim();
      return;
    }
    if (distance > MAX_TELEPORT_DISTANCE) {
      const scale = MAX_TELEPORT_DISTANCE / distance;
      _aim.x = _head.x + dx * scale;
      _aim.z = _head.z + dz * scale;
    }
    _aim.y = 0;

    if (this.hasTeleportAim) {
      locomotion.updateAim(_aim);
    } else {
      locomotion.beginAim(_aim);
      this.hasTeleportAim = true;
    }
    locomotion.setAimRayOrigin(ray.origin);
    this.teleportPoint.copy(_aim);
  }

  private dropTeleportAim(): void {
    this.hasTeleportAim = false;
    this.options.locomotion.setAimRayOrigin(null);
    this.options.locomotion.cancelAim();
  }

  private abortTeleport(): void {
    if (!this.teleportActive && !this.hasTeleportAim) return;
    this.teleportActive = false;
    this.dropTeleportAim();
  }

  /** Fallback when the floor mesh is not tagged: intersect the y = 0 plane. */
  private intersectFloorPlane(ray: THREE.Ray, out: THREE.Vector3): boolean {
    if (ray.direction.y > -0.08) return false;
    const t = -ray.origin.y / ray.direction.y;
    if (!Number.isFinite(t) || t <= 0 || t > 60) return false;
    out.copy(ray.origin).addScaledVector(ray.direction, t);
    return true;
  }

  private readStick(hand: 'left' | 'right'): StickAxes {
    const controllers = this.options.getControllers();

    // Real XR controller: each hand carries its own xr-standard gamepad.
    const paired = controllers.find(
      (controller) =>
        controller.gamepad && controller.inputSource?.handedness === hand,
    );
    if (paired?.gamepad) return readControllerStick(paired.gamepad);

    // Desktop gamepad / simulator: one device exposes both sticks on axes 0-3.
    const single = controllers.find(
      (controller) => controller.gamepad && !controller.inputSource?.handedness,
    );
    const gamepad = single?.gamepad;
    if (gamepad) {
      return hand === 'left'
        ? {
            x: applyDeadzone(gamepad.axes[0] ?? 0),
            y: applyDeadzone(gamepad.axes[1] ?? 0),
          }
        : {
            x: applyDeadzone(gamepad.axes[2] ?? 0),
            y: applyDeadzone(gamepad.axes[3] ?? 0),
          };
    }

    return ZERO_STICK;
  }
}
