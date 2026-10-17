// 组卷与判题：四种题型共用一套。题型只影响候选答案的文字与排序规则。
import { DEFAULT_TYPE_ID, ROUND_SIZE, TYPE_MAP } from './course.js';

export const LETTERS = ['A', 'B', 'C', 'D'];

export function shuffle(items, rng = Math.random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// 气泡与作答格里显示的短标签：选择题是 A-D，填空题就是那个词。
export function keyFor(q, index, text) {
  if (q.type === 'blank') return text ?? q.options[index];
  return LETTERS[index];
}

// 返回按展示顺序排好的候选项，标签跟着位置走，不会出现「第一个选项叫 B」。
export function optionsFor(q, rng = Math.random, typeId = q.type || DEFAULT_TYPE_ID) {
  const options = q.options || [];
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
  if (q.type === 'timeline') {
    if (!Array.isArray(q.axis) || q.axis.length < 3) problems.push('时间轴至少要有三个节点');
    else {
      if (q.axis.length > 6) problems.push('时间轴最多六个节点，否则手机上一格放不下');
      if (!q.axis.every((n) => n && n.year)) problems.push('时间轴节点缺少年份');
      if (q.axis.filter((n) => !n.text).length !== 1) problems.push('时间轴要恰好留一个空节点');
      // 同一根轴上出现两个同年节点，说明这年的两件大事被拆成了两格，学生会分不清哪一格该填什么。
      const years = q.axis.map((n) => n.year);
      if (new Set(years).size !== years.length) problems.push('时间轴有重复年份');
      // 选项里不得重复轴上已经写出来的事件，否则等于把答案提前给了。
      const shown = new Set(q.axis.map((n) => n.text).filter(Boolean));
      if ((q.options || []).some((o) => shown.has(o))) problems.push('选项与轴上已显示的事件重复');
    }
  }
  if (!q.explain) problems.push('缺少解析');
  return problems;
}
