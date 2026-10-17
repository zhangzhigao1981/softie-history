import test from 'node:test';
import assert from 'node:assert/strict';

import { LETTERS, shuffle, keyFor, optionsFor, correctKey, makeRound, recordAnswer, validateQuestion } from '../js/quiz.js';
import { ROUND_SIZE } from '../js/course.js';
import { QUESTIONS } from './helpers/app-harness.mjs';

// 固定种子的伪随机数，用来把「打乱」变成可复现的。
function seeded(seed = 1) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}
const sample = (type, index = 0) => QUESTIONS.find((q) => q.id.endsWith(`-${type}-${index + 1}`));

test('shuffle：不改动原数组，同样的种子给出同样的顺序', () => {
  const input = [1, 2, 3, 4, 5, 6];
  const copy = [...input];
  const a = shuffle(input, seeded(7));
  const b = shuffle(input, seeded(7));
  assert.deepEqual(input, copy, '原数组必须保持不变');
  assert.deepEqual(a, b, '同种子必须可复现');
  assert.deepEqual([...a].sort((x, y) => x - y), copy);
});

test('optionsFor：选择题与材料题给出四个互不相同的候选，正确项只有一个', () => {
  for (const type of ['choice', 'material']) {
    const q = sample(type);
    const options = optionsFor(q, seeded(3), q.type);
    assert.equal(options.length, 4);
    assert.deepEqual(options.map((o) => o.key), LETTERS, '标签按展示位置分配 A-D');
    assert.equal(options.filter((o) => o.correct).length, 1);
    assert.equal(options.find((o) => o.correct).text, q.options[q.answer]);
    assert.deepEqual([...options.map((o) => o.text)].sort(), [...q.options].sort(), '候选项内容与题库一致，只是换了顺序');
  }
});

test('optionsFor：时间轴题也是四选一，正确项跟着 answer 走', () => {
  const q = QUESTIONS.find((item) => item.type === 'timeline');
  const options = optionsFor(q, seeded(5), 'timeline');
  assert.equal(options.length, 4);
  assert.deepEqual(options.map((o) => o.key), LETTERS);
  assert.equal(options.filter((o) => o.correct).length, 1);
  assert.equal(options.find((o) => o.correct).text, q.options[q.answer]);
});

test('optionsFor：填空题的气泡标签就是那个词本身', () => {
  const q = sample('blank');
  const options = optionsFor(q, seeded(11), 'blank');
  assert.equal(options.length, 4);
  for (const option of options) assert.equal(option.key, option.text);
  assert.equal(options.find((o) => o.correct).key, q.options[q.answer]);
});

test('keyFor：选择题按位置给 A-D，填空题直接给那个词', () => {
  assert.equal(keyFor({ type: 'choice' }, 2), 'C');
  assert.equal(keyFor({ type: 'timeline' }, 1), 'B');
  assert.equal(keyFor({ type: 'blank' }, 0, '虎门'), '虎门');
  assert.equal(keyFor({ type: 'blank', options: ['虎门'] }, 0), '虎门');
});

test('correctKey 与 optionsFor 选出的正确项始终一致', () => {
  for (const type of ['choice', 'blank', 'material', 'timeline']) {
    const q = sample(type);
    const rng = seeded(13);
    assert.equal(correctKey(q, rng, q.type), optionsFor(q, seeded(13), q.type).find((o) => o.correct).key);
  }
});

test('makeRound：一轮取满 5 题、不重复，没见过的题排在前面', () => {
  const pool = QUESTIONS.filter((q) => q.type === 'choice').slice(0, 12);
  const seen = pool.slice(0, 8).map((q) => q.id);
  const round = makeRound(pool, { count: ROUND_SIZE, seen, rng: seeded(21) });
  assert.equal(round.length, ROUND_SIZE);
  assert.equal(new Set(round.map((q) => q.id)).size, ROUND_SIZE);
  const freshIds = new Set(pool.slice(8).map((q) => q.id));
  assert.deepEqual(round.slice(0, 4).map((q) => freshIds.has(q.id)), [true, true, true, true], '先把没练过的题排出来');
  assert.ok(round.some((q) => seen.includes(q.id)), '题量不足时用练过的补满');
});

test('makeRound：题量少于一轮时只返回现有的题', () => {
  const pool = QUESTIONS.filter((q) => q.type === 'timeline').slice(0, 3);
  const round = makeRound(pool, { count: ROUND_SIZE, seen: [], rng: seeded(2) });
  assert.equal(round.length, 3);
  assert.deepEqual([...round.map((q) => q.id)].sort(), [...pool.map((q) => q.id)].sort());
});

test('recordAnswer：独立答对进「已练过」，答错进错题本，之后答对会移出', () => {
  const q = sample('choice');
  const save = { learned: [], review: [] };
  recordAnswer(save, q, true);
  assert.deepEqual(save.learned, [q.id]);
  assert.deepEqual(save.review, []);

  const other = sample('choice', 1);
  recordAnswer(save, other, false);
  assert.ok(save.review.includes(other.id), '答错要进错题本');
  assert.ok(save.learned.includes(other.id), '见过就要记进已练过');

  recordAnswer(save, other, true);
  assert.ok(!save.review.includes(other.id), '再答对就移出错题本');
  assert.equal(save.learned.filter((id) => id === other.id).length, 1, '不重复记录');
});

test('recordAnswer：演示模式完全不写学习记录', () => {
  const q = sample('blank');
  const save = { learned: [], review: [] };
  recordAnswer(save, q, false, { demo: true });
  assert.deepEqual(save, { learned: [], review: [] });
});

test('validateQuestion：题干、选项、答案下标、空格与材料缺失都会被指出', () => {
  const ok = sample('material');
  assert.deepEqual(validateQuestion(ok), []);

  assert.ok(validateQuestion({ ...ok, stem: '' }).includes('缺少题干'));
  assert.ok(validateQuestion({ ...ok, options: ['只有一个'] }).includes('候选项不足'));
  assert.ok(validateQuestion({ ...ok, answer: 9 }).includes('答案下标越界'));
  assert.ok(validateQuestion({ ...ok, answer: 1.5 }).includes('答案下标越界'));
  assert.ok(validateQuestion({ ...ok, material: '' }).includes('材料题缺少材料'));
  assert.ok(validateQuestion({ ...ok, explain: '' }).includes('缺少解析'));
  assert.ok(validateQuestion({ ...sample('blank'), stem: '没有空格的题干' }).includes('填空题缺少空格'));
  const axis = sample('timeline');
  assert.deepEqual(validateQuestion(axis), []);
  assert.ok(validateQuestion({ ...axis, axis: axis.axis.slice(0, 2) }).includes('时间轴至少要有三个节点'));
  assert.ok(validateQuestion({ ...axis, axis: axis.axis.map((n) => ({ ...n, text: n.text || '补上' })) }).includes('时间轴要恰好留一个空节点'));
  assert.ok(validateQuestion({ ...axis, axis: [...axis.axis, ...['1900', '1901', '1902', '1903'].map((y) => ({ year: `${y} 年`, text: '补上' }))] }).includes('时间轴最多六个节点，否则手机上一格放不下'));
  assert.ok(validateQuestion({ ...ok, type: 'essay' }).includes('未知题型'));
});
