// 课程表：初中历史（统编版 2025 版）。
// 「册 → 单元 → 课」是内容骨架，四种题型是同一批知识点的四种问法。
// 八年级上册题库已完整，七上/七下/八下只搭了骨架，题量统计为 0 时界面进入「待补题」态。
import { BOOKS, ALL_QUESTIONS } from './content/history.js';

export { BOOKS, ALL_QUESTIONS };

export const SUBJECT = { id: 'history', theme: 'children', label: '历史' };

export const TYPES = [
  {
    id: 'choice',
    label: '选择题',
    icon: '🔖',
    note: '四选一',
    guide: '选出最符合题意的一项',
    seconds: 40,
  },
  {
    id: 'judge',
    label: '判断题',
    icon: '⚖️',
    note: '判断对错',
    guide: '判断这句话对不对',
    seconds: 35,
  },
  {
    id: 'blank',
    label: '填空题',
    icon: '✍️',
    note: '选词填空',
    guide: '从候选词里挑一个补进空格',
    seconds: 45,
  },
  {
    id: 'material',
    label: '材料题',
    icon: '📜',
    note: '史料研读',
    guide: '先读材料，再回答小问',
    seconds: 70,
  },
];

export const TYPE_MAP = Object.fromEntries(TYPES.map((t) => [t.id, t]));
export const DEFAULT_TYPE_ID = TYPES[0].id;

export const ROUND_SIZE = 5;
export const REVIEW_SIZE = 10;

export const SAVE_VERSION = 1;
export const SAVE_KEY = `softie-history:v${SAVE_VERSION}`;
export const UI_KEY = 'softie-history:ui';

export function saveKey() { return SAVE_KEY; }

export function lessonQuestionCount(lesson) { return lesson?.questions?.length || 0; }

export function bookQuestionCount(book) {
  return (book?.units || []).reduce((n, u) => n + u.lessons.reduce((m, l) => m + lessonQuestionCount(l), 0), 0);
}

// 有题目的册（按年级顺序）。默认落在第一本「能玩」的册上，
// 这样新加的空白册不会把首页顶成一片「待补题」。
export const PLAYABLE_BOOKS = BOOKS.filter((book) => bookQuestionCount(book) > 0);
export const DEFAULT_BOOK = PLAYABLE_BOOKS[0] || BOOKS[0];

export function firstPlayableLesson(book = DEFAULT_BOOK) {
  for (const unit of book?.units || []) {
    for (const lesson of unit.lessons) {
      if (lessonQuestionCount(lesson) > 0) return { unit, lesson };
    }
  }
  const unit = book?.units?.[0] || null;
  return { unit, lesson: unit?.lessons?.[0] || null };
}

export function findBook(bookId) { return BOOKS.find((b) => b.id === bookId) || DEFAULT_BOOK; }

export function findUnit(book, unitId) {
  return book?.units.find((u) => u.id === unitId) || book?.units[0] || null;
}

export function findLesson(unit, lessonId) {
  return unit?.lessons.find((l) => l.id === lessonId) || unit?.lessons[0] || null;
}

export function questionsOf(lesson, typeId) {
  return (lesson?.questions || []).filter((q) => q.type === typeId);
}

export function countByType(lesson, typeId) { return questionsOf(lesson, typeId).length; }

export function secondsFor(typeId) { return (TYPE_MAP[typeId] || TYPES[0]).seconds; }
