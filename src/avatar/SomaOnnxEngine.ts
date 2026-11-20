import type {
  PlaygroundAvatarActivity,
  SomaMotionStyle,
  SomaRuntimeStatus,
} from '../types';
import { MOTIONBRICKS_R2_ONNX_URL } from '../constants';
import {
  SOMA_JOINT_NAMES,
  type SomaPoseFrame,
  decodeSomaOnnxTensorToPose,
  synthesizeSoma30Pose,
} from '../sim/somaRig';
import {
  type MotionBricksDataset,
  Soma77MotionSequencer,
  type SomaSkeleton,
  loadMotionBricksDatasets,
} from '../soma/motionBricksRuntime';

type OrtModule = typeof import('onnxruntime-web');

/**
 * MotionBricks SOMA-77 Runtime + Optional Live WebGPU ONNX Engine.
 *
 * 1. On boot, loads the authentic 77-joint MotionBricks SOMA runtime clips from
 *    `/runtime_data/soma_runtime.json`, `ardy_runtime.json`, and `kimodo_runtime.json`
 *    (walk, jog/run, idle, crouch, ardy_sit, kimodo_vault, kimodo_hurdle, ardy_kick, pickup).
 * 2. Allows activating the real 243MB WebGPU `mmm_v6_soma_q8h.onnx` model via a
 *    dedicated Web Worker (`/workers/mb_worker.js`) with Cache Storage caching,
 *    or loading any user-supplied `.onnx` model file.
 * 3. Preserves the SOMA-30 procedural emotional synthesizer as an expressive overlay
 *    and fallback when no external VRM or SOMA-77 dataset is loaded.
 */
export class SomaOnnxEngine {
  private ort: OrtModule | null = null;
  private session: import('onnxruntime-web').InferenceSession | null = null;
  private mbWorker: Worker | null = null;

  private dataset: MotionBricksDataset | null = null;
  private sequencer: Soma77MotionSequencer | null = null;

  private modelName = 'MotionBricks SOMA-77 Runtime Clips';
  private executionMode: SomaRuntimeStatus['mode'] = 'procedural-soma30';
  private activeStyle: SomaMotionStyle = 'idle_gentle';
  private lastInferenceMs = 0;
  private onnxInferring = false;
  private lastOnnxRunAt = 0;
  private cachedOnnxPose: SomaPoseFrame | null = null;
  private historyBuffer = new Float32Array(30 * 3);

  private liveOnnxReady = false;
  private liveOnnxLoading = false;
  private liveOnnxProgress = '';

  public onStatusChange?: () => void;

  public async initMotionBricksRuntime(): Promise<void> {
    try {
      const t0 = performance.now();
      this.dataset = await loadMotionBricksDatasets();
      this.sequencer = new Soma77MotionSequencer(this.dataset);
      this.executionMode = 'soma77-runtime';
      this.modelName = 'MotionBricks SOMA-77 (soma + ardy + kimodo)';
      this.lastInferenceMs = Number((performance.now() - t0).toFixed(1));
      this.onStatusChange?.();
    } catch (err) {
      console.warn('[SomaOnnxEngine] Could not load SOMA-77 runtime JSONs:', err);
    }
  }

  public getSkeleton(): SomaSkeleton | null {
    return this.dataset?.skeleton || null;
  }

  public getSequencer(): Soma77MotionSequencer | null {
    return this.sequencer;
  }

  public setStyle(style: SomaMotionStyle): void {
    this.activeStyle = style;
  }

  public getStyle(): SomaMotionStyle {
    return this.activeStyle;
  }

  public getActiveClip(): string {
    return this.sequencer?.getActiveClipLabel() || `procedural:${this.activeStyle}`;
  }

  public getStatus(): SomaRuntimeStatus {
    return {
      mode: this.executionMode,
      modelName: this.modelName,
      jointCount: this.dataset ? this.dataset.skeleton.J : SOMA_JOINT_NAMES.length,
      inferenceMs: this.lastInferenceMs,
      activeStyle: this.activeStyle,
      activeClip: this.sequencer?.getActiveClipLabel() || `procedural:${this.activeStyle}`,
      liveOnnxReady: this.liveOnnxReady,
      liveOnnxLoading: this.liveOnnxLoading,
      liveOnnxProgress: this.liveOnnxProgress,
    };
  }

  /**
   * Samples an authentic 77-joint SOMA pose for the current playground activity
   * (walk, run, sit_bench, vault_bench, sit_seesaw, vault_seesaw, kick_ball, etc.).
   */
  public sampleSoma77Pose(params: {
    activity: PlaygroundAvatarActivity;
    phase: number;
    timeSec: number;
    dt: number;
  }): Float32Array | null {
    if (!this.sequencer) return null;
    const t0 = performance.now();
    const pose = this.sequencer.sampleActivityPose(params);
    if (!this.session) {
      this.lastInferenceMs = Number((performance.now() - t0).toFixed(2));
    }
    return pose;
  }

  /**
   * Loads the official MotionBricks SOMA 8-bit WebGPU ONNX model (mmm_v6_soma_q8h.onnx)
   * from Cloudflare R2 via the background worker with Cache Storage persistence.
   */
  public async loadMotionBricksCloudOnnx(): Promise<SomaRuntimeStatus> {
    if (this.liveOnnxLoading) return this.getStatus();
    this.liveOnnxLoading = true;
    this.liveOnnxProgress = 'WebGPU ONNX 워커 초기화 중…';
    this.onStatusChange?.();

    const hasWebGpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
    const ep = hasWebGpu ? 'webgpu' : 'wasm';

    return new Promise<SomaRuntimeStatus>((resolve, reject) => {
      try {
        this.mbWorker?.terminate();
        this.mbWorker = new Worker(`${import.meta.env.BASE_URL}workers/mb_worker.js`);
        this.mbWorker.onmessage = (ev: MessageEvent) => {
          const m = ev.data as {
            type: string;
            loaded?: number;
            total?: number;
            message?: string;
            ep?: string;
          };
          if (m.type === 'cached') {
            this.liveOnnxProgress = '브라우저 캐시에서 SOMA ONNX 모델 로드 중…';
            this.onStatusChange?.();
          } else if (m.type === 'progress') {
            const loadedMb = Math.round((m.loaded || 0) / 1e6);
            const totalMb = m.total ? Math.round(m.total / 1e6) : 243;
            this.liveOnnxProgress = `mmm_v6_soma_q8h.onnx 다운로드 중 (${loadedMb}/${totalMb} MB)…`;
            this.onStatusChange?.();
          } else if (m.type === 'ready') {
            this.liveOnnxLoading = false;
            this.liveOnnxReady = true;
            this.liveOnnxProgress = '준비 완료';
            this.executionMode = m.ep === 'webgpu' ? 'onnx-webgpu' : 'onnx-wasm';
            this.modelName = 'mmm_v6_soma_q8h.onnx (MotionBricks Live)';
            this.onStatusChange?.();
            resolve(this.getStatus());
          } else if (m.type === 'error') {
            this.liveOnnxLoading = false;
            this.liveOnnxReady = false;
            this.liveOnnxProgress = '';
            this.onStatusChange?.();
            reject(new Error(m.message || 'MotionBricks ONNX 초기화 실패'));
          }
        };
        this.mbWorker.onerror = (err) => {
          this.liveOnnxLoading = false;
          this.liveOnnxProgress = '';
          this.onStatusChange?.();
          reject(new Error(err.message || 'MotionBricks ONNX 워커 오류'));
        };
        this.mbWorker.postMessage({
          type: 'init',
          modelUrl: MOTIONBRICKS_R2_ONNX_URL,
          ep,
        });
      } catch (err) {
        this.liveOnnxLoading = false;
        this.liveOnnxProgress = '';
        this.onStatusChange?.();
        reject(err);
      }
    });
  }

  public async loadOnnxModelFromBuffer(
    buffer: ArrayBuffer,
    fileName: string,
  ): Promise<SomaRuntimeStatus> {
    if (!this.ort) {
      this.ort = await import('onnxruntime-web');
      this.ort.env.wasm.numThreads = 1;
    }

    const bytes = new Uint8Array(buffer);
    let mode: SomaRuntimeStatus['mode'] = 'onnx-wasm';
    try {
      this.session = await this.ort.InferenceSession.create(bytes, {
        executionProviders: ['webgpu', 'wasm'],
      });
      mode =
        typeof navigator !== 'undefined' && 'gpu' in navigator
          ? 'onnx-webgpu'
          : 'onnx-wasm';
    } catch {
      this.session = await this.ort.InferenceSession.create(bytes, {
        executionProviders: ['wasm'],
      });
      mode = 'onnx-wasm';
    }

    this.executionMode = mode;
    this.modelName = fileName;
    this.liveOnnxReady = true;
    this.cachedOnnxPose = null;
    this.onStatusChange?.();
    return this.getStatus();
  }

  public resetToBuiltin(): SomaRuntimeStatus {
    this.mbWorker?.terminate();
    this.mbWorker = null;
    this.session = null;
    this.liveOnnxReady = false;
    this.liveOnnxLoading = false;
    this.liveOnnxProgress = '';
    this.executionMode = this.dataset ? 'soma77-runtime' : 'procedural-soma30';
    this.modelName = this.dataset
      ? 'MotionBricks SOMA-77 (soma + ardy + kimodo)'
      : 'Built-in SOMA-30 Synthesizer';
    this.cachedOnnxPose = null;
    this.lastInferenceMs = 0;
    this.onStatusChange?.();
    return this.getStatus();
  }

  public step(params: {
    timeSec: number;
    emotionIntensity: number;
    affection: number;
    speakingEnergy: number;
  }): SomaPoseFrame {
    const start = performance.now();
    const proceduralPose = synthesizeSoma30Pose({
      style: this.activeStyle,
      timeSec: params.timeSec,
      emotionIntensity: params.emotionIntensity,
      affection: params.affection,
      speakingEnergy: params.speakingEnergy,
    });

    if (this.session && this.ort) {
      const now = performance.now();
      if (!this.onnxInferring && now - this.lastOnnxRunAt >= 48) {
        this.lastOnnxRunAt = now;
        void this.runOnnxStep(proceduralPose, params.emotionIntensity);
      }
      if (this.cachedOnnxPose) {
        for (const joint of SOMA_JOINT_NAMES) {
          const p = proceduralPose[joint];
          const o = this.cachedOnnxPose[joint];
          p.x = p.x * 0.35 + o.x * 0.65;
          p.y = p.y * 0.35 + o.y * 0.65;
          p.z = p.z * 0.35 + o.z * 0.65;
        }
      }
    } else if (!this.dataset) {
      this.lastInferenceMs = Number((performance.now() - start).toFixed(2));
    }

    return proceduralPose;
  }

  private async runOnnxStep(
    seedPose: SomaPoseFrame,
    intensity: number,
  ): Promise<void> {
    if (!this.session || !this.ort) return;
    this.onnxInferring = true;
    const t0 = performance.now();
    try {
      for (let i = 0; i < SOMA_JOINT_NAMES.length; i++) {
        const j = seedPose[SOMA_JOINT_NAMES[i]];
        this.historyBuffer[i * 3] = j.x;
        this.historyBuffer[i * 3 + 1] = j.y;
        this.historyBuffer[i * 3 + 2] = j.z;
      }

      const feeds: Record<string, import('onnxruntime-web').Tensor> = {};
      for (const name of this.session.inputNames) {
        const meta = this.session.inputMetadata as unknown as Record<
          string,
          { dimensions?: Array<number | string>; type?: string }
        >;
        const rawDims = meta?.[name]?.dimensions;
        const dims =
          Array.isArray(rawDims) && rawDims.length > 0
            ? rawDims.map((d) => (typeof d === 'number' && d > 0 ? d : 1))
            : [1, 30, 3];
        const totalSize = dims.reduce((a, b) => a * b, 1);
        const inputData = new Float32Array(totalSize);
        for (let i = 0; i < totalSize; i++) {
          inputData[i] =
            i < this.historyBuffer.length
              ? this.historyBuffer[i]
              : intensity * 0.1;
        }
        feeds[name] = new this.ort.Tensor('float32', inputData, dims);
      }

      const outputs = await this.session.run(feeds);
      const firstOutputName = this.session.outputNames[0];
      const outTensor = firstOutputName ? outputs[firstOutputName] : undefined;
      if (outTensor && outTensor.data instanceof Float32Array) {
        this.cachedOnnxPose = decodeSomaOnnxTensorToPose(outTensor.data);
      }
      this.lastInferenceMs = Number((performance.now() - t0).toFixed(2));
    } catch (err) {
      console.warn('[SomaOnnxEngine] Inference fallback:', err);
      this.cachedOnnxPose = null;
    } finally {
      this.onnxInferring = false;
    }
  }

  public dispose(): void {
    this.mbWorker?.terminate();
    this.mbWorker = null;
    this.session = null;
  }
}
