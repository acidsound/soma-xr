import {
  buildStaticResponse,
  type NpcRequestParams,
} from './staticNpcResponder';
import type { NpcRespondPayload } from '../types';

/**
 * GitHub Pages has no server: requestNpcResponse uses the local rule-based
 * responder. Direct browser calls to OpenAI-compatible APIs are blocked by
 * CORS, so LLM replies will return only once a backend proxy is connected.
 */
export function isStaticDemo(): boolean {
  return __STATIC_DEMO__;
}

export async function requestNpcResponse(params: NpcRequestParams): Promise<NpcRespondPayload> {
  return buildStaticResponse(params);
}

/**
 * Local-only build: audio is never uploaded. The app uses browser Web Speech
 * interim results when available; recording a blob alone cannot be transcribed.
 */
export async function transcribeAudioBlob(_blob: Blob): Promise<string> {
  void _blob;
  throw new Error('음성 인식은 브라우저(Web Speech API) 결과만 사용합니다.');
}
export class TtsLipSyncPlayer {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array<ArrayBuffer> | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private _isPlaying = false;
  public onPlaybackStateChange?: (playing: boolean) => void;

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  private ensureContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.audioCtx = new AudioCtx();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.65;
      this.analyser.connect(this.audioCtx.destination);
      this.dataArray = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
    }
    if (this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  async playBase64Wav(base64Audio: string): Promise<void> {
    this.stop();
    const ctx = this.ensureContext();
    const binary = atob(base64Audio);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const audioBuffer = await ctx.decodeAudioData(bytes.buffer.slice(0));
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    if (this.analyser) {
      source.connect(this.analyser);
    } else {
      source.connect(ctx.destination);
    }

    this.currentSource = source;
    this._isPlaying = true;
    this.onPlaybackStateChange?.(true);

    return new Promise<void>((resolve) => {
      source.onended = () => {
        if (this.currentSource === source) {
          this.currentSource = null;
          this._isPlaying = false;
          this.onPlaybackStateChange?.(false);
        }
        resolve();
      };
      source.start(0);
    });
  }

  getSpeakingEnergy(): number {
    if (!this._isPlaying || !this.analyser || !this.dataArray) {
      return 0;
    }
    this.analyser.getByteTimeDomainData(this.dataArray);
    let sumSq = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      const norm = (this.dataArray[i] - 128) / 128;
      sumSq += norm * norm;
    }
    const rms = Math.sqrt(sumSq / this.dataArray.length);
    return Math.min(1, rms * 4.5);
  }

  stop(): void {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
        this.currentSource.disconnect();
      } catch {
        // already stopped
      }
      this.currentSource = null;
    }
    if (this._isPlaying) {
      this._isPlaying = false;
      this.onPlaybackStateChange?.(false);
    }
  }

  dispose(): void {
    this.stop();
    if (this.audioCtx) {
      void this.audioCtx.close();
      this.audioCtx = null;
    }
  }
}
