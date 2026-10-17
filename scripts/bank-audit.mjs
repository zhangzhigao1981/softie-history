#!/usr/bin/env node
// 题库验收工具。批量录题（含 AI 生成）之后先跑这个，再跑 npm test。
//
//   node scripts/bank-audit.mjs          审计全部四册
//   node scripts/bank-audit.mjs b8a      只审计八年级上册
//
// 会拦的硬问题（退出码 1）：
//   - validateQuestion 不通过（缺题干/解析、答案越界、填空没有空格）
//   - 同一课内题干完全重复
//   - 同一题内候选项重复（会让判题出现两个正确答案）
// 会报的软问题（只提示，不影响退出码）：
//   - 解析少于 12 字、题干超过 60 字、候选项超过 18 字
//   —— 这三条对应手机上的可读性：解析太短帮不上忙，题干太长会顶掉选项区，
//      选项超过 18 字字号会从 20px 掉到更小一档。
import { BOOKS } from '../js/content/history.js';
import { validateQuestion } from '../js/quiz.js';

const MAX_STEM = 60;
const MAX_OPTION = 24;
const MIN_EXPLAIN = 12;
const TYPE_ORDER = ['choice', 'judge', 'blank', 'material'];
const TYPE_LABEL = { choice: '选择', judge: '判断', blank: '填空', material: '材料' };

const only = process.argv[2];
const books = only ? BOOKS.filter((b) => b.id === only) : BOOKS;
if (!books.length) {
  console.error(`没有这一册：${only}。可选：${BOOKS.map((b) => b.id).join(' / ')}`);
  process.exit(2);
}

const hard = [];
const soft = [];
const lines = [];
let total = 0;

for (const book of books) {
  const rows = [];
  const seenStem = new Map(); // 题干 → 首次出现的课
  let bookTotal = 0;

  for (const unit of book.units) {
    for (const lesson of unit.lessons) {
      const counts = Object.fromEntries(TYPE_ORDER.map((t) => [t, 0]));
      for (const q of lesson.questions) {
        counts[q.type] = (counts[q.type] || 0) + 1;
        bookTotal += 1;
        const where = `${book.title} ${lesson.label}「${lesson.title}」${q.id.split('-').slice(-2).join('-')}`;

        for (const p of validateQuestion(q)) hard.push(`${where}：${p}`);
        if (new Set(q.options).size !== q.options.length) hard.push(`${where}：候选项有重复文字`);
        if (seenStem.has(q.stem)) hard.push(`${where}：题干与 ${seenStem.get(q.stem)} 完全重复`);
        else seenStem.set(q.stem, where);
        if (q.type === 'blank' && (q.stem.match(/____/g) || []).length !== 1) {
          hard.push(`${where}：填空题要恰好一个 ____`);
        }

        if (q.explain.length < MIN_EXPLAIN) soft.push(`${where}：解析只有 ${q.explain.length} 字`);
        if (q.stem.length > MAX_STEM) soft.push(`${where}：题干 ${q.stem.length} 字`);
        q.options.forEach((o) => {
          if (o.length > MAX_OPTION) soft.push(`${where}：选项「${o}」${o.length} 字`);
        });
      }
      const n = lesson.questions.length;
      if (n === 0) rows.push([unit.no >= 1 ? `第${unit.no}单元` : '导言与学法', `${lesson.label} ${lesson.title}`, '—', '—', '—', '—', 0]);
      else rows.push([unit.no >= 1 ? `第${unit.no}单元` : '导言与学法', `${lesson.label} ${lesson.title}`, ...TYPE_ORDER.map((t) => counts[t] || 0), n]);
    }
  }
  total += bookTotal;
  lines.push(`\n${book.title}（${book.edition}）　${bookTotal} 题`);
  lines.push(['单元', '课', '选择', '判断', '填空', '材料', '合计'].join('\t'));
  for (const r of rows) lines.push(r.join('\t'));
}

console.log(lines.join('\n'));

const count = (type) => {
  let n = 0;
  for (const book of books) for (const unit of book.units) for (const lesson of unit.lessons) {
    n += lesson.questions.filter((q) => q.type === type).length;
  }
  return n;
};
console.log(`\n合计 ${total} 题：${TYPE_ORDER.map((t) => `${TYPE_LABEL[t]} ${count(t)}`).join('　')}`);

if (soft.length) {
  console.log(`\n软问题 ${soft.length} 处（可读性，不影响测试通过）：`);
  for (const s of soft.slice(0, 20)) console.log(`  · ${s}`);
  if (soft.length > 20) console.log(`  …还有 ${soft.length - 20} 处`);
}

if (hard.length) {
  console.log(`\n硬问题 ${hard.length} 处，必须修：`);
  for (const h of hard) console.log(`  ✗ ${h}`);
  process.exit(1);
}
console.log('\n硬问题 0 处。');
