import type {
  PlaygroundAvatarActivity,
  PlaygroundCommand,
  PlaygroundCommandType,
  PlaygroundObjectId,
} from '../types';

export interface Vec2 {
  x: number;
  z: number;
}

export interface PlaygroundBallState {
  id: 'soccer_ball' | 'basketball';
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  radius: number;
  restitution: number;
  friction: number;
  spinAxisX: number;
  spinAxisZ: number;
  spinAngle: number;
  kickCount: number;
  heldByAvatar: boolean;
}

export interface ObstacleBox {
  id: PlaygroundObjectId;
  x: number;
  z: number;
  halfW: number;
  halfD: number;
  height: number;
  yaw: number;
  vaultable: boolean;
}

export interface VaultBoxSpec {
  id: 'vault_box_1' | 'vault_box_2' | 'vault_box_3';
  tier: 1 | 2 | 3;
  label: string;
  x: number;
  z: number;
  height: number;
  topWidth: number;
  bottomWidth: number;
  length: number;
  apexHeight: number;
}

export interface PlaygroundLayout {
  boundsHalfSize: number;
  seatedThighClearance: number;
  slide: {
    x: number;
    z: number;
    stairsStart: Vec2;
    topPlatform: { x: number; y: number; z: number };
    chuteExit: Vec2;
    facingYaw: number;
  };
  swing: {
    x: number;
    z: number;
    frameWidth: number;
    topBarY: number;
    ropeLength: number;
    seatHeight: number;
    approachFront: Vec2;
    facingYaw: number;
  };
  seesaw: {
    x: number;
    z: number;
    plankLength: number;
    plankWidth: number;
    pivotHeight: number;
    seatTopOffset: number;
    leftSeat: Vec2;
    rightSeat: Vec2;
    seatHeight: number;
  };
  bench: {
    x: number;
    z: number;
    width: number;
    depth: number;
    seatHeight: number;
    seatPos: Vec2;
    approachFront: Vec2;
    behindPos: Vec2;
    facingYaw: number;
  };
  vaultBoxes: [VaultBoxSpec, VaultBoxSpec, VaultBoxSpec];
  sandbox: {
    x: number;
    z: number;
    halfSize: number;
    playPos: Vec2;
  };
}

// Calibrated to mech_girl.vrm (1.56m) in SOMA ardy_sit[1]:
// hip joint = 0.478m, thigh underside = 0.36m, soles = 0.003m when avatar.y = 0.
const SEATED_THIGH_CLEARANCE = 0.36;

export const PLAYGROUND_LAYOUT: PlaygroundLayout = {
  boundsHalfSize: 8.2,
  seatedThighClearance: SEATED_THIGH_CLEARANCE,
  slide: {
    x: -4.9,
    z: -4.5,
    stairsStart: { x: -4.9, z: -5.75 },
    topPlatform: { x: -4.9, y: 1.48, z: -4.8 },
    chuteExit: { x: -4.9, z: -2.65 },
    facingYaw: 0,
  },
  swing: {
    x: -0.2,
    z: -5.1,
    frameWidth: 2.35,
    topBarY: 2.45,
    ropeLength: 2.0,
    seatHeight: 0.45,
    approachFront: { x: -0.2, z: -4.15 },
    facingYaw: 0, // faces +Z toward center & camera
  },
  seesaw: {
    x: 4.6,
    z: -4.3,
    plankLength: 2.9,
    plankWidth: 0.42,
    pivotHeight: 0.44,
    seatTopOffset: 0.075,
    leftSeat: { x: 3.45, z: -4.3 },
    rightSeat: { x: 5.75, z: -4.3 },
    seatHeight: SEATED_THIGH_CLEARANCE,
  },
  bench: {
    x: -4.5,
    z: 1.9,
    width: 1.85,
    depth: 0.62,
    seatHeight: SEATED_THIGH_CLEARANCE,
    seatPos: { x: -4.5, z: 1.9 },
    approachFront: { x: -3.65, z: 1.9 },
    behindPos: { x: -5.45, z: 1.9 },
    facingYaw: Math.PI * 0.5, // faces +X toward center of playground
  },
  vaultBoxes: [
    {
      id: 'vault_box_1',
      tier: 1,
      label: '1단',
      x: 2.4,
      z: -0.55,
      height: 0.48,
      topWidth: 0.42,
      bottomWidth: 0.56,
      length: 0.88,
      apexHeight: 0.64,
    },
    {
      id: 'vault_box_2',
      tier: 2,
      label: '2단',
      x: 4.2,
      z: -0.55,
      height: 0.72,
      topWidth: 0.42,
      bottomWidth: 0.64,
      length: 0.96,
      apexHeight: 0.88,
    },
    {
      id: 'vault_box_3',
      tier: 3,
      label: '3단',
      x: 6.0,
      z: -0.55,
      height: 0.96,
      topWidth: 0.42,
      bottomWidth: 0.72,
      length: 1.04,
      apexHeight: 1.12,
    },
  ],
  sandbox: {
    x: 4.5,
    z: 3.25,
    halfSize: 1.45,
    playPos: { x: 4.3, z: 3.25 },
  },
};

export const PLAYGROUND_OBSTACLES: ObstacleBox[] = [
  {
    id: 'bench',
    x: PLAYGROUND_LAYOUT.bench.x,
    z: PLAYGROUND_LAYOUT.bench.z,
    halfW: 0.34,
    halfD: 0.94,
    height: 0.78,
    yaw: 0,
    vaultable: true,
  },
  {
    id: 'seesaw',
    x: PLAYGROUND_LAYOUT.seesaw.x,
    z: PLAYGROUND_LAYOUT.seesaw.z,
    halfW: 1.45,
    halfD: 0.24,
    height: 0.52,
    yaw: 0,
    vaultable: true,
  },
  ...PLAYGROUND_LAYOUT.vaultBoxes.map((box) => ({
    id: box.id,
    x: box.x,
    z: box.z,
    halfW: box.bottomWidth * 0.5,
    halfD: box.length * 0.5,
    height: box.height,
    yaw: 0,
    vaultable: true,
  })),
];

export interface PlaygroundAvatarState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  activity: PlaygroundAvatarActivity;
  phase: number; // 0..1 progress for finite actions
  targetX: number;
  targetZ: number;
  statusLabelKo: string;
}

export interface PlaygroundSimSnapshot {
  avatar: PlaygroundAvatarState;
  seesawTilt: number; // radians, positive tilts left side down
  swingAngle: number; // radians, positive swings seat forward (+Z)
  soccerBall: PlaygroundBallState;
  basketball: PlaygroundBallState;
  targetMarker: { x: number; z: number; visible: boolean; ttl: number };
}

interface QueuedTask {
  type: PlaygroundCommandType;
  targetX: number;
  targetZ: number;
  run: boolean;
  startX: number;
  startZ: number;
  vaultStartX: number;
  vaultStartZ: number;
  vaultEndX: number;
  vaultEndZ: number;
  vaultApex?: number;
  vaultTierIndex?: number;
  remainingVaultTiers?: number[];
  finalDestX?: number;
  finalDestZ?: number;
  ballId?: 'soccer_ball' | 'basketball';
  kickImpulsed?: boolean;
  throwAimYaw?: number;
}

const GRAVITY = 9.81;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

function dist2D(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(bx - ax, bz - az);
}

/**
 * Checks if line segment A->B intersects an axis-aligned rectangle centered at (cx, cz)
 * with half extents (halfW, halfD).
 */
export function segmentIntersectsBox2D(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  halfW: number,
  halfD: number,
): boolean {
  const minX = cx - halfW;
  const maxX = cx + halfW;
  const minZ = cz - halfD;
  const maxZ = cz + halfD;
  const dx = bx - ax;
  const dz = bz - az;
  let tmin = 0;
  let tmax = 1;

  if (Math.abs(dx) < 1e-6) {
    if (ax < minX || ax > maxX) return false;
  } else {
    let tx1 = (minX - ax) / dx;
    let tx2 = (maxX - ax) / dx;
    if (tx1 > tx2) [tx1, tx2] = [tx2, tx1];
    tmin = Math.max(tmin, tx1);
    tmax = Math.min(tmax, tx2);
    if (tmin > tmax) return false;
  }

  if (Math.abs(dz) < 1e-6) {
    if (az < minZ || az > maxZ) return false;
  } else {
    let tz1 = (minZ - az) / dz;
    let tz2 = (maxZ - az) / dz;
    if (tz1 > tz2) [tz1, tz2] = [tz2, tz1];
    tmin = Math.max(tmin, tz1);
    tmax = Math.min(tmax, tz2);
    if (tmin > tmax) return false;
  }
  return true;
}

/**
 * Parses Korean or English user chat/voice directives into immediate
 * PlaygroundCommand objects so avatar locomotion and object interaction
 * respond deterministically even before LLM text finishes streaming.
 */
export function parsePlaygroundCommand(text: string): PlaygroundCommand | null {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return null;

  const wantsVault =
    /(타넘|넘어|뛰어넘|건너|점프|vault|hurdle|jump over|leap)/i.test(normalized);
  const wantsSit = /(앉|쉬|휴식|sit|rest)/i.test(normalized);
  const wantsRun = /(뛰|달려|빨리|run|sprint|dash)/i.test(normalized);

  // Bench
  if (/(벤치|의자|bench)/i.test(normalized)) {
    if (wantsVault) {
      return { type: 'vault_bench', run: true, labelKo: '벤치 타넘고 지나가기' };
    }
    return { type: 'sit_bench', run: wantsRun, labelKo: '벤치에 앉기' };
  }

  // Seesaw
  if (/(시소|seesaw|teeter)/i.test(normalized)) {
    if (wantsVault) {
      return { type: 'vault_seesaw', run: true, labelKo: '시소 타넘고 지나가기' };
    }
    return { type: 'sit_seesaw', run: wantsRun, labelKo: '시소 타기' };
  }

  // Swing
  if (/(그네|swing)/i.test(normalized)) {
    return { type: 'ride_swing', run: wantsRun, labelKo: '그네 타기' };
  }

  // 3-Tier Vaulting Boxes (1단, 2단, 3단 뜀틀)
  if (/(뜀틀|vault\s*box|vaulting\s*box)/i.test(normalized)) {
    if (/(1단|일\s*단|첫\s*번\s*째|box\s*1|tier\s*1)/i.test(normalized) && !/(2단|3단|순서|전부|연속|다)/i.test(normalized)) {
      return { type: 'vault_box_1', run: true, labelKo: '1단 뜀틀 뛰어넘기' };
    }
    if (/(2단|이\s*단|두\s*번\s*째|box\s*2|tier\s*2)/i.test(normalized) && !/(1단|3단|순서|전부|연속|다)/i.test(normalized)) {
      return { type: 'vault_box_2', run: true, labelKo: '2단 뜀틀 뛰어넘기' };
    }
    if (/(3단만|삼단만|세\s*번\s*째|box\s*3|tier\s*3)/i.test(normalized)) {
      return { type: 'vault_box_3', run: true, labelKo: '3단 뜀틀 뛰어넘기' };
    }
    return { type: 'vault_boxes_all', run: true, labelKo: '1·2·3단 뜀틀 연속 뛰어넘기' };
  }

  // Slide
  if (/(미끄럼틀|슬라이드|slide)/i.test(normalized)) {
    return { type: 'ride_slide', run: wantsRun, labelKo: '미끄럼틀 타기' };
  }

  // Soccer ball
  if (/(축구공|축구|soccer|football)/i.test(normalized)) {
    return { type: 'kick_soccer', run: true, labelKo: '축구공 차기' };
  }

  // Basketball (pick up by hand and throw!)
  if (/(농구공|농구|드리블|basketball|dribble|공\s*던|공을\s*던|공\s*주워|공을\s*주워|패스|슛|throw\s*(the\s*)?ball)/i.test(normalized)) {
    return { type: 'throw_basketball', run: true, labelKo: '농구공 주워서 던지기' };
  }

  // Generic ball kick
  if (/(공\s*차|공을\s*차|발로\s*차|kick\s*(the\s*)?ball)/i.test(normalized)) {
    return { type: 'kick_soccer', run: true, labelKo: '축구공 차기' };
  }

  // Sandbox
  if (/(샌드박스|모래|모래놀|모래성|sandbox|sandpit)/i.test(normalized)) {
    return { type: 'play_sandbox', run: wantsRun, labelKo: '샌드박스에서 놀기' };
  }

  // Stand up
  if (/(일어나|일어서|서\s*봐|stand\s*up)/i.test(normalized)) {
    return { type: 'stand_up', labelKo: '일어서기' };
  }

  // Come here / center
  if (/(이리\s*와|이쪽|가운데|중앙|앞으로\s*와|come\s*here)/i.test(normalized)) {
    return {
      type: 'move_to',
      targetX: 0,
      targetZ: 0.9,
      run: wantsRun,
      labelKo: '가까이 이동하기',
    };
  }

  return null;
}

export class PlaygroundSimulation {
  private avatar: PlaygroundAvatarState;
  private seesawTilt = -0.135;
  private seesawTiltVel = 0;
  private swingAngle = 0;
  private swingVel = 0;
  private simTime = 0;
  private soccerBall: PlaygroundBallState;
  private basketball: PlaygroundBallState;
  private targetMarker = { x: 0, z: 0, visible: false, ttl: 0 };

  private activeTask: QueuedTask | null = null;
  private taskStage: 'approach' | 'execute' | 'follow_move' = 'approach';
  private taskTimer = 0;

  constructor() {
    this.avatar = {
      x: 0.0,
      y: 0.0,
      z: 0.85,
      yaw: 0.0,
      speed: 0,
      activity: 'idle',
      phase: 0,
      targetX: 0.0,
      targetZ: 0.85,
      statusLabelKo: '놀이터 중앙 대기',
    };

    this.soccerBall = {
      id: 'soccer_ball',
      x: -1.0,
      y: 0.2,
      z: -0.35,
      vx: 0,
      vy: 0,
      vz: 0,
      radius: 0.2,
      restitution: 0.56,
      friction: 1.65,
      spinAxisX: 0,
      spinAxisZ: 1,
      spinAngle: 0,
      kickCount: 0,
      heldByAvatar: false,
    };

    this.basketball = {
      id: 'basketball',
      x: 0.9,
      y: 0.22,
      z: -0.45,
      vx: 0,
      vy: 0,
      vz: 0,
      radius: 0.22,
      restitution: 0.78,
      friction: 1.4,
      spinAxisX: 0,
      spinAxisZ: 1,
      spinAngle: 0,
      kickCount: 0,
      heldByAvatar: false,
    };
  }

  public getSnapshot(): PlaygroundSimSnapshot {
    return {
      avatar: { ...this.avatar },
      seesawTilt: this.seesawTilt,
      swingAngle: this.swingAngle,
      soccerBall: { ...this.soccerBall },
      basketball: { ...this.basketball },
      targetMarker: { ...this.targetMarker },
    };
  }

  public reset(): void {
    this.avatar = {
      x: 0.0,
      y: 0.0,
      z: 0.85,
      yaw: 0.0,
      speed: 0,
      activity: 'idle',
      phase: 0,
      targetX: 0.0,
      targetZ: 0.85,
      statusLabelKo: '놀이터 중앙 대기',
    };
    this.seesawTilt = -0.135;
    this.seesawTiltVel = 0;
    this.swingAngle = 0;
    this.swingVel = 0;
    this.simTime = 0;
    this.soccerBall = {
      ...this.soccerBall,
      x: -1.0,
      y: 0.2,
      z: -0.35,
      vx: 0,
      vy: 0,
      vz: 0,
      spinAngle: 0,
      kickCount: 0,
      heldByAvatar: false,
    };
    this.basketball = {
      ...this.basketball,
      x: 0.9,
      y: 0.22,
      z: -0.45,
      vx: 0,
      vy: 0,
      vz: 0,
      spinAngle: 0,
      kickCount: 0,
      heldByAvatar: false,
    };
    this.activeTask = null;
    this.targetMarker.visible = false;
  }

  public issueCommand(cmd: PlaygroundCommand): void {
    if (cmd.type === 'none') return;

    // Release any held ball naturally if interrupted by a new command
    this.soccerBall.heldByAvatar = false;
    this.basketball.heldByAvatar = false;

    const lim = PLAYGROUND_LAYOUT.boundsHalfSize - 0.55;
    const isSitting =
      this.avatar.activity === 'sit_bench' ||
      this.avatar.activity === 'sit_seesaw' ||
      this.avatar.activity === 'sit_swing';
    if (isSitting && cmd.type === 'stand_up') {
      if (this.avatar.activity === 'sit_swing') {
        this.avatar.x = PLAYGROUND_LAYOUT.swing.approachFront.x;
        this.avatar.z = PLAYGROUND_LAYOUT.swing.approachFront.z;
      } else if (this.avatar.activity === 'sit_seesaw') {
        this.avatar.x = PLAYGROUND_LAYOUT.seesaw.leftSeat.x;
        this.avatar.z = PLAYGROUND_LAYOUT.seesaw.leftSeat.z + 0.65;
      }
      this.activeTask = {
        type: 'stand_up',
        targetX: this.avatar.x,
        targetZ: this.avatar.z,
        run: false,
        startX: this.avatar.x,
        startZ: this.avatar.z,
        vaultStartX: 0,
        vaultStartZ: 0,
        vaultEndX: 0,
        vaultEndZ: 0,
      };
      this.taskStage = 'execute';
      this.taskTimer = 0;
      this.avatar.activity = 'stand_up';
      this.avatar.statusLabelKo = '자리에서 일어나는 중';
      return;
    }

    // If currently seated and given a new movement task, step cleanly onto ground first
    if (isSitting) {
      if (this.avatar.activity === 'sit_bench') {
        this.avatar.x = PLAYGROUND_LAYOUT.bench.approachFront.x;
        this.avatar.z = PLAYGROUND_LAYOUT.bench.approachFront.z;
      } else if (this.avatar.activity === 'sit_swing') {
        this.avatar.x = PLAYGROUND_LAYOUT.swing.approachFront.x;
        this.avatar.z = PLAYGROUND_LAYOUT.swing.approachFront.z;
      } else {
        this.avatar.x = PLAYGROUND_LAYOUT.seesaw.leftSeat.x;
        this.avatar.z = PLAYGROUND_LAYOUT.seesaw.leftSeat.z + 0.65;
      }
      this.avatar.y = 0;
    }

    switch (cmd.type) {
      case 'move_to': {
        const tx = clamp(cmd.targetX ?? 0, -lim, lim);
        const tz = clamp(cmd.targetZ ?? 0, -lim, lim);
        this.targetMarker = { x: tx, z: tz, visible: true, ttl: 2.2 };

        // Auto-vault if path crosses the bench, seesaw, or any vaulting box!
        const benchBox = PLAYGROUND_OBSTACLES[0];
        const seesawBox = PLAYGROUND_OBSTACLES[1];
        if (
          segmentIntersectsBox2D(
            this.avatar.x,
            this.avatar.z,
            tx,
            tz,
            benchBox.x,
            benchBox.z,
            benchBox.halfW + 0.18,
            benchBox.halfD + 0.12,
          )
        ) {
          this.startVaultTask('vault_bench', tx, tz);
          return;
        }
        if (
          segmentIntersectsBox2D(
            this.avatar.x,
            this.avatar.z,
            tx,
            tz,
            seesawBox.x,
            seesawBox.z,
            seesawBox.halfW + 0.12,
            seesawBox.halfD + 0.2,
          )
        ) {
          this.startVaultTask('vault_seesaw', tx, tz);
          return;
        }
        // Check 1단/2단/3단 vaulting boxes (pick closest intersected box)
        let nearestBoxIdx = -1;
        let nearestBoxDist = Infinity;
        PLAYGROUND_LAYOUT.vaultBoxes.forEach((vb, idx) => {
          if (
            segmentIntersectsBox2D(
              this.avatar.x,
              this.avatar.z,
              tx,
              tz,
              vb.x,
              vb.z,
              vb.bottomWidth * 0.5 + 0.15,
              vb.length * 0.5 + 0.12,
            )
          ) {
            const dBox = dist2D(this.avatar.x, this.avatar.z, vb.x, vb.z);
            if (dBox < nearestBoxDist) {
              nearestBoxDist = dBox;
              nearestBoxIdx = idx;
            }
          }
        });
        if (nearestBoxIdx >= 0) {
          this.startVaultBoxTask(nearestBoxIdx, [], tx, tz);
          return;
        }

        const d = dist2D(this.avatar.x, this.avatar.z, tx, tz);
        const shouldRun = cmd.run ?? d > 3.1;
        this.activeTask = {
          type: 'move_to',
          targetX: tx,
          targetZ: tz,
          run: shouldRun,
          startX: this.avatar.x,
          startZ: this.avatar.z,
          vaultStartX: 0,
          vaultStartZ: 0,
          vaultEndX: 0,
          vaultEndZ: 0,
        };
        this.taskStage = 'approach';
        this.taskTimer = 0;
        this.avatar.targetX = tx;
        this.avatar.targetZ = tz;
        this.avatar.statusLabelKo = shouldRun ? '목표 지점으로 달려가는 중' : '목표 지점으로 이동 중';
        break;
      }

      case 'sit_bench': {
        const ap = PLAYGROUND_LAYOUT.bench.approachFront;
        this.targetMarker = { x: ap.x, z: ap.z, visible: true, ttl: 1.8 };
        this.activeTask = {
          type: 'sit_bench',
          targetX: ap.x,
          targetZ: ap.z,
          run: Boolean(cmd.run),
          startX: this.avatar.x,
          startZ: this.avatar.z,
          vaultStartX: 0,
          vaultStartZ: 0,
          vaultEndX: 0,
          vaultEndZ: 0,
        };
        this.taskStage = 'approach';
        this.taskTimer = 0;
        this.avatar.statusLabelKo = '벤치로 이동 중';
        break;
      }

      case 'vault_bench': {
        this.startVaultTask('vault_bench');
        break;
      }

      case 'sit_seesaw': {
        const seat = PLAYGROUND_LAYOUT.seesaw.leftSeat;
        const apX = seat.x;
        const apZ = seat.z + 0.58;
        this.targetMarker = { x: seat.x, z: seat.z, visible: true, ttl: 1.8 };
        this.activeTask = {
          type: 'sit_seesaw',
          targetX: apX,
          targetZ: apZ,
          run: Boolean(cmd.run),
          startX: this.avatar.x,
          startZ: this.avatar.z,
          vaultStartX: 0,
          vaultStartZ: 0,
          vaultEndX: 0,
          vaultEndZ: 0,
        };
        this.taskStage = 'approach';
        this.taskTimer = 0;
        this.avatar.statusLabelKo = '시소로 이동 중';
        break;
      }

      case 'vault_seesaw': {
        this.startVaultTask('vault_seesaw');
        break;
      }

      case 'ride_slide': {
        const stairs = PLAYGROUND_LAYOUT.slide.stairsStart;
        this.targetMarker = { x: stairs.x, z: stairs.z, visible: true, ttl: 2.0 };
        this.activeTask = {
          type: 'ride_slide',
          targetX: stairs.x,
          targetZ: stairs.z,
          run: Boolean(cmd.run),
          startX: this.avatar.x,
          startZ: this.avatar.z,
          vaultStartX: 0,
          vaultStartZ: 0,
          vaultEndX: 0,
          vaultEndZ: 0,
        };
        this.taskStage = 'approach';
        this.taskTimer = 0;
        this.avatar.statusLabelKo = '미끄럼틀 계단으로 이동 중';
        break;
      }

      case 'ride_swing': {
        const sw = PLAYGROUND_LAYOUT.swing;
        this.targetMarker = { x: sw.x, z: sw.z, visible: true, ttl: 2.0 };
        this.activeTask = {
          type: 'ride_swing',
          targetX: sw.approachFront.x,
          targetZ: sw.approachFront.z,
          run: Boolean(cmd.run),
          startX: this.avatar.x,
          startZ: this.avatar.z,
          vaultStartX: 0,
          vaultStartZ: 0,
          vaultEndX: 0,
          vaultEndZ: 0,
        };
        this.taskStage = 'approach';
        this.taskTimer = 0;
        this.avatar.statusLabelKo = '그네로 이동 중';
        break;
      }

      case 'vault_box_1': {
        this.startVaultBoxTask(0, []);
        break;
      }

      case 'vault_box_2': {
        this.startVaultBoxTask(1, []);
        break;
      }

      case 'vault_box_3': {
        this.startVaultBoxTask(2, []);
        break;
      }

      case 'vault_boxes_all': {
        // Sequential 1단 -> 2단 -> 3단 vaulting course from left to right!
        this.startVaultBoxTask(0, [1, 2], undefined, undefined, true);
        break;
      }

      case 'kick_soccer': {
        const ball = this.soccerBall;
        this.targetMarker = { x: ball.x, z: ball.z, visible: true, ttl: 1.6 };
        this.activeTask = {
          type: 'kick_soccer',
          targetX: ball.x,
          targetZ: ball.z,
          run: true,
          startX: this.avatar.x,
          startZ: this.avatar.z,
          vaultStartX: 0,
          vaultStartZ: 0,
          vaultEndX: 0,
          vaultEndZ: 0,
          ballId: 'soccer_ball',
          kickImpulsed: false,
        };
        this.taskStage = 'approach';
        this.taskTimer = 0;
        this.avatar.statusLabelKo = '축구공을 향해 달려가는 중';
        break;
      }

      case 'kick_basketball':
      case 'throw_basketball': {
        const ball = this.basketball;
        this.targetMarker = { x: ball.x, z: ball.z, visible: true, ttl: 1.8 };
        this.activeTask = {
          type: 'throw_basketball',
          targetX: ball.x,
          targetZ: ball.z,
          run: true,
          startX: this.avatar.x,
          startZ: this.avatar.z,
          vaultStartX: 0,
          vaultStartZ: 0,
          vaultEndX: 0,
          vaultEndZ: 0,
          ballId: 'basketball',
          kickImpulsed: false,
        };
        this.taskStage = 'approach';
        this.taskTimer = 0;
        this.avatar.statusLabelKo = '농구공을 주우러 이동 중';
        break;
      }

      case 'play_sandbox': {
        const sp = PLAYGROUND_LAYOUT.sandbox.playPos;
        this.targetMarker = { x: sp.x, z: sp.z, visible: true, ttl: 1.8 };
        this.activeTask = {
          type: 'play_sandbox',
          targetX: sp.x,
          targetZ: sp.z,
          run: Boolean(cmd.run),
          startX: this.avatar.x,
          startZ: this.avatar.z,
          vaultStartX: 0,
          vaultStartZ: 0,
          vaultEndX: 0,
          vaultEndZ: 0,
        };
        this.taskStage = 'approach';
        this.taskTimer = 0;
        this.avatar.statusLabelKo = '샌드박스(모래놀이터)로 이동 중';
        break;
      }

      case 'stand_up': {
        this.activeTask = null;
        this.avatar.activity = 'idle';
        this.avatar.y = 0;
        this.avatar.statusLabelKo = '놀이터 대기';
        break;
      }
    }
  }

  private startVaultTask(
    kind: 'vault_bench' | 'vault_seesaw',
    finalDestX?: number,
    finalDestZ?: number,
  ): void {
    if (kind === 'vault_bench') {
      const b = PLAYGROUND_LAYOUT.bench;
      // Vault from whichever side the avatar is currently closer to
      const fromRight = this.avatar.x >= b.x;
      const startX = fromRight ? b.x + 1.0 : b.x - 1.0;
      const endX = fromRight ? b.x - 1.05 : b.x + 1.05;
      const z = b.z;
      this.targetMarker = {
        x: finalDestX ?? endX,
        z: finalDestZ ?? z,
        visible: true,
        ttl: 2.2,
      };
      this.activeTask = {
        type: 'vault_bench',
        targetX: startX,
        targetZ: z,
        run: true,
        startX: this.avatar.x,
        startZ: this.avatar.z,
        vaultStartX: startX,
        vaultStartZ: z,
        vaultEndX: endX,
        vaultEndZ: z,
        finalDestX,
        finalDestZ,
      };
      this.taskStage = 'approach';
      this.taskTimer = 0;
      this.avatar.statusLabelKo = '벤치 타넘기 준비 중';
    } else {
      const s = PLAYGROUND_LAYOUT.seesaw;
      const fromFront = this.avatar.z >= s.z;
      const startZ = fromFront ? s.z + 0.95 : s.z - 0.95;
      const endZ = fromFront ? s.z - 1.0 : s.z + 1.0;
      const x = clamp(this.avatar.x, s.x - 0.95, s.x + 0.95);
      this.targetMarker = {
        x: finalDestX ?? x,
        z: finalDestZ ?? endZ,
        visible: true,
        ttl: 2.2,
      };
      this.activeTask = {
        type: 'vault_seesaw',
        targetX: x,
        targetZ: startZ,
        run: true,
        startX: this.avatar.x,
        startZ: this.avatar.z,
        vaultStartX: x,
        vaultStartZ: startZ,
        vaultEndX: x,
        vaultEndZ: endZ,
        finalDestX,
        finalDestZ,
      };
      this.taskStage = 'approach';
      this.taskTimer = 0;
      this.avatar.statusLabelKo = '시소 타넘기 준비 중';
    }
  }

  private startVaultBoxTask(
    tierIndex: number,
    remainingTiers: number[] = [],
    finalDestX?: number,
    finalDestZ?: number,
    forceLeftToRight = false,
  ): void {
    const box = PLAYGROUND_LAYOUT.vaultBoxes[tierIndex];
    const fromRight = !forceLeftToRight && this.avatar.x >= box.x;
    const takeoffOffset = 0.88;
    const landingOffset = 0.92;
    const startX = fromRight ? box.x + takeoffOffset : box.x - takeoffOffset;
    const endX = fromRight ? box.x - landingOffset : box.x + landingOffset;
    const z = box.z;
    const cmdType: PlaygroundCommandType =
      tierIndex === 0 ? 'vault_box_1' : tierIndex === 1 ? 'vault_box_2' : 'vault_box_3';

    this.targetMarker = {
      x: finalDestX ?? endX,
      z: finalDestZ ?? z,
      visible: true,
      ttl: 2.2,
    };
    this.activeTask = {
      type: cmdType,
      targetX: startX,
      targetZ: z,
      run: true,
      startX: this.avatar.x,
      startZ: this.avatar.z,
      vaultStartX: startX,
      vaultStartZ: z,
      vaultEndX: endX,
      vaultEndZ: z,
      vaultApex: box.apexHeight,
      vaultTierIndex: tierIndex,
      remainingVaultTiers: remainingTiers,
      finalDestX,
      finalDestZ,
    };
    this.taskStage = 'approach';
    this.taskTimer = 0;
    this.avatar.statusLabelKo = `${box.label} 뜀틀 도움닫기 중`;
  }

  public kickBallDirectly(
    ballId: 'soccer_ball' | 'basketball',
    dirX: number,
    dirZ: number,
    power = 6.2,
  ): void {
    const ball = ballId === 'soccer_ball' ? this.soccerBall : this.basketball;
    const mag = Math.hypot(dirX, dirZ) || 1;
    const nx = dirX / mag;
    const nz = dirZ / mag;
    ball.vx = nx * power;
    ball.vz = nz * power;
    ball.vy = ballId === 'basketball' ? 4.4 : 2.6;
    ball.kickCount += 1;
  }

  public step(rawDt: number): PlaygroundSimSnapshot {
    const dt = clamp(rawDt, 0.001, 0.05);
    this.simTime += dt;

    if (this.targetMarker.visible) {
      this.targetMarker.ttl -= dt;
      if (this.targetMarker.ttl <= 0) {
        this.targetMarker.visible = false;
      }
    }

    this.stepSeesaw(dt);
    this.stepSwing(dt);
    this.stepAvatar(dt);
    this.stepBall(this.soccerBall, dt);
    this.stepBall(this.basketball, dt);
    this.resolveBallToBallCollision();

    return this.getSnapshot();
  }

  private getSeesawLeftSeatWorld(): { x: number; y: number } {
    const s = PLAYGROUND_LAYOUT.seesaw;
    const seatLocalX = s.leftSeat.x - s.x; // -1.15
    const seatLocalY = s.seatTopOffset; // +0.075 (cushion top surface)
    const cosT = Math.cos(this.seesawTilt);
    const sinT = Math.sin(this.seesawTilt);
    // Exact Three.js rotation.z transform for left seat top surface
    const x = s.x + seatLocalX * cosT - seatLocalY * sinT;
    const y = s.pivotHeight + seatLocalX * sinT + seatLocalY * cosT;
    return { x, y };
  }

  private getSwingSeatWorld(): { x: number; y: number; z: number } {
    const sw = PLAYGROUND_LAYOUT.swing;
    // swingPivotGroup.rotation.x = -swingAngle -> positive swingAngle moves seat forward (+Z)
    const y = sw.topBarY - sw.ropeLength * Math.cos(this.swingAngle);
    const z = sw.z + sw.ropeLength * Math.sin(this.swingAngle);
    return { x: sw.x, y, z };
  }

  private stepAvatar(dt: number): void {
    const task = this.activeTask;
    if (!task) {
      this.avatar.speed = Math.max(0, this.avatar.speed - 8 * dt);
      if (
        this.avatar.activity !== 'sit_bench' &&
        this.avatar.activity !== 'sit_seesaw' &&
        this.avatar.activity !== 'sit_swing' &&
        this.avatar.activity !== 'play_sandbox'
      ) {
        this.avatar.activity = 'idle';
        this.avatar.y = lerp(this.avatar.y, 0, Math.min(1, dt * 10));
      } else if (this.avatar.activity === 'sit_seesaw') {
        // Lock seated avatar thighs flush onto the dynamically tilting seesaw cushion
        const seat = this.getSeesawLeftSeatWorld();
        this.avatar.x = seat.x;
        this.avatar.z = PLAYGROUND_LAYOUT.seesaw.leftSeat.z;
        this.avatar.y = Math.max(0, seat.y - SEATED_THIGH_CLEARANCE);
      } else if (this.avatar.activity === 'sit_swing') {
        // Lock seated avatar thighs flush onto the dynamically swinging pendulum seat
        const seat = this.getSwingSeatWorld();
        this.avatar.x = seat.x;
        this.avatar.z = seat.z;
        this.avatar.y = Math.max(0.02, seat.y - SEATED_THIGH_CLEARANCE);
        this.avatar.yaw = PLAYGROUND_LAYOUT.swing.facingYaw;
      }
      return;
    }

    // Dynamic chase target for moving balls
    if (
      (task.type === 'kick_soccer' ||
        task.type === 'throw_basketball' ||
        task.type === 'kick_basketball') &&
      this.taskStage === 'approach'
    ) {
      const ball = task.ballId === 'soccer_ball' ? this.soccerBall : this.basketball;
      const dx = ball.x - this.avatar.x;
      const dz = ball.z - this.avatar.z;
      const dist = Math.hypot(dx, dz) || 1;
      const standOff = task.ballId === 'basketball' ? ball.radius + 0.38 : ball.radius + 0.42;
      task.targetX = ball.x - (dx / dist) * standOff;
      task.targetZ = ball.z - (dz / dist) * standOff;
    }

    if (this.taskStage === 'approach') {
      const dx = task.targetX - this.avatar.x;
      const dz = task.targetZ - this.avatar.z;
      const dist = Math.hypot(dx, dz);
      const arrivalTol =
        task.type === 'kick_soccer' ||
        task.type === 'throw_basketball' ||
        task.type === 'kick_basketball'
          ? 0.24
          : 0.14;

      if (dist <= arrivalTol) {
        this.avatar.x = task.targetX;
        this.avatar.z = task.targetZ;
        this.avatar.speed = 0;

        if (task.type === 'move_to') {
          this.activeTask = null;
          this.avatar.activity = 'idle';
          this.avatar.statusLabelKo = '이동 완료';
          return;
        }

        this.taskStage = 'execute';
        this.taskTimer = 0;
        this.avatar.phase = 0;
        return;
      }

      const maxSpeed = task.run ? 2.75 : 1.55;
      const stepDist = Math.min(dist, maxSpeed * dt);
      const dirX = dx / dist;
      const dirZ = dz / dist;
      this.avatar.x += dirX * stepDist;
      this.avatar.z += dirZ * stepDist;
      this.avatar.y = 0;
      this.avatar.speed = stepDist / dt;
      const desiredYaw = Math.atan2(dirX, dirZ);
      this.avatar.yaw = lerpAngle(this.avatar.yaw, desiredYaw, Math.min(1, dt * 10));
      this.avatar.activity = task.run ? 'run' : 'walk';
      return;
    }

    if (this.taskStage === 'follow_move') {
      const fx = task.finalDestX ?? this.avatar.x;
      const fz = task.finalDestZ ?? this.avatar.z;
      const dx = fx - this.avatar.x;
      const dz = fz - this.avatar.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= 0.14) {
        this.avatar.x = fx;
        this.avatar.z = fz;
        this.avatar.speed = 0;
        this.avatar.activity = 'idle';
        this.avatar.statusLabelKo = '타넘고 이동 완료';
        this.activeTask = null;
        return;
      }
      const speed = 1.85;
      const stepDist = Math.min(dist, speed * dt);
      this.avatar.x += (dx / dist) * stepDist;
      this.avatar.z += (dz / dist) * stepDist;
      this.avatar.y = 0;
      this.avatar.speed = stepDist / dt;
      this.avatar.yaw = lerpAngle(this.avatar.yaw, Math.atan2(dx, dz), Math.min(1, dt * 10));
      this.avatar.activity = 'walk';
      return;
    }

    // EXECUTE STAGE
    this.taskTimer += dt;

    switch (task.type) {
      case 'sit_bench': {
        const dur = 0.65;
        const t = clamp(this.taskTimer / dur, 0, 1);
        const b = PLAYGROUND_LAYOUT.bench;
        this.avatar.x = lerp(b.approachFront.x, b.seatPos.x + 0.08, t);
        this.avatar.z = lerp(b.approachFront.z, b.seatPos.z, t);
        // Bench seat top is calibrated to SEATED_THIGH_CLEARANCE (0.36m) so feet rest on y=0
        this.avatar.y = 0;
        this.avatar.yaw = lerpAngle(this.avatar.yaw, b.facingYaw, Math.min(1, dt * 9));
        this.avatar.activity = 'sit_bench';
        this.avatar.phase = t;
        this.avatar.statusLabelKo = '벤치에 앉아 쉬는 중';
        if (t >= 1) {
          this.activeTask = null;
        }
        break;
      }

      case 'vault_bench': {
        const dur = 1.05;
        const t = clamp(this.taskTimer / dur, 0, 1);
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        this.avatar.x = lerp(task.vaultStartX, task.vaultEndX, ease);
        this.avatar.z = lerp(task.vaultStartZ, task.vaultEndZ, ease);
        // Clear arc over the bench (seat + backrest height ~0.78m)
        this.avatar.y = Math.sin(t * Math.PI) * 0.78;
        const dirX = task.vaultEndX - task.vaultStartX;
        const dirZ = task.vaultEndZ - task.vaultStartZ;
        this.avatar.yaw = lerpAngle(
          this.avatar.yaw,
          Math.atan2(dirX, dirZ),
          Math.min(1, dt * 12),
        );
        this.avatar.activity = 'vault_bench';
        this.avatar.phase = t;
        this.avatar.speed = 2.2;
        this.avatar.statusLabelKo = '벤치를 타넘고 지나가는 중!';
        if (t >= 1) {
          this.avatar.y = 0;
          if (task.finalDestX !== undefined && task.finalDestZ !== undefined) {
            this.taskStage = 'follow_move';
          } else {
            this.activeTask = null;
            this.avatar.activity = 'idle';
            this.avatar.speed = 0;
            this.avatar.statusLabelKo = '벤치 타넘기 완료!';
          }
        }
        break;
      }

      case 'sit_seesaw': {
        const dur = 0.7;
        const t = clamp(this.taskTimer / dur, 0, 1);
        const seat = this.getSeesawLeftSeatWorld();
        this.avatar.x = lerp(this.avatar.x, seat.x, Math.min(1, dt * 8));
        this.avatar.z = lerp(
          this.avatar.z,
          PLAYGROUND_LAYOUT.seesaw.leftSeat.z,
          Math.min(1, dt * 8),
        );
        this.avatar.y = lerp(
          this.avatar.y,
          Math.max(0, seat.y - SEATED_THIGH_CLEARANCE),
          Math.min(1, dt * 10),
        );
        this.avatar.yaw = lerpAngle(this.avatar.yaw, Math.PI * 0.5, Math.min(1, dt * 8));
        this.avatar.activity = 'sit_seesaw';
        this.avatar.phase = t;
        this.avatar.statusLabelKo = '시소를 타며 흔들리는 중!';
        if (t >= 1) {
          this.seesawTiltVel += 0.65;
          this.activeTask = null;
        }
        break;
      }

      case 'vault_seesaw': {
        const dur = 0.95;
        const t = clamp(this.taskTimer / dur, 0, 1);
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        this.avatar.x = lerp(task.vaultStartX, task.vaultEndX, ease);
        this.avatar.z = lerp(task.vaultStartZ, task.vaultEndZ, ease);
        this.avatar.y = Math.sin(t * Math.PI) * 0.64;
        const dirX = task.vaultEndX - task.vaultStartX;
        const dirZ = task.vaultEndZ - task.vaultStartZ;
        this.avatar.yaw = lerpAngle(
          this.avatar.yaw,
          Math.atan2(dirX, dirZ),
          Math.min(1, dt * 12),
        );
        this.avatar.activity = 'vault_seesaw';
        this.avatar.phase = t;
        this.avatar.speed = 2.3;
        this.avatar.statusLabelKo = '시소를 훌쩍 타넘는 중!';
        if (t > 0.4 && t < 0.55) {
          const sideSign = task.vaultStartX < PLAYGROUND_LAYOUT.seesaw.x ? 1 : -1;
          this.seesawTiltVel += sideSign * 1.6 * dt;
        }
        if (t >= 1) {
          this.avatar.y = 0;
          if (task.finalDestX !== undefined && task.finalDestZ !== undefined) {
            this.taskStage = 'follow_move';
          } else {
            this.activeTask = null;
            this.avatar.activity = 'idle';
            this.avatar.speed = 0;
            this.avatar.statusLabelKo = '시소 타넘기 완료!';
          }
        }
        break;
      }

      case 'ride_swing': {
        const dur = 0.72;
        const t = clamp(this.taskTimer / dur, 0, 1);
        const sw = PLAYGROUND_LAYOUT.swing;
        const seat = this.getSwingSeatWorld();
        this.avatar.x = lerp(sw.approachFront.x, seat.x, t);
        this.avatar.z = lerp(sw.approachFront.z, seat.z, t);
        this.avatar.y = lerp(0, Math.max(0.02, seat.y - SEATED_THIGH_CLEARANCE), t);
        this.avatar.yaw = lerpAngle(this.avatar.yaw, sw.facingYaw, Math.min(1, dt * 9));
        this.avatar.activity = 'sit_swing';
        this.avatar.phase = t;
        this.avatar.statusLabelKo = '그네에 앉아 신나게 타는 중!';
        if (t >= 1) {
          this.swingVel += 1.05;
          this.activeTask = null;
        }
        break;
      }

      case 'vault_box_1':
      case 'vault_box_2':
      case 'vault_box_3':
      case 'vault_boxes_all': {
        const tierIdx = task.vaultTierIndex ?? 0;
        const box = PLAYGROUND_LAYOUT.vaultBoxes[tierIdx];
        const dur = 0.88 + tierIdx * 0.1;
        const t = clamp(this.taskTimer / dur, 0, 1);
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        this.avatar.x = lerp(task.vaultStartX, task.vaultEndX, ease);
        this.avatar.z = lerp(task.vaultStartZ, task.vaultEndZ, ease);
        this.avatar.y = Math.sin(t * Math.PI) * (task.vaultApex ?? box.apexHeight);
        const dirX = task.vaultEndX - task.vaultStartX;
        const dirZ = task.vaultEndZ - task.vaultStartZ;
        this.avatar.yaw = lerpAngle(
          this.avatar.yaw,
          Math.atan2(dirX, dirZ),
          Math.min(1, dt * 14),
        );
        this.avatar.activity = 'vault_box';
        this.avatar.phase = t;
        this.avatar.speed = 2.55;
        this.avatar.statusLabelKo = `${box.label} 뜀틀 뛰어넘는 중!`;
        if (t >= 1) {
          this.avatar.y = 0;
          const nextQueue = task.remainingVaultTiers || [];
          if (nextQueue.length > 0) {
            const [nextTier, ...rest] = nextQueue;
            this.startVaultBoxTask(nextTier, rest, task.finalDestX, task.finalDestZ, true);
          } else if (task.finalDestX !== undefined && task.finalDestZ !== undefined) {
            this.taskStage = 'follow_move';
          } else {
            this.activeTask = null;
            this.avatar.activity = 'idle';
            this.avatar.speed = 0;
            this.avatar.statusLabelKo =
              tierIdx === 2 ? '3단 뜀틀 완주 성공!' : `${box.label} 뜀틀 착지 완료!`;
          }
        }
        break;
      }

      case 'ride_slide': {
        const climbDur = 1.45;
        const slideDur = 1.15;
        const s = PLAYGROUND_LAYOUT.slide;
        if (this.taskTimer <= climbDur) {
          const t = clamp(this.taskTimer / climbDur, 0, 1);
          this.avatar.x = s.stairsStart.x;
          this.avatar.z = lerp(s.stairsStart.z, s.topPlatform.z, t);
          this.avatar.y = lerp(0, s.topPlatform.y, t);
          this.avatar.yaw = lerpAngle(this.avatar.yaw, s.facingYaw, Math.min(1, dt * 8));
          this.avatar.activity = 'climb_slide';
          this.avatar.phase = t;
          this.avatar.speed = 1.1;
          this.avatar.statusLabelKo = '미끄럼틀 계단을 올라가는 중';
        } else {
          const t = clamp((this.taskTimer - climbDur) / slideDur, 0, 1);
          const accel = t * t * (3 - 2 * t);
          this.avatar.x = s.topPlatform.x;
          this.avatar.z = lerp(s.topPlatform.z + 0.15, s.chuteExit.z, accel);
          this.avatar.y = lerp(s.topPlatform.y - 0.18, 0.02, accel);
          this.avatar.yaw = s.facingYaw;
          this.avatar.activity = 'slide_down';
          this.avatar.phase = t;
          this.avatar.speed = 2.6;
          this.avatar.statusLabelKo = '미끄럼틀을 신나게 내려오는 중!';
          if (t >= 1) {
            this.avatar.y = 0;
            this.avatar.z = s.chuteExit.z + 0.25;
            this.avatar.speed = 0;
            this.avatar.activity = 'idle';
            this.avatar.statusLabelKo = '미끄럼틀 착지 완료!';
            this.activeTask = null;
          }
        }
        break;
      }

      case 'kick_soccer': {
        const dur = 0.85;
        const t = clamp(this.taskTimer / dur, 0, 1);
        const ball = this.soccerBall;
        const toBallX = ball.x - this.avatar.x;
        const toBallZ = ball.z - this.avatar.z;
        const yaw = Math.atan2(toBallX, toBallZ);
        this.avatar.yaw = lerpAngle(this.avatar.yaw, yaw, Math.min(1, dt * 14));
        this.avatar.activity = 'kick_ball';
        this.avatar.phase = t;
        this.avatar.speed = 0;
        this.avatar.statusLabelKo = '축구공을 힘차게 차는 중!';

        if (!task.kickImpulsed && t >= 0.42) {
          task.kickImpulsed = true;
          const aimX = toBallX + (Math.abs(ball.x) > 3.5 ? -Math.sign(ball.x) * 1.4 : 0.25);
          const aimZ = toBallZ + (Math.abs(ball.z) > 3.5 ? -Math.sign(ball.z) * 1.4 : -0.15);
          this.kickBallDirectly('soccer_ball', aimX, aimZ, 6.4);
        }
        if (t >= 1) {
          this.activeTask = null;
          this.avatar.activity = 'idle';
          this.avatar.statusLabelKo = '축구공 슛 완료!';
        }
        break;
      }

      case 'kick_basketball':
      case 'throw_basketball': {
        const pickupDur = 0.85;
        const throwDur = 0.78;
        const ball = this.basketball;

        if (this.taskTimer < pickupDur) {
          // Stage 1: Bend down and pick up the basketball with both hands
          const t = clamp(this.taskTimer / pickupDur, 0, 1);
          const toBallX = ball.x - this.avatar.x;
          const toBallZ = ball.z - this.avatar.z;
          if (!ball.heldByAvatar && Math.hypot(toBallX, toBallZ) > 0.05) {
            const yaw = Math.atan2(toBallX, toBallZ);
            this.avatar.yaw = lerpAngle(this.avatar.yaw, yaw, Math.min(1, dt * 14));
          }
          this.avatar.activity = 'pickup_ball';
          this.avatar.phase = t;
          this.avatar.speed = 0;
          this.avatar.statusLabelKo = '농구공을 손으로 줍는 중';

          if (t >= 0.44) {
            ball.heldByAvatar = true;
            ball.vx = 0;
            ball.vy = 0;
            ball.vz = 0;
            const liftT = clamp((t - 0.44) / 0.56, 0, 1);
            const smoothLift = liftT * liftT * (3 - 2 * liftT);
            const fwdX = Math.sin(this.avatar.yaw);
            const fwdZ = Math.cos(this.avatar.yaw);
            ball.x = this.avatar.x + fwdX * 0.42;
            ball.z = this.avatar.z + fwdZ * 0.42;
            ball.y = lerp(ball.radius, 1.04, smoothLift);
          }
        } else {
          // Stage 2: Aim toward open court, wind up overhead, and throw!
          const t = clamp((this.taskTimer - pickupDur) / throwDur, 0, 1);
          if (task.throwAimYaw === undefined) {
            // Aim playfully across the open playground court (away from nearby walls)
            const targetAimX =
              Math.abs(this.avatar.x) > 1.2 ? -Math.sign(this.avatar.x) * 2.2 : -1.6;
            const targetAimZ =
              Math.abs(this.avatar.z) > 1.2 ? -Math.sign(this.avatar.z) * 1.4 : -0.6;
            task.throwAimYaw = Math.atan2(
              targetAimX - this.avatar.x,
              targetAimZ - this.avatar.z,
            );
          }

          this.avatar.yaw = lerpAngle(
            this.avatar.yaw,
            task.throwAimYaw,
            Math.min(1, dt * 10),
          );
          this.avatar.activity = 'throw_ball';
          this.avatar.phase = t;
          this.avatar.speed = 0;
          this.avatar.statusLabelKo = '농구공을 손으로 힘차게 던지는 중!';

          const fwdX = Math.sin(this.avatar.yaw);
          const fwdZ = Math.cos(this.avatar.yaw);

          if (!task.kickImpulsed) {
            if (t < 0.42) {
              // Wind up hands overhead with basketball
              const windT = clamp(t / 0.38, 0, 1);
              ball.heldByAvatar = true;
              ball.x = this.avatar.x + fwdX * lerp(0.42, 0.34, windT);
              ball.z = this.avatar.z + fwdZ * lerp(0.42, 0.34, windT);
              ball.y = lerp(1.04, 1.42, windT);
            } else {
              // Release throw with graceful high basketball arc!
              task.kickImpulsed = true;
              ball.heldByAvatar = false;
              ball.x = this.avatar.x + fwdX * 0.48;
              ball.z = this.avatar.z + fwdZ * 0.48;
              ball.y = 1.38;
              const throwSpeed = 4.9;
              ball.vx = fwdX * throwSpeed;
              ball.vz = fwdZ * throwSpeed;
              ball.vy = 4.65;
              ball.kickCount += 1;
            }
          }

          if (t >= 1) {
            this.activeTask = null;
            this.avatar.activity = 'idle';
            this.avatar.statusLabelKo = '농구공 패스 완료!';
          }
        }
        break;
      }

      case 'play_sandbox': {
        const dur = 0.9;
        const t = clamp(this.taskTimer / dur, 0, 1);
        this.avatar.yaw = lerpAngle(this.avatar.yaw, -Math.PI * 0.25, Math.min(1, dt * 6));
        this.avatar.activity = 'play_sandbox';
        this.avatar.phase = t;
        this.avatar.y = 0;
        this.avatar.statusLabelKo = '샌드박스에서 모래성 만드는 중';
        if (t >= 1) {
          this.activeTask = null;
        }
        break;
      }

      case 'stand_up': {
        const dur = 0.55;
        const t = clamp(this.taskTimer / dur, 0, 1);
        this.avatar.activity = 'stand_up';
        this.avatar.phase = t;
        this.avatar.y = lerp(this.avatar.y, 0, t);
        if (t >= 1) {
          this.avatar.y = 0;
          this.avatar.activity = 'idle';
          this.avatar.statusLabelKo = '놀이터 대기';
          this.activeTask = null;
        }
        break;
      }
    }
  }

  private stepSeesaw(dt: number): void {
    // At tilt = +0.135 rad, left seat top is exactly 0.36m (avatar feet touch ground!).
    // At tilt = -0.135 rad, left seat lifts to 0.67m (feet dangle naturally).
    const maxTilt = 0.145;
    if (this.avatar.activity === 'sit_seesaw') {
      const targetTilt = Math.sin(this.simTime * 2.2) * 0.135;
      const springK = 14;
      const damping = 3.2;
      this.seesawTiltVel += ((targetTilt - this.seesawTilt) * springK - this.seesawTiltVel * damping) * dt;
    } else {
      const restTilt = -0.135;
      const springK = 10;
      const damping = 2.8;
      this.seesawTiltVel += ((restTilt - this.seesawTilt) * springK - this.seesawTiltVel * damping) * dt;
    }
    this.seesawTilt = clamp(this.seesawTilt + this.seesawTiltVel * dt, -maxTilt, maxTilt);
  }

  private stepSwing(dt: number): void {
    const maxAngle = 0.46;
    if (this.avatar.activity === 'sit_swing' && !this.activeTask) {
      // Rhythmic pumped pendulum oscillation while seated on the swing
      const targetAngle = Math.sin(this.simTime * 2.15) * 0.42;
      const springK = 12;
      const damping = 2.4;
      this.swingVel += ((targetAngle - this.swingAngle) * springK - this.swingVel * damping) * dt;
    } else {
      // Natural pendulum decay back to vertical rest
      const springK = 8.5;
      const damping = 2.2;
      this.swingVel += (-this.swingAngle * springK - this.swingVel * damping) * dt;
    }
    this.swingAngle = clamp(this.swingAngle + this.swingVel * dt, -maxAngle, maxAngle);
  }

  private stepBall(ball: PlaygroundBallState, dt: number): void {
    // While held in the avatar's hands, skip gravity/ground physics
    if (ball.heldByAvatar) {
      return;
    }

    // Avatar walking/running nudge if walking straight into a ball
    // (skip nudging the specific basketball we are intentionally approaching to pick up)
    const approachingToPickUp =
      this.activeTask?.type === 'throw_basketball' &&
      this.activeTask.ballId === ball.id &&
      this.taskStage === 'approach';

    if (
      !approachingToPickUp &&
      (this.avatar.activity === 'walk' || this.avatar.activity === 'run')
    ) {
      const dx = ball.x - this.avatar.x;
      const dz = ball.z - this.avatar.z;
      const dist = Math.hypot(dx, dz);
      const minDist = ball.radius + 0.34;
      if (dist < minDist && dist > 1e-4) {
        const nx = dx / dist;
        const nz = dz / dist;
        const pushSpeed = Math.max(2.6, this.avatar.speed * 1.45);
        ball.vx = nx * pushSpeed;
        ball.vz = nz * pushSpeed;
        if (ball.id === 'basketball' && ball.y <= ball.radius + 0.03) {
          ball.vy = 2.2;
        }
      }
    }

    // Gravity & vertical bounce
    if (ball.y > ball.radius + 0.001 || Math.abs(ball.vy) > 0.02) {
      ball.vy -= GRAVITY * dt;
      ball.y += ball.vy * dt;
      if (ball.y <= ball.radius) {
        ball.y = ball.radius;
        if (Math.abs(ball.vy) > 0.65) {
          ball.vy = -ball.vy * ball.restitution;
        } else {
          ball.vy = 0;
        }
      }
    } else {
      ball.y = ball.radius;
      ball.vy = 0;
    }

    // Horizontal motion + rolling friction
    const speed = Math.hypot(ball.vx, ball.vz);
    if (speed > 0.015) {
      const prevX = ball.x;
      const prevZ = ball.z;
      ball.x += ball.vx * dt;
      ball.z += ball.vz * dt;

      // Ground friction (less drag while airborne)
      const onGround = ball.y <= ball.radius + 0.02;
      const drag = onGround ? ball.friction : 0.25;
      const nextSpeed = Math.max(0, speed - drag * dt);
      const scale = nextSpeed / speed;
      ball.vx *= scale;
      ball.vz *= scale;

      // Perimeter bounds rebound
      const bound = PLAYGROUND_LAYOUT.boundsHalfSize - ball.radius - 0.12;
      if (ball.x < -bound) {
        ball.x = -bound;
        ball.vx = Math.abs(ball.vx) * 0.72;
      } else if (ball.x > bound) {
        ball.x = bound;
        ball.vx = -Math.abs(ball.vx) * 0.72;
      }
      if (ball.z < -bound) {
        ball.z = -bound;
        ball.vz = Math.abs(ball.vz) * 0.72;
      } else if (ball.z > bound) {
        ball.z = bound;
        ball.vz = -Math.abs(ball.vz) * 0.72;
      }

      // Obstacle rebound (bench & seesaw base)
      for (const ob of PLAYGROUND_OBSTACLES) {
        const hw = ob.halfW + ball.radius;
        const hd = ob.halfD + ball.radius;
        const rx = ball.x - ob.x;
        const rz = ball.z - ob.z;
        if (Math.abs(rx) < hw && Math.abs(rz) < hd && ball.y < ob.height + ball.radius) {
          if (hw - Math.abs(rx) < hd - Math.abs(rz)) {
            ball.x = ob.x + Math.sign(rx || 1) * hw;
            ball.vx = -ball.vx * 0.65;
          } else {
            ball.z = ob.z + Math.sign(rz || 1) * hd;
            ball.vz = -ball.vz * 0.65;
          }
        }
      }

      const movedX = ball.x - prevX;
      const movedZ = ball.z - prevZ;
      const moved = Math.hypot(movedX, movedZ);
      if (moved > 1e-5) {
        ball.spinAxisX = movedZ / moved;
        ball.spinAxisZ = -movedX / moved;
        ball.spinAngle += moved / ball.radius;
      }
    } else {
      ball.vx = 0;
      ball.vz = 0;
    }
  }

  private resolveBallToBallCollision(): void {
    const a = this.soccerBall;
    const b = this.basketball;
    if (a.heldByAvatar || b.heldByAvatar) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const dist = Math.hypot(dx, dy, dz);
    const minDist = a.radius + b.radius;
    if (dist < minDist && dist > 1e-4) {
      const nx = dx / dist;
      const nz = dz / dist;
      const overlap = (minDist - dist) * 0.5;
      a.x -= nx * overlap;
      a.z -= nz * overlap;
      b.x += nx * overlap;
      b.z += nz * overlap;

      const rvx = b.vx - a.vx;
      const rvz = b.vz - a.vz;
      const vn = rvx * nx + rvz * nz;
      if (vn < 0) {
        const impulse = -0.85 * vn;
        a.vx -= nx * impulse;
        a.vz -= nz * impulse;
        b.vx += nx * impulse;
        b.vz += nz * impulse;
      }
    }
  }
}
