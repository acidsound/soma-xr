import * as THREE from 'three';
import type { PersonaProfile } from '../types';

export interface ProceduralExpressionState {
  happy: number;
  sad: number;
  angry: number;
  relaxed: number;
  surprised: number;
  blush: number;
  blink: number;
  mouthOpen: number;
}

function createIrisTexture(baseHex: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const c = new THREE.Color(baseHex);
    const dark = c.clone().multiplyScalar(0.38);
    const bright = c.clone().lerp(new THREE.Color(0xffffff), 0.45);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 256, 256);

    const cx = 128;
    const cy = 128;
    const irisGrad = ctx.createLinearGradient(0, 48, 0, 208);
    irisGrad.addColorStop(0, `#${dark.getHexString()}`);
    irisGrad.addColorStop(0.55, `#${c.getHexString()}`);
    irisGrad.addColorStop(1, `#${bright.getHexString()}`);

    ctx.beginPath();
    ctx.arc(cx, cy, 78, 0, Math.PI * 2);
    ctx.fillStyle = irisGrad;
    ctx.fill();

    // Pupil
    ctx.beginPath();
    ctx.arc(cx, cy + 4, 34, 0, Math.PI * 2);
    ctx.fillStyle = '#181426';
    ctx.fill();

    // Specular catchlights
    ctx.beginPath();
    ctx.arc(cx - 26, cy - 26, 17, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx + 22, cy + 24, 8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createBlushTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(64, 32, 4, 64, 32, 56);
    grad.addColorStop(0, 'rgba(255, 108, 138, 0.85)');
    grad.addColorStop(0.6, 'rgba(255, 130, 155, 0.35)');
    grad.addColorStop(1, 'rgba(255, 130, 155, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 64);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Stylized multi-part VRM-compatible 3D companion avatar.
 * Grounded at y = 0 (feet soles), standing ~1.58m tall, facing +Z.
 * Implements the full VRM humanoid bone dictionary + facial expression controls.
 */
export class ProceduralVrmAvatar extends THREE.Group {
  public readonly bones: Record<string, THREE.Object3D> = {};
  private disposables: Array<{ dispose: () => void }> = [];

  private skinMat: THREE.MeshStandardMaterial;
  private hairMat: THREE.MeshStandardMaterial;
  private irisMat: THREE.MeshStandardMaterial;
  private irisTex: THREE.CanvasTexture;
  private outfitPrimaryMat: THREE.MeshStandardMaterial;
  private outfitAccentMat: THREE.MeshStandardMaterial;
  private ribbonMat: THREE.MeshStandardMaterial;
  private blushMat: THREE.MeshBasicMaterial;
  private mouthMat: THREE.MeshStandardMaterial;

  private leftIrisMesh!: THREE.Mesh;
  private rightIrisMesh!: THREE.Mesh;
  private leftEyelid!: THREE.Mesh;
  private rightEyelid!: THREE.Mesh;
  private leftBrow!: THREE.Mesh;
  private rightBrow!: THREE.Mesh;
  private mouthMesh!: THREE.Mesh;
  private hairTailGroup!: THREE.Group;

  constructor(persona: PersonaProfile) {
    super();
    this.name = `Companion_${persona.id}`;

    this.skinMat = new THREE.MeshStandardMaterial({
      color: persona.palette.skin,
      roughness: 0.64,
      metalness: 0.02,
    });
    this.hairMat = new THREE.MeshStandardMaterial({
      color: persona.palette.hair,
      roughness: 0.44,
      metalness: 0.08,
    });
    this.irisTex = createIrisTexture(persona.palette.eyes);
    this.irisMat = new THREE.MeshStandardMaterial({
      map: this.irisTex,
      roughness: 0.18,
      metalness: 0.05,
    });
    this.outfitPrimaryMat = new THREE.MeshStandardMaterial({
      color: persona.palette.outfitPrimary,
      roughness: 0.84,
      metalness: 0.04,
    });
    this.outfitAccentMat = new THREE.MeshStandardMaterial({
      color: persona.palette.outfitAccent,
      roughness: 0.72,
      metalness: 0.05,
    });
    this.ribbonMat = new THREE.MeshStandardMaterial({
      color: persona.palette.ribbon,
      roughness: 0.3,
      metalness: 0.12,
    });
    const blushTex = createBlushTexture();
    this.blushMat = new THREE.MeshBasicMaterial({
      map: blushTex,
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
    });
    this.mouthMat = new THREE.MeshStandardMaterial({
      color: 0xd96b7c,
      roughness: 0.45,
    });

    this.disposables.push(
      this.skinMat,
      this.hairMat,
      this.irisTex,
      this.irisMat,
      this.outfitPrimaryMat,
      this.outfitAccentMat,
      this.ribbonMat,
      blushTex,
      this.blushMat,
      this.mouthMat,
    );

    this.buildSkeleton();
  }

  private trackGeo<T extends THREE.BufferGeometry>(geo: T): T {
    this.disposables.push(geo);
    return geo;
  }

  private buildSkeleton(): void {
    const whiteMat = new THREE.MeshStandardMaterial({
      color: 0xfefefe,
      roughness: 0.35,
    });
    const darkShoeMat = new THREE.MeshStandardMaterial({
      color: 0x241f2d,
      roughness: 0.35,
      metalness: 0.15,
    });
    const blouseMat = new THREE.MeshStandardMaterial({
      color: 0xfbf8f6,
      roughness: 0.78,
    });
    this.disposables.push(whiteMat, darkShoeMat, blouseMat);

    // Hips at standing pelvic height (0.86m)
    const hips = new THREE.Group();
    hips.name = 'hips';
    hips.position.set(0, 0.86, 0);
    this.add(hips);
    this.bones.hips = hips;

    // Pelvis inner volume & Double-sided Pleated A-line Skirt
    const pelvisCore = new THREE.Mesh(
      this.trackGeo(new THREE.SphereGeometry(0.105, 18, 14)),
      this.outfitPrimaryMat,
    );
    pelvisCore.scale.set(1.06, 0.78, 0.88);
    pelvisCore.position.y = -0.02;
    hips.add(pelvisCore);

    const skirtMat = this.outfitPrimaryMat.clone();
    skirtMat.side = THREE.DoubleSide;
    this.disposables.push(skirtMat);

    const skirtProfile = [
      new THREE.Vector2(0.098, 0.065),
      new THREE.Vector2(0.12, 0.01),
      new THREE.Vector2(0.205, -0.17),
      new THREE.Vector2(0.255, -0.31),
    ];
    const skirtGeo = this.trackGeo(new THREE.LatheGeometry(skirtProfile, 32));
    const skirtMesh = new THREE.Mesh(skirtGeo, skirtMat);
    skirtMesh.castShadow = true;
    skirtMesh.receiveShadow = true;
    hips.add(skirtMesh);

    // Waist accent sash
    const sashMesh = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.102, 0.112, 0.052, 24)),
      this.outfitAccentMat,
    );
    sashMesh.scale.set(1.04, 1, 0.86);
    sashMesh.position.y = 0.042;
    hips.add(sashMesh);

    // Spine -> Chest -> UpperChest (continuous fitted bodice, no midriff skin gap)
    const spine = new THREE.Group();
    spine.name = 'spine';
    spine.position.set(0, 0.06, 0);
    hips.add(spine);
    this.bones.spine = spine;

    const torsoLower = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.102, 0.098, 0.16, 22)),
      this.outfitPrimaryMat,
    );
    torsoLower.scale.set(1.04, 1, 0.84);
    torsoLower.position.y = 0.075;
    torsoLower.castShadow = true;
    torsoLower.userData.interactionZone = 'body';
    spine.add(torsoLower);

    const chest = new THREE.Group();
    chest.name = 'chest';
    chest.position.set(0, 0.14, 0);
    spine.add(chest);
    this.bones.chest = chest;

    const jacketMesh = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.116, 0.101, 0.175, 22)),
      this.outfitPrimaryMat,
    );
    jacketMesh.position.y = 0.085;
    jacketMesh.scale.set(1.08, 1, 0.84);
    jacketMesh.castShadow = true;
    jacketMesh.userData.interactionZone = 'body';
    chest.add(jacketMesh);

    // Blouse V-front insert for tailored layered look
    const blouseInsert = new THREE.Mesh(
      this.trackGeo(new THREE.ConeGeometry(0.052, 0.14, 12)),
      blouseMat,
    );
    blouseInsert.rotation.x = Math.PI;
    blouseInsert.scale.set(1.0, 1, 0.45);
    blouseInsert.position.set(0, 0.115, 0.078);
    chest.add(blouseInsert);

    const upperChest = new THREE.Group();
    upperChest.name = 'upperChest';
    upperChest.position.set(0, 0.16, 0);
    chest.add(upperChest);
    this.bones.upperChest = upperChest;

    // Collar + Ribbon Bow
    const collar = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.068, 0.014, 10, 24)),
      blouseMat,
    );
    collar.rotation.x = Math.PI / 2 + 0.18;
    collar.position.set(0, 0.04, 0.012);
    upperChest.add(collar);

    const ribbonGroup = new THREE.Group();
    ribbonGroup.position.set(0, 0.015, 0.096);
    const wingGeo = this.trackGeo(new THREE.ConeGeometry(0.022, 0.055, 8));
    const leftWing = new THREE.Mesh(wingGeo, this.ribbonMat);
    leftWing.rotation.z = -Math.PI / 2.2;
    leftWing.position.x = -0.026;
    const rightWing = new THREE.Mesh(wingGeo, this.ribbonMat);
    rightWing.rotation.z = Math.PI / 2.2;
    rightWing.position.x = 0.026;
    const knot = new THREE.Mesh(
      this.trackGeo(new THREE.SphereGeometry(0.014, 12, 12)),
      this.ribbonMat,
    );
    ribbonGroup.add(leftWing, rightWing, knot);
    upperChest.add(ribbonGroup);

    // Neck & Head
    const neck = new THREE.Group();
    neck.name = 'neck';
    neck.position.set(0, 0.06, 0);
    upperChest.add(neck);
    this.bones.neck = neck;

    const neckMesh = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.036, 0.042, 0.085, 16)),
      this.skinMat,
    );
    neckMesh.position.y = 0.035;
    neck.add(neckMesh);

    const head = new THREE.Group();
    head.name = 'head';
    head.position.set(0, 0.075, 0);
    neck.add(head);
    this.bones.head = head;

    // Head base (sculpted slightly oval anime silhouette)
    const headMesh = new THREE.Mesh(
      this.trackGeo(new THREE.SphereGeometry(0.118, 28, 24)),
      this.skinMat,
    );
    headMesh.position.set(0, 0.11, 0);
    headMesh.scale.set(0.95, 1.03, 0.96);
    headMesh.castShadow = true;
    headMesh.userData.interactionZone = 'head';
    head.add(headMesh);

    // Soft chin contour
    const chinMesh = new THREE.Mesh(
      this.trackGeo(new THREE.SphereGeometry(0.072, 20, 16)),
      this.skinMat,
    );
    chinMesh.position.set(0, 0.052, 0.038);
    chinMesh.scale.set(0.92, 0.72, 0.85);
    head.add(chinMesh);

    // Eyes (Left = +X, Right = -X in +Z facing character space)
    const leftEyePivot = new THREE.Group();
    leftEyePivot.name = 'leftEye';
    leftEyePivot.position.set(0.042, 0.102, 0.101);
    head.add(leftEyePivot);
    this.bones.leftEye = leftEyePivot;

    const rightEyePivot = new THREE.Group();
    rightEyePivot.name = 'rightEye';
    rightEyePivot.position.set(-0.042, 0.102, 0.101);
    head.add(rightEyePivot);
    this.bones.rightEye = rightEyePivot;

    const scleraGeo = this.trackGeo(new THREE.SphereGeometry(0.025, 18, 16));
    const leftSclera = new THREE.Mesh(scleraGeo, whiteMat);
    leftSclera.scale.set(1.08, 1.18, 0.55);
    leftEyePivot.add(leftSclera);

    const rightSclera = new THREE.Mesh(scleraGeo, whiteMat);
    rightSclera.scale.set(1.08, 1.18, 0.55);
    rightEyePivot.add(rightSclera);

    const irisGeo = this.trackGeo(new THREE.CircleGeometry(0.02, 22));
    this.leftIrisMesh = new THREE.Mesh(irisGeo, this.irisMat);
    this.leftIrisMesh.position.set(0, 0, 0.0145);
    leftEyePivot.add(this.leftIrisMesh);

    this.rightIrisMesh = new THREE.Mesh(irisGeo, this.irisMat);
    this.rightIrisMesh.position.set(0, 0, 0.0145);
    rightEyePivot.add(this.rightIrisMesh);

    // Eyelids for natural blink & happy smile curve
    const eyelidGeo = this.trackGeo(
      new THREE.SphereGeometry(0.0265, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
    );
    this.leftEyelid = new THREE.Mesh(eyelidGeo, this.skinMat);
    this.leftEyelid.scale.set(1.1, 1.2, 0.65);
    this.leftEyelid.rotation.x = -0.95;
    leftEyePivot.add(this.leftEyelid);

    this.rightEyelid = new THREE.Mesh(eyelidGeo, this.skinMat);
    this.rightEyelid.scale.set(1.1, 1.2, 0.65);
    this.rightEyelid.rotation.x = -0.95;
    rightEyePivot.add(this.rightEyelid);

    // Eyebrows
    const browGeo = this.trackGeo(new THREE.CapsuleGeometry(0.0032, 0.026, 4, 8));
    this.leftBrow = new THREE.Mesh(browGeo, this.hairMat);
    this.leftBrow.rotation.z = Math.PI / 2 - 0.08;
    this.leftBrow.position.set(0.042, 0.148, 0.106);
    head.add(this.leftBrow);

    this.rightBrow = new THREE.Mesh(browGeo, this.hairMat);
    this.rightBrow.rotation.z = Math.PI / 2 + 0.08;
    this.rightBrow.position.set(-0.042, 0.148, 0.106);
    head.add(this.rightBrow);

    // Blush Cheeks
    const blushGeo = this.trackGeo(new THREE.PlaneGeometry(0.042, 0.022));
    const leftBlush = new THREE.Mesh(blushGeo, this.blushMat);
    leftBlush.position.set(0.058, 0.083, 0.095);
    leftBlush.rotation.y = 0.42;
    head.add(leftBlush);

    const rightBlush = new THREE.Mesh(blushGeo, this.blushMat);
    rightBlush.position.set(-0.058, 0.083, 0.095);
    rightBlush.rotation.y = -0.42;
    head.add(rightBlush);

    // Delicate nose & mouth
    const nose = new THREE.Mesh(
      this.trackGeo(new THREE.SphereGeometry(0.0055, 8, 8)),
      this.skinMat,
    );
    nose.position.set(0, 0.086, 0.114);
    head.add(nose);

    this.mouthMesh = new THREE.Mesh(
      this.trackGeo(new THREE.SphereGeometry(0.011, 14, 12)),
      this.mouthMat,
    );
    this.mouthMesh.position.set(0, 0.058, 0.102);
    this.mouthMesh.scale.set(1.25, 0.35, 0.45);
    head.add(this.mouthMesh);

    // Hair Crown + Soft Curved Bangs + Side Locks + Back Flow
    const crown = new THREE.Mesh(
      this.trackGeo(
        new THREE.SphereGeometry(0.128, 28, 22, 0, Math.PI * 2, 0, Math.PI * 0.64),
      ),
      this.hairMat,
    );
    crown.position.set(0, 0.122, -0.006);
    crown.rotation.x = -0.14;
    crown.userData.interactionZone = 'head';
    head.add(crown);

    const bangGeo = this.trackGeo(new THREE.CapsuleGeometry(0.022, 0.056, 6, 12));
    for (let i = -2; i <= 2; i++) {
      const bang = new THREE.Mesh(bangGeo, this.hairMat);
      bang.position.set(i * 0.025, 0.158 - Math.abs(i) * 0.004, 0.095 - Math.abs(i) * 0.012);
      bang.scale.set(1.05, 1.0, 0.52);
      bang.rotation.x = 0.24;
      bang.rotation.z = -i * 0.12;
      bang.userData.interactionZone = 'head';
      head.add(bang);
    }

    const sideLockGeo = this.trackGeo(new THREE.CapsuleGeometry(0.023, 0.16, 6, 12));
    const leftSideLock = new THREE.Mesh(sideLockGeo, this.hairMat);
    leftSideLock.position.set(0.098, 0.068, 0.036);
    leftSideLock.rotation.z = 0.08;
    head.add(leftSideLock);

    const rightSideLock = new THREE.Mesh(sideLockGeo, this.hairMat);
    rightSideLock.position.set(-0.098, 0.068, 0.036);
    rightSideLock.rotation.z = -0.08;
    head.add(rightSideLock);

    this.hairTailGroup = new THREE.Group();
    this.hairTailGroup.position.set(0, 0.12, -0.095);
    const backHair = new THREE.Mesh(
      this.trackGeo(new THREE.CapsuleGeometry(0.085, 0.22, 8, 16)),
      this.hairMat,
    );
    backHair.position.set(0, -0.12, -0.02);
    backHair.scale.set(1.15, 1.0, 0.65);
    backHair.rotation.x = 0.14;
    this.hairTailGroup.add(backHair);

    // Side ribbon hairclip accent
    const hairClip = new THREE.Mesh(
      this.trackGeo(new THREE.SphereGeometry(0.018, 12, 12)),
      this.ribbonMat,
    );
    hairClip.position.set(0.092, 0.19, 0.045);
    head.add(hairClip, this.hairTailGroup);

    // Arms (Left along +X, Right along -X in rest T-pose)
    this.buildArm('left', 1, upperChest, blouseMat);
    this.buildArm('right', -1, upperChest, blouseMat);

    // Legs (grounded from y=0.86 down to y=0)
    this.buildLeg('left', 1, hips, darkShoeMat);
    this.buildLeg('right', -1, hips, darkShoeMat);
  }

  private buildArm(
    side: 'left' | 'right',
    sign: 1 | -1,
    parent: THREE.Object3D,
    cuffMat: THREE.Material,
  ): void {
    const shoulder = new THREE.Group();
    shoulder.name = `${side}Shoulder`;
    shoulder.position.set(sign * 0.115, 0.025, 0);
    parent.add(shoulder);
    this.bones[`${side}Shoulder`] = shoulder;

    const upperArm = new THREE.Group();
    upperArm.name = `${side}UpperArm`;
    upperArm.position.set(sign * 0.016, 0, 0);
    shoulder.add(upperArm);
    this.bones[`${side}UpperArm`] = upperArm;

    const shoulderJoint = new THREE.Mesh(
      this.trackGeo(new THREE.SphereGeometry(0.033, 14, 12)),
      this.outfitPrimaryMat,
    );
    upperArm.add(shoulderJoint);

    const sleeveGeo = this.trackGeo(
      new THREE.CapsuleGeometry(0.03, 0.18, 6, 14),
    );
    sleeveGeo.rotateZ((sign * Math.PI) / 2);
    const sleeveMesh = new THREE.Mesh(sleeveGeo, this.outfitPrimaryMat);
    sleeveMesh.position.set(sign * 0.112, 0, 0);
    sleeveMesh.castShadow = true;
    upperArm.add(sleeveMesh);

    const lowerArm = new THREE.Group();
    lowerArm.name = `${side}LowerArm`;
    lowerArm.position.set(sign * 0.225, 0, 0);
    upperArm.add(lowerArm);
    this.bones[`${side}LowerArm`] = lowerArm;

    const elbowJoint = new THREE.Mesh(
      this.trackGeo(new THREE.SphereGeometry(0.026, 12, 10)),
      this.outfitAccentMat,
    );
    lowerArm.add(elbowJoint);

    const forearmGeo = this.trackGeo(
      new THREE.CapsuleGeometry(0.024, 0.165, 6, 14),
    );
    forearmGeo.rotateZ((sign * Math.PI) / 2);
    const forearmMesh = new THREE.Mesh(forearmGeo, this.outfitAccentMat);
    forearmMesh.position.set(sign * 0.102, 0, 0);
    forearmMesh.castShadow = true;
    lowerArm.add(forearmMesh);

    const cuffGeo = this.trackGeo(new THREE.CylinderGeometry(0.025, 0.025, 0.024, 14));
    cuffGeo.rotateZ((sign * Math.PI) / 2);
    const cuff = new THREE.Mesh(cuffGeo, cuffMat);
    cuff.position.set(sign * 0.195, 0, 0);
    lowerArm.add(cuff);

    const hand = new THREE.Group();
    hand.name = `${side}Hand`;
    hand.position.set(sign * 0.21, 0, 0);
    lowerArm.add(hand);
    this.bones[`${side}Hand`] = hand;

    const handMesh = new THREE.Mesh(
      this.trackGeo(new THREE.SphereGeometry(0.028, 14, 12)),
      this.skinMat,
    );
    handMesh.position.set(sign * 0.026, 0, 0);
    handMesh.scale.set(1.35, 0.72, 0.92);
    handMesh.userData.interactionZone = 'hand';
    hand.add(handMesh);
  }

  private buildLeg(
    side: 'left' | 'right',
    sign: 1 | -1,
    hips: THREE.Object3D,
    shoeMat: THREE.Material,
  ): void {
    const upperLeg = new THREE.Group();
    upperLeg.name = `${side}UpperLeg`;
    upperLeg.position.set(sign * 0.075, -0.02, 0);
    hips.add(upperLeg);
    this.bones[`${side}UpperLeg`] = upperLeg;

    const thighMesh = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.048, 0.038, 0.4, 16)),
      this.skinMat,
    );
    thighMesh.position.y = -0.2;
    thighMesh.castShadow = true;
    upperLeg.add(thighMesh);

    const lowerLeg = new THREE.Group();
    lowerLeg.name = `${side}LowerLeg`;
    lowerLeg.position.set(0, -0.4, 0);
    upperLeg.add(lowerLeg);
    this.bones[`${side}LowerLeg`] = lowerLeg;

    const calfMesh = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.037, 0.028, 0.37, 16)),
      this.outfitPrimaryMat,
    );
    calfMesh.position.y = -0.185;
    calfMesh.castShadow = true;
    lowerLeg.add(calfMesh);

    const foot = new THREE.Group();
    foot.name = `${side}Foot`;
    foot.position.set(0, -0.37, 0);
    lowerLeg.add(foot);
    this.bones[`${side}Foot`] = foot;

    // Shoe resting flush at y = 0 (hips 0.86 - 0.02 - 0.4 - 0.37 = 0.07m)
    const shoeMesh = new THREE.Mesh(
      this.trackGeo(new THREE.CapsuleGeometry(0.034, 0.075, 6, 12)),
      shoeMat,
    );
    shoeMesh.rotation.x = Math.PI / 2;
    shoeMesh.scale.set(0.95, 1, 0.72);
    shoeMesh.position.set(0, -0.045, 0.035);
    shoeMesh.castShadow = true;
    foot.add(shoeMesh);
  }

  public applyPersonaPalette(persona: PersonaProfile): void {
    this.skinMat.color.setHex(persona.palette.skin);
    this.hairMat.color.setHex(persona.palette.hair);
    this.outfitPrimaryMat.color.setHex(persona.palette.outfitPrimary);
    this.outfitAccentMat.color.setHex(persona.palette.outfitAccent);
    this.ribbonMat.color.setHex(persona.palette.ribbon);

    const newIris = createIrisTexture(persona.palette.eyes);
    this.irisMat.map = newIris;
    this.irisMat.needsUpdate = true;
    this.irisTex.dispose();
    this.irisTex = newIris;
    this.disposables.push(newIris);
  }

  public setEyeGaze(yawRad: number, pitchRad: number): void {
    const offsetX = THREE.MathUtils.clamp(yawRad * 0.018, -0.008, 0.008);
    const offsetY = THREE.MathUtils.clamp(pitchRad * 0.016, -0.006, 0.006);
    this.leftIrisMesh.position.set(offsetX, offsetY, 0.0145);
    this.rightIrisMesh.position.set(offsetX, offsetY, 0.0145);
  }

  public setExpressions(state: ProceduralExpressionState, timeSec: number): void {
    // Eyelid blink + happy squint
    const blinkAmount = Math.max(state.blink, state.happy * 0.25);
    const lidPitch = THREE.MathUtils.lerp(-0.98, 0.15, blinkAmount);
    this.leftEyelid.rotation.x = lidPitch;
    this.rightEyelid.rotation.x = lidPitch;

    // Eyebrows expressiveness
    const browY = 0.148 + state.surprised * 0.012 - state.sad * 0.006;
    const browTilt = state.sad * 0.22 - state.angry * 0.25 + state.happy * 0.08;
    this.leftBrow.position.y = browY;
    this.rightBrow.position.y = browY;
    this.leftBrow.rotation.z = Math.PI / 2 - 0.08 + browTilt;
    this.rightBrow.rotation.z = Math.PI / 2 + 0.08 - browTilt;

    // Blush opacity
    this.blushMat.opacity = THREE.MathUtils.clamp(0.12 + state.blush * 0.78, 0.08, 0.92);

    // Lip-sync + smile mouth
    const open = THREE.MathUtils.clamp(state.mouthOpen, 0, 1);
    const width = 1.2 + state.happy * 0.45 - open * 0.2;
    const height = 0.28 + open * 0.95 + state.surprised * 0.45;
    this.mouthMesh.scale.set(width, height, 0.45);

    // Gentle hair sway
    this.hairTailGroup.rotation.z = Math.sin(timeSec * 1.4) * 0.04;
    this.hairTailGroup.rotation.x = 0.06 + Math.cos(timeSec * 1.1) * 0.03;
  }

  public dispose(): void {
    for (const item of this.disposables) {
      item.dispose();
    }
    this.disposables = [];
  }
}
