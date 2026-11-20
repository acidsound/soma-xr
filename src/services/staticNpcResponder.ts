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

export interface NpcRequestParams {
  message: string;
  interactionType: string;
  localEmotionHint: UserEmotionAnalysis;
  relationship: RelationshipState;
  persona: PersonaProfile;
  history: ChatTurn[];
}

export function buildStaticResponse(params: NpcRequestParams): NpcRespondPayload {
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
