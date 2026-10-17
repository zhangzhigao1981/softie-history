// 组卷与判题：四种题型共用一套。题型只影响候选答案的文字与排序规则。
import { DEFAULT_TYPE_ID, ROUND_SIZE, TYPE_MAP } from './course.js';

export const LETTERS = ['A', 'B', 'C', 'D'];
export const JUDGE_KEYS = ['对', '错'];

export function shuffle(items, rng = Math.random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// 气泡与作答格里显示的短标签：选择题是 A-D，判断题是对/错，填空题就是那个词。
export function keyFor(q, index, text) {
  if (q.type === 'blank') return text ?? q.options[index];
  if (q.type === 'judge') return JUDGE_KEYS[index];
  return LETTERS[index];
}

// 返回按展示顺序排好的候选项，标签跟着位置走，不会出现「第一个选项叫 B」。
export function optionsFor(q, rng = Math.random, typeId = q.type || DEFAULT_TYPE_ID) {
  const options = q.options || [];
  if (typeId === 'judge') {
    return options.map((text, i) => ({ key: JUDGE_KEYS[i], text, correct: i === q.answer }));
  }
  const correct = { text: options[q.answer], correct: true };
  const others = shuffle(options.map((text) => ({ text, correct: false })).filter((o) => o.text !== correct.text), rng)
    .slice(0, Math.max(1, Math.min(3, options.length - 1)));
  return shuffle([correct, ...others], rng)
    .map((o, i) => ({ key: keyFor({ type: typeId }, i, o.text), text: o.text, correct: o.correct }));
}

export function correctKey(q, rng = Math.random, typeId = q.type || DEFAULT_TYPE_ID) {
  return optionsFor(q, rng, typeId).find((o) => o.correct)?.key ?? null;
}

// 一轮默认把该课该题型的题全部走一遍，见过的排后面，让新知识点先出场。
export function makeRound(questions, { count = ROUND_SIZE, seen = [], rng = Math.random } = {}) {
  const known = new Set(seen);
  const pool = shuffle(questions, rng);
  const fresh = pool.filter((q) => !known.has(q.id));
  const review = pool.filter((q) => known.has(q.id));
  return [...fresh, ...review].slice(0, count);
}

export function recordAnswer(save, q, firstTry, { demo = false } = {}) {
  if (demo) return;
  if (!save.learned.includes(q.id)) save.learned.push(q.id);
  if (firstTry) save.review = save.review.filter((id) => id !== q.id);
  else if (!save.review.includes(q.id)) save.review.push(q.id);
}

// 题库自检：题干、选项、答案下标、填空题空格、材料正文都要齐。
export function validateQuestion(q) {
  const problems = [];
  if (!TYPE_MAP[q.type]) problems.push('未知题型');
  if (!q.stem) problems.push('缺少题干');
  if (!Array.isArray(q.options) || q.options.length < 2) problems.push('候选项不足');
  if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= (q.options?.length || 0)) problems.push('答案下标越界');
  if (q.type === 'blank' && !q.stem?.includes('____')) problems.push('填空题缺少空格');
  if (q.type === 'material' && !q.material) problems.push('材料题缺少材料');
  if (q.type === 'judge' && q.options?.length !== 2) problems.push('判断题应有两个选项');
  if (!q.explain) problems.push('缺少解析');
  return problems;
}
