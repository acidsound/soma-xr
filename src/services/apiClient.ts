import {
  buildStaticResponse,
  type NpcRequestParams,
} from './staticNpcResponder';
import {
  loadLocalApiConfig,
  type LocalApiConfig,
} from './localApiConfig';
import type { NpcRespondPayload, PersonaProfile } from '../types';

const VALID_USER_EMOTIONS = new Set([
  'joy',
  'affection',
  'curiosity',
  'shy',
  'sad',
  'anxious',
  'frustrated',
  'playful',
  'neutral',
]);
const VALID_NPC_EMOTIONS = new Set([
  'happy',
  'blush',
  'loving',
  'shy',
  'surprised',
  'sad',
  'concerned',
  'playful',
  'calm',
]);
const VALID_MOTIONS = new Set([
  'idle_gentle',
  'wave_greet',
  'lean_affection',
  'shy_fidget',
  'happy_bounce',
  'nod_listen',
  'comfort_reach',
  'head_tilt_curious',
  'cheer_clap',
  'point_forward',
]);
const VALID_GAZES = new Set(['lock_eyes', 'shy_avert', 'curious_tilt']);
const VALID_PLAYGROUND_COMMANDS = new Set([
  'none',
  'move_to',
  'sit_bench',
  'vault_bench',
  'sit_seesaw',
  'vault_seesaw',
  'ride_slide',
  'ride_swing',
  'vault_box_1',
  'vault_box_2',
  'vault_box_3',
  'vault_boxes_all',
  'kick_soccer',
  'throw_basketball',
  'play_sandbox',
  'stand_up',
]);

/**
 * GitHub Pages has no server: requestNpcResponse falls back to a local
 * rule-based responder unless the user configured an OpenAI-compatible API.
 */
export function isStaticDemo(): boolean {
  return __STATIC_DEMO__;
}

function openAiChatUrl(endpoint: string): string {
  return /\/chat\/completions\/?$/.test(endpoint)
    ? endpoint
    : `${endpoint}/chat/completions`;
}

function buildSystemPrompt(persona: Partial<PersonaProfile>, body: NpcRequestParams): string {
  const rel = body.relationship || {};
  return [
    `당신은 XR 놀이터 연애 시뮬레이션 샌드박스의 3D VRM 동반자 "${persona.name || '서연'}" (${persona.role || '놀이터 산책 메이트'})입니다.`,
    `현재 공간은 미끄럼틀, 그네, 시소, 벤치, 1~3단 뜀틀, 축구공, 농구공, 모래놀이터가 있는 노을 공원 놀이터입니다.`,
    `성격: ${persona.personality || '따뜻하고 활발하며 사용자의 말과 감정에 진심으로 귀 기울이는 성격'}`,
    `말투: ${persona.speakingStyle || '부드럽고 다정한 해요체, 친밀도가 높아질수록 애정이 담긴 친근한 표현 사용'}`,
    `현재 관계 상태: 단계=${rel.stage || '낯선 만남'}, 호감도=${rel.affection ?? 32}/100, 신뢰도=${rel.trust ?? 28}/100, 기분=${rel.mood ?? 72}/100, 대화 턴=${rel.turnCount ?? 0}.`,
    `역할:\n1. 사용자의 발화에서 감정(userEmotion)을 분석하세요.`,
    `2. NPC 감정(npcEmotion), MotionBricks SOMA 모션 스타일(somaMotionStyle), 시선(gazeMode)을 선택하세요.`,
    `3. 놀이터 행동을 요청하면 적절한 playgroundCommand를 설정하세요.`,
    `4. 답변(npcReply)은 1~3문장의 자연스러운 한국어 구어체로 작성하고 이모지·괄호 지문은 넣지 마세요.`,
    `출력은 반드시 JSON 객체 하나이며 아래 키를 모두 포함해야 합니다: userEmotion{primary,intensity,valence,arousal,labelKo,cues}, npcReply, npcEmotion, somaMotionStyle, gazeMode, affectionDelta, trustDelta, moodDelta, innerThought, suggestedChoices(2~3개), playgroundCommand.`,
    `primary는 joy/affection/curiosity/shy/sad/anxious/frustrated/playful/neutral 중 하나,`,
    `npcEmotion은 happy/blush/loving/shy/surprised/sad/concerned/playful/calm 중 하나,`,
    `somaMotionStyle은 idle_gentle/wave_greet/lean_affection/shy_fidget/happy_bounce/nod_listen/comfort_reach/head_tilt_curious/cheer_clap/point_forward 중 하나,`,
    `gazeMode는 lock_eyes/shy_avert/curious_tilt 중 하나여야 합니다.`,
  ].join('\n');
}

function buildUserPrompt(body: NpcRequestParams): string {
  const history = Array.isArray(body.history) ? body.history.slice(-10) : [];
  const conversation = history
    .map((item) => `${item.role === 'user' ? '사용자' : 'NPC'}: ${item.text}`)
    .join('\n');
  return [
    conversation ? `[최근 대화]\n${conversation}` : '',
    `[실시간 로컬 감정 힌트] ${JSON.stringify(body.localEmotionHint || {})}`,
    `[상호작용 유형] ${body.interactionType || 'text_chat'}`,
    `[이번 사용자 입력] ${body.message}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function extractJsonObject(content: string): Record<string, unknown> | null {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : content).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(candidate.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Keep response fields type-safe even if the model ignores the schema. */
function coerceResponse(raw: Record<string, unknown> | null, params: NpcRequestParams): NpcRespondPayload {
  const fallback = buildStaticResponse(params);
  if (!raw) return fallback;

  const rawEmotion = raw.userEmotion && typeof raw.userEmotion === 'object'
    ? (raw.userEmotion as Record<string, unknown>)
    : {};
  const emotionPrimary = VALID_USER_EMOTIONS.has(String(rawEmotion.primary))
    ? (rawEmotion.primary as NpcRespondPayload['userEmotion']['primary'])
    : fallback.userEmotion.primary;
  const numberOr = (value: unknown, base: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : base;

  const npcEmotion = VALID_NPC_EMOTIONS.has(String(raw.npcEmotion))
    ? (raw.npcEmotion as NpcRespondPayload['npcEmotion'])
    : fallback.npcEmotion;
  const somaMotionStyle = VALID_MOTIONS.has(String(raw.somaMotionStyle))
    ? (raw.somaMotionStyle as NpcRespondPayload['somaMotionStyle'])
    : fallback.somaMotionStyle;
  const gazeMode = VALID_GAZES.has(String(raw.gazeMode))
    ? (raw.gazeMode as NpcRespondPayload['gazeMode'])
    : fallback.gazeMode;
  const playgroundCommand = VALID_PLAYGROUND_COMMANDS.has(String(raw.playgroundCommand))
    ? (raw.playgroundCommand as NpcRespondPayload['playgroundCommand'])
    : undefined;
  const choices = Array.isArray(raw.suggestedChoices)
    ? raw.suggestedChoices.filter((item): item is string => typeof item === 'string' && !!item.trim()).slice(0, 3)
    : [];

  return {
    userEmotion: {
      primary: emotionPrimary,
      intensity: Math.min(1, Math.max(0, numberOr(rawEmotion.intensity, fallback.userEmotion.intensity))),
      valence: Math.min(1, Math.max(-1, numberOr(rawEmotion.valence, fallback.userEmotion.valence))),
      arousal: Math.min(1, Math.max(0, numberOr(rawEmotion.arousal, fallback.userEmotion.arousal))),
      labelKo: typeof rawEmotion.labelKo === 'string' && rawEmotion.labelKo.trim()
        ? rawEmotion.labelKo.trim()
        : fallback.userEmotion.labelKo,
      cues: typeof rawEmotion.cues === 'string' && rawEmotion.cues.trim()
        ? rawEmotion.cues.trim()
        : fallback.userEmotion.cues,
    },
    npcReply: typeof raw.npcReply === 'string' && raw.npcReply.trim()
      ? raw.npcReply.trim()
      : fallback.npcReply,
    npcEmotion,
    somaMotionStyle,
    gazeMode,
    affectionDelta: Math.round(numberOr(raw.affectionDelta, fallback.affectionDelta)),
    trustDelta: Math.round(numberOr(raw.trustDelta, fallback.trustDelta)),
    moodDelta: Math.round(numberOr(raw.moodDelta, fallback.moodDelta)),
    innerThought: typeof raw.innerThought === 'string' && raw.innerThought.trim()
      ? raw.innerThought.trim()
      : fallback.innerThought,
    suggestedChoices: choices.length ? choices : fallback.suggestedChoices,
    playgroundCommand,
  };
}

/**
 * Calls the configured OpenAI-compatible `/chat/completions` endpoint directly
 * from the browser. The key never passes through this app's server.
 */
async function requestOpenAiResponse(
  params: NpcRequestParams,
  config: LocalApiConfig,
): Promise<NpcRespondPayload> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  let response: Response;
  try {
    response = await fetch(openAiChatUrl(config.endpoint), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: buildSystemPrompt(params.persona || {}, params) },
          { role: 'user', content: buildUserPrompt(params) },
        ],
        temperature: 0.8,
      }),
    });
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI 호환 API 오류 (${response.status}): ${text.slice(0, 300) || response.statusText}`);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('OpenAI 호환 API가 JSON을 반환하지 않았습니다.');
  }
  const choices = (payload as { choices?: Array<{ message?: { content?: string } }> })?.choices;
  const content = choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('OpenAI 호환 API 응답에 choices[0].message.content가 없습니다.');
  }
  return coerceResponse(extractJsonObject(content), params);
}

export async function requestNpcResponse(params: NpcRequestParams): Promise<NpcRespondPayload> {
  const config = loadLocalApiConfig();
  if (config) {
    return requestOpenAiResponse(params, config);
  }
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
