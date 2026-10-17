import test from 'node:test';
import assert from 'node:assert/strict';
import { TROPHIES, extractTrophyMetrics, evaluateTrophies, getEarnedTrophiesCount } from '../js/trophies.js';
import { ROUND_SIZE, REVIEW_SIZE, TYPES, ALL_QUESTIONS } from '../js/course.js';

test('trophies: definitions have valid fields and positive thresholds', () => {
  assert.ok(TROPHIES.length >= 20, 'Should have at least 20 trophies');
  for (const t of TROPHIES) {
    assert.ok(t.id, 'Trophy must have id');
    assert.ok(t.name, 'Trophy must have name');
    assert.ok(t.desc, 'Trophy must have desc');
    assert.ok(t.rank, 'Trophy must have rank');
    assert.ok(t.metric, 'Trophy must have metric');
    assert.ok(t.need > 0, 'Trophy threshold must be > 0');
  }
});

test('trophies: evaluation awards new trophies accurately without duplication', () => {
  const trophyState = { got: {} };
  const fakeSave = {
    streak: 7,
    learned: Array.from({ length: 35 }, (_, i) => `id-${i}`),
    daysPlayed: 10,
    stats: {
      maxCombo: 8,
      perfects: 2,
      problems: 60,
      reviewSolved: 5,
      flags: { firstPlay: true },
    },
  };

  const metrics = extractTrophyMetrics(fakeSave);
  assert.equal(metrics.streak, 7);
  assert.equal(metrics.learnedCount, 35);
  assert.equal(metrics.maxCombo, 8);
  assert.equal(metrics['flag:firstPlay'], 1);

  const newlyEarned = evaluateTrophies(trophyState, metrics);
  assert.ok(newlyEarned.length > 0, 'Should earn initial trophies');
  assert.ok(trophyState.got['streak-3']);
  assert.ok(trophyState.got['streak-7']);
  assert.equal(trophyState.got['streak-14'], undefined);
  assert.ok(trophyState.got['combo-5']);
  assert.equal(trophyState.got['combo-10'], undefined);
  assert.ok(trophyState.got['secret-first']);

  const count = getEarnedTrophiesCount(trophyState);
  assert.equal(count, newlyEarned.length);

  // Second evaluation with same metrics should award 0 new trophies
  const second = evaluateTrophies(trophyState, metrics);
  assert.equal(second.length, 0);
  assert.equal(getEarnedTrophiesCount(trophyState), count);
});

test('奖杯门槛与留存目标一致，每条连击都够得到', () => {
  assert.equal(TROPHIES.length, 32);
  for (const [series, expected] of Object.entries({ combo: [3, 4, 5], perfect: [1, 3, 10], problems: [50, 150, 300, 500], review: [1, 5, 15] })) {
    assert.deepEqual(TROPHIES.filter(t => t.series === series).map(t => t.need), expected);
  }
  // 一轮 5 题、错题重练一轮 10 题：最高连击要够得到最高的连击奖杯。
  const maxCombo = Math.max(ROUND_SIZE, REVIEW_SIZE);
  const comboNeeds = TROPHIES.filter(t => t.series === 'combo').map(t => t.need);
  assert.ok(comboNeeds.every(t => t <= ROUND_SIZE), `连击门槛 ${comboNeeds} 超出单轮题量 ${ROUND_SIZE}`);
  // 其余门槛不能超过题库总量，否则永远拿不到。
  assert.ok(TROPHIES.every(t => t.need <= ALL_QUESTIONS.length), '奖杯门槛不能超过题目总数');
  // 三种全对/连击类门槛靠一轮就能推进，学习量类门槛要玩很多轮。
  assert.ok(ROUND_SIZE === 5);
});

test('每个奇遇彩蛋都挂在一个真实存在的标记上', () => {
  const secrets = TROPHIES.filter(t => t.series === 'secret');
  assert.deepEqual(secrets.map(t => t.metric).sort(), [
    'flag:advanced', 'flag:energy', 'flag:firstPlay', 'flag:hammerUsed',
    'flag:night', 'flag:speedy', 'flag:weekend',
  ]);
  for (const t of secrets) assert.ok(t.desc.length > 6, `${t.id} 缺少说明`);
  assert.equal(TYPES.length, 4, '「更上一层」依赖四种题型');
});

test('old award records are preserved but never inflate the current trophy count', () => {
  const state = { got: { 'combo-15': 1, 'combo-25': 2, 'secret-first': 3 } };
  evaluateTrophies(state, { maxCombo: 7 }, 4);
  assert.equal(state.got['combo-15'], 1, '旧目录的门槛记录要留着');
  assert.equal(state.got['combo-25'], 2);
  assert.equal(state.got['combo-5'], 4, '现目录的门槛照常发放');
  assert.equal(getEarnedTrophiesCount(state), 4, '旧记录不计入当前奖杯数');
});

