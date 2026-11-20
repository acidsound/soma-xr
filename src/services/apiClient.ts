import type {
  ChatTurn,
  NpcEmotionType,
  NpcRespondPayload,
  PersonaProfile,
  RelationshipState,
  UserEmotionAnalysis,
} from '../types';

export interface HealthStatus {
  ok: boolean;
  hasGeminiKey: boolean;
}

export async function checkApiHealth(): Promise<HealthStatus> {
  const res = await fetch('/api/health');
  if (!res.ok) {
    throw new Error(`Health check failed (${res.status})`);
  }
  return (await res.json()) as HealthStatus;
}

export async function requestNpcResponse(params: {
  message: string;
  interactionType: string;
  localEmotionHint: UserEmotionAnalysis;
  relationship: RelationshipState;
  persona: PersonaProfile;
  history: ChatTurn[];
}): Promise<NpcRespondPayload> {
  const res = await fetch('/api/npc/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: params.message,
      interactionType: params.interactionType,
      localEmotionHint: {
        primary: params.localEmotionHint.primary,
        valence: params.localEmotionHint.valence,
        arousal: params.localEmotionHint.arousal,
      },
      relationship: {
        affection: params.relationship.affection,
        trust: params.relationship.trust,
        mood: params.relationship.mood,
        stage: params.relationship.stage,
        turnCount: params.relationship.turnCount,
      },
      persona: {
        id: params.persona.id,
        name: params.persona.name,
        role: params.persona.role,
        personality: params.persona.personality,
        speakingStyle: params.persona.speakingStyle,
      },
      history: params.history.slice(-10).map((t) => ({
        role: t.role,
        text: t.text,
      })),
    }),
  });

  const data = (await res.json()) as NpcRespondPayload & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `LLM 요청 실패 (${res.status})`);
  }
  return data;
}

export async function transcribeAudioBlob(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  const audioBase64 = btoa(binary);
  const mimeType = blob.type || 'audio/webm';

  const res = await fetch('/api/speech/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audioBase64, mimeType }),
  });

  const data = (await res.json()) as { text?: string; error?: string };
  if (!res.ok) {
    throw new Error(data.error || `음성 변환 실패 (${res.status})`);
  }
  return data.text || '';
}

export async function requestNpcTts(params: {
  text: string;
  npcEmotion: NpcEmotionType;
  voiceName: string;
}): Promise<{ audioBase64: string; mimeType: string }> {
  const res = await fetch('/api/speech/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = (await res.json()) as {
    audioBase64?: string;
    mimeType?: string;
    error?: string;
  };
  if (!res.ok || !data.audioBase64) {
    throw new Error(data.error || `TTS 생성 실패 (${res.status})`);
  }
  return {
    audioBase64: data.audioBase64,
    mimeType: data.mimeType || 'audio/wav',
  };
}

/**
 * Plays WAV TTS output through Web Audio API and exposes real-time RMS
 * speaking amplitude (0..1) for VRM mouth lip-sync.
 */
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
