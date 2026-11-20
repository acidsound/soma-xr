import * as THREE from 'three';

function createWoodFloorTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#2a202d';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 8; i++) {
      const y = i * 64;
      ctx.fillStyle = i % 2 === 0 ? '#312534' : '#291e2c';
      ctx.fillRect(0, y, 512, 62);
      ctx.fillStyle = '#1b141e';
      ctx.fillRect(0, y + 62, 512, 2);
      ctx.strokeStyle = 'rgba(255, 220, 210, 0.05)';
      ctx.lineWidth = 1;
      for (let g = 0; g < 6; g++) {
        ctx.beginPath();
        ctx.moveTo(0, y + 10 + g * 9);
        ctx.bezierCurveTo(
          160,
          y + 8 + g * 9,
          340,
          y + 13 + g * 9,
          512,
          y + 10 + g * 9,
        );
        ctx.stroke();
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
    grad.addColorStop(0, 'rgba(10, 6, 16, 0.52)');
    grad.addColorStop(0.65, 'rgba(10, 6, 16, 0.22)');
    grad.addColorStop(1, 'rgba(10, 6, 16, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface InteractivePropInfo {
  id: 'latte' | 'bouquet' | 'musicbox';
  label: string;
  mesh: THREE.Group;
}

export class RomanticEnvironment extends THREE.Group {
  public readonly props: InteractivePropInfo[] = [];
  private disposables: Array<{ dispose: () => void }> = [];
  private skyDome!: THREE.Mesh;
  private floorGroup = new THREE.Group();
  private petalsMesh!: THREE.InstancedMesh;
  private petalCount = 42;
  private petalStates: Array<{
    x: number;
    y: number;
    z: number;
    speed: number;
    swayOffset: number;
    rotSpeed: number;
  }> = [];
  private dummy = new THREE.Object3D();
  private lanternLight!: THREE.PointLight;

  constructor(options: { isSoftwareGl: boolean }) {
    super();
    this.name = 'RomanticTwilightTerrace';
    this.buildLighting(options.isSoftwareGl);
    this.buildSkyDome();
    this.buildTerraceAndFurniture();
    this.buildPetals();
  }

  private track<T extends { dispose: () => void }>(item: T): T {
    this.disposables.push(item);
    return item;
  }

  private buildLighting(isSoftwareGl: boolean): void {
    // Cool twilight sky/ground hemisphere fill + warm sunset/lantern key light
    const hemi = new THREE.HemisphereLight(0xc4b5fd, 0x2c1f30, 1.35);
    this.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xffdfb8, 2.1);
    keyLight.position.set(1.8, 3.6, 2.4);
    keyLight.castShadow = !isSoftwareGl;
    if (!isSoftwareGl) {
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.left = -2.2;
      keyLight.shadow.camera.right = 2.2;
      keyLight.shadow.camera.top = 2.4;
      keyLight.shadow.camera.bottom = -0.5;
      keyLight.shadow.camera.near = 0.5;
      keyLight.shadow.camera.far = 9;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    this.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xa78bfa, 0.85);
    rimLight.position.set(-1.6, 2.4, -2.2);
    this.add(rimLight);
  }

  private buildSkyDome(): void {
    const skyGeo = this.track(new THREE.SphereGeometry(24, 24, 16));
    const skyMat = this.track(
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          uTopColor: { value: new THREE.Color(0x120f24) },
          uMidColor: { value: new THREE.Color(0x382047) },
          uHorizonColor: { value: new THREE.Color(0x743c5c) },
        },
        vertexShader: `
          varying vec3 vWorldPos;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPos = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: `
          uniform vec3 uTopColor;
          uniform vec3 uMidColor;
          uniform vec3 uHorizonColor;
          varying vec3 vWorldPos;
          void main() {
            float h = clamp(normalize(vWorldPos).y, 0.0, 1.0);
            vec3 col = mix(uHorizonColor, uMidColor, smoothstep(0.0, 0.32, h));
            col = mix(col, uTopColor, smoothstep(0.32, 0.88, h));
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      }),
    );
    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.add(this.skyDome);
  }

  private buildTerraceAndFurniture(): void {
    this.add(this.floorGroup);

    const woodTex = this.track(createWoodFloorTexture());
    const floorMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: woodTex,
        roughness: 0.72,
        metalness: 0.05,
      }),
    );
    const floor = new THREE.Mesh(
      this.track(new THREE.CircleGeometry(7.5, 48)),
      floorMat,
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.floorGroup.add(floor);

    // Woven circular sanctuary rug (offset +0.018m above floor)
    const rugMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x452d48,
        roughness: 0.92,
        metalness: 0.02,
      }),
    );
    const rug = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(1.35, 1.38, 0.014, 40)),
      rugMat,
    );
    rug.position.set(0, 0.008, -0.05);
    rug.receiveShadow = true;
    this.floorGroup.add(rug);

    // Soft contact shadow disc directly beneath avatar feet (z = -0.15)
    const contactTex = this.track(createContactShadowTexture());
    const contactMat = this.track(
      new THREE.MeshBasicMaterial({
        map: contactTex,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    );
    const contactDisc = new THREE.Mesh(
      this.track(new THREE.CircleGeometry(0.42, 24)),
      contactMat,
    );
    contactDisc.rotation.x = -Math.PI / 2;
    contactDisc.position.set(0, 0.019, -0.15);
    this.floorGroup.add(contactDisc);

    // Pergola / Sanctuary Arch behind companion
    const archMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x261d2b,
        roughness: 0.65,
        metalness: 0.25,
      }),
    );
    const pillarGeo = this.track(new THREE.CylinderGeometry(0.055, 0.065, 2.35, 14));
    const leftPillar = new THREE.Mesh(pillarGeo, archMat);
    leftPillar.position.set(-1.35, 1.175, -1.25);
    const rightPillar = new THREE.Mesh(pillarGeo, archMat);
    rightPillar.position.set(1.35, 1.175, -1.25);

    const beamGeo = this.track(new THREE.BoxGeometry(3.1, 0.1, 0.14));
    const topBeam = new THREE.Mesh(beamGeo, archMat);
    topBeam.position.set(0, 2.35, -1.25);

    // Warm string-light bulbs along pergola beam
    const bulbMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xffe4b5,
        emissive: 0xffb366,
        emissiveIntensity: 1.6,
        roughness: 0.2,
      }),
    );
    const bulbGeo = this.track(new THREE.SphereGeometry(0.032, 10, 10));
    for (let i = -4; i <= 4; i++) {
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.set(i * 0.3, 2.26 - Math.cos(i * 0.35) * 0.05, -1.22);
      this.floorGroup.add(bulb);
    }
    this.floorGroup.add(leftPillar, rightPillar, topBeam);

    // Bistro Café Table on the left side (x = -0.64, z = -0.05)
    const tableGroup = new THREE.Group();
    tableGroup.position.set(-0.64, 0, -0.05);

    const ironMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x24202c,
        roughness: 0.38,
        metalness: 0.72,
      }),
    );
    const tableTopMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x5c3c36,
        roughness: 0.45,
        metalness: 0.08,
      }),
    );

    const pedestalProfile = [
      new THREE.Vector2(0.22, 0.0),
      new THREE.Vector2(0.18, 0.04),
      new THREE.Vector2(0.035, 0.12),
      new THREE.Vector2(0.03, 0.72),
      new THREE.Vector2(0.12, 0.74),
    ];
    const pedestal = new THREE.Mesh(
      this.track(new THREE.LatheGeometry(pedestalProfile, 24)),
      ironMat,
    );
    pedestal.castShadow = true;

    const tableTop = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(0.32, 0.31, 0.032, 32)),
      tableTopMat,
    );
    tableTop.position.y = 0.76;
    tableTop.castShadow = true;
    tableTop.receiveShadow = true;
    tableGroup.add(pedestal, tableTop);

    // Warm Glowing Table Lantern
    const lanternGlassMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xfff3d6,
        emissive: 0xffaa55,
        emissiveIntensity: 1.5,
        roughness: 0.2,
      }),
    );
    const lanternBase = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(0.048, 0.055, 0.025, 16)),
      ironMat,
    );
    lanternBase.position.set(-0.1, 0.788, -0.08);
    const lanternCore = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(0.036, 0.04, 0.09, 14)),
      lanternGlassMat,
    );
    lanternCore.position.set(-0.1, 0.84, -0.08);
    const lanternCap = new THREE.Mesh(
      this.track(new THREE.ConeGeometry(0.056, 0.038, 16)),
      ironMat,
    );
    lanternCap.position.set(-0.1, 0.9, -0.08);
    tableGroup.add(lanternBase, lanternCore, lanternCap);

    this.lanternLight = new THREE.PointLight(0xffb46b, 1.4, 3.2, 2);
    this.lanternLight.position.set(-0.1, 0.88, -0.08);
    tableGroup.add(this.lanternLight);

    // Interactive Prop 1: Warm Latte Cup
    const latteGroup = new THREE.Group();
    latteGroup.position.set(0.08, 0.778, 0.08);
    const porcelainMat = this.track(
      new THREE.MeshStandardMaterial({ color: 0xf9f5f0, roughness: 0.22 }),
    );
    const coffeeMat = this.track(
      new THREE.MeshStandardMaterial({ color: 0x7b4c32, roughness: 0.3 }),
    );
    const saucer = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(0.065, 0.04, 0.012, 20)),
      porcelainMat,
    );
    const cup = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(0.042, 0.032, 0.062, 20)),
      porcelainMat,
    );
    cup.position.y = 0.036;
    const coffee = new THREE.Mesh(
      this.track(new THREE.CircleGeometry(0.038, 18)),
      coffeeMat,
    );
    coffee.rotation.x = -Math.PI / 2;
    coffee.position.y = 0.066;
    latteGroup.add(saucer, cup, coffee);
    this.tagPropGroup(latteGroup, 'latte', '따뜻한 라떼 건네기');
    tableGroup.add(latteGroup);

    // Interactive Prop 2: Starlight Bouquet
    const bouquetGroup = new THREE.Group();
    bouquetGroup.position.set(0.14, 0.778, -0.08);
    const wrapMat = this.track(
      new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.75 }),
    );
    const petalMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xfde047,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.25,
        roughness: 0.4,
      }),
    );
    const wrapCone = new THREE.Mesh(
      this.track(new THREE.ConeGeometry(0.048, 0.11, 14)),
      wrapMat,
    );
    wrapCone.rotation.x = Math.PI;
    wrapCone.position.y = 0.055;
    bouquetGroup.add(wrapCone);
    const flowerGeo = this.track(new THREE.SphereGeometry(0.022, 10, 10));
    for (let f = 0; f < 4; f++) {
      const ang = (f / 4) * Math.PI * 2;
      const flower = new THREE.Mesh(flowerGeo, petalMat);
      flower.position.set(Math.cos(ang) * 0.022, 0.115, Math.sin(ang) * 0.022);
      bouquetGroup.add(flower);
    }
    this.tagPropGroup(bouquetGroup, 'bouquet', '별꽃 다발 선물하기');
    tableGroup.add(bouquetGroup);

    // Interactive Prop 3: Glowing Music Box
    const musicBoxGroup = new THREE.Group();
    musicBoxGroup.position.set(-0.08, 0.778, 0.12);
    const boxWoodMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x4c1d95,
        roughness: 0.35,
        metalness: 0.25,
      }),
    );
    const goldMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        roughness: 0.22,
        metalness: 0.85,
      }),
    );
    const boxMesh = new THREE.Mesh(
      this.track(new THREE.BoxGeometry(0.075, 0.045, 0.065)),
      boxWoodMat,
    );
    boxMesh.position.y = 0.022;
    const gem = new THREE.Mesh(
      this.track(new THREE.OctahedronGeometry(0.018, 0)),
      goldMat,
    );
    gem.position.y = 0.058;
    musicBoxGroup.add(boxMesh, gem);
    this.tagPropGroup(musicBoxGroup, 'musicbox', '오르골 들려주기');
    tableGroup.add(musicBoxGroup);

    this.floorGroup.add(tableGroup);
  }

  private tagPropGroup(
    group: THREE.Group,
    id: InteractivePropInfo['id'],
    label: string,
  ): void {
    group.name = `Prop_${id}`;
    group.traverse((child) => {
      child.userData.interactivePropId = id;
      child.userData.interactivePropLabel = label;
    });
    this.props.push({ id, label, mesh: group });
  }

  private buildPetals(): void {
    const petalGeo = this.track(new THREE.PlaneGeometry(0.032, 0.02));
    const petalMat = this.track(
      new THREE.MeshBasicMaterial({
        color: 0xf9a8d4,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.petalsMesh = new THREE.InstancedMesh(
      petalGeo,
      petalMat,
      this.petalCount,
    );
    this.petalsMesh.frustumCulled = false;

    for (let i = 0; i < this.petalCount; i++) {
      this.petalStates.push({
        x: (Math.random() - 0.5) * 4.8,
        y: Math.random() * 2.6 + 0.2,
        z: (Math.random() - 0.5) * 3.8 - 0.5,
        speed: 0.14 + Math.random() * 0.18,
        swayOffset: Math.random() * Math.PI * 2,
        rotSpeed: 0.8 + Math.random() * 1.4,
      });
    }
    this.add(this.petalsMesh);
  }

  public setPassthroughMode(isAR: boolean): void {
    this.skyDome.visible = !isAR;
    this.floorGroup.visible = !isAR;
  }

  public update(dt: number, elapsedSec: number): void {
    const clampedDt = Math.min(dt, 0.05);
    this.lanternLight.intensity = 1.35 + Math.sin(elapsedSec * 4.2) * 0.12;

    for (let i = 0; i < this.petalCount; i++) {
      const p = this.petalStates[i];
      p.y -= p.speed * clampedDt;
      if (p.y < 0.05) {
        p.y = 2.7;
        p.x = (Math.random() - 0.5) * 4.8;
      }
      const swayX = Math.sin(elapsedSec * 1.2 + p.swayOffset) * 0.22;
      this.dummy.position.set(p.x + swayX, p.y, p.z);
      this.dummy.rotation.set(
        elapsedSec * p.rotSpeed,
        elapsedSec * p.rotSpeed * 0.7,
        p.swayOffset,
      );
      this.dummy.updateMatrix();
      this.petalsMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.petalsMesh.instanceMatrix.needsUpdate = true;
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
