export type UserEmotionType =
  | 'joy'
  | 'affection'
  | 'curiosity'
  | 'shy'
  | 'sad'
  | 'anxious'
  | 'frustrated'
  | 'playful'
  | 'neutral';

export type NpcEmotionType =
  | 'happy'
  | 'blush'
  | 'loving'
  | 'shy'
  | 'surprised'
  | 'sad'
  | 'concerned'
  | 'playful'
  | 'calm';

export type SomaMotionStyle =
  | 'idle_gentle'
  | 'wave_greet'
  | 'lean_affection'
  | 'shy_fidget'
  | 'happy_bounce'
  | 'nod_listen'
  | 'comfort_reach'
  | 'head_tilt_curious';

export type PlaygroundObjectId =
  | 'slide'
  | 'swing'
  | 'seesaw'
  | 'bench'
  | 'vault_box_1'
  | 'vault_box_2'
  | 'vault_box_3'
  | 'soccer_ball'
  | 'basketball'
  | 'sandbox';

export type PlaygroundCommandType =
  | 'none'
  | 'move_to'
  | 'sit_bench'
  | 'vault_bench'
  | 'sit_seesaw'
  | 'vault_seesaw'
  | 'ride_slide'
  | 'ride_swing'
  | 'vault_box_1'
  | 'vault_box_2'
  | 'vault_box_3'
  | 'vault_boxes_all'
  | 'kick_soccer'
  | 'kick_basketball'
  | 'throw_basketball'
  | 'play_sandbox'
  | 'stand_up';

export interface PlaygroundCommand {
  type: PlaygroundCommandType;
  targetX?: number;
  targetZ?: number;
  run?: boolean;
  labelKo?: string;
}

export type PlaygroundAvatarActivity =
  | 'idle'
  | 'walk'
  | 'run'
  | 'sit_bench'
  | 'vault_bench'
  | 'sit_seesaw'
  | 'vault_seesaw'
  | 'sit_swing'
  | 'vault_box'
  | 'climb_slide'
  | 'slide_down'
  | 'kick_ball'
  | 'pickup_ball'
  | 'throw_ball'
  | 'play_sandbox'
  | 'stand_up';

export type GazeMode = 'lock_eyes' | 'shy_avert' | 'curious_tilt';

export type RelationshipStage =
  | '낯선 만남'
  | '설레는 호감'
  | '깊어지는 마음'
  | '연인';

export interface UserEmotionAnalysis {
  primary: UserEmotionType;
  intensity: number;
  valence: number;
  arousal: number;
  labelKo: string;
  cues: string;
}

export interface RelationshipState {
  affection: number;
  trust: number;
  mood: number;
  stage: RelationshipStage;
  turnCount: number;
  lastUserEmotion: UserEmotionAnalysis;
  lastNpcEmotion: NpcEmotionType;
  innerThought: string;
}

export interface PersonaProfile {
  id: string;
  name: string;
  role: string;
  voiceName: 'Kore' | 'Zephyr' | 'Puck';
  personality: string;
  speakingStyle: string;
  greeting: string;
  palette: {
    hair: number;
    eyes: number;
    outfitPrimary: number;
    outfitAccent: number;
    ribbon: number;
    skin: number;
  };
}

export interface ChatTurn {
  role: 'user' | 'npc';
  text: string;
  emotionLabel?: string;
  timestamp: number;
}

export interface NpcRespondPayload {
  userEmotion: UserEmotionAnalysis;
  npcReply: string;
  npcEmotion: NpcEmotionType;
  somaMotionStyle: SomaMotionStyle;
  gazeMode: GazeMode;
  affectionDelta: number;
  trustDelta: number;
  moodDelta: number;
  innerThought: string;
  suggestedChoices: string[];
  playgroundCommand?: PlaygroundCommandType;
}

export interface SomaRuntimeStatus {
  mode: 'soma77-runtime' | 'procedural-soma30' | 'onnx-webgpu' | 'onnx-wasm';
  modelName: string;
  jointCount: number;
  inferenceMs: number;
  activeStyle: SomaMotionStyle;
  activeClip: string;
  liveOnnxReady: boolean;
  liveOnnxLoading?: boolean;
  liveOnnxProgress?: string;
}

export interface AvatarRuntimeStatus {
  kind: 'builtin-vrm-rig' | 'external-vrm';
  name: string;
  lookAtActive: boolean;
}
