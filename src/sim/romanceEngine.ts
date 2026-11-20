import type {
  GazeMode,
  NpcEmotionType,
  RelationshipStage,
  RelationshipState,
  SomaMotionStyle,
  UserEmotionAnalysis,
  UserEmotionType,
} from '../types';

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function computeRelationshipStage(
  affection: number,
  trust: number,
): RelationshipStage {
  const bond = affection * 0.65 + trust * 0.35;
  if (bond >= 78) return '연인';
  if (bond >= 56) return '깊어지는 마음';
  if (bond >= 36) return '설레는 호감';
  return '낯선 만남';
}

export function applyRelationshipDelta(
  prev: RelationshipState,
  delta: {
    affectionDelta: number;
    trustDelta: number;
    moodDelta: number;
    userEmotion: UserEmotionAnalysis;
    npcEmotion: NpcEmotionType;
    innerThought?: string;
  },
): RelationshipState {
  const affection = clamp(Math.round(prev.affection + delta.affectionDelta), 0, 100);
  const trust = clamp(Math.round(prev.trust + delta.trustDelta), 0, 100);
  const mood = clamp(Math.round(prev.mood + delta.moodDelta), 0, 100);
  const stage = computeRelationshipStage(affection, trust);
  return {
    affection,
    trust,
    mood,
    stage,
    turnCount: prev.turnCount + 1,
    lastUserEmotion: delta.userEmotion,
    lastNpcEmotion: delta.npcEmotion,
    innerThought: delta.innerThought || prev.innerThought,
  };
}

/**
 * Fast client-side real-time emotion pre-signal used for instant avatar
 * micro-reactions while typing/speaking before the LLM round-trip returns.
 */
export function analyzeLocalEmotionSignal(
  text: string,
  acousticEnergy = 0,
): UserEmotionAnalysis {
  const lower = text.toLowerCase();
  const energyBoost = clamp(acousticEnergy, 0, 1) * 0.25;

  const patterns: Array<{
    type: UserEmotionType;
    labelKo: string;
    valence: number;
    arousal: number;
    keywords: RegExp;
  }> = [
    {
      type: 'affection',
      labelKo: '애정 · 설렘',
      valence: 0.9,
      arousal: 0.65,
      keywords: /좋아|사랑|설레|예쁘|귀엽|보고\s*싶|고마워|마음이\s*놓|love|cute|like you/i,
    },
    {
      type: 'shy',
      labelKo: '수줍음',
      valence: 0.55,
      arousal: 0.55,
      keywords: /부끄|수줍|떨려|긴장|바라봐|손\s*잡|두근|shy|blush/i,
    },
    {
      type: 'joy',
      labelKo: '기쁨',
      valence: 0.85,
      arousal: 0.78,
      keywords: /기뻐|행복|신나|최고|웃|재밌|좋다|happy|great|yay|ㅎㅎ|ㅋㅋ/i,
    },
    {
      type: 'playful',
      labelKo: '장난기',
      valence: 0.7,
      arousal: 0.7,
      keywords: /장난|놀리|비밀|내기|헤헤|ㅋ|tease|playful/i,
    },
    {
      type: 'sad',
      labelKo: '우울 · 지침',
      valence: -0.7,
      arousal: 0.25,
      keywords: /슬퍼|슬프|우울|지쳤|지쳐|힘들|힘드|외롭|외로|눈물|피곤|sad|tired|lonely/i,
    },
    {
      type: 'anxious',
      labelKo: '불안 · 걱정',
      valence: -0.45,
      arousal: 0.7,
      keywords: /불안|걱정|무서|어쩌지|초조|nervous|worried/i,
    },
    {
      type: 'frustrated',
      labelKo: '서운 · 답답',
      valence: -0.6,
      arousal: 0.75,
      keywords: /짜증|화나|서운|미워|싫어|답답|angry|upset/i,
    },
    {
      type: 'curiosity',
      labelKo: '호기심',
      valence: 0.35,
      arousal: 0.52,
      keywords: /왜|어때|무슨|궁금|뭐야|어디|언제|\?|curious|what|why/i,
    },
  ];

  for (const rule of patterns) {
    if (rule.keywords.test(lower)) {
      return {
        primary: rule.type,
        intensity: clamp(0.62 + energyBoost, 0.2, 1),
        valence: rule.valence,
        arousal: clamp(rule.arousal + energyBoost * 0.5, 0, 1),
        labelKo: rule.labelKo,
        cues: '실시간 발화 어휘 및 에너지 신호 감지',
      };
    }
  }

  if (acousticEnergy > 0.45) {
    return {
      primary: 'joy',
      intensity: clamp(0.55 + energyBoost, 0.2, 1),
      valence: 0.45,
      arousal: clamp(0.65 + energyBoost, 0, 1),
      labelKo: '활기참',
      cues: '음성 에너지 상승 감지',
    };
  }

  return {
    primary: 'neutral',
    intensity: 0.3,
    valence: 0.15,
    arousal: clamp(0.3 + energyBoost, 0, 1),
    labelKo: '차분함',
    cues: '안정적인 대화 톤',
  };
}

export interface ExpressionWeights {
  happy: number;
  sad: number;
  angry: number;
  relaxed: number;
  surprised: number;
  blush: number;
}

export function mapEmotionToExpressionWeights(
  npcEmotion: NpcEmotionType,
): ExpressionWeights {
  switch (npcEmotion) {
    case 'happy':
      return { happy: 0.85, sad: 0, angry: 0, relaxed: 0.2, surprised: 0, blush: 0.25 };
    case 'blush':
      return { happy: 0.45, sad: 0, angry: 0, relaxed: 0.1, surprised: 0.15, blush: 0.95 };
    case 'loving':
      return { happy: 0.72, sad: 0, angry: 0, relaxed: 0.45, surprised: 0, blush: 0.8 };
    case 'shy':
      return { happy: 0.3, sad: 0, angry: 0, relaxed: 0.05, surprised: 0.2, blush: 0.88 };
    case 'surprised':
      return { happy: 0.15, sad: 0, angry: 0, relaxed: 0, surprised: 0.9, blush: 0.2 };
    case 'sad':
      return { happy: 0, sad: 0.8, angry: 0, relaxed: 0, surprised: 0, blush: 0 };
    case 'concerned':
      return { happy: 0, sad: 0.45, angry: 0, relaxed: 0.15, surprised: 0.1, blush: 0.05 };
    case 'playful':
      return { happy: 0.78, sad: 0, angry: 0, relaxed: 0.25, surprised: 0.12, blush: 0.35 };
    default:
      return { happy: 0.2, sad: 0, angry: 0, relaxed: 0.65, surprised: 0, blush: 0.1 };
  }
}

export function defaultSomaStyleForEmotion(
  npcEmotion: NpcEmotionType,
): SomaMotionStyle {
  switch (npcEmotion) {
    case 'loving':
      return 'lean_affection';
    case 'blush':
    case 'shy':
      return 'shy_fidget';
    case 'happy':
    case 'playful':
      return 'happy_bounce';
    case 'surprised':
      return 'head_tilt_curious';
    case 'sad':
    case 'concerned':
      return 'comfort_reach';
    default:
      return 'idle_gentle';
  }
}

export interface GazeAngles {
  headYaw: number;
  headPitch: number;
  eyeYaw: number;
  eyePitch: number;
}

/**
 * Computes anatomically clamped head & eye yaw/pitch angles (radians)
 * from the avatar head position toward the user's real-time gaze target.
 */
export function computeGazeAngles(params: {
  headPos: { x: number; y: number; z: number };
  targetPos: { x: number; y: number; z: number };
  gazeMode: GazeMode;
  timeSec: number;
}): GazeAngles {
  const dx = params.targetPos.x - params.headPos.x;
  const dy = params.targetPos.y - params.headPos.y;
  const dz = Math.max(0.25, params.targetPos.z - params.headPos.z);

  let rawYaw = Math.atan2(dx, dz);
  let rawPitch = Math.atan2(dy, Math.hypot(dx, dz));

  // Subtle natural micro-saccade
  const microYaw = Math.sin(params.timeSec * 1.3) * 0.015;
  const microPitch = Math.cos(params.timeSec * 0.9) * 0.01;

  if (params.gazeMode === 'shy_avert') {
    rawYaw -= 0.24 + Math.sin(params.timeSec * 0.8) * 0.04;
    rawPitch -= 0.16;
  } else if (params.gazeMode === 'curious_tilt') {
    rawYaw += Math.sin(params.timeSec * 0.7) * 0.06;
    rawPitch += 0.05;
  }

  const headYaw = clamp(rawYaw * 0.62, -0.58, 0.58);
  const headPitch = clamp(rawPitch * 0.55, -0.35, 0.35);
  const eyeYaw = clamp(rawYaw - headYaw + microYaw, -0.32, 0.32);
  const eyePitch = clamp(rawPitch - headPitch + microPitch, -0.22, 0.22);

  return { headYaw, headPitch, eyeYaw, eyePitch };
}
