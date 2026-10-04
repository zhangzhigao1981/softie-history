import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MODE, MODES, getMode, saveKey } from '../js/modes.js';
import { optionsFor, makeRound, placementRound, recommendedLevel, recordAnswer, answerAt } from '../js/idioms.js';
import { freshSave, loadSave, persistSave, resetAllSaves } from '../js/storage.js';

const mode = DEFAULT_MODE;
const rng = () => .37;
function memory() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    get length() { return values.size; },
    key: (i) => [...values.keys()][i] ?? null,
  };
}

test('120 shared words generate 360 unique questions, 40 per level and 20 per theme', () => {
  assert.deepEqual(Object.keys(MODES), ['meaning', 'spelling', 'sentence']);
  const all = Object.values(MODES).flatMap(mode => mode.questions);
  assert.equal(all.length, 360);
  assert.equal(new Set(all.map(q => q.id)).size, 360);
  for (const mode of Object.values(MODES)) {
    assert.equal(mode.questions.length, 120);
    assert.equal(new Set(mode.questions.map(q => q.word)).size, 120);
    for (const level of mode.levels) assert.equal(mode.questions.filter(q => q.level === level.id).length, 40);
    const topics = new Set(mode.questions.map(q => q.topic));
    assert.equal(topics.size, 6);
    for (const topic of topics) assert.equal(mode.questions.filter(q => q.topic === topic).length, 20);
    for (const q of mode.questions) {
      assert.equal(q.id, `${mode.id}:word-${q.word}`);
      assert.match(q.word, /^[a-z]{3,8}$/);
      assert.ok(q.meaning && q.translation && q.pattern);
      assert.equal(q.context.split('____').length, 2);
      assert.ok(!q.context.includes(q.word));
      assert.ok(q.context.replace('____', q.word).split(' ').length <= 6);
      assert.equal(q.blanks.length, mode.id === 'spelling' && q.level === 3 ? 2 : 1);
      assert.equal(new Set(q.blanks).size, q.blanks.length);
      assert.ok(q.blanks.every(i => i >= 0 && i < q.parts.length));
      assert.equal(q.parts.join(''), q.word);
    }
  }
});

test('every question has four unique choices and one accepted answer', () => {
  for (const mode of Object.values(MODES)) for (const q of mode.questions) for (let step = 0; step < q.blanks.length; step++) {
    for (let n = 0; n < 10; n++) {
      const opts = optionsFor(q, step, Math.random, mode);
      assert.equal(opts.length, 4, q.id); assert.equal(new Set(opts).size, 4, q.id);
      assert.equal(opts.filter(x => x === answerAt(q, step)).length, 1);
      assert.ok(opts.every(x => mode.id === 'spelling' ? /^[a-z]$/.test(x) : /^[a-z]+$/.test(x)));
    }
  }
});

test('round mixes three new words with five previously seen words; cold start is unique', () => {
  for (const level of mode.levels) {
    const initial = makeRound(level.id, { rng });
    assert.equal(initial.length, 8); assert.equal(new Set(initial.map(q => q.id)).size, 8);
    assert.ok(initial.every(q => q.level === level.id));
    const seen = initial.map(q => q.id);
    const next = makeRound(level.id, { seen, rng });
    assert.equal(next.filter(q => !seen.includes(q.id)).length, 3);
    assert.equal(next.filter(q => seen.includes(q.id)).length, 5);
    assert.equal(makeRound(level.id, { seen: mode.questions.map(q => q.id), rng }).length, 8);
    assert.equal(makeRound(level.id, { seen: seen.slice(0, 2), rng }).length, 8);
  }
});

test('all forty words remain reachable as new vocabulary is introduced', () => {
  const seen = [];
  for (let i = 0; i < 15; i++) for (const q of makeRound(1, { seen, rng })) if (!seen.includes(q.id)) seen.push(q.id);
  assert.equal(seen.length, 40);
});

test('placement samples two per level, requires earlier foundations, and permits skipped/assisted answers', () => {
  const round = placementRound(rng);
  assert.deepEqual(round.map((q) => q.level), [1, 1, 2, 2, 3, 3]);
  const result = (levels) => round.map((q) => ({ level: q.level, firstTry: levels.includes(q.level) }));
  assert.equal(recommendedLevel(result([])), 1);
  assert.equal(recommendedLevel(result([1])), 2);
  assert.equal(recommendedLevel(result([1, 2])), 3);
  assert.equal(recommendedLevel(result([2, 3])), 1);
});

test('completed mistakes enter review, first-try review clears them, records are unique', () => {
  const save = freshSave(); const q = mode.questions[0];
  recordAnswer(save, q, false); recordAnswer(save, q, false);
  assert.deepEqual(save.learned, [q.id]); assert.deepEqual(save.review, [q.id]);
  recordAnswer(save, q, true);
  assert.deepEqual(save.review, []); assert.deepEqual(save.learned, [q.id]);
});

test('demo and placement never change mastery or review data', () => {
  const save = freshSave(); const before = structuredClone(save);
  for (const q of mode.questions) { recordAnswer(save, q, false, { demo: true }); recordAnswer(save, q, true, { placement: true }); }
  assert.deepEqual(save, before);
});

test('storage tolerates blocked, corrupt, null and unknown-version saves', () => {
  assert.deepEqual(loadSave(null), freshSave());
  assert.deepEqual(loadSave({ getItem() { throw new Error('blocked'); } }), freshSave());
  for (const text of ['{', 'null', '[]', '3', '{"version":100}']) assert.deepEqual(loadSave({ getItem: () => text }), freshSave());
  assert.equal(persistSave(null, freshSave()), false);
});

test('storage sanitizes fields and round-trips valid progress', () => {
  const store = memory(); const save = freshSave();
  recordAnswer(save, mode.questions[0], false); save.recommended = 2; save.rounds = 4;
  assert.ok(persistSave(store, save)); assert.deepEqual(loadSave(store), save);
  store.setItem(saveKey(mode), JSON.stringify({ version: 1, learned: [save.learned[0], save.learned[0], 'missing'], review: 'invalid', recommended: 99, rounds: -5, settings: { sound: 'yes', motion: false } }));
  const clean = loadSave(store);
  assert.deepEqual(clean.learned, save.learned); assert.deepEqual(clean.review, []);
  assert.equal(clean.rounds, 0); assert.equal(clean.recommended, null); assert.equal(clean.settings.sound, true); assert.equal(clean.settings.motion, false);
});

test('all three modes isolate progress for the same vocabulary', () => {
  const store = memory();
  const spelling = MODES.spelling;
  assert.equal(getMode('spelling'), spelling);
  assert.equal(getMode('unknown'), mode);
  const save = freshSave(spelling);
  recordAnswer(save, spelling.questions[0], false);
  persistSave(store, save, spelling);
  assert.deepEqual(loadSave(store, mode), freshSave(mode));
  assert.deepEqual(loadSave(store, MODES.sentence), freshSave(MODES.sentence));
  assert.deepEqual(loadSave(store, spelling), save);
});

test('volume settings migrate old saves, clamp values, and persist without changing progress', () => {
  for (const [volume, expected] of [[undefined, .8], ['loud', .8], [-1, 0], [2, 1], [.35, .35]]) {
    const store = memory();
    store.setItem(saveKey(mode), JSON.stringify({ version: 1, learned: [mode.questions[0].id], settings: { sound: false, motion: true, volume } }));
    const save = loadSave(store);
    assert.equal(save.settings.volume, expected);
    assert.deepEqual(save.learned, [mode.questions[0].id]);
    persistSave(store, save);
    assert.deepEqual(loadSave(store), save);
  }
});

test('motion settings support booleans and numeric percentages', () => {
  for (const [motion, expected] of [[undefined, true], [true, true], [false, false], ['fast', true], [-0.5, 0], [1.5, 1], [0.65, 0.65]]) {
    const store = memory();
    store.setItem(saveKey(mode), JSON.stringify({ version: 1, learned: [mode.questions[0].id], settings: { sound: true, motion, volume: 0.8 } }));
    const save = loadSave(store);
    assert.equal(save.settings.motion, expected);
  }
});

test('resetAllSaves wipes all mode records and settings from storage', () => {
  const store = memory();
  store.setItem(saveKey(mode), JSON.stringify(freshSave(mode)));
  store.setItem(saveKey(MODES.spelling), JSON.stringify(freshSave(MODES.spelling)));
  store.setItem('unrelated-key', 'keep-me');
  store.setItem('softie-idioms:children:v1', 'original-progress');
  store.setItem(saveKey(MODES.sentence), JSON.stringify(freshSave(MODES.sentence)));
  resetAllSaves(store);
  assert.equal(store.getItem(saveKey(mode)), null);
  assert.equal(store.getItem(saveKey(MODES.spelling)), null);
  assert.equal(store.getItem('unrelated-key'), 'keep-me');
  assert.equal(store.getItem('softie-idioms:children:v1'), 'original-progress');
  assert.equal(store.getItem(saveKey(MODES.sentence)), null);
});

test('speech settings validate older or corrupt saves and round-trip child-friendly defaults', () => {
  const store = memory();
  store.setItem(saveKey(mode), JSON.stringify({ version: 1, settings: { autoSpeak: 'yes', localOnly: 0, speechRate: 'fast' } }));
  assert.equal(loadSave(store).settings.autoSpeak, true);
  assert.equal(loadSave(store).settings.localOnly, true);
  assert.equal(loadSave(store).settings.speechRate, 0.85);
  for (const [rate, expected] of [[0, 0.65], [9, 1.1], [0.9, 0.9]]) {
    const save = freshSave(); Object.assign(save.settings, { autoSpeak: false, localOnly: false, speechRate: rate });
    persistSave(store, save);
    const loaded = loadSave(store);
    assert.equal(loaded.settings.speechRate, expected);
    assert.equal(loaded.settings.autoSpeak, false); assert.equal(loaded.settings.localOnly, false);
  }
});

