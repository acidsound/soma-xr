import type {
  PersonaProfile,
  PlaygroundCommandType,
  RelationshipState,
  SomaMotionStyle,
} from './types';

export const DEFAULT_VRM_URL = `${import.meta.env.BASE_URL}assets/vrm/mech_girl.vrm`;

export const MOTIONBRICKS_R2_ONNX_URL =
  'https://pub-360a7e233de942c5bfcb52d8623e38f2.r2.dev/mmm_v6_soma_q8h.onnx';

export const PERSONAS: PersonaProfile[] = [
  {
    id: 'seoyeon',
    name: '서연',
    role: '놀이터 산책 메이트',
    voiceName: 'Kore',
    personality:
      '따뜻하고 활발하며, 놀이터에서 함께 뛰어놀고 벤치에 앉아 대화하며 상대의 감정을 섬세하게 헤아려 주는 성격.',
    speakingStyle:
      '차분하고 다정한 해요체. 놀이터 놀이 중에는 생기 있고 장난스러운 말투가 자연스럽게 섞임.',
    greeting:
      '안녕! 오늘 놀이터 날씨가 정말 좋다. 바닥이나 기구를 클릭하거나 말로 지시해 주면 내가 직접 움직여 볼게!',
    palette: {
      hair: 0x3b2a3c,
      eyes: 0x7c5cff,
      outfitPrimary: 0x30263b,
      outfitAccent: 0xf4a6b8,
      ribbon: 0xff6b8b,
      skin: 0xffe4d6,
    },
  },
  {
    id: 'haru',
    name: '하루',
    role: '호기심 많은 운동 파트너',
    voiceName: 'Zephyr',
    personality:
      '호기심이 많고 솔직하며, 축구공 차기나 벤치 타넘기 같은 활동적인 모션을 즐길 때 눈을 반짝이는 순수한 성격.',
    speakingStyle:
      '또렷하고 설렘이 묻어나는 말투. 진심이 담긴 칭찬에는 귀까지 빨개지며 수줍어함.',
    greeting:
      '왔구나! 저기 축구공이랑 미끄럼틀 보이지? 먼저 뭐부터 같이 해볼까?',
    palette: {
      hair: 0x263859,
      eyes: 0x38bdf8,
      outfitPrimary: 0x1e293b,
      outfitAccent: 0x93c5fd,
      ribbon: 0x60a5fa,
      skin: 0xffe8dc,
    },
  },
  {
    id: 'yuna',
    name: '유나',
    role: '노을 공원 플로리스트',
    voiceName: 'Puck',
    personality:
      '장난기 넘치고 밝은 에너지로 시소나 모래놀이를 즐기지만, 상대가 지쳐 보일 땐 벤치 옆에서 깊이 위로해 주는 성격.',
    speakingStyle:
      '통통 튀고 다정한 구어체. 가벼운 장난과 따뜻한 위로를 자연스럽게 오감.',
    greeting:
      '짜잔~ 놀이터 도착! 시소도 타고 농구공도 차면서 오늘 스트레스 다 날려버리자!',
    palette: {
      hair: 0x8b453a,
      eyes: 0x34d399,
      outfitPrimary: 0x2d3a36,
      outfitAccent: 0xfde68a,
      ribbon: 0xf59e0b,
      skin: 0xffe2d1,
    },
  },
];

export const INITIAL_RELATIONSHIP: RelationshipState = {
  affection: 32,
  trust: 28,
  mood: 72,
  stage: '낯선 만남',
  turnCount: 0,
  lastUserEmotion: {
    primary: 'neutral',
    intensity: 0.3,
    valence: 0.25,
    arousal: 0.35,
    labelKo: '평온',
    cues: '놀이터에서 대화를 시작하는 중',
  },
  lastNpcEmotion: 'happy',
  innerThought: '오늘 놀이터에서 어떤 걸 같이 해볼까 기대돼.',
};

export const SOMA_STYLE_LABELS: Record<SomaMotionStyle, string> = {
  idle_gentle: '자연스러운 호흡',
  wave_greet: '손 흔들며 인사',
  lean_affection: '다정하게 다가가기',
  shy_fidget: '수줍은 몸짓',
  happy_bounce: '기쁜 리듬',
  nod_listen: '경청하며 끄덕임',
  comfort_reach: '위로의 손길',
  head_tilt_curious: '호기심 고개 갸웃',
};

export const PLAYGROUND_QUICK_COMMANDS: Array<{
  command: PlaygroundCommandType;
  label: string;
  prompt: string;
}> = [
  { command: 'sit_bench', label: '벤치 앉기', prompt: '벤치에 앉아서 잠깐 쉬자' },
  { command: 'vault_bench', label: '벤치 타넘기', prompt: '벤치를 타넘고 지나가 봐!' },
  { command: 'sit_seesaw', label: '시소 타기', prompt: '시소에 앉아서 같이 타자!' },
  { command: 'vault_seesaw', label: '시소 타넘기', prompt: '시소를 훌쩍 타넘어 봐!' },
  { command: 'ride_swing', label: '그네 타기', prompt: '그네에 앉아서 신나게 타 볼래?' },
  { command: 'vault_boxes_all', label: '3단 뜀틀', prompt: '1단, 2단, 3단 뜀틀을 순서대로 멋지게 뛰어넘어 봐!' },
  { command: 'ride_slide', label: '미끄럼틀 타기', prompt: '미끄럼틀 올라가서 내려와 봐!' },
  { command: 'kick_soccer', label: '축구공 차기', prompt: '저기 축구공 멋지게 차 줘!' },
  { command: 'throw_basketball', label: '농구공 던지기', prompt: '농구공을 손으로 주워서 저쪽으로 멋지게 던져 볼래?' },
  { command: 'play_sandbox', label: '샌드박스 놀이', prompt: '모래놀이터에서 같이 놀자!' },
];

export const DEFAULT_QUICK_CHOICES: string[] = [
  '그네 타면서 같이 바람 쐬자!',
  '1단, 2단, 3단 뜀틀 순서대로 뛰어넘어 봐!',
  '벤치에 앉아서 잠깐 얘기하자.',
];
