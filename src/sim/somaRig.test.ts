import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SOMA_JOINT_NAMES,
  SOMA_TO_VRM_BONE,
  decodeSomaOnnxTensorToPose,
  synthesizeSoma30Pose,
} from './somaRig';

test('SOMA rig defines exactly 30 canonical joints mapped to VRM bones', () => {
  assert.equal(SOMA_JOINT_NAMES.length, 30);
  assert.equal(SOMA_TO_VRM_BONE.hips, 'hips');
  assert.equal(SOMA_TO_VRM_BONE.spine1, 'chest');
  assert.equal(SOMA_TO_VRM_BONE.head, 'head');
});

test('synthesizeSoma30Pose generates distinct poses for wave_greet vs lean_affection', () => {
  const wave = synthesizeSoma30Pose({
    style: 'wave_greet',
    timeSec: 1.2,
    emotionIntensity: 0.8,
    affection: 50,
    speakingEnergy: 0.5,
  });
  const lean = synthesizeSoma30Pose({
    style: 'lean_affection',
    timeSec: 1.2,
    emotionIntensity: 0.8,
    affection: 80,
    speakingEnergy: 0.2,
  });

  assert.ok(wave.rightUpperArm.z < lean.rightUpperArm.z);
  assert.ok(wave.rightLowerArm.z < -1.2);
  assert.ok(lean.spine.x > 0.05);
  assert.ok(Math.abs(wave.rightLowerArm.z - lean.rightLowerArm.z) > 0.5);
});

test('decodeSomaOnnxTensorToPose decodes 30x3 Euler and 30x6 6D rotation tensors safely', () => {
  const eulerData = new Float32Array(30 * 3);
  eulerData[5 * 3] = 0.25; // head x
  eulerData[5 * 3 + 1] = -0.3; // head y
  const eulerPose = decodeSomaOnnxTensorToPose(eulerData);
  assert.ok(Math.abs(eulerPose.head.x - 0.25) < 1e-5);
  assert.ok(Math.abs(eulerPose.head.y + 0.3) < 1e-5);

  const rot6dData = new Float32Array(30 * 6);
  // Identity-like 6D basis for joint 0
  rot6dData[0] = 1;
  rot6dData[4] = 1;
  const rot6dPose = decodeSomaOnnxTensorToPose(rot6dData);
  assert.equal(rot6dPose.hips.x, 0);
  assert.equal(rot6dPose.hips.y, 0);
});
