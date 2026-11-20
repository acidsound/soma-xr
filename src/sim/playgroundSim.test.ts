import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  PLAYGROUND_LAYOUT,
  PlaygroundSimulation,
  parsePlaygroundCommand,
  segmentIntersectsBox2D,
} from './playgroundSim.ts';

describe('playgroundSim', () => {
  it('parses Korean and English playground directives accurately', () => {
    assert.equal(parsePlaygroundCommand('벤치에 앉아서 쉬자')?.type, 'sit_bench');
    assert.equal(parsePlaygroundCommand('벤치 타넘고 지나가 봐!')?.type, 'vault_bench');
    assert.equal(parsePlaygroundCommand('시소 타자!')?.type, 'sit_seesaw');
    assert.equal(parsePlaygroundCommand('시소 훌쩍 넘어봐')?.type, 'vault_seesaw');
    assert.equal(parsePlaygroundCommand('미끄럼틀 타 줘')?.type, 'ride_slide');
    assert.equal(parsePlaygroundCommand('그네 타자!')?.type, 'ride_swing');
    assert.equal(parsePlaygroundCommand('1단 뜀틀 뛰어봐')?.type, 'vault_box_1');
    assert.equal(parsePlaygroundCommand('2단 뜀틀 넘어봐')?.type, 'vault_box_2');
    assert.equal(parsePlaygroundCommand('3단만 뜀틀 뛰어봐')?.type, 'vault_box_3');
    assert.equal(parsePlaygroundCommand('3단 뜀틀 순서대로 뛰어넘어 봐')?.type, 'vault_boxes_all');
    assert.equal(parsePlaygroundCommand('축구공 세게 차 봐!')?.type, 'kick_soccer');
    assert.equal(parsePlaygroundCommand('농구공 주워서 던져줘')?.type, 'throw_basketball');
    assert.equal(parsePlaygroundCommand('모래놀이터 샌드박스에서 놀자')?.type, 'play_sandbox');
    assert.equal(parsePlaygroundCommand('일어나')?.type, 'stand_up');
    assert.equal(parsePlaygroundCommand('오늘 날씨 참 좋다'), null);
  });

  it('detects 2D line-box intersection for automatic vaulting', () => {
    const b = PLAYGROUND_LAYOUT.bench;
    assert.equal(segmentIntersectsBox2D(0, b.z, b.x - 1.5, b.z, b.x, b.z, 0.4, 1.0), true);
    assert.equal(segmentIntersectsBox2D(0, 0, 1, 0, b.x, b.z, 0.4, 1.0), false);
  });

  it('sits on the calibrated bench and vaults over the bench cleanly', () => {
    const sim = new PlaygroundSimulation();
    sim.issueCommand({ type: 'sit_bench' });
    let snap = sim.getSnapshot();
    for (let i = 0; i < 360; i++) {
      snap = sim.step(1 / 60);
    }
    assert.equal(snap.avatar.activity, 'sit_bench');
    assert.equal(PLAYGROUND_LAYOUT.bench.seatHeight, 0.36, 'Bench top should match seated thigh height');
    assert.equal(snap.avatar.y, 0, 'Seated avatar feet should rest cleanly at ground y=0');
    assert.ok(Math.abs(snap.avatar.x - PLAYGROUND_LAYOUT.bench.seatPos.x) < 0.35);

    // Now vault over the bench
    sim.issueCommand({ type: 'vault_bench' });
    let sawVaultArc = false;
    for (let i = 0; i < 240; i++) {
      snap = sim.step(1 / 60);
      if (snap.avatar.activity === 'vault_bench' && snap.avatar.y > 0.35) {
        sawVaultArc = true;
      }
    }
    assert.equal(sawVaultArc, true, 'Avatar should arc upward when vaulting bench');
    assert.equal(snap.avatar.y, 0, 'Avatar should land back at ground y=0');
  });

  it('sits on the calibrated seesaw with thighs locked flush to moving seat height', () => {
    const sim = new PlaygroundSimulation();
    sim.issueCommand({ type: 'sit_seesaw' });
    let snap = sim.getSnapshot();
    let minSeatedY = Infinity;
    let maxSeatedY = -Infinity;
    for (let i = 0; i < 600; i++) {
      snap = sim.step(1 / 60);
      if (snap.avatar.activity === 'sit_seesaw' && snap.avatar.phase >= 1) {
        minSeatedY = Math.min(minSeatedY, snap.avatar.y);
        maxSeatedY = Math.max(maxSeatedY, snap.avatar.y);
      }
    }
    assert.equal(snap.avatar.activity, 'sit_seesaw');
    assert.ok(minSeatedY >= 0 && minSeatedY < 0.06, `Lowest seesaw seated Y should touch ground, got ${minSeatedY}`);
    assert.ok(maxSeatedY > 0.2, `Highest seesaw seated Y should lift smoothly, got ${maxSeatedY}`);
  });

  it('rides the swing with pendulum oscillation and synced seat position', () => {
    const sim = new PlaygroundSimulation();
    sim.issueCommand({ type: 'ride_swing' });
    let snap = sim.getSnapshot();
    let minAngle = Infinity;
    let maxAngle = -Infinity;
    for (let i = 0; i < 720; i++) {
      snap = sim.step(1 / 60);
      if (snap.avatar.activity === 'sit_swing') {
        minAngle = Math.min(minAngle, snap.swingAngle);
        maxAngle = Math.max(maxAngle, snap.swingAngle);
      }
    }
    assert.equal(snap.avatar.activity, 'sit_swing');
    assert.ok(maxAngle > 0.25, `Swing should swing forward (+Z), maxAngle=${maxAngle}`);
    assert.ok(minAngle < -0.25, `Swing should swing backward (-Z), minAngle=${minAngle}`);
    assert.ok(snap.avatar.y >= 0.02, 'Seated avatar on swing should hang above ground');
  });

  it('vaults 1단 -> 2단 -> 3단 vaulting boxes sequentially in ascending height order', () => {
    const sim = new PlaygroundSimulation();
    const [box1, box2, box3] = PLAYGROUND_LAYOUT.vaultBoxes;
    assert.ok(box1.x < box2.x && box2.x < box3.x, 'Vault boxes must be ordered 1단 -> 2단 -> 3단');
    assert.ok(box1.height < box2.height && box2.height < box3.height, 'Heights must ascend 1단 < 2단 < 3단');

    sim.issueCommand({ type: 'vault_boxes_all' });
    let snap = sim.getSnapshot();
    let maxYBox1 = 0;
    let maxYBox2 = 0;
    let maxYBox3 = 0;
    for (let i = 0; i < 650; i++) {
      snap = sim.step(1 / 60);
      if (snap.avatar.activity === 'vault_box') {
        if (Math.abs(snap.avatar.x - box1.x) < 0.45) maxYBox1 = Math.max(maxYBox1, snap.avatar.y);
        if (Math.abs(snap.avatar.x - box2.x) < 0.45) maxYBox2 = Math.max(maxYBox2, snap.avatar.y);
        if (Math.abs(snap.avatar.x - box3.x) < 0.45) maxYBox3 = Math.max(maxYBox3, snap.avatar.y);
      }
    }
    assert.ok(maxYBox1 > box1.height, `Should clear 1단 (${box1.height}m), got ${maxYBox1}`);
    assert.ok(maxYBox2 > maxYBox1, `2단 apex (${maxYBox2}) should exceed 1단 (${maxYBox1})`);
    assert.ok(maxYBox3 > maxYBox2, `3단 apex (${maxYBox3}) should exceed 2단 (${maxYBox2})`);
    assert.ok(snap.avatar.x > box3.x + 0.5, 'Avatar should finish past 3단 vaulting box');
    assert.equal(snap.avatar.y, 0, 'Avatar should land grounded after 3단 vaulting box');
  });

  it('kicks soccer ball and basketball with rolling & bounce physics', () => {
    const sim = new PlaygroundSimulation();
    const initialSoccer = sim.getSnapshot().soccerBall;
    sim.issueCommand({ type: 'kick_soccer' });

    let maxSoccerSpeed = 0;
    let snap = sim.getSnapshot();
    for (let i = 0; i < 220; i++) {
      snap = sim.step(1 / 60);
      maxSoccerSpeed = Math.max(
        maxSoccerSpeed,
        Math.hypot(snap.soccerBall.vx, snap.soccerBall.vz),
      );
    }
    assert.ok(snap.soccerBall.kickCount >= 1, 'Soccer ball kickCount should increment');
    assert.ok(maxSoccerSpeed > 3.0, 'Soccer ball should gain significant kick velocity');
    assert.ok(
      Math.hypot(snap.soccerBall.x - initialSoccer.x, snap.soccerBall.z - initialSoccer.z) > 0.6,
      'Soccer ball should travel across the playground',
    );

    // Basketball pickup-by-hand & throw test
    const initialBasket = sim.getSnapshot().basketball;
    sim.issueCommand({ type: 'throw_basketball' });
    let sawPickup = false;
    let sawHeld = false;
    let sawThrow = false;
    let maxBasketHeight = 0;
    for (let i = 0; i < 320; i++) {
      snap = sim.step(1 / 60);
      if (snap.avatar.activity === 'pickup_ball') sawPickup = true;
      if (snap.basketball.heldByAvatar && snap.basketball.y > 0.85) sawHeld = true;
      if (snap.avatar.activity === 'throw_ball') sawThrow = true;
      maxBasketHeight = Math.max(maxBasketHeight, snap.basketball.y);
    }
    assert.equal(sawPickup, true, 'Avatar should bend and pick up the basketball');
    assert.equal(sawHeld, true, 'Basketball should be held & lifted in avatar hands');
    assert.equal(sawThrow, true, 'Avatar should execute throw_ball motion');
    assert.equal(snap.basketball.heldByAvatar, false, 'Basketball should be released after throw');
    assert.ok(snap.basketball.kickCount >= 1, 'Basketball throw count should increment');
    assert.ok(maxBasketHeight > 1.8, 'Thrown basketball should arc high through the air');
    assert.ok(
      Math.hypot(snap.basketball.x - initialBasket.x, snap.basketball.z - initialBasket.z) > 0.8,
      'Thrown basketball should travel across the playground',
    );
  });

  it('climbs and slides down the playground slide', () => {
    const sim = new PlaygroundSimulation();
    sim.issueCommand({ type: 'ride_slide' });

    let sawClimb = false;
    let sawSlideDown = false;
    let maxY = 0;
    let snap = sim.getSnapshot();
    for (let i = 0; i < 560; i++) {
      snap = sim.step(1 / 60);
      if (snap.avatar.activity === 'climb_slide') sawClimb = true;
      if (snap.avatar.activity === 'slide_down') sawSlideDown = true;
      maxY = Math.max(maxY, snap.avatar.y);
    }
    assert.equal(sawClimb, true, 'Avatar should climb the slide stairs');
    assert.equal(sawSlideDown, true, 'Avatar should slide down the chute');
    assert.ok(maxY > 1.2, 'Avatar should reach top platform height');
    assert.equal(snap.avatar.y, 0, 'Avatar should finish grounded');
  });

  it('automatically vaults over the bench when clicking past it', () => {
    const sim = new PlaygroundSimulation();
    const b = PLAYGROUND_LAYOUT.bench;
    const destX = b.x - 1.7;
    sim.issueCommand({ type: 'move_to', targetX: destX, targetZ: b.z });
    let sawAutoVault = false;
    let snap = sim.getSnapshot();
    for (let i = 0; i < 420; i++) {
      snap = sim.step(1 / 60);
      if (snap.avatar.activity === 'vault_bench') sawAutoVault = true;
    }
    assert.equal(sawAutoVault, true, 'Walking across bench should auto-vault');
    assert.ok(Math.abs(snap.avatar.x - destX) < 0.3, 'Avatar should reach final destination after vault');
  });

  it('mirrors SOMA-77 walk poses accurately in world space without inverting limbs', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const {
      SomaSkeleton,
      Soma77MotionSequencer,
      poseToFlat,
      mirrorPoseWorld,
    } = await import('../soma/motionBricksRuntime.ts');

    const somaJson = JSON.parse(
      fs.readFileSync(
        path.resolve('public/runtime_data/soma_runtime.json'),
        'utf8',
      ),
    );
    const sk = new SomaSkeleton(somaJson);
    const refW = sk.world(sk.reference);
    const walkFrames = somaJson.styles
      .find((s: { id: string }) => s.id === 'walk')
      .window.map((f: number[][]) => sk.normalizeToLocalFrame(poseToFlat(f)));

    const mirrorMap = new Int32Array(sk.J);
    for (let j = 0; j < sk.J; j++) {
      const name = sk.names[j];
      const mir = name.startsWith('Left')
        ? 'Right' + name.slice(4)
        : name.startsWith('Right')
          ? 'Left' + name.slice(5)
          : name;
      const idx = sk.index(mir);
      mirrorMap[j] = idx >= 0 ? idx : j;
    }

    const origW = sk.world(walkFrames[0]);
    const mirW = sk.world(mirrorPoseWorld(sk, refW, mirrorMap, walkFrames[0]));
    const lf = sk.index('LeftFoot');
    const rf = sk.index('RightFoot');
    const lk = sk.index('LeftShin');
    const rk = sk.index('RightShin');

    assert.ok(Math.abs(origW[lf].p[0] + mirW[rf].p[0]) < 1e-3, 'Mirrored foot X should negate');
    assert.ok(Math.abs(origW[lf].p[1] - mirW[rf].p[1]) < 1e-3, 'Mirrored foot Y should match');
    assert.ok(Math.abs(origW[lf].p[2] - mirW[rf].p[2]) < 1e-3, 'Mirrored foot Z should match');
    assert.ok(Math.abs(origW[rk].p[2] - mirW[lk].p[2]) < 1e-3, 'Mirrored knee Z should match');

    const seq = new Soma77MotionSequencer({
      skeleton: sk,
      styles: {
        idle: { id: 'idle', label: 'idle', speed: 0, frames: [sk.reference] },
        walk: { id: 'walk', label: 'walk', speed: 1.06, frames: walkFrames },
      },
      prims: {},
      actions: {},
    });

    // Sample full walk cycle across 20 steps; ensure hips stay upright and legs never invert
    for (let step = 0; step < 30; step++) {
      const pose = seq.sampleActivityPose({
        activity: 'walk',
        phase: 0,
        timeSec: step * 0.05,
        dt: 0.05,
      });
      const w = sk.world(pose);
      assert.ok(w[0].p[1] > 0.85, `Hips Y collapsed at step ${step}: ${w[0].p[1]}`);
      assert.ok(w[lf].p[1] > 0.02 && w[lf].p[1] < 0.45, `LeftFoot Y out of range: ${w[lf].p[1]}`);
      assert.ok(w[rf].p[1] > 0.02 && w[rf].p[1] < 0.45, `RightFoot Y out of range: ${w[rf].p[1]}`);
      assert.ok(w[lk].p[1] > w[lf].p[1] + 0.12, 'Left knee should stay above left foot');
      assert.ok(w[rk].p[1] > w[rf].p[1] + 0.12, 'Right knee should stay above right foot');
    }
  });
});
