// 初中历史（统编版 2025 版）课程骨架。
// 目录以国家出版发行信息公共服务平台登记的教材目录为准。
// 当前八年级上册题库已完整（7 个单元、22 课，另附导言课与三则学史方法，每课每题型 5 题）；
// 七年级上册、七年级下册、八年级下册只搭好「单元 → 课」骨架，题目待补。
import { TYPE_IDS } from './kit.js';

import b7aU1 from './b7a/u1.js';
import b7aU2 from './b7a/u2.js';
import b7aU3 from './b7a/u3.js';
import b7aU4 from './b7a/u4.js';
import b7aExtra from './b7a/extra.js';

import b7bU1 from './b7b/u1.js';
import b7bU2 from './b7b/u2.js';
import b7bU3 from './b7b/u3.js';
import b7bExtra from './b7b/extra.js';

import b8aU1 from './b8a/u1.js';
import b8aU2 from './b8a/u2.js';
import b8aU3 from './b8a/u3.js';
import b8aU4 from './b8a/u4.js';
import b8aU5 from './b8a/u5.js';
import b8aU6 from './b8a/u6.js';
import b8aU7 from './b8a/u7.js';
import b8aExtra from './b8a/extra.js';

import b8bU1 from './b8b/u1.js';
import b8bU2 from './b8b/u2.js';
import b8bU3 from './b8b/u3.js';
import b8bU4 from './b8b/u4.js';
import b8bU5 from './b8b/u5.js';
import b8bU6 from './b8b/u6.js';
import b8bU7 from './b8b/u7.js';
import b8bExtra from './b8b/extra.js';

const RAW_BOOKS = [
  {
    id: 'b7a',
    grade: '七年级',
    term: '上册',
    title: '七年级上册',
    edition: '统编版 2025 版',
    units: [b7aU1, b7aU2, b7aU3, b7aU4, b7aExtra],
  },
  {
    id: 'b7b',
    grade: '七年级',
    term: '下册',
    title: '七年级下册',
    edition: '统编版 2025 版',
    units: [b7bU1, b7bU2, b7bU3, b7bExtra],
  },
  {
    id: 'b8a',
    grade: '八年级',
    term: '上册',
    title: '八年级上册',
    edition: '统编版 2025 版',
    units: [b8aU1, b8aU2, b8aU3, b8aU4, b8aU5, b8aU6, b8aU7, b8aExtra],
  },
  {
    id: 'b8b',
    grade: '八年级',
    term: '下册',
    title: '八年级下册',
    edition: '统编版 2025 版',
    units: [b8bU1, b8bU2, b8bU3, b8bU4, b8bU5, b8bU6, b8bU7, b8bExtra],
  },
];

function buildQuestion(raw, ids, index) {
  return {
    id: `${ids.book}-${ids.unit}-l${ids.lesson}-${raw.type}-${index + 1}`,
    type: raw.type,
    stem: raw.stem,
    material: raw.material || '',
    options: raw.options,
    answer: raw.answer,
    explain: raw.explain,
    bookId: ids.book,
    bookTitle: ids.bookTitle,
    unitId: ids.unit,
    unitNo: ids.unitNo,
    unitName: ids.unitName,
    lessonId: ids.lessonPath,
    lessonLabel: ids.lessonLabel,
    lessonTitle: ids.lessonTitle,
    parts: [raw.options[raw.answer]],
    blanks: [0],
    distractors: raw.options.filter((_, i) => i !== raw.answer),
  };
}

export const BOOKS = RAW_BOOKS.map((book) => ({
  ...book,
  units: book.units.map((unit) => ({
    id: unit.id,
    no: unit.no,
    name: unit.name,
    lessons: unit.lessons.map((lesson, li) => {
      const lessonPath = `${book.id}-${unit.id}-l${li + 1}`;
      const ids = {
        book: book.id,
        bookTitle: book.title,
        unit: unit.id,
        unitNo: unit.no,
        unitName: unit.name,
        lesson: li + 1,
        lessonPath,
        lessonLabel: lesson.label,
        lessonTitle: lesson.title,
      };
      return {
        id: lessonPath,
        label: lesson.label,
        title: lesson.title,
        bookId: book.id,
        bookTitle: book.title,
        unitId: unit.id,
        unitNo: unit.no,
        unitName: unit.name,
        questions: TYPE_IDS.flatMap((type) => (lesson[type] || []).map((raw, i) => buildQuestion(raw, ids, i))),
      };
    }),
  })),
}));

export const ALL_QUESTIONS = BOOKS.flatMap((book) => book.units.flatMap((unit) => unit.lessons.flatMap((lesson) => lesson.questions)));

export const TOTAL_QUESTIONS = ALL_QUESTIONS.length;
export const TOTAL_LESSONS = BOOKS.reduce((n, b) => n + b.units.reduce((m, u) => m + u.lessons.length, 0), 0);
