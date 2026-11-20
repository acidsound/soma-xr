import type {
  ChatTurn,
  GazeMode,
  NpcEmotionType,
  NpcRespondPayload,
  PersonaProfile,
  RelationshipState,
  UserEmotionAnalysis,
  UserEmotionType,
} from '../types';
import { defaultSomaStyleForEmotion } from '../sim/romanceEngine';
import { DEFAULT_QUICK_CHOICES } from '../constants';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

export interface HealthStatus {
  ok: boolean;
  hasGeminiKey: boolean;
}

/** GitHub Pages has no server: route chat to a local demo responder. */
export function isStaticDemo(): boolean {
  return __STATIC_DEMO__ && !API_BASE;
}

function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

interface StaticReplyPreset {
  npcEmotion: NpcEmotionType;
  gazeMode: GazeMode;
  reply: string;
  innerThought: string;
  affectionDelta: number;
  trustDelta: number;
  moodDelta: number;
}

const STATIC_REPLIES: Record<UserEmotionType, StaticReplyPreset> = {
  affection: {
    npcEmotion: 'loving',
    gazeMode: 'lock_eyes',
    reply: '그렇게 말해 주니 진짜 기뻐. 오늘 놀이터에서 네 곁에 있는 것만으로도 좋아.',
    innerThought: '네가 나를 좋아해 줘서 마음이 따뜻해.',
    affectionDelta: 5,
    trustDelta: 3,
    moodDelta: 8,
  },
  shy: {
    npcEmotion: 'blush',
    gazeMode: 'shy_avert',
    reply: '나도 네 앞에서는 좀 부끄러워져... 손 잡아도 될까?',
    innerThought: '가슴이 자꾸 두근거려.',
    affectionDelta: 3,
    trustDelta: 1,
    moodDelta: 5,
  },
  joy: {
    npcEmotion: 'happy',
    gazeMode: 'lock_eyes',
    reply: '으흐흐, 기분 좋아! 미끄럼틀 타러 같이 가자!',
    innerThought: '네가 웃으니까 나도 웃음이 나.',
    affectionDelta: 2,
    trustDelta: 1,
    moodDelta: 6,
  },
  playful: {
    npcEmotion: 'playful',
    gazeMode: 'curious_tilt',
    reply: '장난 치나? 나도 진지하게 받아줄게~ 뭐부터 해볼래?',
    innerThought: '네 장난기가 나도 모르게 따라오게 해.',
    affectionDelta: 2,
    trustDelta: 0,
    moodDelta: 5,
  },
  sad: {
    npcEmotion: 'concerned',
    gazeMode: 'lock_eyes',
    reply: '그랬구나... 벤치에 같이 앉아서 천천히 이야기하자. 내가 곁에 있을게.',
    innerThought: '네 마음이 좀 무거워 보여. 곁에 있어 줄게.',
    affectionDelta: 2,
    trustDelta: 4,
    moodDelta: 2,
  },
  anxious: {
    npcEmotion: 'concerned',
    gazeMode: 'lock_eyes',
    reply: '천천히 숨 고르자. 내가 옆에서 같이 있을게, 하나씩 해보면 돼.',
    innerThought: '조금이라도 마음이 편해졌으면 좋겠어.',
    affectionDelta: 1,
    trustDelta: 4,
    moodDelta: 2,
  },
  frustrated: {
    npcEmotion: 'sad',
    gazeMode: 'lock_eyes',
    reply: '그런 일이 있었구나. 네 마음 충분히 이해해. 같이 그네 타고 바람 쐬자.',
    innerThought: '네가 답답해하는 마음을 헤아리고 싶어.',
    affectionDelta: 1,
    trustDelta: 3,
    moodDelta: 1,
  },
  curiosity: {
    npcEmotion: 'surprised',
    gazeMode: 'curious_tilt',
    reply: '좋은 질문이야! 같이 찾아보자. 궁금한 게 더 있으면 말해 줘.',
    innerThought: '네 호기심이 나도 신나게 해.',
    affectionDelta: 1,
    trustDelta: 2,
    moodDelta: 4,
  },
  neutral: {
    npcEmotion: 'happy',
    gazeMode: 'lock_eyes',
    reply: '그래, 오늘 놀이터에서 뭐부터 해볼까?',
    innerThought: '네와 함께할 시간이 기다려져.',
    affectionDelta: 1,
    trustDelta: 1,
    moodDelta: 2,
  },
};

interface NpcRequestParams {
  message: string;
  interactionType: string;
  localEmotionHint: UserEmotionAnalysis;
  relationship: RelationshipState;
  persona: PersonaProfile;
  history: ChatTurn[];
}

function buildStaticResponse(params: NpcRequestParams): NpcRespondPayload {
  const userEmotion = params.localEmotionHint;
  const preset = STATIC_REPLIES[userEmotion.primary] ?? STATIC_REPLIES.neutral;
  return {
    userEmotion,
    npcReply: preset.reply,
    npcEmotion: preset.npcEmotion,
    somaMotionStyle: defaultSomaStyleForEmotion(preset.npcEmotion),
    gazeMode: preset.gazeMode,
    affectionDelta: preset.affectionDelta,
    trustDelta: preset.trustDelta,
    moodDelta: preset.moodDelta,
    innerThought: `${params.persona.name}: ${preset.innerThought} (정적 데모 응답)`,
    suggestedChoices: [...DEFAULT_QUICK_CHOICES],
  };
}

export async function checkApiHealth(): Promise<HealthStatus> {
  if (isStaticDemo()) {
    return { ok: true, hasGeminiKey: false };
  }
  const res = await fetch(apiUrl('/api/health'));
  if (!res.ok) {
    throw new Error(`Health check failed (${res.status})`);
  }
  return (await res.json()) as HealthStatus;
}

export async function requestNpcResponse(params: NpcRequestParams): Promise<NpcRespondPayload> {
  if (isStaticDemo()) {
    return buildStaticResponse(params);
  }
  const res = await fetch(apiUrl('/api/npc/respond'), {
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
  if (isStaticDemo()) {
    throw new Error(
      '정적 데모에서는 브라우저 음성 인식만 지원합니다. Chrome에서 마이크를 사용해 주세요.',
    );
  }
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  const audioBase64 = btoa(binary);
  const mimeType = blob.type || 'audio/webm';

  const res = await fetch(apiUrl('/api/speech/transcribe'), {
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
  const res = await fetch(apiUrl('/api/speech/tts'), {
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
