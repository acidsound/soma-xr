import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeLocalEmotionSignal,
  applyRelationshipDelta,
  computeGazeAngles,
  computeRelationshipStage,
  mapEmotionToExpressionWeights,
} from './romanceEngine';
import { INITIAL_RELATIONSHIP } from '../constants';

test('relationship stage progression thresholds', () => {
  assert.equal(computeRelationshipStage(20, 20), '낯선 만남');
  assert.equal(computeRelationshipStage(40, 35), '설레는 호감');
  assert.equal(computeRelationshipStage(62, 52), '깊어지는 마음');
  assert.equal(computeRelationshipStage(85, 75), '연인');
});

test('applyRelationshipDelta clamps values between 0 and 100 and increments turns', () => {
  const next = applyRelationshipDelta(INITIAL_RELATIONSHIP, {
    affectionDelta: 80,
    trustDelta: -40,
    moodDelta: 50,
    userEmotion: {
      primary: 'affection',
      intensity: 0.9,
      valence: 0.9,
      arousal: 0.7,
      labelKo: '설렘',
      cues: '다정한 표현',
    },
    npcEmotion: 'loving',
    innerThought: '기분이 좋아.',
  });

  assert.equal(next.affection, 100);
  assert.equal(next.trust, 0);
  assert.equal(next.mood, 100);
  assert.equal(next.turnCount, 1);
  assert.equal(next.lastNpcEmotion, 'loving');
});

test('local emotion analyzer detects affection, sadness, and curiosity', () => {
  const affection = analyzeLocalEmotionSignal('오늘 너랑 있어서 정말 설레고 좋아!');
  assert.equal(affection.primary, 'affection');
  assert.ok(affection.valence > 0.5);

  const sad = analyzeLocalEmotionSignal('요즘 너무 지치고 외로워.');
  assert.equal(sad.primary, 'sad');
  assert.ok(sad.valence < 0);

  const curious = analyzeLocalEmotionSignal('오늘 밤 별이 왜 이렇게 밝지?');
  assert.equal(curious.primary, 'curiosity');
});

test('mapEmotionToExpressionWeights sets blush high for blush/shy', () => {
  const blush = mapEmotionToExpressionWeights('blush');
  assert.ok(blush.blush >= 0.9);
  assert.ok(blush.happy > 0.3);
});

test('computeGazeAngles clamps angles and applies shy_avert offset', () => {
  const lock = computeGazeAngles({
    headPos: { x: 0, y: 1.45, z: 0 },
    targetPos: { x: 0.5, y: 1.6, z: 1.2 },
    gazeMode: 'lock_eyes',
    timeSec: 1.0,
  });
  const shy = computeGazeAngles({
    headPos: { x: 0, y: 1.45, z: 0 },
    targetPos: { x: 0.5, y: 1.6, z: 1.2 },
    gazeMode: 'shy_avert',
    timeSec: 1.0,
  });

  assert.ok(lock.headYaw > 0);
  assert.ok(Math.abs(lock.headYaw) <= 0.58);
  assert.ok(Math.abs(lock.eyeYaw) <= 0.32);
  assert.ok(shy.headYaw < lock.headYaw);
  assert.ok(shy.eyePitch < lock.eyePitch);
});
