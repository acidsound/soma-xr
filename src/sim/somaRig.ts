import type { SomaMotionStyle } from '../types';

/**
 * Canonical 30-joint MotionBricks SOMA skeleton hierarchy.
 * Mirrors NVIDIA MotionBricks-SOMA-RP-v1 30-joint naming and ordering.
 */
export const SOMA_JOINT_NAMES = [
  'hips',
  'spine',
  'spine1',
  'spine2',
  'neck',
  'head',
  'leftEye',
  'rightEye',
  'leftShoulder',
  'leftUpperArm',
  'leftLowerArm',
  'leftHand',
  'leftHandThumb',
  'leftHandIndex',
  'rightShoulder',
  'rightUpperArm',
  'rightLowerArm',
  'rightHand',
  'rightHandThumb',
  'rightHandIndex',
  'leftUpperLeg',
  'leftLowerLeg',
  'leftFoot',
  'leftToes',
  'rightUpperLeg',
  'rightLowerLeg',
  'rightFoot',
  'rightToes',
  'jaw',
  'root',
] as const;

export type SomaJointName = (typeof SOMA_JOINT_NAMES)[number];

/**
 * Mapping from SOMA-30 joint names to @pixiv/three-vrm VRMHumanBoneName.
 */
export const SOMA_TO_VRM_BONE: Partial<Record<SomaJointName, string>> = {
  hips: 'hips',
  spine: 'spine',
  spine1: 'chest',
  spine2: 'upperChest',
  neck: 'neck',
  head: 'head',
  leftEye: 'leftEye',
  rightEye: 'rightEye',
  leftShoulder: 'leftShoulder',
  leftUpperArm: 'leftUpperArm',
  leftLowerArm: 'leftLowerArm',
  leftHand: 'leftHand',
  rightShoulder: 'rightShoulder',
  rightUpperArm: 'rightUpperArm',
  rightLowerArm: 'rightLowerArm',
  rightHand: 'rightHand',
  leftUpperLeg: 'leftUpperLeg',
  leftLowerLeg: 'leftLowerLeg',
  leftFoot: 'leftFoot',
  leftToes: 'leftToes',
  rightUpperLeg: 'rightUpperLeg',
  rightLowerLeg: 'rightLowerLeg',
  rightFoot: 'rightFoot',
  rightToes: 'rightToes',
};

export interface EulerPose {
  x: number;
  y: number;
  z: number;
}

export type SomaPoseFrame = Record<SomaJointName, EulerPose>;

export interface SomaSynthesisInput {
  style: SomaMotionStyle;
  timeSec: number;
  emotionIntensity: number; // 0..1
  affection: number; // 0..100
  speakingEnergy: number; // 0..1
  gestureBoost?: number; // 0..1 decaying trigger
}

export function createNeutralSomaPose(): SomaPoseFrame {
  const pose = {} as SomaPoseFrame;
  for (const joint of SOMA_JOINT_NAMES) {
    pose[joint] = { x: 0, y: 0, z: 0 };
  }
  return pose;
}

/**
 * Synthesizes a 30-joint SOMA pose frame (local XYZ Euler radians in standard
 * Three.js +Z-facing humanoid rest frame: left arm along +X, right arm along -X).
 *
 * Right-hand rule verification:
 * - leftUpperArm (+X): negative Z lowers arm toward -Y; negative Y swings arm forward (+Z).
 * - rightUpperArm (-X): positive Z lowers arm toward -Y; positive Y swings arm forward (+Z).
 * - spine/head: positive X leans/nods forward (+Z).
 */
export function synthesizeSoma30Pose(input: SomaSynthesisInput): SomaPoseFrame {
  const pose = createNeutralSomaPose();
  const t = input.timeSec;
  const amp = 0.6 + 0.4 * Math.max(0, Math.min(1, input.emotionIntensity));
  const aff = Math.max(0, Math.min(1, input.affection / 100));
  const breath = Math.sin(t * 1.85);
  const sway = Math.sin(t * 0.85);
  const speakPulse = Math.sin(t * 7.5) * input.speakingEnergy;

  // Base natural relaxed standing posture (arms comfortably at sides)
  pose.spine.x = breath * 0.022;
  pose.spine1.x = breath * 0.026;
  pose.hips.y = sway * 0.035;
  pose.hips.z = sway * 0.014;

  pose.leftUpperArm.z = -1.18 + breath * 0.02;
  pose.leftUpperArm.y = -0.1;
  pose.leftLowerArm.y = -0.28;
  pose.leftLowerArm.z = -0.06;

  pose.rightUpperArm.z = 1.18 - breath * 0.02;
  pose.rightUpperArm.y = 0.1;
  pose.rightLowerArm.y = 0.28;
  pose.rightLowerArm.z = 0.06;

  // Speaking chest & head cadence
  pose.spine2.x += speakPulse * 0.025;
  pose.head.x += speakPulse * 0.035;

  switch (input.style) {
    case 'wave_greet': {
      // Relaxed shoulder slightly forward/out, forearm raised gently near cheek level
      const wave = Math.sin(t * 4.8);
      pose.rightUpperArm.z = 0.28;
      pose.rightUpperArm.y = 0.44;
      pose.rightLowerArm.z = -1.72 + wave * 0.26 * amp;
      pose.rightLowerArm.y = 0.24;
      pose.rightHand.z = wave * 0.22;
      pose.spine1.z = -0.03;
      pose.head.z = 0.08;
      break;
    }

    case 'lean_affection': {
      const lean = 0.13 + aff * 0.08;
      pose.spine.x += lean * 0.5;
      pose.spine1.x += lean * 0.5;
      pose.head.x -= lean * 0.35;
      pose.head.z = 0.1 * amp;
      // Arms gently brought forward with warmth
      pose.leftUpperArm.z = -0.95;
      pose.leftUpperArm.y = -0.34;
      pose.leftLowerArm.y = -0.78;
      pose.leftLowerArm.z = 0.22;

      pose.rightUpperArm.z = 0.95;
      pose.rightUpperArm.y = 0.34;
      pose.rightLowerArm.y = 0.78;
      pose.rightLowerArm.z = -0.22;
      break;
    }

    case 'shy_fidget': {
      const fidget = Math.sin(t * 2.6);
      pose.hips.y += fidget * 0.06;
      pose.spine1.x += 0.06;
      pose.leftShoulder.z = -0.05;
      pose.rightShoulder.z = 0.05;
      // Hands clasped nervously in front
      pose.leftUpperArm.z = -1.04;
      pose.leftUpperArm.y = -0.38;
      pose.leftLowerArm.y = -0.88;
      pose.leftLowerArm.z = 0.28 + fidget * 0.05;

      pose.rightUpperArm.z = 1.04;
      pose.rightUpperArm.y = 0.38;
      pose.rightLowerArm.y = 0.88;
      pose.rightLowerArm.z = -0.28 - fidget * 0.05;

      pose.head.z = -0.1 * amp;
      pose.head.x += 0.08;
      break;
    }

    case 'happy_bounce': {
      const bounce = Math.abs(Math.sin(t * 4.0));
      pose.spine1.x -= bounce * 0.05 * amp;
      pose.hips.z = Math.sin(t * 2.0) * 0.045;
      pose.leftUpperArm.z = -0.86 + bounce * 0.18;
      pose.leftUpperArm.y = -0.24;
      pose.leftLowerArm.y = -0.58;

      pose.rightUpperArm.z = 0.86 - bounce * 0.18;
      pose.rightUpperArm.y = 0.24;
      pose.rightLowerArm.y = 0.58;
      pose.head.z = Math.sin(t * 2.0) * 0.09;
      break;
    }

    case 'nod_listen': {
      const nod = Math.sin(t * 3.4);
      pose.head.x += Math.max(0, nod) * 0.12 * amp;
      pose.spine1.x += 0.05;
      pose.rightUpperArm.z = 1.02;
      pose.rightUpperArm.y = 0.25;
      pose.rightLowerArm.y = 0.65;
      break;
    }

    case 'comfort_reach': {
      pose.spine.x += 0.1;
      pose.spine1.x += 0.08;
      pose.head.z = 0.11;
      // Gentle comforting forward reach with right hand
      pose.rightUpperArm.z = 0.62;
      pose.rightUpperArm.y = 0.58;
      pose.rightLowerArm.y = 0.38;
      pose.rightLowerArm.z = -0.15;
      pose.leftUpperArm.z = -1.12;
      pose.leftLowerArm.y = -0.3;
      break;
    }

    case 'head_tilt_curious': {
      pose.head.z = 0.2 * amp;
      pose.head.y = Math.sin(t * 1.1) * 0.08;
      pose.spine1.z = 0.04;
      pose.leftUpperArm.z = -1.04;
      pose.leftLowerArm.y = -0.52;
      pose.rightUpperArm.z = 1.08;
      pose.rightLowerArm.y = 0.32;
      break;
    }

    case 'idle_gentle':
    default: {
      pose.leftUpperArm.z += Math.sin(t * 0.9) * 0.025;
      pose.rightUpperArm.z -= Math.sin(t * 0.9) * 0.025;
      pose.head.z = Math.sin(t * 0.65) * 0.035;
      break;
    }
  }

  return pose;
}

/**
 * Converts a flat Float32Array output from a MotionBricks SOMA ONNX tensor
 * (expected [30, 3] Euler radians or [30, 6] 6D rotation)
 * into a normalized SomaPoseFrame.
 */
export function decodeSomaOnnxTensorToPose(
  data: Float32Array | number[],
): SomaPoseFrame {
  const pose = createNeutralSomaPose();
  const jointCount = SOMA_JOINT_NAMES.length;
  if (data.length >= jointCount * 6) {
    for (let i = 0; i < jointCount; i++) {
      const base = i * 6;
      const r00 = data[base];
      const r10 = data[base + 1];
      const r20 = data[base + 2];
      const r11 = data[base + 4];
      const r21 = data[base + 5];
      const name = SOMA_JOINT_NAMES[i];
      pose[name] = {
        x: Math.atan2(r21, r11) * 0.4 || 0,
        y: Math.atan2(-r20, Math.hypot(r00, r10)) * 0.4 || 0,
        z: Math.atan2(r10, r00) * 0.4 || 0,
      };
    }
    return pose;
  }

  if (data.length >= jointCount * 3) {
    for (let i = 0; i < jointCount; i++) {
      const base = i * 3;
      const name = SOMA_JOINT_NAMES[i];
      pose[name] = {
        x: Number.isFinite(data[base]) ? data[base] : 0,
        y: Number.isFinite(data[base + 1]) ? data[base + 1] : 0,
        z: Number.isFinite(data[base + 2]) ? data[base + 2] : 0,
      };
    }
  }
  return pose;
}
