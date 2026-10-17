import test from 'node:test';
import assert from 'node:assert/strict';

import { dayKey, dayBefore, playedDays, currentStreak, bestStreak, hammerOffer, useHammer, freshSave, loadSave, persistSave, resetAllSaves, claimLogin, STICKERS, stickerOn, bonusState } from '../js/storage.js';
import { SAVE_KEY, SAVE_VERSION, UI_KEY } from '../js/course.js';
import { QUESTIONS } from './helpers/app-harness.mjs';

function memory(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    raw: map,
  };
}

test('dayKey 与 dayBefore 跨月、跨年都按本地日期对齐', () => {
  assert.equal(dayKey(new Date(2026, 8, 30)), '2026-09-30');
  assert.equal(dayKey(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(dayKey(dayBefore(new Date(2026, 9, 1))), '2026-09-30');
  assert.equal(dayKey(dayBefore(new Date(2026, 0, 1))), '2025-12-31');
  assert.equal(dayKey(dayBefore(new Date(2026, 2, 1), 2)), '2026-02-27');
});

test('currentStreak 从今天或昨天起算，补签能续上连击但不算一天', () => {
  const today = new Date(2026, 8, 30);
  const daily = [{ day: '2026-09-27' }, { day: '2026-09-28' }, { day: '2026-09-29' }];
  assert.equal(currentStreak(daily, {}, today), 3, '今天还没玩，从昨天往前推');
  assert.equal(currentStreak([...daily, { day: '2026-09-30' }], {}, today), 4, '今天也玩了就连上今天');
  assert.equal(currentStreak(daily, { '2026-09-30': true }, today), 3, '今天靠补签续上，但补签不算一天');
  assert.equal(currentStreak([{ day: '2026-09-27' }, { day: '2026-09-28' }], {}, today), 0, '昨天漏签直接断连');
  assert.equal(currentStreak([], {}, today), 0);
  assert.equal(playedDays(daily).size, 3);
});

test('bestStreak 取历史上最长的一段连续，补签只负责把两端接起来', () => {
  const history = [
    { day: '2026-09-01' }, { day: '2026-09-02' }, { day: '2026-09-03' },
    { day: '2026-09-20' }, { day: '2026-09-21' },
  ];
  assert.equal(bestStreak(history), 3);
  const bridged = [...history, { day: '2026-09-06' }, { day: '2026-09-07' }];
  assert.equal(bestStreak(bridged, { '2026-09-04': true, '2026-09-05': true }), 5);
  assert.equal(bestStreak([], {}), 0);
});

test('hammerOffer 只在有锤子、今天没玩、且缺口不超过存锤数时给出', () => {
  const today = new Date(2026, 8, 30);
  const history = [{ day: '2026-09-26' }];
  assert.equal(hammerOffer({ hammers: 2 }, history, today), null, '缺三天却只有两把锤子');
  assert.deepEqual(hammerOffer({ hammers: 3 }, history, today), {
    missed: ['2026-09-27', '2026-09-28', '2026-09-29'],
    hammersNeeded: 3,
  });
  assert.equal(hammerOffer({ hammers: 3, asked: '2026-09-30' }, history, today), null, '今天问过就不再弹');
  assert.equal(hammerOffer({ hammers: 3 }, [...history, { day: '2026-09-30' }], today), null, '今天玩过就不用补');
  assert.equal(hammerOffer({ hammers: 3 }, [], today), null, '前面没有连续记录可救');
  assert.equal(hammerOffer({ hammers: 0 }, history, today), null, '没有锤子就不打扰');
});

test('useHammer 会重新校验日期，过期的补签报价不会消耗锤子', () => {
  const today = new Date(2026, 8, 30);
  const history = [{ day: '2026-09-27' }, { day: '2026-09-28' }];
  const calendar = { hammers: 2, nocount: {}, asked: null };
  assert.equal(useHammer(calendar, history, ['2026-09-25'], today), false, '日期对不上必须拒绝');
  assert.equal(calendar.hammers, 2);
  assert.equal(useHammer(calendar, history, ['2026-09-29'], today), true);
  assert.equal(calendar.hammers, 1);
  assert.equal(calendar.nocount['2026-09-29'], true);
  assert.equal(useHammer(calendar, history, ['2026-09-29'], today), false, '同一缺口不能重复补');
  assert.equal(calendar.hammers, 1);
});

test('claimLogin 七天一循环，断签归零，补签缺口可以跨过去', () => {
  const bonus = { last: null, run: 0, stickers: {}, total: 0 };
  for (let i = 1; i <= 8; i++) {
    const res = claimLogin(bonus, {}, new Date(2026, 8, i));
    assert.equal(res.total, i);
    assert.equal(res.slot, ((i - 1) % 7) + 1);
    assert.equal(res.type, STICKERS[(i - 1) % 7]);
  }
  assert.equal(bonus.run, 8);
  assert.equal(stickerOn(bonus, '2026-09-08'), 'star');
  assert.equal(claimLogin(bonus, {}, new Date(2026, 8, 8)), null, '同一天只能领一次');

  const reset = { last: '2026-09-01', run: 3, stickers: {}, total: 3 };
  assert.equal(claimLogin(reset, {}, new Date(2026, 8, 3)).run, 1, '漏签要重新从头连');

  const bridged = { last: '2026-09-01', run: 3, stickers: {}, total: 3 };
  assert.equal(claimLogin(bridged, { nocount: { '2026-09-02': true } }, new Date(2026, 8, 3)).run, 4);
  assert.equal(bonusState({}).total, 0);
});

test('freshSave 给出干净的初始存档，并带上当前版本号', () => {
  const save = freshSave();
  assert.equal(save.version, SAVE_VERSION);
  assert.deepEqual(save.learned, []);
  assert.deepEqual(save.review, []);
  assert.equal(save.rounds, 0);
  assert.equal(save.calendar.hammers, 1);
  assert.deepEqual(save.calendar.nocount, {});
  assert.deepEqual(save.trophies.got, {});
  assert.equal(save.bonus.last, null);
  assert.equal(save.stats.problems, 0);
  assert.equal(save.settings.sound, true);
  assert.equal(save.settings.volume, 0.8);
});

test('loadSave 读回合法存档，并夹紧越界的数值', () => {
  const store = memory();
  const save = freshSave();
  save.learned = [QUESTIONS[0].id];
  save.review = [QUESTIONS[1].id];
  save.rounds = 4;
  save.settings = { ...save.settings, volume: 5, speechRate: 9, motion: false };
  save.calendar.hammers = 99;
  save.stats.problems = -3;
  save.bonus = { last: '2026-09-29', run: 2, stickers: { '2026-09-29': 'heart' }, total: 2 };
  persistSave(store, save);

  const loaded = loadSave(store);
  assert.deepEqual(loaded.learned, [QUESTIONS[0].id]);
  assert.deepEqual(loaded.review, [QUESTIONS[1].id]);
  assert.equal(loaded.rounds, 4);
  assert.equal(loaded.settings.volume, 1, '音量上限夹到 1');
  assert.equal(loaded.settings.speechRate, 1.1, '语速上限夹到 1.1');
  assert.equal(loaded.settings.motion, false);
  assert.equal(loaded.calendar.hammers, 3, '金锤最多存 3 把');
  assert.equal(loaded.stats.problems, 0, '统计不能为负');
  assert.equal(loaded.bonus.total, 2);
});

test('loadSave 丢掉不属于本题库的记录，并接受坏数据', () => {
  const store = memory();
  const save = freshSave();
  save.learned = [QUESTIONS[0].id, 'english:word-cat', 'meaning:word-dog'];
  save.review = ['spelling:word-cat', QUESTIONS[0].id, QUESTIONS[0].id];
  persistSave(store, save);
  const loaded = loadSave(store);
  assert.deepEqual(loaded.learned, [QUESTIONS[0].id]);
  assert.deepEqual(loaded.review, [QUESTIONS[0].id], '重复项会去重');

  assert.equal(loadSave(memory({ [SAVE_KEY]: '{ not json' })).rounds, 0);
  assert.equal(loadSave(memory({ [SAVE_KEY]: JSON.stringify({ version: 0, rounds: 9 }) })).rounds, 0, '旧版本号一律丢弃');
  assert.equal(loadSave(memory()).rounds, 0, '没存档时返回初始值');
  assert.equal(loadSave(undefined).version, SAVE_VERSION, '存储被禁用也要能玩');
});

test('persistSave 在存储不可用时返回 false 而不是抛错', () => {
  assert.equal(persistSave(undefined, freshSave()), false);
  const blocked = { getItem: () => null, setItem() { throw new Error('quota'); } };
  assert.equal(persistSave(blocked, freshSave()), false);
  const ok = memory();
  assert.equal(persistSave(ok, freshSave()), true);
  assert.ok(ok.getItem(SAVE_KEY));
});

test('resetAllSaves 只清掉本游戏的键，别的站点数据不动', () => {
  const store = memory({
    [SAVE_KEY]: 'x', [UI_KEY]: 'y', 'softie-english:meaning:v1': 'z', 'other-app:key': 'keep',
  });
  resetAllSaves(store);
  assert.equal(store.getItem(SAVE_KEY), null);
  assert.equal(store.getItem(UI_KEY), null);
  assert.equal(store.getItem('softie-english:meaning:v1'), null, '旧版英语存档也要一并清掉');
  assert.equal(store.getItem('other-app:key'), 'keep');
});

test('saveKey 与界面键互不影响：界面状态不会污染学习记录', () => {
  const store = memory();
  const save = freshSave();
  persistSave(store, save);
  store.setItem(UI_KEY, JSON.stringify({ bookId: 'b8a', unitId: 'u3', lessonId: 'b8a-u3-l2', typeId: 'material' }));
  const loaded = loadSave(store);
  assert.deepEqual(loaded.learned, []);
  assert.equal(loaded.rounds, 0);
  assert.equal(JSON.parse(store.getItem(UI_KEY)).typeId, 'material');
});
