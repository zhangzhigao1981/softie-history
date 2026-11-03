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
const PENDING_BOOK_IDS = ['b8b'];

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

  assert.equal(TOTAL_LESSONS, 102);
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

test('题库：七上第 1 课 48 题，四类题型覆盖古人类、北京人与山顶洞人', () => {
  const l1 = book('b7a').units[0].lessons[0];
  assert.equal(l1.label, '第1课');
  assert.equal(l1.title, '远古时期的人类活动');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l1, typeId).length;
  assert.deepEqual(byType, { choice: 20, blank: 14, material: 8, timeline: 6 });
  assert.equal(lessonQuestionCount(l1), 48);
  assert.equal(bookQuestionCount(book('b7a')), 1405);
  // 本课三处子目（我国境内古人类、北京人、山顶洞人）都要有题落到。
  const stems = l1.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['元谋人', '蓝田人', '郧县人', '北京人', '山顶洞人', '裴文中', '天然火', '人工取火', '第一手资料']) {
    assert.ok(stems.includes(key), `第 1 课应覆盖 ${key}`);
  }
  // 七上 23 课已全部有题，不再有待补骨架。
  const empty = book('b7a').units.flatMap((u) => u.lessons).filter((l) => !l.questions.length);
  assert.deepEqual(empty, [], '七上不该再有待补的课');
});

test('题库：七上第 2 课 54 题，覆盖农业起源、河姆渡、仰韶与大汶口', () => {
  const l2 = book('b7a').units[0].lessons[1];
  assert.equal(l2.label, '第2课');
  assert.equal(l2.title, '原始农业与史前社会');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l2, typeId).length;
  assert.deepEqual(byType, { choice: 24, blank: 14, material: 10, timeline: 6 });
  assert.equal(lessonQuestionCount(l2), 54);
  // 三个子目与本课新增的两处遗址都要有题落到。
  const text = l2.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['河姆渡', '半坡', '仰韶', '大汶口', '龙山', '贾湖', '骨耜', '干栏式', '彩陶', '贫富分化']) {
    assert.ok(text.includes(key), `第 2 课应覆盖 ${key}`);
  }
});

test('题库：七上第 3 课 60 题，覆盖良渚、陶寺、多元一体与炎黄传说', () => {
  const l3 = book('b7a').units[0].lessons[2];
  assert.equal(l3.label, '第3课');
  assert.equal(l3.title, '中华文明的起源');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l3, typeId).length;
  assert.deepEqual(byType, { choice: 28, blank: 16, material: 11, timeline: 5 });
  assert.equal(lessonQuestionCount(l3), 60);
  const text = l3.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['良渚', '陶寺', '牛河梁', '红山文化', '多元', '一体', '禅让', '阪泉', '涿鹿', '人文初祖', '探源工程']) {
    assert.ok(text.includes(key), `第 3 课应覆盖 ${key}`);
  }
});

test('题库：七上第 4 课 56 题，覆盖夏商周更替、分封制与礼乐制度', () => {
  const l4 = book('b7a').units[1].lessons[0];
  assert.equal(l4.label, '第4课');
  assert.equal(l4.title, '夏商西周王朝的更替');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l4, typeId).length;
  assert.deepEqual(byType, { choice: 26, blank: 15, material: 10, timeline: 5 });
  assert.equal(lessonQuestionCount(l4), 56);
  const text = l4.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['禹', '启', '二里头', '汤', '盘庚', '牧野', '镐京', '分封', '卿大夫', '礼乐', '国人暴动', '犬戎']) {
    assert.ok(text.includes(key), `第 4 课应覆盖 ${key}`);
  }
});

test('题库：七上第 5 课 54 题，覆盖王室衰微、诸侯争霸、经济发展与民族关系', () => {
  const l5 = book('b7a').units[1].lessons[1];
  assert.equal(l5.label, '第5课');
  assert.equal(l5.title, '动荡变化中的春秋时期');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l5, typeId).length;
  assert.deepEqual(byType, { choice: 25, blank: 14, material: 10, timeline: 5 });
  assert.equal(lessonQuestionCount(l5), 54);
  const text = l5.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['平王东迁', '礼崩乐坏', '尊王攘夷', '齐桓公', '管仲', '弭兵', '铁制农具', '牛耕', '华夏认同', '勾践']) {
    assert.ok(text.includes(key), `第 5 课应覆盖 ${key}`);
  }
});

test('题库：七上第 6 课 63 题，覆盖战国七雄、商鞅变法与都江堰', () => {
  const l6 = book('b7a').units[1].lessons[2];
  assert.equal(l6.label, '第6课');
  assert.equal(l6.title, '战国时期的社会变革');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l6, typeId).length;
  assert.deepEqual(byType, { choice: 30, blank: 16, material: 12, timeline: 5 });
  assert.equal(lessonQuestionCount(l6), 63);
  const text = l6.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['战国七雄', '兼并', '商鞅', '秦孝公', '县制', '度量衡', '军功', '长平', '都江堰', '李冰']) {
    assert.ok(text.includes(key), `第 6 课应覆盖 ${key}`);
  }
});

test('题库：七上第 7 课 65 题，覆盖老子、孔子与诸子百家', () => {
  const l7 = book('b7a').units[1].lessons[3];
  assert.equal(l7.label, '第7课');
  assert.equal(l7.title, '百家争鸣');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l7, typeId).length;
  assert.deepEqual(byType, { choice: 32, blank: 16, material: 12, timeline: 5 });
  assert.equal(lessonQuestionCount(l7), 65);
  const text = l7.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['老子', '道德经', '无为而治', '孔子', '有教无类', '论语', '孟子', '仁政', '荀子', '墨子', '兼爱', '庄子', '韩非', '孙子兵法']) {
    assert.ok(text.includes(key), `第 7 课应覆盖 ${key}`);
  }
});

test('题库：七上第 8 课 61 题，覆盖天文历法、甲骨文、青铜器与诗经楚辞', () => {
  const l8 = book('b7a').units[1].lessons[4];
  assert.equal(l8.label, '第8课');
  assert.equal(l8.title, '夏商周时期的科技与文化');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l8, typeId).length;
  assert.deepEqual(byType, { choice: 29, blank: 15, material: 12, timeline: 5 });
  assert.equal(lessonQuestionCount(l8), 61);
  const text = l8.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['日食', '哈雷彗星', '二十四节气', '扁鹊', '黄帝内经', '甲骨文', '司母戊鼎', '金文', '何尊', '三星堆', '诗经', '楚辞']) {
    assert.ok(text.includes(key), `第 8 课应覆盖 ${key}`);
  }
});

test('题库：七上第 9 课 65 题，覆盖秦灭六国、中央集权与巩固统一措施', () => {
  const l9 = book('b7a').units[2].lessons[0];
  assert.equal(l9.label, '第9课');
  assert.equal(l9.title, '秦统一中国');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l9, typeId).length;
  assert.deepEqual(byType, { choice: 33, blank: 15, material: 12, timeline: 5 });
  assert.equal(lessonQuestionCount(l9), 65);
  const text = l9.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['咸阳', '皇帝', '三公', '御史大夫', '郡县', '小篆', '半两钱', '度量衡', '灵渠', '临洮', '兵马俑']) {
    assert.ok(text.includes(key), `第 9 课应覆盖 ${key}`);
  }
});

test('题库：七上第 10 课 60 题，覆盖秦的暴政、陈胜吴广起义与秦亡', () => {
  const l10 = book('b7a').units[2].lessons[1];
  assert.equal(l10.label, '第10课');
  assert.equal(l10.title, '秦末农民大起义');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l10, typeId).length;
  assert.deepEqual(byType, { choice: 29, blank: 15, material: 11, timeline: 5 });
  assert.equal(lessonQuestionCount(l10), 60);
  const text = l10.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['焚书坑儒', '骊山陵', '大泽乡', '渔阳', '张楚', '揭竿', '巨鹿', '破釜沉舟', '刘邦', '前 209']) {
    assert.ok(text.includes(key), `第 10 课应覆盖 ${key}`);
  }
});

test('题库：七上第 11 课 62 题，覆盖楚汉之争、休养生息与文景之治', () => {
  const l11 = book('b7a').units[2].lessons[2];
  assert.equal(l11.label, '第11课');
  assert.equal(l11.title, '西汉建立和“文景之治”');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l11, typeId).length;
  assert.deepEqual(byType, { choice: 31, blank: 15, material: 11, timeline: 5 });
  assert.equal(lessonQuestionCount(l11), 62);
  const text = l11.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['垓下', '西楚霸王', '长安', '约法三章', '十五税一', '休养生息', '和亲', '以农为本', '三十税一', '文景之治', '陆贾']) {
    assert.ok(text.includes(key), `第 11 课应覆盖 ${key}`);
  }
});

test('题库：七上第 12 课 72 题，覆盖推恩令、经济管控、尊崇儒术与北击匈奴', () => {
  const l12 = book('b7a').units[2].lessons[3];
  assert.equal(l12.label, '第12课');
  assert.equal(l12.title, '大一统王朝的巩固');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l12, typeId).length;
  assert.deepEqual(byType, { choice: 35, blank: 18, material: 13, timeline: 6 });
  assert.equal(lessonQuestionCount(l12), 72);
  const text = l12.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['推恩', '主父偃', '刺史', '五铢钱', '盐铁', '耧车', '董仲舒', '太学', '漠北', '河西四郡', '察举', '七国之乱']) {
    assert.ok(text.includes(key), `第 12 课应覆盖 ${key}`);
  }
});

test('题库：七上第 13 课 62 题，覆盖光武中兴、外戚宦官专权与黄巾起义', () => {
  const l13 = book('b7a').units[2].lessons[4];
  assert.equal(l13.label, '第13课');
  assert.equal(l13.title, '东汉的兴衰');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l13, typeId).length;
  assert.deepEqual(byType, { choice: 31, blank: 15, material: 11, timeline: 5 });
  assert.equal(lessonQuestionCount(l13), 62);
  const text = l13.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['王莽', '刘秀', '光武帝', '洛阳', '光武中兴', '外戚', '宦官', '梁冀', '太平道', '张角', '黄巾军', '州牧']) {
    assert.ok(text.includes(key), `第 13 课应覆盖 ${key}`);
  }
});

test('题库：七上第 14 课 68 题，覆盖张骞通西域、丝绸之路与西域管理', () => {
  const l14 = book('b7a').units[2].lessons[5];
  assert.equal(l14.label, '第14课');
  assert.equal(l14.title, '丝绸之路的开通与经营西域');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l14, typeId).length;
  assert.deepEqual(byType, { choice: 36, blank: 16, material: 11, timeline: 5 });
  assert.equal(lessonQuestionCount(l14), 68);
  const text = l14.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['西域', '大月氏', '张骞', '凿空', '长安', '河西走廊', '丝绸之路', '马六甲', '西域都护', '乌垒城', '班超', '甘英', '西域长史府']) {
    assert.ok(text.includes(key), `第 14 课应覆盖 ${key}`);
  }
});

test('题库：七上第 15 课 77 题，覆盖造纸术、医学数学、史记与宗教', () => {
  const l15 = book('b7a').units[2].lessons[6];
  assert.equal(l15.label, '第15课');
  assert.equal(l15.title, '秦汉时期的科技与文化');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l15, typeId).length;
  assert.deepEqual(byType, { choice: 40, blank: 18, material: 13, timeline: 6 });
  assert.equal(lessonQuestionCount(l15), 77);
  const text = l15.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['蔡伦', '蔡侯纸', '伤寒杂病论', '医圣', '麻沸散', '五禽戏', '九章算术', '氾胜之书', '司马迁', '史记', '纪传体', '汉书', '太平道', '五斗米道', '众生平等', '论衡']) {
    assert.ok(text.includes(key), `第 15 课应覆盖 ${key}`);
  }
});

test('题库：七上第 16 课 64 题，覆盖官渡之战、赤壁之战与三国建立', () => {
  const l16 = book('b7a').units[3].lessons[0];
  assert.equal(l16.label, '第16课');
  assert.equal(l16.title, '三国鼎立');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l16, typeId).length;
  assert.deepEqual(byType, { choice: 32, blank: 16, material: 11, timeline: 5 });
  assert.equal(lessonQuestionCount(l16), 64);
  const text = l16.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['官渡', '袁绍', '赤壁', '黄盖', '曹丕', '洛阳', '成都', '建业', '夷洲', '卫温', '翻车', '孟获']) {
    assert.ok(text.includes(key), `第 16 课应覆盖 ${key}`);
  }
});

test('题库：七上第 17 课 62 题，覆盖西晋统一、八王之乱与北方各族内迁', () => {
  const l17 = book('b7a').units[3].lessons[1];
  assert.equal(l17.label, '第17课');
  assert.equal(l17.title, '西晋的短暂统一和北方各族的内迁');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l17, typeId).length;
  assert.deepEqual(byType, { choice: 31, blank: 15, material: 11, timeline: 5 });
  assert.equal(lessonQuestionCount(l17), 62);
  const text = l17.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['司马炎', '洛阳', '灭吴', '八王之乱', '晋惠帝', '匈奴', '鲜卑', '羯', '氐', '羌', '关中', '汾河', '钱神论']) {
    assert.ok(text.includes(key), `第 17 课应覆盖 ${key}`);
  }
});

test('题库：七上第 18 课 65 题，覆盖东晋兴亡、南朝政治与江南开发', () => {
  const l18 = book('b7a').units[3].lessons[2];
  assert.equal(l18.label, '第18课');
  assert.equal(l18.title, '东晋南朝政治和江南地区开发');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l18, typeId).length;
  assert.deepEqual(byType, { choice: 32, blank: 16, material: 12, timeline: 5 });
  assert.equal(lessonQuestionCount(l18), 65);
  const text = l18.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['司马睿', '建康', '王导', '门阀政治', '祖逖', '南朝', '萧衍', '江南', '育秧', '灌钢法', '建康']) {
    assert.ok(text.includes(key), `第 18 课应覆盖 ${key}`);
  }
});

test('题库：七上第 19 课 73 题，覆盖淝水之战、孝文帝改革与民族交融', () => {
  const l19 = book('b7a').units[3].lessons[3];
  assert.equal(l19.label, '第19课');
  assert.equal(l19.title, '北朝政治和北方民族大交融');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l19, typeId).length;
  assert.deepEqual(byType, { choice: 38, blank: 17, material: 12, timeline: 6 });
  assert.equal(lessonQuestionCount(l19), 73);
  const text = l19.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['十六国', '苻坚', '王猛', '淝水', '草木皆兵', '拓跋', '孝文帝', '冯太后', '洛阳', '汉姓', '六镇', '柔然', '北周']) {
    assert.ok(text.includes(key), `第 19 课应覆盖 ${key}`);
  }
});

test('题库：七上第 20 课 72 题，覆盖齐民要术、祖冲之、书法绘画与石窟', () => {
  const l20 = book('b7a').units[3].lessons[4];
  assert.equal(l20.label, '第20课');
  assert.equal(l20.title, '三国两晋南北朝时期的科技与文化');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l20, typeId).length;
  assert.deepEqual(byType, { choice: 36, blank: 18, material: 12, timeline: 6 });
  assert.equal(lessonQuestionCount(l20), 72);
  const text = l20.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['齐民要术', '贾思勰', '祖冲之', '刘徽', '缀术', '大明历', '钟繇', '王羲之', '兰亭集序', '顾恺之', '云冈', '龙门', '范缜', '郦道元', '水经注']) {
    assert.ok(text.includes(key), `第 20 课应覆盖 ${key}`);
  }
});

test('题库：七下第 1 课 66 题，覆盖隋的统一、大运河、科举制与隋亡', () => {
  const l1 = book('b7b').units[0].lessons[0];
  assert.equal(l1.label, '第1课');
  assert.equal(l1.title, '隋朝统一与灭亡');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l1, typeId).length;
  assert.deepEqual(byType, { choice: 32, blank: 16, material: 12, timeline: 6 });
  assert.equal(lessonQuestionCount(l1), 66);
  const text = l1.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  // 四个子目与两处拓展都要有题落到。
  for (const key of ['杨坚', '大兴城', '陈后主', '流求', '洛阳', '涿郡', '余杭郡', '邗沟', '进士科', '江都', '含嘉仓', '皮日休']) {
    assert.ok(text.includes(key), `第 1 课应覆盖 ${key}`);
  }
  // 第 1 单元 7 课到这一课已全部补齐。
  for (const l of book('b7b').units[0].lessons) {
    assert.ok(l.questions.length > 0, `${l.label} ${l.title} 应已有题目`);
  }
});

test('题库：七下第 4 课 64 题，覆盖安史之乱、唐末变局与五代十国', () => {
  const l4 = book('b7b').units[0].lessons[3];
  assert.equal(l4.label, '第4课');
  assert.equal(l4.title, '安史之乱与唐朝衰亡');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l4, typeId).length;
  assert.deepEqual(byType, { choice: 30, blank: 15, material: 13, timeline: 6 });
  assert.equal(lessonQuestionCount(l4), 64);
  const text = l4.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['节度使', '外重内轻', '安禄山', '史思明', '755', '763', '郭子仪', '回纥', '藩镇割据', '黄巢', '大齐', '朱温', '后梁', '后周', '周世宗', '北汉']) {
    assert.ok(text.includes(key), `第 4 课应覆盖 ${key}`);
  }
});

test('题库：七下第 5 课 65 题，覆盖唐蕃和亲、突厥、回纥与渤海南诏', () => {
  const l5 = book('b7b').units[0].lessons[4];
  assert.equal(l5.label, '第5课');
  assert.equal(l5.title, '隋唐时期的民族交往与交融');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l5, typeId).length;
  assert.deepEqual(byType, { choice: 31, blank: 16, material: 12, timeline: 6 });
  assert.equal(lessonQuestionCount(l5), 65);
  const text = l5.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['松赞干布', '逻些', '641', '文成公主', '金城公主', '尺带珠丹', '唐蕃会盟碑', '天可汗', '安西都护府', '北庭都护府', '回纥', '怀仁可汗', '回鹘', '维吾尔族', '靺鞨', '大祚荣', '海东盛国', '皮逻阁', '云南王', '南诏']) {
    assert.ok(text.includes(key), `第 5 课应覆盖 ${key}`);
  }
  // 教材导语与课后活动的诗文、图像也要有题落到。
  for (const key of ['日月山', '凉州行', '法曲', '步辇图', '大昭寺']) {
    assert.ok(text.includes(key), `第 5 课应覆盖 ${key}`);
  }
});

test('题库：七下第 6 课 64 题，覆盖遣唐使、鉴真东渡、新罗、玄奘与大食', () => {
  const l6 = book('b7b').units[0].lessons[5];
  assert.equal(l6.label, '第6课');
  assert.equal(l6.title, '隋唐时期的中外文化交流');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l6, typeId).length;
  assert.deepEqual(byType, { choice: 30, blank: 16, material: 12, timeline: 6 });
  assert.equal(lessonQuestionCount(l6), 64);
  const text = l6.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['遣隋使', '遣唐使', '阿倍仲麻吕', '晁衡', '平城京', '和同开珎', '鉴真', '大明寺', '唐招提寺', '鸿胪寺', '崔致远', '桂苑笔耕集', '玄奘', '天竺', '那烂陀寺', '大唐西域记', '大食', '造纸术', '唐人']) {
    assert.ok(text.includes(key), `第 6 课应覆盖 ${key}`);
  }
  // 教材插图与课后活动也要有题落到。
  for (const key of ['弘法大师行状绘词', '客使图', '印度', '开元通宝']) {
    assert.ok(text.includes(key), `第 6 课应覆盖 ${key}`);
  }
});

test('题库：七下第 7 课 69 题，覆盖雕版印刷、天文医药、思想家与唐诗书画', () => {
  const l7 = book('b7b').units[0].lessons[6];
  assert.equal(l7.label, '第7课');
  assert.equal(l7.title, '隋唐时期的科技与文化');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l7, typeId).length;
  assert.deepEqual(byType, { choice: 33, blank: 17, material: 13, timeline: 6 });
  assert.equal(lessonQuestionCount(l7), 69);
  const text = l7.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['雕版印刷', '金刚经', '王玠', '藏经洞', '波斯', '一行', '大衍历', '子午线', '孙思邈', '千金方', '药王', '唐本草', '韩愈', '柳宗元', '元气', '李白', '诗仙', '杜甫', '诗史', '白居易', '颜真卿', '柳公权', '阎立本', '吴道子', '莫高窟', '鸣沙山', '赵州桥', '李春']) {
    assert.ok(text.includes(key), `第 7 课应覆盖 ${key}`);
  }
  // 教材的插图、学史崇德与知识拓展也要有题落到。
  for (const key of ['颜勤礼碑', '玄秘塔碑', '送子天王图', '人命至重', '敞肩拱']) {
    assert.ok(text.includes(key), `第 7 课应覆盖 ${key}`);
  }
});

test('题库：七下第 8 课 67 题，覆盖陈桥兵变、中央集权加强与王安石变法', () => {
  const l8 = book('b7b').units[1].lessons[0];
  assert.equal(l8.label, '第8课');
  assert.equal(l8.title, '北宋的政治');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l8, typeId).length;
  assert.deepEqual(byType, { choice: 33, blank: 16, material: 12, timeline: 6 });
  assert.equal(lessonQuestionCount(l8), 67);
  const text = l8.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['赵匡胤', '陈桥兵变', '黄袍', '开封', '先南后北', '北汉', '崇文抑武', '杯酒释兵权', '通判', '知州', '节度使', '殿试', '天子门生', '王安石', '宋神宗', '青苗法', '募役法', '方田均税法', '保甲法', '王小波']) {
    assert.ok(text.includes(key), `第 8 课应覆盖 ${key}`);
  }
  // 材料研读、学史崇德与知识拓展也要有题落到。
  for (const key of ['儒林公议', '赵普', '范仲淹', '百家姓']) {
    assert.ok(text.includes(key), `第 8 课应覆盖 ${key}`);
  }
});

test('题库：七下第 9 课 66 题，覆盖契丹与西夏建国、澶渊之盟与宋夏和议', () => {
  const l9 = book('b7b').units[1].lessons[1];
  assert.equal(l9.label, '第9课');
  assert.equal(l9.title, '辽、西夏与北宋并立');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l9, typeId).length;
  assert.deepEqual(byType, { choice: 32, blank: 16, material: 12, timeline: 6 });
  assert.equal(lessonQuestionCount(l9), 66);
  const text = l9.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['契丹', '耶律阿保机', '上京', '党项', '元昊', '兴庆府', '西夏文字', '石敬瑭', '燕云十六州', '寇准', '宋真宗', '澶渊之盟', '岁币', '岁赐', '榷场', '应县木塔']) {
    assert.ok(text.includes(key), `第 9 课应覆盖 ${key}`);
  }
  // 材料研读、想一想与知识拓展也要有题落到。
  for (const key of ['以国制治契丹', '天朝万顺', '敕燃马牌', '西州回鹘']) {
    assert.ok(text.includes(key), `第 9 课应覆盖 ${key}`);
  }
});

test('题库：七下第 10 课 67 题，覆盖金灭辽北宋、靖康之变与岳飞抗金', () => {
  const l10 = book('b7b').units[1].lessons[2];
  assert.equal(l10.label, '第10课');
  assert.equal(l10.title, '金与南宋对峙');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l10, typeId).length;
  assert.deepEqual(byType, { choice: 32, blank: 16, material: 13, timeline: 6 });
  assert.equal(lessonQuestionCount(l10), 67);
  const text = l10.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['女真', '完颜', '阿骨打', '会宁府', '金太祖', '1125', '1127', '靖康之变', '赵构', '宋高宗', '临安', '岳飞', '岳家军', '郾城', '莫须有', '1141', '淮水', '大散关', '秦桧', '八字军', '金世宗']) {
    assert.ok(text.includes(key), `第 10 课应覆盖 ${key}`);
  }
  // 材料研读、想一想、知识拓展与课后活动也要有题落到。
  for (const key of ['宾铁', '卤簿钟', '题临安邸', '译经所']) {
    assert.ok(text.includes(key), `第 10 课应覆盖 ${key}`);
  }
});

test('题库：七下第 11 课 70 题，覆盖蒙古兴起、元朝统一、行省制与民族交融', () => {
  const l11 = book('b7b').units[1].lessons[3];
  assert.equal(l11.label, '第11课');
  assert.equal(l11.title, '元朝的建立与统一');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l11, typeId).length;
  assert.deepEqual(byType, { choice: 34, blank: 17, material: 13, timeline: 6 });
  assert.equal(lessonQuestionCount(l11), 70);
  const text = l11.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['铁木真', '成吉思汗', '1260', '忽必烈', '1271', '大都', '1276', '临安', '1279', '文天祥', '汗青', '中书省', '枢密院', '御史台', '宣政院', '行省', '澎湖', '巡检司', '北庭都元帅府', '宣慰使司', '凉州', '回回', '四等人制', '色目人', '妙应寺', '驿站']) {
    assert.ok(text.includes(key), `第 11 课应覆盖 ${key}`);
  }
  // 材料研读、相关史事与知识拓展也要有题落到。
  for (const key of ['元史·地理志', '钓鱼城', '阔端', '急递铺', '正气歌']) {
    assert.ok(text.includes(key), `第 11 课应覆盖 ${key}`);
  }
});

test('题库：七下第 12 课 72 题，覆盖农业、手工业、商业与经济重心南移', () => {
  const l12 = book('b7b').units[1].lessons[4];
  assert.equal(l12.label, '第12课');
  assert.equal(l12.title, '辽宋夏金元时期经济的繁荣');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l12, typeId).length;
  assert.deepEqual(byType, { choice: 36, blank: 17, material: 13, timeline: 6 });
  assert.equal(lessonQuestionCount(l12), 72);
  const text = l12.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['占城稻', '秧马', '苏湖熟', '复种', '会通河', '通惠河', '汝窑', '定窑', '钧窑', '青花瓷', '鸡冠壶', '黄道婆', '松江', '交子', '瓦子', '勾栏', '清明上河图', '张择端', '经济重心南移', '仰给东南']) {
    assert.ok(text.includes(key), `第 12 课应覆盖 ${key}`);
  }
  // 相关史事、人物扫描与知识拓展也要有题落到。
  for (const key of ['水密隔舱', '船坞', '货郎图', '白兔', '两熟制']) {
    assert.ok(text.includes(key), `第 12 课应覆盖 ${key}`);
  }
});

test('题库：七下第 13 课 68 题，覆盖中外交通、海外贸易与文化交流', () => {
  const l13 = book('b7b').units[1].lessons[5];
  assert.equal(l13.label, '第13课');
  assert.equal(l13.title, '辽宋夏金元时期的对外交流');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l13, typeId).length;
  assert.deepEqual(byType, { choice: 32, blank: 17, material: 13, timeline: 6 });
  assert.equal(lessonQuestionCount(l13), 68);
  const text = l13.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['草原丝绸之路', '波斯湾', '鼎盛', '马可·波罗', '市舶司', '泉州', '明州', '140', '香料', '象牙', '蒲寿庚', '六胜塔', '回回药方', '指南针', '南海一号']) {
    assert.ok(text.includes(key), `第 13 课应覆盖 ${key}`);
  }
  // 材料研读、相关史事与知识拓展也要有题落到。
  for (const key of ['市舶之利最厚', '朔门', '清真寺', '来样加工']) {
    assert.ok(text.includes(key), `第 13 课应覆盖 ${key}`);
  }
});

test('题库：七下第 14 课 73 题，覆盖活字印刷、指南针火药、天文、理学与宋词元曲', () => {
  const l14 = book('b7b').units[1].lessons[6];
  assert.equal(l14.label, '第14课');
  assert.equal(l14.title, '辽宋夏金元时期的科技与文化');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l14, typeId).length;
  assert.deepEqual(byType, { choice: 37, blank: 17, material: 13, timeline: 6 });
  assert.equal(lessonQuestionCount(l14), 73);
  const text = l14.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['毕昇', '泥活字', '王祯', '转轮排字盘', '锡活字', '司南', '罗盘', '指南针', '突火枪', '火铳', '铜火炮', '四大发明', '沈括', '十二气历', '梦溪笔谈', '苏颂', '水运仪象台', '郭守敬', '简仪', '授时历', '365.2425', '程朱理学', '朱熹', '词牌', '苏轼', '李清照', '辛弃疾', '陆游', '关汉卿', '窦娥冤', '资治通鉴', '史学两司马']) {
    assert.ok(text.includes(key), `第 14 课应覆盖 ${key}`);
  }
  // 材料研读、相关史事、知识拓展与课后活动也要有题落到。
  for (const key of ['白象塔', '石油', '培根', '马致远']) {
    assert.ok(text.includes(key), `第 14 课应覆盖 ${key}`);
  }
  // 第二单元 7 课到这一课已全部补齐。
  for (const l of book('b7b').units[1].lessons) {
    assert.ok(l.questions.length > 0, `${l.label} ${l.title} 应已有题目`);
  }
});

test('题库：七下第 15 课 69 题，覆盖明朝建立、强化皇权、八股取士与民族关系', () => {
  const l15 = book('b7b').units[2].lessons[0];
  assert.equal(l15.label, '第15课');
  assert.equal(l15.title, '明朝的统治');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l15, typeId).length;
  assert.deepEqual(byType, { choice: 33, blank: 17, material: 13, timeline: 6 });
  assert.equal(lessonQuestionCount(l15), 69);
  const text = l15.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['朱元璋', '应天府', '靖难之役', '朱棣', '北京', '丞相', '六部', '五军都督府', '兵部', '内阁', '首辅', '三司', '锦衣卫', '东厂', '西厂', '厂卫', '四书', '四书章句集注', '八股文', '乡试', '会试', '殿试', '奴儿干都司', '俺答汗', '隆庆和议', '大明律']) {
    assert.ok(text.includes(key), `第 15 课应覆盖 ${key}`);
  }
  // 材料研读、相关史事与想一想也要有题落到。
  for (const key of ['皇明祖训', '江南贡院', '库页岛', '削藩']) {
    assert.ok(text.includes(key), `第 15 课应覆盖 ${key}`);
  }
});

test('题库：七下第 16 课 69 题，覆盖郑和下西洋、戚继光抗倭、援朝与澳门', () => {
  const l16 = book('b7b').units[2].lessons[1];
  assert.equal(l16.label, '第16课');
  assert.equal(l16.title, '明朝的对外关系');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l16, typeId).length;
  assert.deepEqual(byType, { choice: 33, blank: 17, material: 13, timeline: 6 });
  assert.equal(lessonQuestionCount(l16), 69);
  const text = l16.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['郑和', '明成祖', '1405', '1433', '七次', '红海', '西洋', '三宝', '榜葛剌', '戚继光', '倭寇', '戚家军', '台州', '纪效新书', '丰臣秀吉', '葡萄牙', '1553', '澳门', '守澳官', '陈诚']) {
    assert.ok(text.includes(key), `第 16 课应覆盖 ${key}`);
  }
  // 材料研读、相关史事与知识拓展也要有题落到。
  for (const key of ['天妃灵应之记', '麒麟', '浡泥', '苏禄']) {
    assert.ok(text.includes(key), `第 16 课应覆盖 ${key}`);
  }
});

test('题库：七下第 17 课 67 题，覆盖张居正改革、李自成起义与清朝建立', () => {
  const l17 = book('b7b').units[2].lessons[2];
  assert.equal(l17.label, '第17课');
  assert.equal(l17.title, '明朝的灭亡和清朝的建立');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l17, typeId).length;
  assert.deepEqual(byType, { choice: 32, blank: 16, material: 13, timeline: 6 });
  assert.equal(lessonQuestionCount(l17), 67);
  const text = l17.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['张居正', '一条鞭法', '魏忠贤', '刘瑾', '东林书院', '李自成', '均田免粮', '大顺', '西安', '崇祯', '努尔哈赤', '后金', '皇太极', '满洲', '大清', '吴三桂', '八旗']) {
    assert.ok(text.includes(key), `第 17 课应覆盖 ${key}`);
  }
  // 材料研读、人物扫描与知识拓展也要有题落到。
  for (const key of ['通识时变', '闯王', '沈阳故宫', '九千岁']) {
    assert.ok(text.includes(key), `第 17 课应覆盖 ${key}`);
  }
});

test('题库：七下第 18 课 73 题，覆盖台湾建制、西藏管辖、西北平叛与雅克萨', () => {
  const l18 = book('b7b').units[2].lessons[3];
  assert.equal(l18.label, '第18课');
  assert.equal(l18.title, '清朝的边疆治理');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l18, typeId).length;
  assert.deepEqual(byType, { choice: 36, blank: 17, material: 14, timeline: 6 });
  assert.equal(lessonQuestionCount(l18), 73);
  const text = l18.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['荷兰', '郑成功', '1662', '1683', '1684', '台湾府', '达赖喇嘛', '班禅额尔德尼', '驻藏大臣', '噶厦', '金瓶掣签', '噶尔丹', '大小和卓', '伊犁将军', '土尔扈特', '渥巴锡', '雅克萨', '尼布楚条约', '巴勒喀什池', '库页岛', '钓鱼岛']) {
    assert.ok(text.includes(key), `第 18 课应覆盖 ${key}`);
  }
  // 材料研读、相关史事与知识拓展也要有题落到。
  for (const key of ['开台圣王', '顺风相送', '琼州府', '避暑山庄', '藏内善后章程']) {
    assert.ok(text.includes(key), `第 18 课应覆盖 ${key}`);
  }
});

test('题库：七下第 19 课 67 题，覆盖军机处、文字狱、社会矛盾与闭关政策', () => {
  const l19 = book('b7b').units[2].lessons[4];
  assert.equal(l19.label, '第19课');
  assert.equal(l19.title, '清朝君主专制的强化');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l19, typeId).length;
  assert.deepEqual(byType, { choice: 32, blank: 16, material: 13, timeline: 6 });
  assert.equal(lessonQuestionCount(l19), 67);
  const text = l19.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['议政王大臣会议', '南书房', '军机房', '军机处', '军机大臣', '奏折', '文字狱', '胡中藻', '尊孔读经', '和珅', '白莲教', '禁海令', '广州十三行', '闭关', '马戛尔尼']) {
    assert.ok(text.includes(key), `第 19 课应覆盖 ${key}`);
  }
  // 材料研读、相关史事与知识拓展也要有题落到。
  for (const key of ['檐曝杂记', '南书房行走', '嘉庆', '天朝物产丰盈']) {
    assert.ok(text.includes(key), `第 19 课应覆盖 ${key}`);
  }
});

test('题库：七下第 20 课 67 题，覆盖农业恢复、手工业商业发展与人口增长', () => {
  const l20 = book('b7b').units[2].lessons[5];
  assert.equal(l20.label, '第20课');
  assert.equal(l20.title, '明清时期社会经济的发展');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l20, typeId).length;
  assert.deepEqual(byType, { choice: 32, blank: 16, material: 13, timeline: 6 });
  assert.equal(lessonQuestionCount(l20), 67);
  const text = l20.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['轻徭薄赋', '鱼鳞图册', '河道总督', '玉米', '松江', '景德镇', '机户', '票号', '徽商', '白银', '滋生人丁', '田赋', '天下四聚', '湖广']) {
    assert.ok(text.includes(key), `第 20 课应覆盖 ${key}`);
  }
  // 材料研读、相关史事与知识拓展也要有题落到。
  for (const key of ['明神宗实录', '姑苏繁华图', '商帮', '商品粮基地']) {
    assert.ok(text.includes(key), `第 20 课应覆盖 ${key}`);
  }
});

test('题库：七下第 21 课 72 题，覆盖科技名著、长城北京城、思想家与小说戏曲', () => {
  const l21 = book('b7b').units[2].lessons[6];
  assert.equal(l21.label, '第21课');
  assert.equal(l21.title, '明清时期的科技与文化');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l21, typeId).length;
  assert.deepEqual(byType, { choice: 36, blank: 17, material: 13, timeline: 6 });
  assert.equal(lessonQuestionCount(l21), 72);
  const text = l21.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['李时珍', '本草纲目', '徐光启', '农政全书', '利玛窦', '几何原本', '徐霞客', '宋应星', '天工开物', '嘉峪关', '紫禁城', '中轴线', '王守仁', '知行合一', '黄宗羲', '顾炎武', '王夫之', '罗贯中', '曹雪芹', '红楼梦', '汤显祖', '牡丹亭', '昆曲', '京剧']) {
    assert.ok(text.includes(key), `第 21 课应覆盖 ${key}`);
  }
  // 材料研读、相关史事与知识拓展也要有题落到。
  for (const key of ['贵五谷而贱金玉', '长生殿', '桃花扇', '永乐大典', '四库全书']) {
    assert.ok(text.includes(key), `第 21 课应覆盖 ${key}`);
  }
  // 第三单元正课 7 课到这一课已全部补齐（活动课第 22 课仍待补）。
  for (const l of book('b7b').units[2].lessons.slice(0, 7)) {
    assert.ok(l.questions.length > 0, `${l.label} ${l.title} 应已有题目`);
  }
});

test('题库：七下第 3 课 68 题，覆盖开元盛世、经济繁荣与长安城', () => {
  const l3 = book('b7b').units[0].lessons[2];
  assert.equal(l3.label, '第3课');
  assert.equal(l3.title, '“开元盛世”与唐朝经济的繁荣');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l3, typeId).length;
  assert.deepEqual(byType, { choice: 32, blank: 16, material: 14, timeline: 6 });
  assert.equal(lessonQuestionCount(l3), 68);
  const text = l3.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['开元', '姚崇', '宋璟', '裁减冗员', '曲辕犁', '筒车', '四善', '蜀锦', '越窑', '邢窑', '唐三彩', '陆羽', '茶圣', '扬一益二', '草市', '朱雀街', '坊', '百万']) {
    assert.ok(text.includes(key), `第 3 课应覆盖 ${key}`);
  }
});

test('题库：七下第 2 课 62 题，覆盖唐朝建立、贞观之治与武则天', () => {
  const l2 = book('b7b').units[0].lessons[1];
  assert.equal(l2.label, '第2课');
  assert.equal(l2.title, '唐朝建立与“贞观之治”');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l2, typeId).length;
  assert.deepEqual(byType, { choice: 29, blank: 15, material: 12, timeline: 6 });
  assert.equal(lessonQuestionCount(l2), 62);
  const text = l2.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['李渊', '昭陵六骏', '覆舟', '魏征', '房玄龄', '中书省', '门下省', '尚书省', '进士', '武则天', '殿试', '乾陵', '国子监', '四门学']) {
    assert.ok(text.includes(key), `第 2 课应覆盖 ${key}`);
  }
});

test('题库：七上导言课 40 题，按四单元导语与大事年表铺开', () => {
  const intro = book('b7a').units[4].lessons[0];
  assert.equal(intro.label, '导言课');
  assert.equal(intro.title, '中国古代史开篇');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(intro, typeId).length;
  assert.deepEqual(byType, { choice: 18, blank: 9, material: 8, timeline: 5 });
  assert.equal(lessonQuestionCount(intro), 40);
  const text = intro.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  for (const key of ['元谋人', '多元一体', '夏朝', '统一多民族', '大一统', '汉武帝', '280', '孝文帝', '江南', '齐民要术', '公元元年']) {
    assert.ok(text.includes(key), `导言课应覆盖 ${key}`);
  }
});

test('题库：七上学史方法合并为一课 60 题，文物、纪年、地图三块都有题', () => {
  const extra = book('b7a').units[4].lessons.filter((l) => l.label === '学史方法');
  assert.equal(extra.length, 1, '三则学史方法应合并成一课');
  const m = extra[0];
  assert.equal(m.title, '文物、纪年与地图的读法');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(m, typeId).length;
  assert.deepEqual(byType, { choice: 26, blank: 14, material: 12, timeline: 8 });
  assert.equal(lessonQuestionCount(m), 60);
  const text = m.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  // 三块内容都要有题落到：文物三价值、四种纪年法、读图四步。
  for (const key of ['司母戊鼎', '泥范铸造', '艺术价值', '干支', '甲子', '王位纪年', '年号', '汉武帝', '公元元年', '图名', '图例', '图注', '乌巢', '黄河']) {
    assert.ok(text.includes(key), `学史方法应覆盖 ${key}`);
  }
});

test('题库：七上第 21 课活动课 42 题，落在玉钺、文明三标志与多元一体', () => {
  const act = book('b7a').units[4].lessons[1];
  assert.equal(act.label, '第21课');
  assert.equal(act.title, '活动课 从考古发现看中华文明的起源');
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(act, typeId).length;
  assert.deepEqual(byType, { choice: 18, blank: 9, material: 10, timeline: 5 });
  assert.equal(lessonQuestionCount(act), 42);
  const text = act.questions.map((q) => q.stem + (q.material || '') + q.options.join('')).join('');
  // 器物（玉钺）、方法（论证三标志）、时空（多元一体）三类落点都要有题。
  for (const key of ['1986', '玉钺', '瑁', '镦', '神人兽面纹', '私有制', '阶级', '国家', '探源工程', '多元一体', '中原', '图表']) {
    assert.ok(text.includes(key), `第 21 课应覆盖 ${key}`);
  }
});

test('题库：八上全册 26 课都有题，共 1150 题且全部通过自检', () => {
  assert.equal(TOTAL_QUESTIONS, 3980);
  assert.deepEqual(TYPE_IDS, ['choice', 'blank', 'material', 'timeline']);

  const counts = { choice: 0, blank: 0, material: 0, timeline: 0 };
  const problems = [];
  const withQuestions = [];
  for (const unit of book('b8a').units) {
    for (const lesson of unit.lessons) {
      if (lesson.questions.length) withQuestions.push(lesson.id);
      for (const typeId of TYPE_IDS) {
        const list = questionsOf(lesson, typeId);
        assert.equal(countByType(lesson, typeId), list.length);
        counts[typeId] += list.length;
        for (const q of list) problems.push(...validateQuestion(q).map((p) => `${q.id}: ${p}`));
      }
      assert.equal(lessonQuestionCount(lesson), lesson.questions.length);
    }
  }
  // 七单元加导言与学法共 26 课，全部补齐。
  assert.deepEqual(withQuestions, ['b8a-u1-l1', 'b8a-u1-l2', 'b8a-u1-l3', 'b8a-u2-l1', 'b8a-u2-l2', 'b8a-u2-l3', 'b8a-u2-l4', 'b8a-u3-l1', 'b8a-u3-l2', 'b8a-u3-l3', 'b8a-u4-l1', 'b8a-u4-l2', 'b8a-u5-l1', 'b8a-u5-l2', 'b8a-u5-l3', 'b8a-u6-l1', 'b8a-u6-l2', 'b8a-u6-l3', 'b8a-u6-l4', 'b8a-u7-l1', 'b8a-u7-l2', 'b8a-u7-l3', 'b8a-u0-l1', 'b8a-u0-l2', 'b8a-u0-l3', 'b8a-u0-l4']);
  assert.deepEqual(counts, { choice: 418, blank: 466, material: 136, timeline: 130 });
  assert.deepEqual(problems, []);

  // 有题的课，四类题型都够凑满一轮。
  const everyLesson = book('b8a').units.flatMap((u) => u.lessons);
  for (const lessonId of withQuestions) {
    const lesson = everyLesson.find((l) => l.id === lessonId);
    for (const typeId of TYPE_IDS) {
      assert.ok(questionsOf(lesson, typeId).length >= ROUND_SIZE, `${lesson.label} 的 ${typeId} 不足一轮`);
    }
  }
});

test('待补的册与课：骨架在、题目为空，界面能识别出「没有题」', () => {
  for (const id of PENDING_BOOK_IDS) {
    const bk = book(id);
    assert.ok(bk.units.length > 0, `${bk.title} 要有单元`);
    assert.equal(bookQuestionCount(bk), 0, `${bk.title} 现在不该有题目`);
  }

  // 八上 26 课已全部有题，逐课确认非空。
  const FILLED = new Set(['b8a-u1-l1', 'b8a-u1-l2', 'b8a-u1-l3', 'b8a-u2-l1', 'b8a-u2-l2', 'b8a-u2-l3', 'b8a-u2-l4', 'b8a-u3-l1', 'b8a-u3-l2', 'b8a-u3-l3', 'b8a-u4-l1', 'b8a-u4-l2', 'b8a-u5-l1', 'b8a-u5-l2', 'b8a-u5-l3', 'b8a-u6-l1', 'b8a-u6-l2', 'b8a-u6-l3', 'b8a-u6-l4', 'b8a-u7-l1', 'b8a-u7-l2', 'b8a-u7-l3', 'b8a-u0-l1', 'b8a-u0-l2', 'b8a-u0-l3', 'b8a-u0-l4']);
  let pending = 0;
  for (const unit of book('b8a').units) {
    assert.ok(unit.lessons.length > 0, `八上 ${unit.name} 要有课`);
    for (const lesson of unit.lessons) {
      if (FILLED.has(lesson.id)) {
        assert.ok(lesson.questions.length > 0, `${lesson.label} ${lesson.title} 要有题目`);
        continue;
      }
      assert.deepEqual(lesson.questions, [], `${lesson.label} ${lesson.title} 还没有题目`);
      for (const typeId of TYPE_IDS) assert.equal(questionsOf(lesson, typeId).length, 0);
      pending += 1;
    }
  }
  assert.equal(pending, 0, '八上 26 课应全部有题');
  // 清题不动骨架：课目录仍然是 102 课。
  assert.equal(TOTAL_LESSONS, 102);

  assert.deepEqual(PLAYABLE_BOOKS.map((b) => b.id), ['b7a', 'b7b', 'b8a']);
  assert.equal(DEFAULT_BOOK.id, 'b7a', '默认落在第一本有题的册');
  assert.equal(bookQuestionCount(book('b7a')), 1405);

  // 打开有题的册落到第 1 课；空册回落到首单元首课，不致抛错。
  const opened = firstPlayableLesson(book('b8a'));
  assert.equal(opened.lesson.id, 'b8a-u1-l1');
  assert.equal(bookQuestionCount(book('b8a')), 1150);
  const l1 = book('b8a').units[0].lessons[0];
  const byType = {};
  for (const typeId of TYPE_IDS) byType[typeId] = questionsOf(l1, typeId).length;
  assert.deepEqual(byType, { choice: 16, blank: 48, material: 9, timeline: 5 });
  const l2 = book('b8a').units[0].lessons[1];
  const byType2 = {};
  for (const typeId of TYPE_IDS) byType2[typeId] = questionsOf(l2, typeId).length;
  assert.deepEqual(byType2, { choice: 12, blank: 22, material: 6, timeline: 5 });
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
    assert.equal(q.options.length, 4, `各类题型都是四选一：${q.id}`);
    if (q.type === 'blank') assert.ok(q.stem.includes('____'), `填空题缺少空格：${q.id}`);
    if (q.type === 'material') {
      assert.ok(q.material.trim().length >= 10, `材料过短：${q.id}`);
      // 答案不能是「①②③④」这种序号：朗读时既没有信息量，也会让「朗读不泄露答案」失效。
      assert.ok(q.options[q.answer].length >= 2, `材料题答案过短：${q.id}`);
    }
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
  assert.deepEqual(TYPES.map((t) => t.seconds), [40, 45, 70, 50], '材料题要给足读材料的时间');
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
    '第1课 隋朝统一与灭亡', '第2课 唐朝建立与“贞观之治”', '第3课 “开元盛世”与唐朝经济的繁荣', '第4课 安史之乱与唐朝衰亡', '第5课 隋唐时期的民族交往与交融', '第6课 隋唐时期的中外文化交流', '第7课 隋唐时期的科技与文化',
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
  // 七上的三则学史方法合并成一课「学史方法」，仍在本册导言分组末位。
  assert.deepEqual(extra('b7a').map((l) => `${l.label} ${l.title}`), [
    '导言课 中国古代史开篇',
    '第21课 活动课 从考古发现看中华文明的起源',
    '学史方法 文物、纪年与地图的读法',
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
