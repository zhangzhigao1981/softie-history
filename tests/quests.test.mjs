import test from 'node:test';
import assert from 'node:assert/strict';
import { pickDailyQuests, ensureDailyQuests, feedQuestEvent, isAllQuestsDone, claimQuestReward, QUEST_MAP } from '../js/quests.js';

test('daily quests: generates 3 unique-metric quests (2 easy, 1 hard) deterministically', () => {
  const day1 = '2026-09-30';
  const q1 = pickDailyQuests(day1, { reviewCount: 5 });
  const q2 = pickDailyQuests(day1, { reviewCount: 5 });
  assert.deepEqual(q1, q2, 'Same date and context must return identical quests');
  assert.equal(q1.length, 3);

  const defs = q1.map((q) => QUEST_MAP[q.id]);
  assert.ok(defs.every(Boolean));
  const metrics = defs.map((d) => d.metric);
  assert.equal(new Set(metrics).size, 3, 'Metrics must be 3 distinct metrics');
  const tiers = defs.map((d) => d.tier);
  assert.equal(tiers.filter((t) => t === 'easy').length, 2, 'Must have 2 easy quests');
  assert.equal(tiers.filter((t) => t === 'hard').length, 1, 'Must have 1 hard quest');
});

test('daily quests: feedQuestEvent updates progress and marks completed', () => {
  const questState = {
    day: '2026-09-30',
    list: [
      { id: 'play1', goal: 1, prog: 0, done: false },
      { id: 'combo5', goal: 5, prog: 0, done: false },
      { id: 'first5', goal: 5, prog: 0, done: false },
    ],
    rewarded: false,
    doneDays: {},
  };

  // Solve with combo 3
  let done = feedQuestEvent(questState, { type: 'solve', firstTry: true, combo: 3 });
  assert.equal(done.length, 0);
  assert.equal(questState.list[1].prog, 3);
  assert.equal(questState.list[2].prog, 1);

  // Solve with combo 5
  done = feedQuestEvent(questState, { type: 'solve', firstTry: true, combo: 5 });
  assert.equal(done.length, 1);
  assert.equal(done[0].id, 'combo5');
  assert.equal(questState.list[1].done, true);

  // Finish round
  done = feedQuestEvent(questState, { type: 'round', score: 100, solved: 8, total: 8 });
  assert.equal(done.length, 1);
  assert.equal(done[0].id, 'play1');
  assert.equal(questState.list[0].done, true);

  assert.equal(isAllQuestsDone(questState), false); // first5 still needs 3

  feedQuestEvent(questState, { type: 'solve', firstTry: true });
  feedQuestEvent(questState, { type: 'solve', firstTry: true });
  done = feedQuestEvent(questState, { type: 'solve', firstTry: true });
  assert.equal(done.length, 1);
  assert.equal(done[0].id, 'first5');
  assert.equal(isAllQuestsDone(questState), true);

  // Claim reward
  assert.equal(claimQuestReward(questState), true);
  assert.equal(questState.rewarded, true);
  assert.equal(questState.doneDays['2026-09-30'], true);

  // Claiming again returns false
  assert.equal(claimQuestReward(questState), false);
});

test('daily quests：题型会作为盐值改变序列，选题永远落在已定义的委托里', () => {
  const days = Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);
  const choice = days.map(day => pickDailyQuests(day, { typeId: 'choice', reviewCount: 2 }));
  const material = days.map(day => pickDailyQuests(day, { typeId: 'material', reviewCount: 2 }));
  assert.notEqual(JSON.stringify(choice), JSON.stringify(material), '题型盐值必须改变序列');
  for (const batch of [choice, material]) {
    for (const quest of batch.flat()) {
      const def = QUEST_MAP[quest.id];
      assert.ok(def, `未知委托：${quest.id}`);
      assert.ok(def.text().length > 0);
    }
    assert.ok(batch.flat().every(q => q.goal > 0), '目标必须为正');
  }
  for (const day of days) {
    const list = pickDailyQuests(day, { typeId: 'choice', reviewCount: 0 });
    assert.equal(list.length, 3);
    assert.ok(list.every(q => QUEST_MAP[q.id].tier === 'easy' || QUEST_MAP[q.id].tier === 'hard'));
  }
});

