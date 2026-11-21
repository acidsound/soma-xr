import * as THREE from 'three';

export interface RadialMenuItem {
  id: string;
  label: string;
  color: number;
  onSelect: () => void;
}

export type MenuHand = 'left' | 'right';

type HandsLike = {
  hands: Array<THREE.XRHandSpace | null | undefined>;
};

type ControllerLike = THREE.Object3D & {
  inputSource?: { handedness?: string } | null;
};

const _wrist = new THREE.Vector3();
const _cameraPos = new THREE.Vector3();
const _toCamera = new THREE.Vector3();
const _wristOffset = new THREE.Vector3(0, 0.045, 0);
const _tmpColor = new THREE.Color();

function makeLabelTexture(text: string, color = '#ffffff'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 256, 96);
    ctx.fillStyle = 'rgba(12, 14, 24, 0.72)';
    ctx.fillRect(6, 14, 244, 68);
    ctx.font = 'bold 40px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, 128, 49, 232);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * A small world-space radial menu that rides on the user's wrist. It is drawn
 * with plain THREE meshes (not the DOM/uikit stack) so it stays cheap enough
 * for an 72-90 Hz headset and can be hit by both controller rays and hand rays.
 */
export class WristRadialMenu {
  public readonly group = new THREE.Group();

  private readonly items: RadialMenuItem[];
  private readonly segmentMeshes: THREE.Mesh[] = [];
  private readonly labelMeshes: THREE.Mesh[] = [];
  private readonly segmentMaterials: THREE.MeshBasicMaterial[] = [];
  private readonly baseColors: THREE.Color[] = [];
  private readonly labelTextures: THREE.Texture[] = [];
  private readonly itemEnabled: boolean[];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly raycaster = new THREE.Raycaster();

  private activeHand: MenuHand = 'right';
  private hoveredIndex = -1;
  private open = false;

  constructor(items: RadialMenuItem[]) {
    this.items = items;
    this.itemEnabled = items.map(() => true);
    this.group.name = 'WristRadialMenu';
    this.group.visible = false;
    this.group.renderOrder = 20;

    const inner = 0.058;
    const outer = 0.122;
    const step = (Math.PI * 2) / Math.max(1, items.length);
    const gap = 0.05;

    items.forEach((item, index) => {
      const angle = Math.PI / 2 - (index + 0.5) * step;
      const start = angle - step * 0.5 + gap * 0.5;
      const geometry = new THREE.RingGeometry(
        inner,
        outer,
        20,
        1,
        start,
        step - gap,
      );
      this.geometries.push(geometry);
      const base = new THREE.Color(item.color);
      const material = new THREE.MeshBasicMaterial({
        color: base.clone(),
        transparent: true,
        opacity: 0.86,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.radialItemIndex = index;
      mesh.renderOrder = 21;
      this.group.add(mesh);

      const texture = makeLabelTexture(item.label);
      this.labelTextures.push(texture);
      const labelGeo = new THREE.PlaneGeometry(0.082, 0.031);
      this.geometries.push(labelGeo);
      const label = new THREE.Mesh(
        labelGeo,
        new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          depthTest: false,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      const mid = (inner + outer) * 0.5;
      label.position.set(Math.cos(angle) * mid, Math.sin(angle) * mid, 0.003);
      label.renderOrder = 22;
      // Labels must not block ray selection of their segment.
      label.raycast = () => {};
      this.group.add(label);
      this.labelMeshes.push(label);

      this.segmentMeshes.push(mesh);
      this.segmentMaterials.push(material);
      this.baseColors.push(base);
    });

    const hubGeo = new THREE.CircleGeometry(0.052, 24);
    this.geometries.push(hubGeo);
    const hub = new THREE.Mesh(
      hubGeo,
      new THREE.MeshBasicMaterial({
        color: 0x111827,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    hub.renderOrder = 22;
    hub.raycast = () => {};
    this.group.add(hub);

    const hubTex = makeLabelTexture('메뉴', '#f9a8d4');
    this.labelTextures.push(hubTex);
    const hubLabelGeo = new THREE.PlaneGeometry(0.05, 0.019);
    this.geometries.push(hubLabelGeo);
    const hubLabel = new THREE.Mesh(
      hubLabelGeo,
      new THREE.MeshBasicMaterial({
        map: hubTex,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    hubLabel.position.z = 0.004;
    hubLabel.renderOrder = 23;
    hubLabel.raycast = () => {};
    this.group.add(hubLabel);
  }

  public get isOpen(): boolean {
    return this.open;
  }

  public get currentHand(): MenuHand {
    return this.activeHand;
  }

  public get segments(): THREE.Object3D[] {
    return this.segmentMeshes;
  }

  public openMenu(hand: MenuHand): void {
    this.activeHand = hand;
    this.open = true;
    this.setHover(-1);
    this.group.visible = true;
  }

  public closeMenu(): void {
    this.open = false;
    this.group.visible = false;
    this.setHover(-1);
  }

  public toggle(hand: MenuHand): boolean {
    if (this.open && this.activeHand === hand) {
      this.closeMenu();
    } else {
      this.openMenu(hand);
    }
    return this.open;
  }

  /** Resolve a radial item from any hit object (segment mesh or its owner). */
  public itemIndexFromObject(object: THREE.Object3D | null | undefined): number {
    let node: THREE.Object3D | null = object ?? null;
    while (node) {
      const idx = node.userData?.radialItemIndex;
      if (typeof idx === 'number') return idx;
      node = node.parent;
    }
    return -1;
  }

  public activate(index: number): boolean {
    const item = this.items[index];
    if (!item) return false;
    if (!this.itemEnabled[index]) return false;
    this.closeMenu();
    item.onSelect();
    return true;
  }

  /** Hover a segment with a ray, returning the hovered item index. */
  public hoverWithRay(ray: THREE.Ray | null): number {
    let index = -1;
    if (ray && this.open) {
      this.raycaster.set(ray.origin, ray.direction);
      const hits = this.raycaster.intersectObjects(this.segmentMeshes, false);
      if (hits.length > 0) {
        const resolved = this.itemIndexFromObject(hits[0].object);
        index = resolved >= 0 && this.itemEnabled[resolved] ? resolved : -1;
      }
    }
    this.setHover(index);
    return index;
  }

  /** Re-anchor the menu to the active wrist and orient it toward the headset. */
  public update(
    camera: THREE.Camera,
    hands?: HandsLike,
    controllers?: ControllerLike[],
  ): void {
    if (!this.open) return;

    const handednessIndex = this.activeHand === 'left' ? 0 : 1;
    const hand = hands?.hands?.[handednessIndex];
    const wristJoint = hand?.joints?.wrist;
    const handAnchor = wristJoint as THREE.Object3D | undefined;

    let anchor: THREE.Object3D | undefined = handAnchor?.visible
      ? handAnchor
      : undefined;
    if (!anchor && controllers) {
      anchor = controllers.find(
        (c) => c.inputSource?.handedness === this.activeHand,
      );
    }
    if (!anchor && controllers && controllers.length > 0) {
      anchor = controllers[handednessIndex] ?? controllers[0];
    }
    if (!anchor) return;

    anchor.getWorldPosition(_wrist);
    camera.getWorldPosition(_cameraPos);
    _toCamera.copy(_cameraPos).sub(_wrist);
    const distance = Math.max(0.2, _toCamera.length());
    _toCamera.multiplyScalar(1 / distance);

    // Sit just above and slightly in front of the wrist so the ring is readable
    // without floating in front of the face.
    this.group.position
      .copy(_wrist)
      .addScaledVector(_toCamera, 0.035)
      .add(_wristOffset);
    this.group.lookAt(_cameraPos);
    const scale = THREE.MathUtils.clamp(distance / 0.62, 0.85, 1.45);
    this.group.scale.setScalar(scale);
    this.group.updateMatrixWorld(true);
  }

  /** Enable or disable a menu item (e.g. teleport in AR mode). Disabled items are dimmed and unhittable. */
  public setItemEnabled(index: number, enabled: boolean): void {
    if (index < 0 || index >= this.itemEnabled.length) return;
    if (this.itemEnabled[index] === enabled) return;
    this.itemEnabled[index] = enabled;
    if (!enabled && this.hoveredIndex === index) this.hoveredIndex = -1;
    this.applyItemStyles();
  }

  private setHover(index: number): void {
    if (this.hoveredIndex === index) return;
    this.hoveredIndex = index;
    this.applyItemStyles();
  }

  private applyItemStyles(): void {
    for (let i = 0; i < this.segmentMaterials.length; i++) {
      const material = this.segmentMaterials[i];
      const label = this.labelMeshes[i];
      if (!this.itemEnabled[i]) {
        material.color.copy(this.baseColors[i]).multiplyScalar(0.35);
        material.opacity = 0.18;
        if (label) label.visible = false;
        continue;
      }
      material.color.copy(this.baseColors[i]);
      if (i === this.hoveredIndex) {
        _tmpColor.set('#ffffff');
        material.color.lerp(_tmpColor, 0.5);
        material.opacity = 1;
      } else {
        material.opacity = 0.86;
      }
      if (label) label.visible = true;
    }
  }

  public dispose(): void {
    this.closeMenu();
    this.group.removeFromParent();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.segmentMaterials) material.dispose();
    for (const child of this.group.children) {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && mesh.material && !this.segmentMaterials.includes(mesh.material as THREE.MeshBasicMaterial)) {
        (mesh.material as THREE.Material).dispose();
      }
    }
    for (const texture of this.labelTextures) texture.dispose();
  }
}
