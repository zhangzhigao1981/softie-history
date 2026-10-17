import test from 'node:test';
import assert from 'node:assert/strict';

import { BOOKS, ALL_QUESTIONS, TOTAL_QUESTIONS, TOTAL_LESSONS } from '../js/content/history.js';
import {
  TYPES, TYPE_MAP, ROUND_SIZE, REVIEW_SIZE, SAVE_KEY, UI_KEY, findBook, findUnit, findLesson,
  questionsOf, countByType, secondsFor, bookQuestionCount, lessonQuestionCount,
  PLAYABLE_BOOKS, DEFAULT_BOOK, firstPlayableLesson,
} from '../js/course.js';
import { TYPE_IDS } from '../js/content/kit.js';
import { validateQuestion } from '../js/quiz.js';

const book = (id) => BOOKS.find((b) => b.id === id);
const PENDING_BOOK_IDS = ['b7a', 'b7b', 'b8b'];

test('课程结构：四册按年级排列，每册「单元 → 课」逐级可查', () => {
  assert.deepEqual(BOOKS.map((b) => b.id), ['b7a', 'b7b', 'b8a', 'b8b']);
  assert.deepEqual(BOOKS.map((b) => b.title), ['七年级上册', '七年级下册', '八年级上册', '八年级下册']);
  assert.deepEqual(BOOKS.map((b) => [b.grade, b.term]), [
    ['七年级', '上册'], ['七年级', '下册'], ['八年级', '上册'], ['八年级', '下册'],
  ]);

  // 单元数：七上 4+导言、七下 3+导言、八上 7+导言、八下 7+导言
  assert.deepEqual(BOOKS.map((b) => b.units.length), [5, 4, 8, 8]);
  for (const bk of BOOKS) {
    const numbered = bk.units.filter((u) => u.no >= 1);
    assert.deepEqual(numbered.map((u) => u.no), numbered.map((_, i) => i + 1), `${bk.title} 的单元号要连续从 1 开始`);
    assert.equal(bk.units.filter((u) => u.no < 1).length, 1, `${bk.title} 要有一个导言与学法分组`);
  }

  assert.equal(TOTAL_LESSONS, 104);
  for (const bk of BOOKS) {
    for (const unit of bk.units) {
      assert.ok(unit.id && unit.name, '单元必须有 id 与名称');
      for (const lesson of unit.lessons) {
        assert.ok(lesson.id && lesson.label && lesson.title, '课必须有 id、课次标签与标题');
        assert.equal(lesson.unitId, unit.id);
        assert.equal(lesson.bookId, bk.id);
      }
    }
  }

  // 逐级查找函数对合法 id 命中，对非法 id 回落到默认（有题的那一册）。
  assert.equal(findBook('nope').id, DEFAULT_BOOK.id);
  assert.equal(findUnit(book('b8a'), 'u3').id, 'u3');
  assert.equal(findUnit(book('b8a'), 'nope').id, book('b8a').units[0].id);
  assert.equal(findLesson(book('b8a').units[0], 'b8a-u1-l2').label, '第2课');
  assert.equal(findLesson(book('b8a').units[0], 'nope').id, book('b8a').units[0].lessons[0].id);
});

test('题库：只有八年级上册完整，每课四题型各 5 题，共 520 题且全部通过自检', () => {
  assert.equal(TOTAL_QUESTIONS, 520);
  assert.deepEqual(TYPE_IDS, ['choice', 'judge', 'blank', 'material']);

  const counts = { choice: 0, judge: 0, blank: 0, material: 0 };
  const problems = [];
  for (const unit of book('b8a').units) {
    for (const lesson of unit.lessons) {
      for (const typeId of TYPE_IDS) {
        const list = questionsOf(lesson, typeId);
        assert.equal(list.length, 5, `${lesson.label} ${lesson.title} 的 ${typeId} 题量应为 5`);
        assert.equal(countByType(lesson, typeId), 5);
        counts[typeId] += list.length;
        for (const q of list) problems.push(...validateQuestion(q).map((p) => `${q.id}: ${p}`));
      }
      assert.equal(lesson.questions.length, 20);
      assert.equal(lessonQuestionCount(lesson), 20);
    }
  }
  assert.deepEqual(counts, { choice: 130, judge: 130, blank: 130, material: 130 });
  assert.deepEqual(problems, []);
});

test('待补题的册：骨架在、题目为空，界面能识别出「没有题」', () => {
  for (const id of PENDING_BOOK_IDS) {
    const bk = book(id);
    assert.ok(bk.units.length > 0, `${bk.title} 要有单元`);
    assert.equal(bookQuestionCount(bk), 0, `${bk.title} 现在不该有题目`);
    for (const unit of bk.units) {
      assert.ok(unit.lessons.length > 0, `${bk.title} ${unit.name} 要有课`);
      for (const lesson of unit.lessons) {
        assert.deepEqual(lesson.questions, [], `${lesson.label} ${lesson.title} 还没有题目`);
        for (const typeId of TYPE_IDS) assert.equal(questionsOf(lesson, typeId).length, 0);
      }
    }
  }

  assert.deepEqual(PLAYABLE_BOOKS.map((b) => b.id), ['b8a']);
  assert.equal(DEFAULT_BOOK.id, 'b8a', '默认落在第一本有题的册');
  assert.equal(bookQuestionCount(DEFAULT_BOOK), TOTAL_QUESTIONS);

  // 打开任意一册都定位到「第一道有题的课」；空册回落到首单元首课，不致抛错。
  const opened = firstPlayableLesson(book('b8a'));
  assert.equal(opened.lesson.id, 'b8a-u1-l1');
  assert.equal(bookQuestionCount(book('b8a')), 520);
  for (const id of PENDING_BOOK_IDS) {
    const fallback = firstPlayableLesson(book(id));
    assert.equal(fallback.unit.id, book(id).units[0].id);
    assert.equal(fallback.lesson.id, book(id).units[0].lessons[0].id);
  }
});

test('题库：题号唯一、答案落在候选项内、题型与选项格式一致', () => {
  const ids = new Set();
  for (const q of ALL_QUESTIONS) {
    assert.ok(!ids.has(q.id), `题号重复：${q.id}`);
    ids.add(q.id);
    assert.ok(TYPE_MAP[q.type], `未知题型：${q.type}`);
    assert.equal(q.options[q.answer] !== undefined, true);
    assert.equal(new Set(q.options).size, q.options.length, `候选项重复：${q.id}`);
    if (q.type === 'judge') {
      assert.deepEqual(q.options, ['对', '错']);
      assert.ok([0, 1].includes(q.answer));
    } else {
      assert.equal(q.options.length, 4, `选择题/填空/材料题应为四选一：${q.id}`);
    }
    if (q.type === 'blank') assert.ok(q.stem.includes('____'), `填空题缺少空格：${q.id}`);
    if (q.type === 'material') assert.ok(q.material.trim().length >= 10, `材料过短：${q.id}`);
    assert.ok(q.explain.trim().length >= 10, `解析过短：${q.id}`);
    assert.equal(q.blanks.length, 1, '每道题只有一个作答位');
    assert.equal(q.parts[0], q.options[q.answer]);
  }
  assert.equal(ids.size, ALL_QUESTIONS.length);
});

test('题型配置：四种题型各有标签、图标、作答说明与独立时限', () => {
  assert.equal(TYPES.length, 4);
  assert.deepEqual(TYPES.map((t) => t.id), TYPE_IDS);
  for (const type of TYPES) {
    assert.ok(type.label && type.icon && type.note && type.guide);
    assert.ok(Number.isFinite(type.seconds) && type.seconds > 0);
    assert.equal(secondsFor(type.id), type.seconds);
  }
  assert.deepEqual(TYPES.map((t) => t.seconds), [40, 35, 45, 70], '材料题要给足读材料的时间');
  assert.equal(secondsFor('nope'), TYPES[0].seconds);
  assert.equal(ROUND_SIZE, 5, '一轮正好走完一课的一种题型');
  assert.equal(REVIEW_SIZE, 10);
});

test('存档键：只有一个学习记录键，另有独立的界面键', () => {
  assert.equal(SAVE_KEY, 'softie-history:v1');
  assert.equal(UI_KEY, 'softie-history:ui');
  assert.notEqual(SAVE_KEY, UI_KEY);
  assert.ok(UI_KEY.startsWith('softie-history:'));
});

// 目录以国家出版发行信息公共服务平台登记、统编版 2025 版教材目录为准。
// 这里逐册快照：改动课次或标题会立刻失败，避免误改。
const CATALOGUE = {
  b7a: [
    '第1课 远古时期的人类活动', '第2课 原始农业与史前社会', '第3课 中华文明的起源',
    '第4课 夏商西周王朝的更替', '第5课 动荡变化中的春秋时期', '第6课 战国时期的社会变革', '第7课 百家争鸣', '第8课 夏商周时期的科技与文化',
    '第9课 秦统一中国', '第10课 秦末农民大起义', '第11课 西汉建立和“文景之治”', '第12课 大一统王朝的巩固', '第13课 东汉的兴衰', '第14课 丝绸之路的开通与经营西域', '第15课 秦汉时期的科技与文化',
    '第16课 三国鼎立', '第17课 西晋的短暂统一和北方各族的内迁', '第18课 东晋南朝政治和江南地区开发', '第19课 北朝政治和北方民族大交融', '第20课 三国两晋南北朝时期的科技与文化',
  ],
  b7b: [
    '第1课 隋朝统一与灭亡', '第2课 唐朝建立与“贞观之治”', '第3课 “开元盛世”', '第4课 安史之乱与唐朝衰亡', '第5课 隋唐时期的民族交往与交融', '第6课 隋唐时期的中外文化交流', '第7课 隋唐时期的科技与文化',
    '第8课 北宋的政治', '第9课 辽、西夏与北宋并立', '第10课 金与南宋对峙', '第11课 元朝的建立与统一', '第12课 辽宋夏金元时期经济的繁荣', '第13课 辽宋夏金元时期的对外交流', '第14课 辽宋夏金元时期的科技与文化',
    '第15课 明朝的统治', '第16课 明朝的对外关系', '第17课 明朝的灭亡和清朝的建立', '第18课 清朝的边疆治理', '第19课 清朝君主专制的强化', '第20课 明清时期社会经济的发展', '第21课 明清时期的科技与文化', '第22课 活动课 我国传统节日的起源与传承',
  ],
  b8a: [
    '第1课 鸦片战争', '第2课 第二次鸦片战争', '第3课 太平天国运动',
    '第4课 洋务运动和边疆危机', '第5课 甲午中日战争与列强瓜分中国狂潮', '第6课 戊戌变法', '第7课 义和团运动和八国联军侵华',
    '第8课 中国同盟会', '第9课 辛亥革命', '第10课 帝制复辟与军阀割据',
    '第11课 五四运动', '第12课 中国共产党诞生',
    '第13课 国共合作与北伐战争', '第14课 毛泽东开辟井冈山道路', '第15课 中国工农红军长征与遵义会议',
    '第16课 从九一八事变到西安事变', '第17课 七七事变与全民族抗战', '第18课 全民族抗战中的正面战场和敌后战场', '第19课 抗日战争的胜利',
    '第20课 国民党挑起内战', '第21课 人民解放战争的胜利', '第22课 活动课 探寻红色文化的历史基因',
  ],
  b8b: [
    '第1课 中华人民共和国成立', '第2课 巩固人民民主政权', '第3课 社会主义制度建立', '第4课 独立自主的和平外交',
    '第5课 艰辛探索与曲折发展', '第6课 社会主义建设的巨大成就和先锋模范', '第7课 国防现代化起步和外交工作新突破',
    '第8课 伟大的历史转折', '第9课 改革开放的起步', '第10课 改革开放和社会主义现代化建设的全面展开', '第11课 社会主义初级阶段基本路线',
    '第12课 加快改革开放和社会主义现代化建设步伐', '第13课 中国特色社会主义事业取得新成就', '第14课 国防和外交工作新局面',
    '第15课 开始全面建设小康社会', '第16课 夺取全面建设小康社会新胜利', '第17课 推进国防军队建设和外交工作',
    '第18课 擘画中国梦宏伟蓝图', '第19课 决胜全面建成小康社会', '第20课 维护国家安全和推进祖国统一', '第21课 构建人类命运共同体与中国特色大国外交',
    '第22课 实现第一个百年奋斗目标', '第23课 开启全面建设社会主义现代化国家新征程', '第24课 活动课 新时代社会生活的巨大变化',
  ],
};

test('教材目录与统编版 2025 版一致：四册正课逐课快照', () => {
  for (const [id, expected] of Object.entries(CATALOGUE)) {
    const titles = book(id).units.filter((u) => u.no >= 1)
      .flatMap((u) => u.lessons.map((l) => `${l.label} ${l.title}`));
    assert.deepEqual(titles, expected, `${book(id).title} 的正课目录不对`);
  }
});

test('导言与学史方法：各册分组位置与课名', () => {
  const extra = (id) => book(id).units.filter((u) => u.no < 1)[0].lessons;
  assert.deepEqual(extra('b7a').map((l) => `${l.label} ${l.title}`), [
    '导言课 中国古代史开篇',
    '第21课 活动课 从考古发现看中华文明的起源',
    '学史方法（一） 如何从出土文物中获取信息',
    '学史方法（二） 如何掌握历史纪年法',
    '学史方法（三） 如何阅读历史地图',
  ]);
  assert.deepEqual(extra('b7b').map((l) => `${l.label} ${l.title}`), [
    '导言课 中国古代史（下）开篇',
    '学史方法（一） 如何读懂文献史料',
    '学史方法（二） 如何把握史事要素',
  ]);
  assert.deepEqual(extra('b8a').map((l) => `${l.label} ${l.title}`), [
    '导言课 中国近代史开篇',
    '学史方法（一） 如何评价历史人物',
    '学史方法（二） 如何从历史图像中获取信息',
    '学史方法（三） 如何从影视剧中获取信息',
  ]);
  // 八下的「学史方法」栏目与八上同为三则，位置在本册导言分组末位。
  assert.deepEqual(extra('b8b').map((l) => `${l.label} ${l.title}`), [
    '导言课 中国现代史开篇',
    '学史方法（一） 如何建立历史的纵向联系',
    '学史方法（二） 如何解读统计图表',
    '学史方法（三） 如何制作历史年表',
  ]);
});

test('知识点覆盖：八年级上册每课的选择题都在问不同的史实，不重复设问', () => {
  for (const unit of book('b8a').units) {
    for (const lesson of unit.lessons) {
      for (const typeId of TYPE_IDS) {
        const stems = questionsOf(lesson, typeId).map((q) => q.stem);
        assert.equal(new Set(stems).size, stems.length, `${lesson.title} 的 ${typeId} 题干重复`);
      }
    }
  }
});
