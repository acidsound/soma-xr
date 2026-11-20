import * as THREE from 'three';
import * as xb from 'xrblocks';
import type { PlaygroundCommandType, PlaygroundObjectId } from '../types';
import { PLAYGROUND_LAYOUT } from '../sim/playgroundSim';
import { XrLocomotion } from './XrLocomotion';
import { XrStickLocomotion, type StickAxes } from './XrStickLocomotion';
import { WristRadialMenu, type MenuHand } from './WristRadialMenu';

export interface XrInteractionCallbacks {
  isPlaying: () => boolean;
  isXrActive: () => boolean;
  onSummonUI: () => void;
  onPlaygroundAction: (cmd: PlaygroundCommandType) => void;
  onPlaygroundObject: (id: PlaygroundObjectId) => void;
  onMoveAvatar: (x: number, z: number) => void;
  onHeadPat: () => void;
  onDebug: (tag: string, data: Record<string, unknown>) => void;
  onVoiceToggle: () => void;
  onCallAvatar: () => void;
}

const _groundPoint = new THREE.Vector3();
const _centerNdc = new THREE.Vector2(0, 0);

/**
 * Bridges xrblocks select/squeeze/gesture events to the app's XR affordances:
 * floor teleportation, the wrist radial menu, and the summonable info card.
 */
export class XrInteractionBridge extends xb.Script {
  private readonly locomotion: XrLocomotion;
  private readonly sticks: XrStickLocomotion;
  private readonly menu: WristRadialMenu;
  private readonly callbacks: XrInteractionCallbacks;
  private readonly centerRaycaster = new THREE.Raycaster();
  private readonly groundRaycaster = new THREE.Raycaster();
  private readonly groundMeshes: THREE.Object3D[] = [];
  private readonly interactionMeshes: THREE.Object3D[] = [];
  private debugSelectStarts = 0;
  private debugAims = 0;
  private debugCommits = 0;
  private teleportArmed = false;

  private readonly onGestureStart = (event: xb.GestureEvent): void => {
    if (event.detail.name !== 'fist') return;
    if (!this.callbacks.isPlaying()) return;
    const hand: MenuHand = event.detail.hand === 'left' ? 'left' : 'right';
    this.menu.toggle(hand);
  };

  constructor(callbacks: XrInteractionCallbacks) {
    super();
    this.name = 'XrInteractionBridge';
    this.callbacks = callbacks;

    this.menu = new WristRadialMenu([
      {
        id: 'summon',
        label: '카드 소환',
        color: 0x8b5cf6,
        onSelect: () => this.callbacks.onSummonUI(),
      },
      {
        id: 'sit',
        label: '벤치 앉기',
        color: 0x0ea5e9,
        onSelect: () => this.callbacks.onPlaygroundAction('sit_bench'),
      },
      {
        id: 'kick',
        label: '공 차기',
        color: 0xf59e0b,
        onSelect: () => this.callbacks.onPlaygroundAction('kick_soccer'),
      },
      {
        id: 'voice',
        label: '음성 대화',
        color: 0xec4899,
        onSelect: () => this.callbacks.onVoiceToggle(),
      },
      {
        id: 'teleport',
        label: '내 이동',
        color: 0x14b8a6,
        onSelect: () => {
          this.teleportArmed = !this.teleportArmed;
          if (!this.teleportArmed) this.locomotion.cancelAim();
        },
      },
      {
        id: 'avatar',
        label: '아바타 호출',
        color: 0x22c55e,
        onSelect: () => this.callbacks.onCallAvatar(),
      },
      {
        id: 'close',
        label: '닫기',
        color: 0x475569,
        onSelect: () => this.menu.closeMenu(),
      },
    ]);
    this.add(this.menu.group);

    this.locomotion = new XrLocomotion({
      scene: xb.core.scene,
      camera: xb.core.camera as THREE.PerspectiveCamera,
      getSimulator: () => xb.core.simulator,
      isSimulatorRunning: () => xb.core.simulatorRunning,
      // Same walkable limit the simulation uses for the NPC.
      getBoundsHalfSize: () => PLAYGROUND_LAYOUT.boundsHalfSize - 0.55,
    });
    this.add(this.locomotion.rig);

    this.sticks = new XrStickLocomotion({
      camera: xb.core.camera as THREE.PerspectiveCamera,
      locomotion: this.locomotion,
      getControllers: () => xb.core.user.controllers,
      getRayForHand: (hand) => this.rayForHand(hand),
      getGazeRay: () => {
        this.centerRaycaster.setFromCamera(_centerNdc, xb.core.camera);
        return this.centerRaycaster.ray;
      },
      raycastGround: (ray, out) => this.raycastGround(ray, out),
      isActive: () => this.callbacks.isPlaying() && this.callbacks.isXrActive(),
      isBlocked: () => this.menu.isOpen,
    });
  }

  public get isMenuOpen(): boolean {
    return this.menu.isOpen;
  }

  public get isTeleportAiming(): boolean {
    return this.locomotion.isAiming;
  }

  public get isTeleportArmed(): boolean {
    return this.teleportArmed;
  }

  public get isStickTeleportAiming(): boolean {
    return this.sticks.isTeleportAiming;
  }

  public get stickState(): Record<string, unknown> {
    return this.sticks.debugState;
  }

  /** Test/QA hook: drive the thumbsticks without a headset. */
  public setVirtualSticks(left: StickAxes | null, right: StickAxes | null): void {
    this.sticks.setVirtualSticks(left, right);
  }

  public get debugCounters(): { selects: number; aims: number; commits: number } {
    return { selects: this.debugSelectStarts, aims: this.debugAims, commits: this.debugCommits };
  }

  /** Debug/QA hook: teleport the user to a world-space floor point. */
  public teleportToPoint(x: number, z: number): void {
    this.locomotion.beginAim(new THREE.Vector3(x, 0, z));
    this.locomotion.commitAim();
  }

  init(): void {
    xb.core.gestureRecognition?.addEventListener(
      'gesturestart',
      this.onGestureStart,
    );
    this.refreshInteractionTargets();
  }

  private refreshInteractionTargets(): void {
    this.groundMeshes.length = 0;
    this.interactionMeshes.length = 0;
    // XR select events have no `intersection` for scenery that is not part of
    // the interaction registry, so raycast these tagged meshes ourselves.
    xb.core.scene.traverse((object) => {
      if (!(object as THREE.Mesh).isMesh) return;
      if (object.userData?.playgroundGround) {
        this.groundMeshes.push(object);
        this.interactionMeshes.push(object);
        return;
      }
      if (object.userData?.playgroundObjectId || object.userData?.interactionZone) {
        this.interactionMeshes.push(object);
      }
    });
  }

  onXRSessionStarted(): void {
    this.refreshInteractionTargets();
    this.locomotion.onXrSessionStarted();
    this.menu.closeMenu();
    this.reportDebug('session-start');
  }

  onXRSessionEnded(): void {
    this.locomotion.onXrSessionEnded();
    this.menu.closeMenu();
  }

  onKeyDown(event: xb.KeyEvent): void {
    if (event.code === 'KeyG') {
      this.menu.toggle('right');
    } else if (event.code === 'KeyC') {
      this.callbacks.onSummonUI();
    }
  }

  onSelectStart(event: xb.SelectEvent): void {
    if (!this.callbacks.isPlaying() || !this.callbacks.isXrActive()) return;
    // The right stick owns the aim while it is held back for teleport.
    if (this.sticks.isTeleportAiming) return;
    this.debugSelectStarts++;
    this.reportDebug('select-start');
    const eventHasHit = !!event.intersection || !!event.surface || !!event.target;

    if (this.tryMenuSelect(event)) {
      event.stopPropagation();
      return;
    }

    const rayHit = this.trySelectFromRay(event);
    this.reportDebug('select-raycast', {
      eventHasHit,
      rayHit,
      aiming: this.locomotion.isAiming,
    });
    if (rayHit) {
      event.stopPropagation();
      return;
    }

    if (this.findGroundPoint(event)) {
      if (this.teleportArmed) {
        this.debugAims++;
        this.locomotion.beginAim(_groundPoint);
      } else {
        this.callbacks.onMoveAvatar(_groundPoint.x, _groundPoint.z);
      }
      event.stopPropagation();
    }
  }

  onSelecting(event: xb.SelectEvent): void {
    if (!this.locomotion.isAiming || this.sticks.isTeleportAiming) return;
    const controllers = xb.core.user.controllers;
    const index = controllers.indexOf(event.source.controller);
    const ray = xb.core.user.getRay(index >= 0 ? index : 0);
    if (ray.origin.lengthSq() > 1e-6 && this.raycastGround(ray, _groundPoint)) {
      this.locomotion.updateAim(_groundPoint);
    } else {
      this.locomotion.setAimVisible(false);
    }
  }

  onSelectEnd(): void {
    if (this.sticks.isTeleportAiming) return;
    if (!this.locomotion.isAiming) return;
    this.debugCommits++;
    this.locomotion.commitAim();
  }

  onSqueezeStart(event: xb.SelectEvent): void {
    if (!this.callbacks.isPlaying() || !this.callbacks.isXrActive()) return;
    const hand = this.handednessOf(event.source.controller) ?? 'right';
    this.menu.toggle(hand);
  }

  update(): void {
    const elapsed = xb.core.elapsedTime || performance.now() * 0.001;
    this.locomotion.update(elapsed);
    this.sticks.update(xb.getDeltaTime() || 0.016);
    if (!this.menu.isOpen) return;

    const camera = xb.core.camera;
    const user = xb.core.user;
    this.menu.update(camera, user.hands, user.controllers);

    let hovered = -1;
    for (let i = 0; i < user.controllers.length; i++) {
      const ray = user.getRay(i);
      if (ray.origin.lengthSq() < 1e-6) continue;
      hovered = this.menu.hoverWithRay(ray);
      if (hovered >= 0) break;
    }
    if (hovered < 0) {
      this.centerRaycaster.setFromCamera(_centerNdc, camera);
      this.menu.hoverWithRay(this.centerRaycaster.ray);
    }
  }

  dispose(): void {
    xb.core.gestureRecognition?.removeEventListener(
      'gesturestart',
      this.onGestureStart,
    );
    this.menu.dispose();
    this.locomotion.dispose();
    super.dispose();
  }

  private handednessOf(controller: xb.Controller): MenuHand | null {
    const value = controller.inputSource?.handedness;
    if (value === 'left' || value === 'right') return value;
    return null;
  }

  private tryMenuSelect(event: xb.SelectEvent): boolean {
    if (!this.menu.isOpen) return false;

    const surfaceIndex = this.menu.itemIndexFromObject(
      event.surface || event.target,
    );
    if (surfaceIndex >= 0) {
      return this.menu.activate(surfaceIndex);
    }

    const controllers = xb.core.user.controllers;
    const index = controllers.indexOf(event.source.controller);
    const ray = xb.core.user.getRay(index >= 0 ? index : 0);
    if (ray.origin.lengthSq() < 1e-6) return false;
    const hovered = this.menu.hoverWithRay(ray);
    return hovered >= 0 ? this.menu.activate(hovered) : false;
  }

  private reportDebug(tag: string, extra: Record<string, unknown> = {}): void {
    const user = xb.core.user;
    const rays = user.controllers.map((_, index) => {
      const ray = user.getRay(index);
      return {
        origin: ray.origin.toArray().map((v) => +v.toFixed(2)),
        direction: ray.direction.toArray().map((v) => +v.toFixed(2)),
      };
    });
    const camera = xb.core.camera;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
      camera.getWorldQuaternion(new THREE.Quaternion()),
    );
    this.callbacks.onDebug(tag, {
      presenting: !!xb.core.renderer?.xr?.isPresenting,
      isXrActive: this.callbacks.isXrActive(),
      isPlaying: this.callbacks.isPlaying(),
      controllers: user.controllers.length,
      hands: user.hands ? 1 : 0,
      rays,
      gaze: forward.toArray().map((v) => +v.toFixed(2)),
      groundMeshes: this.groundMeshes.length,
      interactionMeshes: this.interactionMeshes.length,
      teleportArmed: this.teleportArmed,
      counters: this.debugCounters,
      ...extra,
    });
  }

  /** Controller ray for a specific hand, or null when it is not tracked yet. */
  private rayForHand(hand: MenuHand): THREE.Ray | null {
    const controllers = xb.core.user.controllers;
    const index = controllers.findIndex(
      (controller) => this.handednessOf(controller) === hand,
    );
    if (index < 0) return null;
    const ray = xb.core.user.getRay(index);
    return ray.origin.lengthSq() > 1e-6 ? ray : null;
  }

  private rayForEvent(event: xb.SelectEvent): THREE.Ray | null {
    const controllers = xb.core.user.controllers;
    const index = controllers.indexOf(event.source.controller);
    const ray = xb.core.user.getRay(index >= 0 ? index : 0);
    if (ray.origin.lengthSq() > 1e-6) return ray;

    // Hand tracking may not expose a controller ray; fall back to gaze.
    this.centerRaycaster.setFromCamera(_centerNdc, xb.core.camera);
    return this.centerRaycaster.ray;
  }

  /**
   * Raycast tagged playground scenery directly. xrblocks only fills
   * `event.intersection` for objects in its interaction registry, so floor and
   * playground props otherwise produce no select result in an XR session.
   */
  private trySelectFromRay(event: xb.SelectEvent): boolean {
    if (this.interactionMeshes.length === 0) this.refreshInteractionTargets();
    const ray = this.rayForEvent(event);
    if (!ray) return false;

    this.groundRaycaster.set(ray.origin, ray.direction);
    const hits = this.groundRaycaster.intersectObjects(
      this.interactionMeshes,
      true,
    );
    for (const hit of hits) {
      let node: THREE.Object3D | null = hit.object;
      while (node) {
        const objectId = node.userData?.playgroundObjectId as
          | PlaygroundObjectId
          | undefined;
        if (objectId) {
          this.callbacks.onPlaygroundObject(objectId);
          return true;
        }
        if (node.userData?.interactionZone === 'head') {
          this.callbacks.onHeadPat();
          return true;
        }
        if (node.userData?.playgroundGround) {
          if (this.teleportArmed) {
            this.debugAims++;
            this.locomotion.beginAim(hit.point);
          } else {
            this.callbacks.onMoveAvatar(hit.point.x, hit.point.z);
          }
          return true;
        }
        node = node.parent;
      }
    }
    return false;
  }

  private raycastGround(ray: THREE.Ray, out: THREE.Vector3): boolean {
    if (this.groundMeshes.length === 0) return false;
    this.groundRaycaster.set(ray.origin, ray.direction);
    const hits = this.groundRaycaster.intersectObjects(this.groundMeshes, false);
    if (hits.length === 0) return false;
    out.copy(hits[0].point);
    return true;
  }

  private findGroundPoint(event: xb.SelectEvent): boolean {
    if (!event.intersection) return false;
    let node: THREE.Object3D | null = event.surface || event.target || null;
    while (node) {
      if (node.userData?.playgroundGround) {
        _groundPoint.copy(event.intersection.point);
        return true;
      }
      node = node.parent;
    }
    return false;
  }
}
