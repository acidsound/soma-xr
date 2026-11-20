/**
 * NVIDIA MotionBricks SOMA-77 Runtime & Clip Sequencer.
 * Adapted from https://huggingface.co/spaces/monoradio/motionbricks-live (viewer/mb_runtime.js)
 *
 * Uses the real 77-joint SOMA skeleton and runtime motion windows/primitives from:
 * - /runtime_data/soma_runtime.json (idle, walk, jog, run, crouch_idle, crouch, push_walk)
 * - /runtime_data/ardy_runtime.json (ardy_sit, ardy_vault, ardy_jump, kick, pickup, push)
 * - /runtime_data/kimodo_runtime.json (kimodo_vault, kimodo_hurdle, pickup, run)
 */

import type { PlaygroundAvatarActivity } from '../types';

export const FPS = 30;
export const POSES_PER_TOKEN = 4;

export interface TransformPQ {
  p: [number, number, number];
  q: [number, number, number, number];
}

export interface SomaStyleEntry {
  id: string;
  label: string;
  speed: number;
  window: number[][][]; // [4][77][7]
}

export interface SomaPrimStep {
  node: string;
  time: number;
  num_poses_to_use?: number;
  window: number[][][];
}

export interface SomaPrimEntry {
  name: string;
  sequences: Array<{ steps: SomaPrimStep[] }>;
}

export interface SomaActionEntry {
  contact?: [number, number, number];
  steps?: SomaPrimStep[];
  clip?: number[][][];
}

export interface SomaRuntimeFile {
  fps: number;
  joint_names: string[];
  parents: number[];
  reference: number[][];
  styles: SomaStyleEntry[];
}

export interface ArdyRuntimeFile {
  styles?: SomaStyleEntry[];
  prims?: SomaPrimEntry[];
  actions?: Record<string, SomaActionEntry>;
}

export interface KimodoRuntimeFile {
  styles?: SomaStyleEntry[];
  prims?: SomaPrimEntry[];
  actions?: Record<string, SomaActionEntry>;
}

// ---------- Quaternion & Vector helpers (xyzw) ----------
export function qmul(
  a: readonly number[],
  b: readonly number[],
): [number, number, number, number] {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

export function qconj(q: readonly number[]): [number, number, number, number] {
  return [-q[0], -q[1], -q[2], q[3]];
}

export function qrot(
  q: readonly number[],
  v: readonly number[],
): [number, number, number] {
  const tx = 2 * (q[1] * v[2] - q[2] * v[1]);
  const ty = 2 * (q[2] * v[0] - q[0] * v[2]);
  const tz = 2 * (q[0] * v[1] - q[1] * v[0]);
  return [
    v[0] + q[3] * tx + (q[1] * tz - q[2] * ty),
    v[1] + q[3] * ty + (q[2] * tx - q[0] * tz),
    v[2] + q[3] * tz + (q[0] * ty - q[1] * tx),
  ];
}

export function qnorm(q: readonly number[]): [number, number, number, number] {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

export function qy(angle: number): [number, number, number, number] {
  return [0, Math.sin(angle * 0.5), 0, Math.cos(angle * 0.5)];
}

export function qslerp(
  a: readonly number[],
  b: readonly number[],
  t: number,
): [number, number, number, number] {
  let bx = b[0];
  let by = b[1];
  let bz = b[2];
  let bw = b[3];
  let d = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (d < 0) {
    d = -d;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  if (d > 0.9995) {
    return qnorm([
      a[0] + (bx - a[0]) * t,
      a[1] + (by - a[1]) * t,
      a[2] + (bz - a[2]) * t,
      a[3] + (bw - a[3]) * t,
    ]);
  }
  const th = Math.acos(Math.min(1, d));
  const s = Math.sin(th);
  const w1 = Math.sin((1 - t) * th) / s;
  const w2 = Math.sin(t * th) / s;
  return [
    a[0] * w1 + bx * w2,
    a[1] * w1 + by * w2,
    a[2] * w1 + bz * w2,
    a[3] * w1 + bw * w2,
  ];
}

export function tget(flat: Float32Array, j: number): TransformPQ {
  const o = j * 7;
  return {
    p: [flat[o], flat[o + 1], flat[o + 2]],
    q: [flat[o + 3], flat[o + 4], flat[o + 5], flat[o + 6]],
  };
}

export function tset(
  flat: Float32Array,
  j: number,
  p: readonly number[],
  q: readonly number[],
): void {
  const o = j * 7;
  flat[o] = p[0];
  flat[o + 1] = p[1];
  flat[o + 2] = p[2];
  flat[o + 3] = q[0];
  flat[o + 4] = q[1];
  flat[o + 5] = q[2];
  flat[o + 6] = q[3];
}

export function poseToFlat(pose: number[][]): Float32Array {
  const out = new Float32Array(pose.length * 7);
  for (let j = 0; j < pose.length; j++) {
    for (let k = 0; k < 7; k++) {
      out[j * 7 + k] = pose[j][k];
    }
  }
  return out;
}

export function headingFromHips(
  rightLegPos: readonly number[],
  leftLegPos: readonly number[],
): number {
  // facing = (L - R) x up = (-hz, 0, hx), so forward +Z gives heading = 0
  const hx = leftLegPos[0] - rightLegPos[0];
  const hz = leftLegPos[2] - rightLegPos[2];
  return Math.atan2(-hz, hx);
}

/**
 * 77-joint SOMA Skeleton with forward kinematics matching MotionBricks.
 */
export class SomaSkeleton {
  public readonly names: string[];
  public readonly parents: number[];
  public readonly J: number;
  public readonly reference: Float32Array;
  public readonly leftLeg: number;
  public readonly rightLeg: number;
  private readonly indexMap: Map<string, number>;

  constructor(data: SomaRuntimeFile) {
    this.names = data.joint_names;
    this.parents = data.parents;
    this.J = this.names.length;
    this.reference = poseToFlat(data.reference);
    this.indexMap = new Map(this.names.map((n, i) => [n, i]));
    this.leftLeg = this.index('LeftLeg');
    this.rightLeg = this.index('RightLeg');
  }

  public index(name: string): number {
    return this.indexMap.get(name) ?? -1;
  }

  public world(flat: Float32Array): TransformPQ[] {
    const out: TransformPQ[] = new Array(this.J);
    for (let j = 0; j < this.J; j++) {
      const o = j * 7;
      const lp: [number, number, number] = [flat[o], flat[o + 1], flat[o + 2]];
      const lq: [number, number, number, number] = [
        flat[o + 3],
        flat[o + 4],
        flat[o + 5],
        flat[o + 6],
      ];
      const p = this.parents[j];
      if (p < 0) {
        out[j] = { p: lp, q: lq };
      } else {
        const P = out[p];
        const rp = qrot(P.q, lp);
        out[j] = {
          p: [P.p[0] + rp[0], P.p[1] + rp[1], P.p[2] + rp[2]],
          q: qmul(P.q, lq),
        };
      }
    }
    return out;
  }

  /**
   * Strips global XZ translation and yaw heading from a raw SOMA pose so the
   * pose is centered at XZ=(0,0) facing canonical +Z while preserving root Y
   * height, hip pitch/roll, and all local joint rotations.
   */
  public normalizeToLocalFrame(rawFlat: Float32Array): Float32Array {
    const out = new Float32Array(rawFlat);
    const w = this.world(rawFlat);
    const heading = headingFromHips(w[this.rightLeg].p, w[this.leftLeg].p);
    const rot = qy(-heading);
    const root = tget(rawFlat, 0);
    const newQ = qnorm(qmul(rot, root.q));
    tset(out, 0, [0, root.p[1], 0], newQ);
    return out;
  }

  public interpolatePoses(
    a: Float32Array,
    b: Float32Array,
    t: number,
    out: Float32Array,
  ): Float32Array {
    const clamped = Math.max(0, Math.min(1, t));
    for (let j = 0; j < this.J; j++) {
      const o = j * 7;
      out[o] = a[o] + (b[o] - a[o]) * clamped;
      out[o + 1] = a[o + 1] + (b[o + 1] - a[o + 1]) * clamped;
      out[o + 2] = a[o + 2] + (b[o + 2] - a[o + 2]) * clamped;
      const q = qslerp(
        [a[o + 3], a[o + 4], a[o + 5], a[o + 6]],
        [b[o + 3], b[o + 4], b[o + 5], b[o + 6]],
        clamped,
      );
      out[o + 3] = q[0];
      out[o + 4] = q[1];
      out[o + 5] = q[2];
      out[o + 6] = q[3];
    }
    return out;
  }
}

export interface MotionBricksDataset {
  skeleton: SomaSkeleton;
  styles: Record<string, { id: string; label: string; speed: number; frames: Float32Array[] }>;
  prims: Record<string, { name: string; keyframes: Float32Array[] }>;
  actions: Record<string, { name: string; keyframes: Float32Array[] }>;
}

/**
 * Loads the authentic MotionBricks SOMA runtime JSON datasets copied from
 * https://huggingface.co/spaces/monoradio/motionbricks-live/tree/main
 */
export async function loadMotionBricksDatasets(): Promise<MotionBricksDataset> {
  const [somaRes, ardyRes, kimodoRes] = await Promise.all([
    fetch('/runtime_data/soma_runtime.json'),
    fetch('/runtime_data/ardy_runtime.json'),
    fetch('/runtime_data/kimodo_runtime.json'),
  ]);

  if (!somaRes.ok) {
    throw new Error(`soma_runtime.json load failed (${somaRes.status})`);
  }

  const somaJson = (await somaRes.json()) as SomaRuntimeFile;
  const ardyJson = ardyRes.ok ? ((await ardyRes.json()) as ArdyRuntimeFile) : {};
  const kimodoJson = kimodoRes.ok
    ? ((await kimodoRes.json()) as KimodoRuntimeFile)
    : {};

  const skeleton = new SomaSkeleton(somaJson);
  const styles: MotionBricksDataset['styles'] = {};

  const registerStyles = (list?: SomaStyleEntry[]) => {
    if (!list) return;
    for (const st of list) {
      if (!st.window?.length) continue;
      styles[st.id] = {
        id: st.id,
        label: st.label,
        speed: st.speed,
        frames: st.window.map((f) => skeleton.normalizeToLocalFrame(poseToFlat(f))),
      };
    }
  };
  registerStyles(somaJson.styles);
  registerStyles(ardyJson.styles);

  const prims: MotionBricksDataset['prims'] = {};
  const registerPrims = (list?: SomaPrimEntry[]) => {
    if (!list) return;
    for (const p of list) {
      const seq = p.sequences?.[0];
      if (!seq?.steps?.length) continue;
      const keyframes: Float32Array[] = [];
      for (const step of seq.steps) {
        if (step.window?.length) {
          // Take the middle/representative frames of each step window
          const mid = Math.floor(step.window.length / 2);
          keyframes.push(skeleton.normalizeToLocalFrame(poseToFlat(step.window[mid])));
        }
      }
      if (keyframes.length > 0) {
        prims[p.name] = { name: p.name, keyframes };
      }
    }
  };
  registerPrims(ardyJson.prims);
  registerPrims(kimodoJson.prims);

  const actions: MotionBricksDataset['actions'] = {};
  const registerActions = (map?: Record<string, SomaActionEntry>) => {
    if (!map) return;
    for (const [name, act] of Object.entries(map)) {
      const keyframes: Float32Array[] = [];
      if (act.steps?.length) {
        for (const step of act.steps) {
          if (step.window?.length) {
            for (const f of step.window) {
              keyframes.push(skeleton.normalizeToLocalFrame(poseToFlat(f)));
            }
          }
        }
      } else if (act.clip?.length) {
        for (const f of act.clip) {
          keyframes.push(skeleton.normalizeToLocalFrame(poseToFlat(f)));
        }
      }
      if (keyframes.length > 0) {
        actions[name] = { name, keyframes };
      }
    }
  };
  registerActions(ardyJson.actions);
  registerActions(kimodoJson.actions);

  return { skeleton, styles, prims, actions };
}

/**
 * Produces mirrored left/right leg/arm gait frames from a MotionBricks 4-frame
 * walk/run window so continuous locomotion cycles smoothly without needing a
 * 243MB WebGPU model download, while seamlessly accepting live ONNX worker frames
 * whenever the WebGPU ONNX engine is activated.
 */
function buildMirrorMap(sk: SomaSkeleton): Int32Array {
  const map = new Int32Array(sk.J);
  for (let j = 0; j < sk.J; j++) {
    const name = sk.names[j];
    let mirroredName = name;
    if (name.startsWith('Left')) {
      mirroredName = 'Right' + name.slice(4);
    } else if (name.startsWith('Right')) {
      mirroredName = 'Left' + name.slice(5);
    }
    const idx = sk.index(mirroredName);
    map[j] = idx >= 0 ? idx : j;
  }
  return map;
}

export function mirrorPoseWorld(
  sk: SomaSkeleton,
  refWorld: TransformPQ[],
  mirrorMap: Int32Array,
  src: Float32Array,
): Float32Array {
  const srcW = sk.world(src);
  const mirW: Array<[number, number, number, number]> = new Array(sk.J);

  for (let j = 0; j < sk.J; j++) {
    const sj = mirrorMap[j];
    // World-space rotation delta of the mirrored source joint relative to its rest world frame
    const delta = qmul(srcW[sj].q, qconj(refWorld[sj].q));
    // Reflect world rotation delta across YZ plane (x -> -x): pitch preserved, yaw & roll negated
    const mirDelta: [number, number, number, number] = [
      delta[0],
      -delta[1],
      -delta[2],
      delta[3],
    ];
    mirW[j] = qnorm(qmul(mirDelta, refWorld[j].q));
  }

  const out = new Float32Array(src.length);
  for (let j = 0; j < sk.J; j++) {
    const p = sk.parents[j];
    const o = j * 7;
    if (p < 0) {
      out[o] = -src[0];
      out[o + 1] = src[1];
      out[o + 2] = src[2];
      out[o + 3] = mirW[0][0];
      out[o + 4] = mirW[0][1];
      out[o + 5] = mirW[0][2];
      out[o + 6] = mirW[0][3];
    } else {
      const lq = qnorm(qmul(qconj(mirW[p]), mirW[j]));
      // Preserve exact SOMA rest bone offsets
      out[o] = sk.reference[o];
      out[o + 1] = sk.reference[o + 1];
      out[o + 2] = sk.reference[o + 2];
      out[o + 3] = lq[0];
      out[o + 4] = lq[1];
      out[o + 5] = lq[2];
      out[o + 6] = lq[3];
    }
  }
  return out;
}

interface TimedPoseFrame {
  t: number; // phase in [0, 1)
  pose: Float32Array;
}

export class Soma77MotionSequencer {
  public readonly dataset: MotionBricksDataset;
  public readonly sk: SomaSkeleton;
  private mirrorMap: Int32Array;
  private refWorld: TransformPQ[];
  private walkLoop: TimedPoseFrame[] = [];
  private runLoop: TimedPoseFrame[] = [];
  private currentPose: Float32Array;
  private scratchPose: Float32Array;
  private targetPose: Float32Array;
  private activeClipLabel = 'soma:idle';

  // Optional live ONNX worker stream
  private liveOnnxFrames: Float32Array[] = [];
  private liveOnnxTime = 0;

  constructor(dataset: MotionBricksDataset) {
    this.dataset = dataset;
    this.sk = dataset.skeleton;
    this.mirrorMap = buildMirrorMap(this.sk);
    this.refWorld = this.sk.world(this.sk.reference);
    this.currentPose = new Float32Array(
      dataset.styles.idle?.frames[0] || this.sk.reference,
    );
    this.scratchPose = new Float32Array(this.sk.J * 7);
    this.targetPose = new Float32Array(this.sk.J * 7);

    // Build smooth full left-right stride loops from authentic SOMA 4-frame windows
    // using exact world-space mirroring and foot-travel-proportional phase timing.
    const idleF = dataset.styles.idle?.frames[0] || this.sk.reference;
    const walkRaw = dataset.styles.walk?.frames || [idleF];
    const runRaw = dataset.styles.run?.frames || dataset.styles.jog?.frames || walkRaw;

    this.walkLoop = this.buildTimedGaitLoop(walkRaw, [0.0, 0.06, 0.13, 0.2]);
    this.runLoop = this.buildTimedGaitLoop(runRaw, [0.0, 0.12, 0.26, 0.4]);
  }

  private buildTimedGaitLoop(
    rawFrames: Float32Array[],
    halfTimes: number[],
  ): TimedPoseFrame[] {
    const count = Math.min(rawFrames.length, halfTimes.length);
    const loop: TimedPoseFrame[] = [];
    for (let i = 0; i < count; i++) {
      loop.push({ t: halfTimes[i], pose: rawFrames[i] });
    }
    for (let i = 0; i < count; i++) {
      loop.push({
        t: 0.5 + halfTimes[i],
        pose: mirrorPoseWorld(this.sk, this.refWorld, this.mirrorMap, rawFrames[i]),
      });
    }
    return loop;
  }

  public getActiveClipLabel(): string {
    return this.activeClipLabel;
  }

  public pushLiveOnnxClip(frames: Float32Array[], label: string): void {
    this.liveOnnxFrames = frames.map((f) => this.sk.normalizeToLocalFrame(f));
    this.liveOnnxTime = 0;
    this.activeClipLabel = `onnx:${label}`;
  }

  public sampleActivityPose(params: {
    activity: PlaygroundAvatarActivity;
    phase: number;
    timeSec: number;
    dt: number;
  }): Float32Array {
    // If live ONNX worker generated frames are playing, advance them first
    if (this.liveOnnxFrames.length > 1) {
      this.liveOnnxTime += params.dt;
      const fIdx = this.liveOnnxTime * FPS;
      if (fIdx < this.liveOnnxFrames.length - 1) {
        const i0 = Math.floor(fIdx);
        const frac = fIdx - i0;
        this.sk.interpolatePoses(
          this.liveOnnxFrames[i0],
          this.liveOnnxFrames[i0 + 1],
          frac,
          this.targetPose,
        );
        this.blendCurrentTowardTarget(params.dt, 14);
        return this.currentPose;
      } else {
        this.liveOnnxFrames = [];
      }
    }

    const idleFrames = this.dataset.styles.idle?.frames || [this.sk.reference];
    const crouchFrames =
      this.dataset.styles.crouch_idle?.frames ||
      this.dataset.styles.crouch?.frames ||
      idleFrames;
    const sitPrim = this.dataset.prims.ardy_sit?.keyframes;
    const vaultPrim =
      this.dataset.prims.kimodo_vault?.keyframes ||
      this.dataset.prims.ardy_vault?.keyframes ||
      this.dataset.prims.ardy_jump?.keyframes;
    const hurdlePrim =
      this.dataset.prims.kimodo_hurdle?.keyframes || vaultPrim;
    const kickAct = this.dataset.actions.kick?.keyframes;
    const pickupAct = this.dataset.actions.pickup?.keyframes;

    switch (params.activity) {
      case 'walk':
      case 'climb_slide': {
        this.activeClipLabel =
          params.activity === 'climb_slide' ? 'soma:walk (climb)' : 'soma:walk';
        const cycle = (params.timeSec * (params.activity === 'climb_slide' ? 1.3 : 1.05)) % 1;
        this.sampleTimedCyclic(this.walkLoop, cycle, this.targetPose);
        break;
      }

      case 'run': {
        this.activeClipLabel = 'soma:run';
        const cycle = (params.timeSec * 1.55) % 1;
        this.sampleTimedCyclic(this.runLoop, cycle, this.targetPose);
        break;
      }

      case 'sit_bench':
      case 'sit_seesaw':
      case 'sit_swing':
      case 'slide_down': {
        this.activeClipLabel =
          params.activity === 'slide_down'
            ? 'ardy:ardy_sit (slide)'
            : params.activity === 'sit_seesaw'
              ? 'ardy:ardy_sit (seesaw)'
              : params.activity === 'sit_swing'
                ? 'ardy:ardy_sit (swing)'
                : 'ardy:ardy_sit (bench)';
        const sitPose = sitPrim?.[1] || sitPrim?.[0] || crouchFrames[0];
        if (params.phase < 1 && params.activity !== 'slide_down') {
          this.sk.interpolatePoses(idleFrames[0], sitPose, params.phase, this.targetPose);
        } else {
          this.targetPose.set(sitPose);
        }
        break;
      }

      case 'vault_bench':
      case 'vault_box': {
        this.activeClipLabel =
          params.activity === 'vault_box'
            ? 'kimodo:vault (vault box)'
            : 'kimodo:vault (bench)';
        if (vaultPrim && vaultPrim.length >= 2) {
          this.sampleSequence(
            [idleFrames[0], ...vaultPrim, idleFrames[0]],
            params.phase,
            this.targetPose,
          );
        } else {
          this.sampleTimedCyclic(this.runLoop, params.phase, this.targetPose);
        }
        break;
      }

      case 'vault_seesaw': {
        this.activeClipLabel = 'kimodo:hurdle (seesaw)';
        if (hurdlePrim && hurdlePrim.length >= 2) {
          this.sampleSequence(
            [idleFrames[0], ...hurdlePrim, idleFrames[0]],
            params.phase,
            this.targetPose,
          );
        } else {
          this.sampleTimedCyclic(this.runLoop, params.phase, this.targetPose);
        }
        break;
      }

      case 'kick_ball': {
        this.activeClipLabel = 'ardy:kick';
        if (kickAct && kickAct.length >= 2) {
          this.sampleSequence(
            [idleFrames[0], ...kickAct, idleFrames[0]],
            params.phase,
            this.targetPose,
          );
        } else {
          this.sampleTimedCyclic(this.runLoop, params.phase, this.targetPose);
        }
        break;
      }

      case 'pickup_ball': {
        this.activeClipLabel = 'ardy:pickup (basketball)';
        if (pickupAct && pickupAct.length >= 2) {
          const bend0 = pickupAct[0];
          const bendMid = pickupAct[Math.min(2, pickupAct.length - 1)];
          const rise0 = pickupAct[Math.min(4, pickupAct.length - 1)];
          const riseEnd = pickupAct[pickupAct.length - 1];
          this.sampleSequence(
            [idleFrames[0], bend0, bendMid, rise0, riseEnd],
            params.phase,
            this.targetPose,
          );
        } else {
          this.sampleSequence(
            [idleFrames[0], crouchFrames[0], idleFrames[0]],
            params.phase,
            this.targetPose,
          );
        }
        break;
      }

      case 'throw_ball': {
        this.activeClipLabel = 'ardy:pickup + throw';
        const holdStance =
          pickupAct && pickupAct.length > 0
            ? pickupAct[pickupAct.length - 1]
            : idleFrames[0];
        this.sampleSequence(
          [holdStance, holdStance, idleFrames[0]],
          params.phase,
          this.targetPose,
        );
        break;
      }

      case 'play_sandbox': {
        this.activeClipLabel = 'ardy:pickup + crouch_idle';
        if (pickupAct && pickupAct.length >= 2) {
          const loopT = (params.timeSec * 0.45) % 1;
          this.sampleSequence(
            [crouchFrames[0], pickupAct[0], pickupAct[Math.min(3, pickupAct.length - 1)], crouchFrames[0]],
            loopT,
            this.targetPose,
          );
        } else {
          this.targetPose.set(crouchFrames[0]);
        }
        break;
      }

      case 'stand_up': {
        this.activeClipLabel = 'ardy:stand_up';
        const sitPose = sitPrim?.[1] || sitPrim?.[0] || crouchFrames[0];
        this.sk.interpolatePoses(sitPose, idleFrames[0], params.phase, this.targetPose);
        break;
      }

      case 'idle':
      default: {
        this.activeClipLabel = 'soma:idle';
        const breathT = 0.5 + 0.5 * Math.sin(params.timeSec * 1.6);
        this.sk.interpolatePoses(
          idleFrames[0],
          idleFrames[idleFrames.length - 1],
          breathT,
          this.targetPose,
        );
        break;
      }
    }

    const blendSpeed =
      params.activity === 'kick_ball' ||
      params.activity === 'pickup_ball' ||
      params.activity === 'throw_ball' ||
      params.activity === 'vault_bench' ||
      params.activity === 'vault_seesaw' ||
      params.activity === 'vault_box'
        ? 16
        : 10.5;
    this.blendCurrentTowardTarget(params.dt, blendSpeed);
    return this.currentPose;
  }

  private sampleTimedCyclic(
    loop: TimedPoseFrame[],
    t01: number,
    out: Float32Array,
  ): void {
    const n = loop.length;
    if (n === 0) return;
    if (n === 1) {
      out.set(loop[0].pose);
      return;
    }
    const t = ((t01 % 1) + 1) % 1;
    let k = n - 1;
    for (let i = 0; i < n; i++) {
      if (t >= loop[i].t) k = i;
    }
    const next = (k + 1) % n;
    const t0 = loop[k].t;
    const t1 = next === 0 ? 1.0 : loop[next].t;
    const span = Math.max(1e-5, t1 - t0);
    const frac = (t - t0) / span;
    this.sk.interpolatePoses(loop[k].pose, loop[next].pose, frac, out);
  }

  private sampleSequence(
    seq: Float32Array[],
    t01: number,
    out: Float32Array,
  ): void {
    const clamped = Math.max(0, Math.min(1, t01));
    const maxIdx = seq.length - 1;
    const scaled = clamped * maxIdx;
    const i0 = Math.min(maxIdx, Math.floor(scaled));
    const i1 = Math.min(maxIdx, i0 + 1);
    const frac = scaled - i0;
    this.sk.interpolatePoses(seq[i0], seq[i1], frac, out);
  }

  private blendCurrentTowardTarget(dt: number, lambda: number): void {
    const alpha = 1 - Math.exp(-lambda * Math.min(dt, 0.05));
    this.sk.interpolatePoses(
      this.currentPose,
      this.targetPose,
      alpha,
      this.scratchPose,
    );
    this.currentPose.set(this.scratchPose);
  }
}
