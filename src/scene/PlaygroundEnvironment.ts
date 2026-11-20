import * as THREE from 'three';
import {
  PLAYGROUND_LAYOUT,
  type PlaygroundBallState,
  type PlaygroundSimSnapshot,
} from '../sim/playgroundSim';
import type { PlaygroundObjectId } from '../types';

function tagPlaygroundObject(root: THREE.Object3D, id: PlaygroundObjectId): void {
  root.traverse((obj) => {
    obj.userData.playgroundObjectId = id;
    if ((obj as THREE.Mesh).isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
}

function createGrassTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#4e8a4a';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle mowed lawn stripes
  ctx.fillStyle = 'rgba(255, 255, 255, 0.045)';
  for (let i = 0; i < 8; i += 2) {
    ctx.fillRect(i * 64, 0, 64, 512);
  }

  // Organic grass blades & clover speckles
  for (let i = 0; i < 5200; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = Math.random();
    ctx.fillStyle =
      r < 0.35
        ? 'rgba(58, 112, 52, 0.45)'
        : r < 0.7
          ? 'rgba(108, 166, 86, 0.38)'
          : 'rgba(148, 194, 108, 0.25)';
    ctx.fillRect(x, y, 2, 4 + Math.random() * 4);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  tex.anisotropy = 4;
  return tex;
}

function createPlaygroundCourtTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#c59c72';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle safety-mat rubber speckles
  for (let i = 0; i < 4000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    ctx.fillStyle =
      Math.random() > 0.5
        ? 'rgba(138, 92, 54, 0.28)'
        : 'rgba(245, 224, 195, 0.22)';
    ctx.fillRect(x, y, 3, 3);
  }

  // Crisp court markings
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = 6;
  ctx.strokeRect(20, 20, 472, 472);
  ctx.beginPath();
  ctx.arc(256, 256, 86, 0, Math.PI * 2);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createSandTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ebd09a';
  ctx.fillRect(0, 0, 256, 256);

  // Gentle wind ripples
  ctx.strokeStyle = 'rgba(205, 168, 108, 0.35)';
  ctx.lineWidth = 3;
  for (let y = 10; y < 256; y += 16) {
    ctx.beginPath();
    for (let x = 0; x <= 256; x += 16) {
      const yy = y + Math.sin(x * 0.08 + y * 0.1) * 3;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }

  for (let i = 0; i < 2400; i++) {
    ctx.fillStyle =
      Math.random() > 0.5 ? 'rgba(255,248,225,0.4)' : 'rgba(170,136,84,0.28)';
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

function createWoodTexture(baseHex = '#a66d3f'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 256, 256);

  for (let y = 0; y < 256; y += 4) {
    ctx.fillStyle =
      y % 8 === 0 ? 'rgba(62, 34, 14, 0.14)' : 'rgba(255, 224, 185, 0.08)';
    ctx.fillRect(0, y, 256, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createSoccerBallTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 512, 256);

  // Subtle hex grid lines
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  for (let x = 0; x <= 512; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }

  const drawPentagon = (cx: number, cy: number, r: number) => {
    ctx.fillStyle = '#18181b';
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  };

  // Classic distributed black pentagons across equirectangular UV
  const rows = [
    { y: 54, xs: [64, 192, 320, 448], r: 24 },
    { y: 128, xs: [0, 128, 256, 384, 512], r: 26 },
    { y: 202, xs: [64, 192, 320, 448], r: 24 },
  ];
  for (const row of rows) {
    for (const x of row.xs) {
      drawPentagon(x, row.y, row.r);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createBasketballTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#e86825';
  ctx.fillRect(0, 0, 512, 256);

  // Pebbled leather grain
  for (let i = 0; i < 4500; i++) {
    ctx.fillStyle =
      Math.random() > 0.5
        ? 'rgba(145, 52, 12, 0.25)'
        : 'rgba(255, 165, 92, 0.2)';
    ctx.fillRect(Math.random() * 512, Math.random() * 256, 2, 2);
  }

  // Classic black seam ribs
  ctx.strokeStyle = '#1f1a18';
  ctx.lineWidth = 6;
  // Equator seam
  ctx.beginPath();
  ctx.moveTo(0, 128);
  ctx.lineTo(512, 128);
  ctx.stroke();

  // Meridian seams
  for (const x of [0, 128, 256, 384, 512]) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }

  // Curved side ribs
  ctx.lineWidth = 5;
  for (const cx of [64, 320]) {
    ctx.beginPath();
    ctx.ellipse(cx, 128, 48, 92, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
  grad.addColorStop(0, 'rgba(20, 26, 18, 0.55)');
  grad.addColorStop(0.55, 'rgba(20, 26, 18, 0.22)');
  grad.addColorStop(1, 'rgba(20, 26, 18, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createVaultBoxLabelTexture(label: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#e5be8a';
  ctx.fillRect(0, 0, 256, 128);

  // Subtle wood grain lines
  for (let y = 0; y < 128; y += 6) {
    ctx.fillStyle = y % 12 === 0 ? 'rgba(110, 68, 30, 0.12)' : 'rgba(255, 240, 215, 0.12)';
    ctx.fillRect(0, y, 256, 2);
  }

  // Border frame
  ctx.strokeStyle = '#7c4d25';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 240, 112);

  // Bold tier label ("1단", "2단", "3단")
  ctx.fillStyle = '#2d1a0c';
  ctx.font = 'bold 64px "Google Sans", "Noto Sans KR", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 128, 68);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class PlaygroundEnvironment extends THREE.Group {
  private skyMesh: THREE.Mesh;
  private lawnGroup = new THREE.Group();
  private seesawBeamGroup!: THREE.Group;
  private swingPivotGroup!: THREE.Group;
  private soccerBallMesh!: THREE.Mesh;
  private soccerShadow!: THREE.Mesh;
  private basketballMesh!: THREE.Mesh;
  private basketballShadow!: THREE.Mesh;
  private targetRing!: THREE.Mesh;

  private textures: THREE.Texture[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];

  private tmpSpinAxis = new THREE.Vector3();
  private prevSoccerSpin = 0;
  private prevBasketSpin = 0;

  constructor(options: { isSoftwareGl: boolean }) {
    super();
    this.name = 'PlaygroundEnvironment';

    // 1. Lighting: Balanced golden-hour afternoon park sun + cool sky fill
    const hemi = new THREE.HemisphereLight(0xd9ecff, 0x5c7c48, 0.85);
    hemi.position.set(0, 16, 0);
    this.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff1d6, 1.25);
    sun.position.set(8.5, 13.5, 7.5);
    if (!options.isSoftwareGl) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 42;
      const d = 12.5;
      sun.shadow.camera.left = -d;
      sun.shadow.camera.right = d;
      sun.shadow.camera.top = d;
      sun.shadow.camera.bottom = -d;
      sun.shadow.bias = -0.0005;
    }
    this.add(sun);

    const rimFill = new THREE.DirectionalLight(0xa5c8ff, 0.35);
    rimFill.position.set(-7, 6, -8);
    this.add(rimFill);

    // 2. Open Sky Dome (golden-hour horizon matching scene fog)
    this.skyMesh = this.buildSkyDome();
    this.add(this.skyMesh);

    // 3. Ground Lawn, Safety Court, Fence & Trees
    this.buildGroundAndPerimeter();
    this.add(this.lawnGroup);

    // 4. Playground Structures
    const woodTex = this.trackTex(createWoodTexture('#b07542'));
    const darkWoodTex = this.trackTex(createWoodTexture('#8a5732'));
    const birchWoodTex = this.trackTex(createWoodTexture('#d8ae78'));

    this.add(this.buildSlide(woodTex));
    this.add(this.buildSwing(woodTex));
    this.add(this.buildSeesaw(woodTex));
    this.add(this.buildBench(darkWoodTex));
    this.add(this.buildVaultingBoxes(birchWoodTex));
    this.add(this.buildSandbox(woodTex));
    this.buildBalls();
    this.buildTargetRing();
  }

  private trackTex<T extends THREE.Texture>(tex: T): T {
    this.textures.push(tex);
    return tex;
  }

  private trackGeo<T extends THREE.BufferGeometry>(geo: T): T {
    this.geometries.push(geo);
    return geo;
  }

  private trackMat<T extends THREE.Material>(mat: T): T {
    this.materials.push(mat);
    return mat;
  }

  private buildSkyDome(): THREE.Mesh {
    const skyGeo = this.trackGeo(new THREE.SphereGeometry(55, 32, 20));
    const skyMat = this.trackMat(
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          uTopColor: { value: new THREE.Color(0x3a6fb5) },
          uMidColor: { value: new THREE.Color(0x8bc1e8) },
          uHorizonColor: { value: new THREE.Color(0xf6d5b0) },
          uSunDir: { value: new THREE.Vector3(0.52, 0.48, 0.45).normalize() },
        },
        vertexShader: `
          varying vec3 vWorldDir;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldDir = normalize(wp.xyz);
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: `
          uniform vec3 uTopColor;
          uniform vec3 uMidColor;
          uniform vec3 uHorizonColor;
          uniform vec3 uSunDir;
          varying vec3 vWorldDir;
          void main() {
            float h = clamp(vWorldDir.y, 0.0, 1.0);
            vec3 col = mix(uHorizonColor, uMidColor, smoothstep(0.0, 0.28, h));
            col = mix(col, uTopColor, smoothstep(0.24, 0.85, h));
            float sunDot = max(dot(normalize(vWorldDir), uSunDir), 0.0);
            col += vec3(1.0, 0.88, 0.65) * pow(sunDot, 22.0) * 0.42;
            col += vec3(1.0, 0.96, 0.88) * smoothstep(0.996, 0.9992, sunDot) * 0.9;
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      }),
    );
    const mesh = new THREE.Mesh(skyGeo, skyMat);
    mesh.name = 'PlaygroundSkyDome';
    return mesh;
  }

  private buildGroundAndPerimeter(): void {
    const grassTex = this.trackTex(createGrassTexture());
    const grassGeo = this.trackGeo(new THREE.CircleGeometry(46, 48));
    grassGeo.rotateX(-Math.PI / 2);
    const grassMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: grassTex,
        roughness: 0.92,
        metalness: 0.0,
      }),
    );
    const grass = new THREE.Mesh(grassGeo, grassMat);
    grass.receiveShadow = true;
    grass.userData.playgroundGround = true;
    grass.name = 'ParkGrassGround';
    this.lawnGroup.add(grass);

    // Central rubberized playground pad
    const courtTex = this.trackTex(createPlaygroundCourtTexture());
    const padSize = PLAYGROUND_LAYOUT.boundsHalfSize * 2;
    const courtGeo = this.trackGeo(new THREE.BoxGeometry(padSize, 0.04, padSize));
    const courtMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: courtTex,
        roughness: 0.84,
        metalness: 0.02,
      }),
    );
    const court = new THREE.Mesh(courtGeo, courtMat);
    court.position.set(0, -0.015, 0);
    court.receiveShadow = true;
    court.userData.playgroundGround = true;
    court.name = 'PlaygroundSafetyPad';
    this.lawnGroup.add(court);

    // Low wooden perimeter fence posts & rails around playground pad
    const fenceMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0x8d6342, roughness: 0.82 }),
    );
    const half = PLAYGROUND_LAYOUT.boundsHalfSize + 0.15;
    const postGeo = this.trackGeo(new THREE.CylinderGeometry(0.055, 0.065, 0.72, 10));
    const railGeo = this.trackGeo(new THREE.BoxGeometry(half * 2, 0.07, 0.05));

    const postPositions: Array<[number, number]> = [];
    for (let i = -5; i <= 5; i++) {
      const coord = (i / 5) * half;
      postPositions.push([coord, -half]);
      postPositions.push([coord, half]);
      if (i > -5 && i < 5) {
        postPositions.push([-half, coord]);
        postPositions.push([half, coord]);
      }
    }
    const postInst = new THREE.InstancedMesh(postGeo, fenceMat, postPositions.length);
    const dummy = new THREE.Object3D();
    postPositions.forEach(([px, pz], idx) => {
      dummy.position.set(px, 0.36, pz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      postInst.setMatrixAt(idx, dummy.matrix);
    });
    postInst.receiveShadow = true;
    postInst.castShadow = true;
    this.lawnGroup.add(postInst);

    // Horizontal rails on 3 sides (leave front entrance open for camera sightlines)
    const addFenceSide = (x: number, z: number, rotY: number) => {
      for (const ry of [0.28, 0.56]) {
        const rail = new THREE.Mesh(railGeo, fenceMat);
        rail.position.set(x, ry, z);
        rail.rotation.y = rotY;
        rail.castShadow = true;
        rail.receiveShadow = true;
        this.lawnGroup.add(rail);
      }
    };
    addFenceSide(0, -half, 0);
    addFenceSide(-half, 0, Math.PI / 2);
    addFenceSide(half, 0, Math.PI / 2);

    // Stylized Park Trees outside the expanded fence using InstancedMesh
    const treeCoords: Array<[number, number, number]> = [
      [-11.5, -10.5, 1.2],
      [-6.0, -12.4, 1.05],
      [0.4, -13.2, 1.28],
      [7.2, -11.8, 1.1],
      [12.2, -8.0, 1.22],
      [12.8, 0.2, 1.0],
      [11.6, 8.8, 1.15],
      [-12.2, -2.0, 1.12],
      [-11.8, 7.6, 1.02],
      [-6.5, 12.6, 0.96],
      [5.8, 12.8, 1.08],
    ];
    const trunkGeo = this.trackGeo(new THREE.CylinderGeometry(0.18, 0.28, 2.2, 10));
    const trunkMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0x6f4a32, roughness: 0.9 }),
    );
    const crownLowerGeo = this.trackGeo(new THREE.ConeGeometry(1.45, 2.5, 9));
    const crownUpperGeo = this.trackGeo(new THREE.ConeGeometry(1.05, 2.1, 9));
    const crownMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0x3b7d42, roughness: 0.85 }),
    );
    const crownLightMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0x4f9450, roughness: 0.82 }),
    );

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCoords.length);
    const lowers = new THREE.InstancedMesh(crownLowerGeo, crownMat, treeCoords.length);
    const uppers = new THREE.InstancedMesh(crownUpperGeo, crownLightMat, treeCoords.length);

    treeCoords.forEach(([tx, tz, sc], idx) => {
      dummy.position.set(tx, 1.1 * sc, tz);
      dummy.scale.set(sc, sc, sc);
      dummy.rotation.set(0, idx * 0.7, 0);
      dummy.updateMatrix();
      trunks.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(tx, 2.75 * sc, tz);
      dummy.updateMatrix();
      lowers.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(tx, 3.85 * sc, tz);
      dummy.updateMatrix();
      uppers.setMatrixAt(idx, dummy.matrix);
    });
    this.lawnGroup.add(trunks, lowers, uppers);
  }

  private buildSlide(woodTex: THREE.Texture): THREE.Group {
    const group = new THREE.Group();
    const s = PLAYGROUND_LAYOUT.slide;
    group.name = 'PlaygroundSlide';

    const steelTeal = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0x1d8a99, roughness: 0.35, metalness: 0.45 }),
    );
    const railYellow = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xf4b942, roughness: 0.36, metalness: 0.25 }),
    );
    const chuteCoral = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xe65b45, roughness: 0.24, metalness: 0.12 }),
    );
    const deckWood = this.trackMat(
      new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.75 }),
    );

    const px = s.topPlatform.x;
    const py = s.topPlatform.y;
    const pz = s.topPlatform.z;

    // 4 vertical tower support posts grounded at y=0
    const postGeo = this.trackGeo(new THREE.CylinderGeometry(0.05, 0.05, py + 0.72, 12));
    const halfDeck = 0.48;
    for (const dx of [-halfDeck, halfDeck]) {
      for (const dz of [-halfDeck, halfDeck]) {
        const post = new THREE.Mesh(postGeo, steelTeal);
        post.position.set(px + dx, (py + 0.72) * 0.5, pz + dz);
        group.add(post);
      }
    }

    // Elevated platform deck
    const deckGeo = this.trackGeo(new THREE.BoxGeometry(1.04, 0.1, 1.04));
    const deck = new THREE.Mesh(deckGeo, deckWood);
    deck.position.set(px, py - 0.05, pz);
    group.add(deck);

    // Side safety guardrails on platform
    const sideRailGeo = this.trackGeo(new THREE.BoxGeometry(0.06, 0.06, 1.02));
    for (const dx of [-halfDeck, halfDeck]) {
      for (const ry of [py + 0.34, py + 0.66]) {
        const rail = new THREE.Mesh(sideRailGeo, railYellow);
        rail.position.set(px + dx, ry, pz);
        group.add(rail);
      }
    }

    // Top overhead safety arch bar above chute entry
    const topBarGeo = this.trackGeo(new THREE.CylinderGeometry(0.035, 0.035, 1.02, 12));
    topBarGeo.rotateZ(Math.PI / 2);
    const topBar = new THREE.Mesh(topBarGeo, railYellow);
    topBar.position.set(px, py + 0.68, pz + halfDeck);
    group.add(topBar);

    // Angled Ladder from stairsStart (z=-3.85, y=0) up to platform back (z=-3.38, y=1.48)
    const ladderBottomZ = s.stairsStart.z;
    const ladderTopZ = pz - halfDeck;
    const ladderLen = Math.hypot(ladderTopZ - ladderBottomZ, py);
    const ladderPitch = Math.atan2(ladderTopZ - ladderBottomZ, py);
    const stringerGeo = this.trackGeo(new THREE.BoxGeometry(0.055, ladderLen, 0.09));
    for (const dx of [-0.34, 0.34]) {
      const stringer = new THREE.Mesh(stringerGeo, steelTeal);
      stringer.position.set(px + dx, py * 0.5, (ladderBottomZ + ladderTopZ) * 0.5);
      stringer.rotation.x = ladderPitch;
      group.add(stringer);
    }

    // 6 Ladder steps
    const rungGeo = this.trackGeo(new THREE.BoxGeometry(0.68, 0.045, 0.14));
    for (let i = 1; i <= 6; i++) {
      const frac = i / 7;
      const rung = new THREE.Mesh(rungGeo, railYellow);
      rung.position.set(
        px,
        py * frac,
        ladderBottomZ + (ladderTopZ - ladderBottomZ) * frac,
      );
      group.add(rung);
    }

    // Sloped Slide Chute descending from platform front (z=-2.42, y=1.42) to exit (z=-0.75, y=0.22)
    const chuteTopZ = pz + halfDeck;
    const chuteBotZ = s.chuteExit.z;
    const chuteTopY = py - 0.04;
    const chuteBotY = 0.22;
    const dz = chuteBotZ - chuteTopZ;
    const dy = chuteTopY - chuteBotY;
    const chuteLen = Math.hypot(dz, dy);
    const chuteAngle = Math.atan2(dy, dz);

    const chuteGroup = new THREE.Group();
    chuteGroup.position.set(px, (chuteTopY + chuteBotY) * 0.5, (chuteTopZ + chuteBotZ) * 0.5);
    chuteGroup.rotation.x = chuteAngle;

    const bedGeo = this.trackGeo(new THREE.BoxGeometry(0.76, 0.06, chuteLen));
    const bed = new THREE.Mesh(bedGeo, chuteCoral);
    chuteGroup.add(bed);

    // Raised slide walls
    const wallGeo = this.trackGeo(new THREE.BoxGeometry(0.06, 0.18, chuteLen));
    for (const dx of [-0.38, 0.38]) {
      const wall = new THREE.Mesh(wallGeo, railYellow);
      wall.position.set(dx, 0.09, 0);
      chuteGroup.add(wall);
    }
    group.add(chuteGroup);

    // Rounded horizontal run-out lip + front support leg grounded at y=0
    const exitBedGeo = this.trackGeo(new THREE.BoxGeometry(0.76, 0.06, 0.38));
    const exitBed = new THREE.Mesh(exitBedGeo, chuteCoral);
    exitBed.position.set(px, chuteBotY - 0.02, chuteBotZ + 0.16);
    group.add(exitBed);

    const frontSupportGeo = this.trackGeo(new THREE.CylinderGeometry(0.04, 0.04, chuteBotY, 10));
    for (const dx of [-0.32, 0.32]) {
      const leg = new THREE.Mesh(frontSupportGeo, steelTeal);
      leg.position.set(px + dx, chuteBotY * 0.5, chuteBotZ + 0.18);
      group.add(leg);
    }

    tagPlaygroundObject(group, 'slide');
    return group;
  }

  private buildSwing(woodTex: THREE.Texture): THREE.Group {
    const group = new THREE.Group();
    const sw = PLAYGROUND_LAYOUT.swing;
    group.position.set(sw.x, 0, sw.z);
    group.name = 'PlaygroundSwing';

    const frameMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0x267387, roughness: 0.36, metalness: 0.5 }),
    );
    const accentMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xf4b942, roughness: 0.34, metalness: 0.28 }),
    );
    const chainMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.3, metalness: 0.8 }),
    );
    const seatMat = this.trackMat(
      new THREE.MeshStandardMaterial({ map: woodTex, color: 0xe68452, roughness: 0.55 }),
    );
    const footingMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.85 }),
    );

    const halfW = sw.frameWidth * 0.5;
    const topY = sw.topBarY;
    const spreadZ = 0.88;
    const legLen = Math.hypot(topY, spreadZ);
    const legPitch = Math.atan2(spreadZ, topY);

    const legGeo = this.trackGeo(new THREE.CylinderGeometry(0.044, 0.052, legLen, 12));
    const footGeo = this.trackGeo(new THREE.CylinderGeometry(0.11, 0.13, 0.08, 12));
    const sideBraceGeo = this.trackGeo(new THREE.CylinderGeometry(0.028, 0.028, spreadZ * 1.18, 10));
    sideBraceGeo.rotateX(Math.PI / 2);

    // Twin A-frame side supports grounded cleanly at y=0
    for (const sx of [-halfW, halfW]) {
      for (const szSign of [-1, 1]) {
        const leg = new THREE.Mesh(legGeo, frameMat);
        leg.position.set(sx, topY * 0.5, szSign * spreadZ * 0.5);
        leg.rotation.x = -szSign * legPitch;
        group.add(leg);

        const foot = new THREE.Mesh(footGeo, footingMat);
        foot.position.set(sx, 0.04, szSign * spreadZ);
        group.add(foot);
      }

      // Mid-height A-frame crossbar
      const brace = new THREE.Mesh(sideBraceGeo, accentMat);
      brace.position.set(sx, topY * 0.44, 0);
      group.add(brace);

      // Top joint cap
      const cap = new THREE.Mesh(
        this.trackGeo(new THREE.SphereGeometry(0.075, 14, 10)),
        accentMat,
      );
      cap.position.set(sx, topY, 0);
      group.add(cap);
    }

    // Horizontal top steel crossbar
    const topBarGeo = this.trackGeo(
      new THREE.CylinderGeometry(0.052, 0.052, sw.frameWidth + 0.16, 14),
    );
    topBarGeo.rotateZ(Math.PI / 2);
    const topBar = new THREE.Mesh(topBarGeo, frameMat);
    topBar.position.set(0, topY, 0);
    group.add(topBar);

    // Dynamic Pendulum Pivot Group at top crossbar center
    this.swingPivotGroup = new THREE.Group();
    this.swingPivotGroup.position.set(0, topY, 0);

    const chainX = 0.27;
    const ropeLen = sw.ropeLength;
    const chainGeo = this.trackGeo(new THREE.CylinderGeometry(0.012, 0.012, ropeLen, 8));
    const gripGeo = this.trackGeo(new THREE.CylinderGeometry(0.02, 0.02, 0.34, 10));
    const clampGeo = this.trackGeo(new THREE.TorusGeometry(0.064, 0.015, 8, 16));
    clampGeo.rotateY(Math.PI / 2);

    for (const cx of [-chainX, chainX]) {
      const clampRing = new THREE.Mesh(clampGeo, accentMat);
      clampRing.position.set(cx, 0, 0);
      this.swingPivotGroup.add(clampRing);

      const chain = new THREE.Mesh(chainGeo, chainMat);
      chain.position.set(cx, -ropeLen * 0.5, 0);
      this.swingPivotGroup.add(chain);

      // Soft yellow hand-grip sleeve at seated shoulder/chest height
      const grip = new THREE.Mesh(gripGeo, accentMat);
      grip.position.set(cx, -ropeLen + 0.56, 0);
      this.swingPivotGroup.add(grip);
    }

    // Contoured Swing Seat — top surface sits strictly at y_local = -ropeLen (y_world = 0.45m)
    const seatThickness = 0.044;
    const seat = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.62, seatThickness, 0.3)),
      seatMat,
    );
    seat.position.set(0, -ropeLen - seatThickness * 0.5, 0);
    this.swingPivotGroup.add(seat);

    // Side metal brackets under seat
    const bracketGeo = this.trackGeo(new THREE.BoxGeometry(0.04, 0.055, 0.26));
    for (const cx of [-chainX, chainX]) {
      const bracket = new THREE.Mesh(bracketGeo, footingMat);
      bracket.position.set(cx, -ropeLen - seatThickness * 0.5, 0);
      this.swingPivotGroup.add(bracket);
    }

    group.add(this.swingPivotGroup);
    tagPlaygroundObject(group, 'swing');
    return group;
  }

  private buildSeesaw(woodTex: THREE.Texture): THREE.Group {
    const group = new THREE.Group();
    const s = PLAYGROUND_LAYOUT.seesaw;
    group.position.set(s.x, 0, s.z);
    group.name = 'PlaygroundSeesaw';

    const frameMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0x3b4d63, roughness: 0.42, metalness: 0.55 }),
    );
    const plankMat = this.trackMat(
      new THREE.MeshStandardMaterial({ map: woodTex, color: 0xf4c27a, roughness: 0.6 }),
    );
    const seatMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0x2a9d8f, roughness: 0.38, metalness: 0.1 }),
    );
    const handleMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xf4a261, roughness: 0.3, metalness: 0.5 }),
    );
    const bumperMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0x262626, roughness: 0.85 }),
    );

    // Central A-frame fulcrum grounded at y=0, calibrated to s.pivotHeight (0.44m)
    const basePlate = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.55, 0.05, 0.72)),
      frameMat,
    );
    basePlate.position.set(0, 0.025, 0);
    group.add(basePlate);

    const strutLen = s.pivotHeight + 0.05;
    const strutGeo = this.trackGeo(new THREE.CylinderGeometry(0.038, 0.044, strutLen, 10));
    for (const dz of [-0.26, 0.26]) {
      for (const dx of [-0.14, 0.14]) {
        const strut = new THREE.Mesh(strutGeo, frameMat);
        strut.position.set(dx * 0.62, s.pivotHeight * 0.5, dz);
        strut.rotation.z = dx > 0 ? 0.25 : -0.25;
        group.add(strut);
      }
    }

    // Pivot axle at s.pivotHeight
    const axleGeo = this.trackGeo(new THREE.CylinderGeometry(0.042, 0.042, 0.64, 14));
    axleGeo.rotateX(Math.PI / 2);
    const axle = new THREE.Mesh(axleGeo, handleMat);
    axle.position.set(0, s.pivotHeight, 0);
    group.add(axle);

    // Rubber ground bumpers under both seat ends (height 0.24m catches plank cleanly at max tilt)
    const bumperH = 0.24;
    const bumperGeo = this.trackGeo(new THREE.CylinderGeometry(0.14, 0.17, bumperH, 14));
    for (const bx of [-1.15, 1.15]) {
      const bumper = new THREE.Mesh(bumperGeo, bumperMat);
      bumper.position.set(bx, bumperH * 0.5, 0);
      group.add(bumper);
    }

    // Dynamic Pivoting Beam Group
    this.seesawBeamGroup = new THREE.Group();
    this.seesawBeamGroup.position.set(0, s.pivotHeight, 0);

    const plankH = 0.064;
    const plank = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(s.plankLength, plankH, s.plankWidth)),
      plankMat,
    );
    this.seesawBeamGroup.add(plank);

    // Decorative center accent strip
    const strip = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(s.plankLength - 0.1, plankH + 0.006, 0.1)),
      seatMat,
    );
    this.seesawBeamGroup.add(strip);

    // Twin contoured seats — top surface sits strictly at y_local = s.seatTopOffset (0.075m)
    const seatH = 0.046;
    const seatCenterY = s.seatTopOffset - seatH * 0.5;
    const seatGeo = this.trackGeo(new THREE.BoxGeometry(0.42, seatH, 0.44));
    const handlePostGeo = this.trackGeo(new THREE.CylinderGeometry(0.019, 0.019, 0.23, 10));
    const handleBarGeo = this.trackGeo(new THREE.CylinderGeometry(0.021, 0.021, 0.28, 10));
    handleBarGeo.rotateX(Math.PI / 2);

    for (const side of [-1, 1]) {
      const seatX = side * 1.15;
      const seat = new THREE.Mesh(seatGeo, seatMat);
      seat.position.set(seatX, seatCenterY, 0);
      this.seesawBeamGroup.add(seat);

      const handleX = side * 0.78;
      for (const hz of [-0.12, 0.12]) {
        const post = new THREE.Mesh(handlePostGeo, handleMat);
        post.position.set(handleX, 0.15, hz);
        this.seesawBeamGroup.add(post);
      }
      const grip = new THREE.Mesh(handleBarGeo, handleMat);
      grip.position.set(handleX, 0.265, 0);
      this.seesawBeamGroup.add(grip);
    }

    group.add(this.seesawBeamGroup);
    tagPlaygroundObject(group, 'seesaw');
    return group;
  }

  private buildBench(woodTex: THREE.Texture): THREE.Group {
    const group = new THREE.Group();
    const b = PLAYGROUND_LAYOUT.bench;
    group.position.set(b.x, 0, b.z);
    // Oriented so bench runs along Z axis and faces +X (toward playground center)
    group.rotation.y = b.facingYaw;
    group.name = 'PlaygroundBench';

    const ironMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0x262b33, roughness: 0.48, metalness: 0.65 }),
    );
    const slatMat = this.trackMat(
      new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.72 }),
    );

    const benchW = b.width;
    // Calibrated exact seat surface top = b.seatHeight (0.36m) to match mech_girl seated thighs
    const seatTopY = b.seatHeight;
    const slatThickness = 0.044;
    const legH = seatTopY - slatThickness;

    // 3 heavy cast-iron leg frames grounded at y=0
    const legGeo = this.trackGeo(new THREE.BoxGeometry(0.068, legH, 0.075));
    const seatSupportGeo = this.trackGeo(new THREE.BoxGeometry(0.068, 0.052, 0.54));
    const backPostGeo = this.trackGeo(new THREE.BoxGeometry(0.06, 0.44, 0.06));

    for (const lx of [-benchW * 0.42, 0, benchW * 0.42]) {
      const frontLeg = new THREE.Mesh(legGeo, ironMat);
      frontLeg.position.set(lx, legH * 0.5, 0.2);
      group.add(frontLeg);

      const backLeg = new THREE.Mesh(legGeo, ironMat);
      backLeg.position.set(lx, legH * 0.5, -0.2);
      group.add(backLeg);

      const crossbar = new THREE.Mesh(seatSupportGeo, ironMat);
      crossbar.position.set(lx, legH - 0.024, 0);
      group.add(crossbar);

      const backPost = new THREE.Mesh(backPostGeo, ironMat);
      backPost.position.set(lx, seatTopY + 0.19, -0.24);
      backPost.rotation.x = -0.18;
      group.add(backPost);
    }

    // Armrests at both ends proportional to seatTopY
    const armGeo = this.trackGeo(new THREE.BoxGeometry(0.068, 0.046, 0.46));
    const armFrontGeo = this.trackGeo(new THREE.BoxGeometry(0.055, 0.17, 0.055));
    for (const lx of [-benchW * 0.46, benchW * 0.46]) {
      const arm = new THREE.Mesh(armGeo, ironMat);
      arm.position.set(lx, seatTopY + 0.18, 0);
      group.add(arm);
      const armLeg = new THREE.Mesh(armFrontGeo, ironMat);
      armLeg.position.set(lx, seatTopY + 0.09, 0.19);
      group.add(armLeg);
    }

    // 4 Beveled cedar seat slats — top surface strictly at y = seatTopY (0.36m)
    const seatSlatGeo = this.trackGeo(new THREE.BoxGeometry(benchW, slatThickness, 0.11));
    for (let i = 0; i < 4; i++) {
      const slat = new THREE.Mesh(seatSlatGeo, slatMat);
      slat.position.set(0, seatTopY - slatThickness * 0.5, -0.18 + i * 0.125);
      group.add(slat);
    }

    // 3 Angled backrest slats
    const backSlatGeo = this.trackGeo(new THREE.BoxGeometry(benchW, 0.09, 0.038));
    for (let i = 0; i < 3; i++) {
      const slat = new THREE.Mesh(backSlatGeo, slatMat);
      slat.position.set(0, seatTopY + 0.14 + i * 0.115, -0.23 - i * 0.021);
      slat.rotation.x = -0.18;
      group.add(slat);
    }

    tagPlaygroundObject(group, 'bench');
    return group;
  }

  private buildVaultingBoxes(birchWoodTex: THREE.Texture): THREE.Group {
    const courseGroup = new THREE.Group();
    courseGroup.name = 'PlaygroundVaultingBoxCourse';

    const woodMat = this.trackMat(
      new THREE.MeshStandardMaterial({ map: birchWoodTex, roughness: 0.68 }),
    );
    const seamMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.78 }),
    );
    const leatherMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xc95a3d, roughness: 0.54, metalness: 0.04 }),
    );
    const pipingMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xf7e7ce, roughness: 0.62 }),
    );
    const rubberMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0x1f242c, roughness: 0.88 }),
    );

    const cushionH = 0.12;
    const footH = 0.035;

    for (const box of PLAYGROUND_LAYOUT.vaultBoxes) {
      const boxGroup = new THREE.Group();
      boxGroup.position.set(box.x, 0, box.z);
      boxGroup.name = `VaultingBox_${box.tier}`;

      const woodTotalH = box.height - cushionH - footH;
      const tierH = woodTotalH / box.tier;

      // 4 rubber non-slip corner feet grounded at y=0
      const footGeo = this.trackGeo(new THREE.BoxGeometry(0.09, footH, 0.1));
      const baseHalfW = box.bottomWidth * 0.5 - 0.045;
      const baseHalfL = box.length * 0.5 - 0.055;
      for (const fx of [-baseHalfW, baseHalfW]) {
        for (const fz of [-baseHalfL, baseHalfL]) {
          const foot = new THREE.Mesh(footGeo, rubberMat);
          foot.position.set(fx, footH * 0.5, fz);
          boxGroup.add(foot);
        }
      }

      // Stacked wooden trapezoidal tiers (1 tier for 1단, 2 for 2단, 3 for 3단)
      for (let t = 0; t < box.tier; t++) {
        const fracMid = (t + 0.5) / box.tier;
        const w = THREE.MathUtils.lerp(box.bottomWidth, box.topWidth + 0.03, fracMid);
        const l = THREE.MathUtils.lerp(box.length, box.length - 0.06, fracMid);
        const yCenter = footH + (t + 0.5) * tierH;

        const tierBody = new THREE.Mesh(
          this.trackGeo(new THREE.BoxGeometry(w, tierH - 0.012, l)),
          woodMat,
        );
        tierBody.position.set(0, yCenter, 0);
        boxGroup.add(tierBody);

        // Dark wooden joinery seam divider between stacked sections
        const seam = new THREE.Mesh(
          this.trackGeo(new THREE.BoxGeometry(w + 0.01, 0.014, l + 0.01)),
          seamMat,
        );
        seam.position.set(0, footH + (t + 1) * tierH - 0.006, 0);
        boxGroup.add(seam);

        // Side hand-grip cutouts on +X / -X faces
        const gripSlot = new THREE.Mesh(
          this.trackGeo(new THREE.BoxGeometry(w + 0.012, 0.032, 0.18)),
          seamMat,
        );
        gripSlot.position.set(0, yCenter, 0);
        boxGroup.add(gripSlot);
      }

      // Padded gymnastic leather top cushion with cream trim band
      const topTrimY = box.height - cushionH + 0.015;
      const trimBand = new THREE.Mesh(
        this.trackGeo(new THREE.BoxGeometry(box.topWidth + 0.02, 0.03, box.length - 0.03)),
        pipingMat,
      );
      trimBand.position.set(0, topTrimY, 0);
      boxGroup.add(trimBand);

      const cushionBodyH = cushionH - 0.03;
      const cushion = new THREE.Mesh(
        this.trackGeo(new THREE.BoxGeometry(box.topWidth, cushionBodyH, box.length - 0.05)),
        leatherMat,
      );
      cushion.position.set(0, box.height - cushionBodyH * 0.5, 0);
      boxGroup.add(cushion);

      // Rounded top cylinder crown for soft gymnastic vaulting silhouette
      const crownGeo = this.trackGeo(
        new THREE.CylinderGeometry(
          box.topWidth * 0.44,
          box.topWidth * 0.44,
          box.length - 0.07,
          14,
        ),
      );
      crownGeo.rotateX(Math.PI / 2);
      const crown = new THREE.Mesh(crownGeo, leatherMat);
      crown.scale.set(1.0, 0.28, 1.0);
      crown.position.set(0, box.height - 0.012, 0);
      boxGroup.add(crown);

      // High-contrast "1단" / "2단" / "3단" stencil plaques on front (+Z) and back (-Z) ends
      const labelTex = this.trackTex(createVaultBoxLabelTexture(box.label));
      const labelMat = this.trackMat(
        new THREE.MeshStandardMaterial({ map: labelTex, roughness: 0.6 }),
      );
      const plaqueW = Math.min(0.38, box.bottomWidth * 0.72);
      const plaqueH = 0.19;
      const plaqueGeo = this.trackGeo(new THREE.PlaneGeometry(plaqueW, plaqueH));
      const plaqueY = footH + woodTotalH * 0.52;
      const halfL = box.length * 0.5 - 0.015;

      const frontPlaque = new THREE.Mesh(plaqueGeo, labelMat);
      frontPlaque.position.set(0, plaqueY, halfL + 0.012);
      boxGroup.add(frontPlaque);

      const backPlaque = new THREE.Mesh(plaqueGeo, labelMat);
      backPlaque.position.set(0, plaqueY, -(halfL + 0.012));
      backPlaque.rotation.y = Math.PI;
      boxGroup.add(backPlaque);

      tagPlaygroundObject(boxGroup, box.id);
      courseGroup.add(boxGroup);
    }

    return courseGroup;
  }

  private buildSandbox(woodTex: THREE.Texture): THREE.Group {
    const group = new THREE.Group();
    const sb = PLAYGROUND_LAYOUT.sandbox;
    group.position.set(sb.x, 0, sb.z);
    group.name = 'PlaygroundSandbox';

    const half = sb.halfSize;
    const wallH = 0.24;
    const wallT = 0.16;

    const frameMat = this.trackMat(
      new THREE.MeshStandardMaterial({ map: woodTex, color: 0xc98c53, roughness: 0.78 }),
    );
    const capMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xe9b472, roughness: 0.72 }),
    );
    const sandTex = this.trackTex(createSandTexture());
    const sandMat = this.trackMat(
      new THREE.MeshStandardMaterial({ map: sandTex, roughness: 0.96, metalness: 0.0 }),
    );

    // 4 Timber perimeter walls grounded at y=0
    const wallXGeo = this.trackGeo(new THREE.BoxGeometry(half * 2 + wallT, wallH, wallT));
    const wallZGeo = this.trackGeo(new THREE.BoxGeometry(wallT, wallH, half * 2 - wallT));
    for (const z of [-half, half]) {
      const w = new THREE.Mesh(wallXGeo, frameMat);
      w.position.set(0, wallH * 0.5, z);
      group.add(w);
    }
    for (const x of [-half, half]) {
      const w = new THREE.Mesh(wallZGeo, frameMat);
      w.position.set(x, wallH * 0.5, 0);
      group.add(w);
    }

    // Corner seat triangles/caps
    const cornerGeo = this.trackGeo(new THREE.BoxGeometry(0.36, 0.04, 0.36));
    for (const cx of [-half + 0.12, half - 0.12]) {
      for (const cz of [-half + 0.12, half - 0.12]) {
        const cap = new THREE.Mesh(cornerGeo, capMat);
        cap.position.set(cx, wallH + 0.02, cz);
        group.add(cap);
      }
    }

    // Sand fill bed
    const sandBed = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(half * 2 - wallT * 0.8, 0.17, half * 2 - wallT * 0.8)),
      sandMat,
    );
    sandBed.position.set(0, 0.085, 0);
    group.add(sandBed);

    // Sculpted Sandcastle prop inside the sandbox
    const castleMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xe2be82, roughness: 0.95 }),
    );
    const castleBase = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.34, 0.42, 0.2, 14)),
      castleMat,
    );
    castleBase.position.set(0.45, 0.25, -0.35);
    group.add(castleBase);

    const turretGeo = this.trackGeo(new THREE.CylinderGeometry(0.085, 0.11, 0.24, 10));
    const roofGeo = this.trackGeo(new THREE.ConeGeometry(0.11, 0.14, 10));
    const flagMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.5 }),
    );
    for (const [tx, tz] of [
      [0.3, -0.22],
      [0.6, -0.22],
      [0.45, -0.5],
    ]) {
      const turret = new THREE.Mesh(turretGeo, castleMat);
      turret.position.set(tx, 0.38, tz);
      group.add(turret);
      const roof = new THREE.Mesh(roofGeo, castleMat);
      roof.position.set(tx, 0.56, tz);
      group.add(roof);
    }
    const flagPole = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 6)),
      capMat,
    );
    flagPole.position.set(0.45, 0.68, -0.5);
    group.add(flagPole);
    const flag = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.11, 0.07, 0.01)),
      flagMat,
    );
    flag.position.set(0.51, 0.75, -0.5);
    group.add(flag);

    // Toy bucket & shovel
    const pailMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.38 }),
    );
    const pail = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.13, 0.1, 0.22, 16)),
      pailMat,
    );
    pail.position.set(-0.52, 0.27, 0.42);
    group.add(pail);

    const shovelMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.42 }),
    );
    const shovelHandle = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.018, 0.018, 0.34, 8)),
      shovelMat,
    );
    shovelHandle.position.set(-0.22, 0.21, 0.55);
    shovelHandle.rotation.set(0.4, 0.2, 1.15);
    group.add(shovelHandle);

    tagPlaygroundObject(group, 'sandbox');
    return group;
  }

  private buildBalls(): void {
    const shadowTex = this.trackTex(createContactShadowTexture());
    const shadowGeo = this.trackGeo(new THREE.PlaneGeometry(0.65, 0.65));
    shadowGeo.rotateX(-Math.PI / 2);

    // Soccer ball
    const soccerTex = this.trackTex(createSoccerBallTexture());
    const soccerMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: soccerTex,
        roughness: 0.42,
        metalness: 0.05,
      }),
    );
    this.soccerBallMesh = new THREE.Mesh(
      this.trackGeo(new THREE.SphereGeometry(0.2, 28, 20)),
      soccerMat,
    );
    this.soccerBallMesh.name = 'PlaygroundSoccerBall';
    tagPlaygroundObject(this.soccerBallMesh, 'soccer_ball');
    this.add(this.soccerBallMesh);

    this.soccerShadow = new THREE.Mesh(
      shadowGeo,
      this.trackMat(
        new THREE.MeshBasicMaterial({
          map: shadowTex,
          transparent: true,
          depthWrite: false,
        }),
      ),
    );
    this.soccerShadow.position.y = 0.012;
    this.add(this.soccerShadow);

    // Basketball
    const basketTex = this.trackTex(createBasketballTexture());
    const basketMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: basketTex,
        roughness: 0.62,
        metalness: 0.02,
      }),
    );
    this.basketballMesh = new THREE.Mesh(
      this.trackGeo(new THREE.SphereGeometry(0.22, 28, 20)),
      basketMat,
    );
    this.basketballMesh.name = 'PlaygroundBasketball';
    tagPlaygroundObject(this.basketballMesh, 'basketball');
    this.add(this.basketballMesh);

    this.basketballShadow = new THREE.Mesh(
      shadowGeo,
      this.trackMat(
        new THREE.MeshBasicMaterial({
          map: shadowTex,
          transparent: true,
          depthWrite: false,
        }),
      ),
    );
    this.basketballShadow.position.y = 0.012;
    this.add(this.basketballShadow);
  }

  private buildTargetRing(): void {
    const ringGeo = this.trackGeo(new THREE.RingGeometry(0.18, 0.25, 32));
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xf472b6,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.targetRing = new THREE.Mesh(ringGeo, ringMat);
    this.targetRing.position.y = 0.018;
    this.targetRing.visible = false;
    this.targetRing.name = 'GroundClickTargetRing';
    this.add(this.targetRing);
  }

  public setPassthroughMode(isAr: boolean): void {
    this.skyMesh.visible = !isAr;
    this.lawnGroup.visible = !isAr;
  }

  public syncFromSimulation(
    snap: PlaygroundSimSnapshot,
    elapsedSec: number,
    heldBasketballPos?: THREE.Vector3 | null,
  ): void {
    // Dynamic seesaw beam tilt
    if (this.seesawBeamGroup) {
      this.seesawBeamGroup.rotation.z = snap.seesawTilt;
    }

    // Dynamic swing pendulum rotation (negative X rotation swings seat forward toward +Z)
    if (this.swingPivotGroup) {
      this.swingPivotGroup.rotation.x = -snap.swingAngle;
    }

    // Soccer ball
    this.syncBallMesh(
      this.soccerBallMesh,
      this.soccerShadow,
      snap.soccerBall,
      this.prevSoccerSpin,
    );
    this.prevSoccerSpin = snap.soccerBall.spinAngle;

    // Basketball (snaps directly into avatar's hands when held!)
    if (snap.basketball.heldByAvatar && heldBasketballPos) {
      this.basketballMesh.position.copy(heldBasketballPos);
      this.basketballShadow.position.set(heldBasketballPos.x, 0.014, heldBasketballPos.z);
      const heightAboveGround = Math.max(0, heldBasketballPos.y - snap.basketball.radius);
      this.basketballShadow.scale.setScalar(Math.max(0.35, 1.0 - heightAboveGround * 0.28));
      const smat = this.basketballShadow.material as THREE.MeshBasicMaterial;
      smat.opacity = Math.max(0.14, 0.85 - heightAboveGround * 0.38);
    } else {
      this.syncBallMesh(
        this.basketballMesh,
        this.basketballShadow,
        snap.basketball,
        this.prevBasketSpin,
      );
    }
    this.prevBasketSpin = snap.basketball.spinAngle;

    // Click target indicator ring
    this.targetRing.visible = snap.targetMarker.visible;
    if (snap.targetMarker.visible) {
      this.targetRing.position.set(snap.targetMarker.x, 0.018, snap.targetMarker.z);
      const pulse = 1 + Math.sin(elapsedSec * 6.5) * 0.1;
      this.targetRing.scale.setScalar(pulse);
    }
  }

  private syncBallMesh(
    mesh: THREE.Mesh,
    shadow: THREE.Mesh,
    state: PlaygroundBallState,
    prevSpin: number,
  ): void {
    mesh.position.set(state.x, state.y, state.z);
    const deltaSpin = state.spinAngle - prevSpin;
    if (Math.abs(deltaSpin) > 1e-5) {
      this.tmpSpinAxis.set(state.spinAxisX, 0, state.spinAxisZ).normalize();
      mesh.rotateOnWorldAxis(this.tmpSpinAxis, deltaSpin);
    }

    shadow.position.set(state.x, 0.014, state.z);
    const heightAboveGround = Math.max(0, state.y - state.radius);
    const shadowScale = Math.max(0.4, 1.0 - heightAboveGround * 0.25);
    shadow.scale.setScalar(shadowScale);
    const smat = shadow.material as THREE.MeshBasicMaterial;
    smat.opacity = Math.max(0.18, 0.85 - heightAboveGround * 0.35);
  }

  public dispose(): void {
    for (const t of this.textures) t.dispose();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.textures = [];
    this.geometries = [];
    this.materials = [];
  }
}
