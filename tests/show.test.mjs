import test from 'node:test';
import assert from 'node:assert/strict';


import { energyAt, musicAt, crowdAt, burstKinds, correctParticles, celebrationParticles, finaleParticles, gainEnergy } from '../js/choreography.js';
import { questionSeconds, countdown } from '../js/timer.js';
import { TYPES, ROUND_SIZE } from '../js/course.js';

function recorders() {
  const calls = [];
  const layer = (name) => Object.fromEntries(['burst', 'ring', 'streamers', 'rain', 'fireworks'].map((method) => [method, (...args) => calls.push([name, method, ...args])]));
  return { calls, fx: layer('front'), fxBack: layer('back') };
}
const normalize = (value) => JSON.parse(JSON.stringify(value));

test('correct-answer bursts retain paper weights instead of diluting them with bubbles', () => {
  assert.deepEqual(burstKinds(1), ['confetti', 'star', 'spark', 'spark', 'coin', 'mini', 'heart']);
  const { calls, fx, fxBack } = recorders();
  correctParticles(fx, fxBack, 1, 20, 30);
  assert.equal(calls[0][4].count, 28);
  assert.deepEqual(calls[0][4].kinds, ['confetti', 'star', 'spark', 'spark', 'heart']);
  assert.equal(calls[1][0], 'back');
});

test('finale has the original opening and closing waves', () => {
  const { calls, fx, fxBack } = recorders();
  finaleParticles(fx, fxBack, 390, 844);
  finaleParticles(fx, fxBack, 390, 844, true);
  assert.deepEqual(calls.map((x) => [x[0], x[1], x[4]?.count ?? x[4]]), [
    ['back', 'fireworks', 10], ['front', 'streamers', 12], ['back', 'rain', { kinds: ['confetti', 'confetti', 'mini', 'star', 'coin'] }],
    ['front', 'burst', 70], ['back', 'fireworks', 6], ['front', 'fireworks', 3],
  ]);
});

test('show and music grow with round progress, independently of question difficulty', () => {
  assert.equal(energyAt(0, 8), .08); assert.equal(energyAt(7, 8), 1); assert.equal(energyAt(0, 1), 1);
  assert.deepEqual([.44, .45, .67, .68, .87, .88].map(crowdAt), [1, 2, 2, 3, 3, 5]);
  assert.deepEqual(musicAt(1), { level: 10, bpm: 128 });
  let L = 0;
  for (let qi = 0; qi < 8; qi++) for (let step = 0; step < 2; step++) {
    const next = gainEnergy(L, qi, step, 2, 8, qi * 2 + step + 1); assert.ok(next > L); L = next;
  }
  assert.ok(L > 3, 'long unbroken combo passes the 1000 milestone');
});

test('每题时限由题型决定：材料题留足读材料的时间，缺省回落到 40 秒', () => {
  assert.deepEqual(TYPES.map((type) => questionSeconds(type)), TYPES.map((type) => type.seconds));
  assert.deepEqual(TYPES.map((type) => questionSeconds(type)), [40, 35, 45, 70]);
  assert.equal(questionSeconds({ seconds: 15 }), 15, '题型可以自带时限');
  assert.equal(questionSeconds(undefined), 40);
  assert.equal(questionSeconds({}), 40);
  assert.ok(ROUND_SIZE >= 5);
});

test('countdown spends real elapsed thinking time only, never resets between blanks', () => {
  assert.equal(countdown(20000, 2500, true), 17500);
  for (const label of ['bubble flight', 'explanation', 'settings', 'background', 'finale']) assert.equal(countdown(17500, 4000, false), 17500, label);
  assert.equal(countdown(17500, 1200, true), 16300);
  assert.equal(countdown(150, 4000, true), 0);
  assert.equal(countdown(150, -1, true), 150);
});

