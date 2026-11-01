import test from 'node:test';
import assert from 'node:assert/strict';

import { createApp, QUESTIONS, TYPES, BOOKS } from './helpers/app-harness.mjs';
import { freshSave, currentStreak, dayKey } from '../js/storage.js';
import { ROUND_SIZE, REVIEW_SIZE, DEFAULT_BOOK } from '../js/course.js';
import { questionSeconds } from '../js/timer.js';

const UNIT1 = DEFAULT_BOOK.units[0];
const LESSON1 = UNIT1.lessons[0];

function questSave(day, completed = false) {
  const save = freshSave();
  save.settings.motion = false;
  save.quests = {
    day, rewarded: false, doneDays: {},
    list: [
      { id: 'play1', goal: 1, prog: completed ? 1 : 0, done: completed },
      { id: 'combo5', goal: 5, prog: completed ? 5 : 0, done: completed },
      { id: 'first5', goal: 5, prog: completed ? 5 : 0, done: completed },
    ],
  };
  return save;
}

test('首页默认落在第一单元第一课，从首页可以直接开始一轮', async () => {
  const f = createApp();
  assert.equal(f.app.scene.screen, 'home');
  const tabs = f.$('#unit-tabs').innerHTML;
  assert.ok(tabs.includes('data-unit="u1"') && /导言/.test(tabs), '单元标签要包含全部单元');
  assert.ok(tabs.includes('class="unit-tab active"'), '当前单元要高亮');
  const cards = f.$('#lesson-list').innerHTML;
  assert.ok(cards.includes('data-lesson="b7a-u1-l1"'), '课程卡要带上课程 id');
  assert.ok(cards.includes('第1课') && cards.includes('远古时期的人类活动'));
  assert.ok(f.$('#start-label').textContent.includes('开始闯关'));
  assert.ok(f.$('#start-note').textContent.includes('一轮 5 题'), '开始按钮要写明本轮题量');

  f.$('#start-round').click();
  assert.equal(f.app.scene.screen, 'play');
  assert.equal(f.app.scene.questions.length, ROUND_SIZE);
  assert.ok(f.app.scene.questions.every((q) => q.type === 'choice'));
  assert.ok(f.app.scene.questions.every((q) => q.lessonId === LESSON1.id));
});

test('四种题型都能完整走完一轮，题面、候选与解析各就各位', async () => {
  for (const type of TYPES) {
    const f = createApp({ type: type.id });
    f.app.start('lesson');
    // 第 1 课四类题型的池子都够一轮 5 题。
    assert.equal(f.app.scene.questions.length, ROUND_SIZE, '一轮 5 题');
    assert.ok(f.app.scene.questions.every((q) => q.type === type.id), `${type.label} 一轮里只出本題型`);

    const q = f.app.scene.questions[0];
    assert.equal(f.$('#type-tag').textContent, type.label);
    assert.equal(f.$('#stem-guide').textContent, type.guide);
    assert.equal(f.$('#blank-count').textContent, type.note);
    assert.equal(f.$('#level-tag').textContent, `${q.lessonLabel} · ${type.label}`);
    assert.equal(f.$('#level-tag').textContent.includes(q.lessonLabel), true);
    assert.equal(f.app.scene.timeLeft, questionSeconds(type) * 1000, '每题用自己的时限');

    // 材料题才显示材料框，时间轴题才显示时间轴
    assert.equal(f.$('#material-text').hidden, type.id !== 'material');
    if (type.id === 'material') assert.equal(f.$('#material-text').textContent, q.material);
    assert.equal(f.$('#axis-board').hidden, type.id !== 'timeline');
    if (type.id === 'timeline') {
      const axisHtml = f.$('#axis-board').innerHTML;
      assert.equal((axisHtml.match(/class="axis-node/g) || []).length, q.axis.length, '时间轴节点数要对上');
      assert.equal((axisHtml.match(/is-blank/g) || []).length, 1, '时间轴恰好留一个空位');
      assert.match(axisHtml, /class="axis-year">[^<]*\d/, '节点要显示年份');
    }

    // 候选数量与标签
    const buttons = f.$('#choices').children;
    assert.equal(buttons.length, 4);
    assert.equal(buttons.filter((b) => b.dataset.char === f.app.scene.correctKey).length, 1);
    const density = f.$('#choices').dataset.density;
    assert.ok(['stack', 'pair', 'trio'].includes(density), `未知排布：${density}`);

    // 作答位的排布：填空题嵌在题干里，其余单独一列
    assert.equal(f.$('#word-slots').className, type.id === 'blank' ? 'word-slots inline' : 'word-slots');
    assert.equal(f.$('#slot-home').children.length, type.id === 'blank' ? 0 : 1);
    assert.equal(f.doc.body.dataset.questionType, type.id, '题型要挂到 body 上，答案格的版式靠它分型');

    await f.answer({});
    assert.equal(f.app.scene.phase, 'explain');
    assert.equal(f.$('#answer-word').textContent, q.options[q.answer]);
    assert.equal(f.$('#meaning').textContent, q.explain);
    assert.ok(f.$('#example').textContent.startsWith('教材定位：'));
    assert.equal(f.$('.explain-heading span').textContent, '这个知识点记牢了');
    assert.equal(f.$('#answer-area').hidden, true);
    assert.equal(f.$('#explanation').hidden, false);

    const roundSize = f.app.scene.questions.length;
    await f.round({});
    assert.equal(f.app.scene.screen, 'result');
    assert.equal(f.app.saved.learned.length, roundSize);
    assert.equal(f.app.saved.history.length, 1);
    assert.equal(f.app.saved.history[0].type, type.label);
    assert.equal(f.app.saved.history[0].total, roundSize);
    assert.ok(f.app.saved.history[0].lesson.includes(LESSON1.title));
  }
});

test('切换单元、课时与题型只改写界面键，学习记录不受影响', async () => {
  const f = createApp();
  f.$('#unit-tabs').click({ target: { closest: () => ({ dataset: { unit: 'u3' } }) } });
  assert.equal(f.app.course.unitId, 'u3');
  assert.equal(f.app.course.lessonId, 'b7a-u3-l1', '换单元要落到该单元第一课');
  assert.equal(f.storedUi().unitId, 'u3');

  f.$('#lesson-list').click({ target: { closest: () => ({ dataset: { lesson: 'b7a-u3-l3' } }) } });
  assert.equal(f.app.course.lessonId, 'b7a-u3-l3');
  assert.equal(f.storedUi().lessonId, 'b7a-u3-l3');

  // 七上只有第 1 课有题，要开局得先切回这一课。
  f.$('#unit-tabs').click({ target: { closest: () => ({ dataset: { unit: 'u1' } }) } });
  f.$('#lesson-list').click({ target: { closest: () => ({ dataset: { lesson: 'b7a-u1-l1' } }) } });
  assert.equal(f.app.course.lessonId, 'b7a-u1-l1');

  f.app.setType('material', false);
  assert.equal(f.app.course.typeId, 'material');
  assert.equal(f.storedUi().typeId, 'material');

  f.app.start('lesson');
  assert.ok(f.app.scene.questions.every((q) => q.type === 'material'));
  assert.ok(f.app.scene.questions.every((q) => q.lessonId === 'b7a-u1-l1'));
  assert.equal(f.stored().learned.length, 0, '开题不会写学习记录');
  await f.round({});
  assert.equal(f.stored().learned.length, ROUND_SIZE);
});

test('册次切换：四册都能浏览，没题目的册进不了关卡并给出提示', async () => {
  const f = createApp();
  const tabs = f.$('#book-tabs').innerHTML;
  for (const id of ['b7a', 'b7b', 'b8a', 'b8b']) assert.ok(tabs.includes(`data-book="${id}"`), `缺少 ${id} 的册标签`);
  assert.equal((tabs.match(/is-empty/g) || []).length, 2, '七下、八下都还没有题目');
  assert.match(tabs, /class="book-tab active"/);
  assert.match(tabs, /102 题/, '七上已有第 1、2 课的 102 题');
  assert.match(tabs, /1150 题/, '八上仍是 1150 题');

  // 七上目录本身要完整：4 个正课单元加导言与学法，共 25 课。
  const unitTabs = f.$('#unit-tabs').innerHTML;
  assert.equal((unitTabs.match(/class="unit-tab/g) || []).length, 5);
  assert.ok(unitTabs.includes('导言、活动课与学史方法'));
  f.$('#unit-tabs').click({ target: { closest: () => ({ dataset: { unit: 'u0' } }) } });
  assert.equal(f.app.course.lessonId, 'b7a-u0-l1');
  assert.match(f.$('#lesson-list').innerHTML, /学史方法（三）/);

  // 切到还没题目的七年级下册：册、单元、课都跟着换，开始按钮转为提示态。
  f.$('#book-tabs').click({ target: { closest: () => ({ dataset: { book: 'b7b' } }) } });
  assert.equal(f.app.course.bookId, 'b7b');
  assert.equal(f.app.course.unitId, 'u1');
  assert.equal(f.app.course.lessonId, 'b7b-u1-l1');
  assert.equal(f.storedUi().bookId, 'b7b', '册次记在界面键里');
  assert.equal(f.$('#start-round').disabled, true);
  assert.equal(f.$('#start-label').textContent, '这本还在补题');
  assert.match(f.$('#start-note').textContent, /还没有选择题/);
  assert.match(f.$('#lesson-list').innerHTML, /lesson-todo/, '课卡片显示「待补」而不是 0/0');
  assert.equal(f.stored().learned.length, 0);

  // 切回八年级上册，关卡恢复可用，并且真的能出题。
  f.$('#book-tabs').click({ target: { closest: () => ({ dataset: { book: 'b8a' } }) } });
  assert.equal(f.app.course.bookId, 'b8a');
  assert.equal(f.$('#start-round').disabled, false);
  assert.ok(f.$('#start-label').textContent.includes('开始闯关'));
  f.$('#start-round').click();
  assert.equal(f.app.scene.screen, 'play');
  assert.equal(f.app.scene.questions.length, ROUND_SIZE);
});

test('八上全部 26 课都能开局，界面里不再有待补徽章', async () => {
  const f = createApp();
  // 默认落在七上，先切到八上再逐课检查。
  f.$('#book-tabs').click({ target: { closest: () => ({ dataset: { book: 'b8a' } }) } });
  assert.equal(f.app.course.bookId, 'b8a');
  // 第一单元三课：课卡不挂待补徽章，进度按 0/题量 显示。
  const list = f.$('#lesson-list').innerHTML;
  assert.equal((list.match(/lesson-todo/g) || []).length, 0, '第一单元不该再有待补徽章');
  for (const label of ['第1课', '第2课', '第3课']) assert.match(list, new RegExp(label));
  assert.match(list, /<b>0<\/b>\/16/, '第 1 课选择题仍按 0/16 显示进度');
  assert.match(list, /<b>0<\/b>\/12/, '第 2 课选择题按 0/12 显示进度');

  // 逐个单元、逐课检查：不挂待补徽章，四类题型都能开局。
  const units = [['u1', 3], ['u2', 4], ['u3', 3], ['u4', 2], ['u5', 3], ['u6', 4], ['u7', 3], ['u0', 4]];
  for (const [unitId, count] of units) {
    f.$('#unit-tabs').click({ target: { closest: () => ({ dataset: { unit: unitId } }) } });
    assert.equal(f.app.course.unitId, unitId);
    assert.equal((f.$('#lesson-list').innerHTML.match(/lesson-todo/g) || []).length, 0, `${unitId} 不该有待补徽章`);
    for (let i = 1; i <= count; i += 1) {
      const lessonId = `b8a-${unitId}-l${i}`;
      f.$('#lesson-list').click({ target: { closest: () => ({ dataset: { lesson: lessonId } }) } });
      assert.equal(f.app.course.lessonId, lessonId);
      for (const type of TYPES) {
        f.app.setType(type.id, false);
        assert.equal(f.$('#start-round').disabled, false, `${lessonId} 的 ${type.label} 应当可以开局`);
      }
    }
  }
  assert.equal(f.app.saved.rounds, 0);
});

test('答错进错题本，「再练一练」重做后移出错题本', async () => {
  const f = createApp();
  f.app.start('lesson');
  await f.round({ wrong: true });
  assert.equal(f.app.saved.review.length, ROUND_SIZE, '答错的题全部进错题本');
  f.app.home();
  assert.equal(String(f.$('#review-count').textContent), String(ROUND_SIZE));
  assert.equal(f.$('#start-review').disabled, false);
  assert.equal(f.app.saved.stats.misses, ROUND_SIZE);

  f.app.start('review');
  assert.equal(f.app.scene.kind, 'review');
  assert.equal(f.app.scene.questions.length, Math.min(REVIEW_SIZE, ROUND_SIZE));
  assert.ok(f.app.scene.questions.every((q) => f.app.saved.review.includes(q.id)));
  await f.round({});
  assert.equal(f.app.saved.review.length, 0, '重做答对后要移出错题本');
  assert.equal(f.app.saved.stats.reviewSolved, ROUND_SIZE);
  assert.equal(f.app.saved.history.at(-1).type, '错题重练');
});

test('独立全对给满分，用提示或答错都不算全对', async () => {
  const clean = createApp();
  clean.app.start('lesson');
  await clean.round({});
  assert.equal(clean.app.saved.stats.perfects, 1);
  assert.equal(clean.app.saved.stats.firstTry, ROUND_SIZE);

  const hinted = createApp();
  hinted.app.start('lesson');
  await hinted.round({ hint: true });
  assert.equal(hinted.app.saved.stats.perfects, 0, '用过提示不算全对');

  const retried = createApp();
  retried.app.start('lesson');
  await retried.round({ wrong: true });
  assert.equal(retried.app.saved.stats.perfects, 0);
  assert.equal(retried.app.saved.stats.misses, ROUND_SIZE);
});

test('演示模式完全不写任何学习记录', async () => {
  const f = createApp();
  const before = JSON.stringify(f.app.saved);
  f.app.start('demo');
  assert.equal(f.app.scene.demo, true);
  assert.equal(f.$('#demo-banner').hidden, false);
  await f.round({});
  assert.equal(f.app.scene.screen, 'result');
  assert.equal(JSON.stringify(f.app.saved), before, '演示不能动学习记录');
  assert.equal(f.$('#result-eyebrow').textContent, '演示完成 · 没有写入学习记录');
});

test('结算页汇总题量、连击与能量，并给出对应的按钮', async () => {
  const f = createApp();
  f.app.start('lesson');
  await f.round({});
  assert.equal(f.$('#result-score').textContent, '100');
  assert.equal(f.$('#score-label').textContent, '完成分');
  assert.match(f.$('#result-summary').textContent, /完成 5 道题/);
  assert.match(f.$('#result-summary').textContent, /5 道没有用提示/);
  assert.match(f.$('#result-details').innerHTML, /<b>5<\/b><span>完成题目<\/span>/);
  assert.match(f.$('#result-details').innerHTML, /<b>5<\/b><span>最高连击<\/span>/);
  assert.match(f.$('#result-details').innerHTML, /快乐能量/);
  assert.equal(f.$('#result-home').textContent, '回到历史研习场');
  assert.equal(f.$('#result-review').hidden, true, '没有错题就不显示错题入口');

  f.$('#result-home').click();
  assert.equal(f.app.scene.screen, 'home');
});

test('每日委托全部达成奖励补签锤，金锤上限 3 把且不能重复领取', async () => {
  const f = createApp({ save: questSave('2026-09-30') });
  assert.equal(f.app.saved.calendar.hammers, 1);
  f.app.start('lesson');
  await f.round({});
  assert.equal(f.app.saved.calendar.hammers, 2, '达成全部委托奖励 1 把');
  assert.equal(f.app.saved.quests.doneDays['2026-09-30'], true);
  assert.equal(f.app.saved.quests.rewarded, true);
  assert.equal(f.$('#r-quests').hidden, false, '结算页要展示委托进度');
  assert.match(f.$('#r-quests').innerHTML, /今日委托进度/);

  f.app.start('lesson');
  await f.round({});
  assert.equal(f.app.saved.calendar.hammers, 2, '同一天不能再领一次');
});

test('跨天结算：昨天遗漏的委托奖励会先补发，再结算今天的', async () => {
  const f = createApp({ date: new Date(2026, 8, 30, 12), save: questSave('2026-09-29', true) });
  assert.equal(f.app.saved.calendar.hammers, 2, '昨天的奖励在启动时补发');
  assert.equal(f.app.saved.quests.doneDays['2026-09-29'], true);
  assert.equal(f.app.saved.quests.day, '2026-09-30');
  f.app.start('lesson');
  await f.round({});
  assert.equal(f.app.saved.calendar.hammers, 3, '今天的委托再奖励 1 把，正好封顶');
  assert.equal(f.app.saved.calendar.hammers, Math.min(3, f.app.saved.calendar.hammers));
});

test('补签锤：确认后修复缺口、解锁奖杯，过期的报价不消耗锤子', async () => {
  const base = { calendar: { hammers: 1, nocount: {}, asked: null } };
  const save = freshSave();
  save.settings.motion = false;
  save.calendar.hammers = 1;
  save.history = [{ day: '2026-09-27' }, { day: '2026-09-28' }];
  const f = createApp({ save });
  assert.equal(f.$('#hammer-dialog').open, true, '有缺口就要弹补签确认');
  f.$('#hammer-yes').click();
  assert.equal(f.app.saved.calendar.hammers, 0);
  assert.equal(f.app.saved.calendar.nocount['2026-09-29'], true);
  assert.equal(currentStreak(f.app.saved.history, f.app.saved.calendar.nocount, new Date(2026, 8, 30)), 2);
  assert.ok(f.app.saved.trophies.got['secret-hammer']);

  const stale = createApp({ save: { ...freshSave(), ...base, history: [...save.history] } });
  stale.setDate(new Date(2026, 9, 5));
  stale.$('#hammer-yes').click();
  assert.equal(stale.app.saved.calendar.hammers, 1, '日期对不上就不该扣锤子');
  assert.equal(Object.keys(stale.app.saved.calendar.nocount).length, 0);

  const declined = createApp({ save: { ...freshSave(), ...base, history: [...save.history] } });
  declined.$('#hammer-no').click();
  assert.equal(declined.$('#hammer-dialog').open, false);
  assert.equal(declined.app.saved.calendar.hammers, 1);
});

test('跨零点后继续答题会记到新的一天，返回首页也不丢进度', async () => {
  const f = createApp({ date: new Date(2026, 8, 30, 23, 59), save: questSave('2026-09-30') });
  f.app.start('lesson');
  f.setDate(new Date(2026, 9, 1, 0, 1));
  await f.answer({});
  assert.equal(f.app.saved.quests.day, '2026-10-01');
  const progress = JSON.stringify(f.app.saved.quests.list);
  assert.ok(f.app.saved.quests.list.some((q) => q.prog > 0));
  f.app.home();
  assert.equal(JSON.stringify(f.app.saved.quests.list), progress);
});

test('暂停不计入答题用时，5 秒内独立答对才拿「对答如流」', async () => {
  const f = createApp();
  f.app.start('lesson');
  f.$('#leave-dialog').open = true;
  await f.advance(20000);
  f.$('#leave-dialog').open = false;
  await f.answer({ thinkingMs: 1000 });
  assert.ok(f.app.saved.trophies.got['secret-speed']);
  assert.equal(f.app.scene.playMs, 1000, '暂停的 20 秒不算学习时间');

  for (const [thinkingMs, hint, expected] of [[5000, false, true], [5100, false, false], [1000, true, false]]) {
    const g = createApp();
    g.app.start('lesson');
    await g.answer({ thinkingMs, hint });
    assert.equal(Boolean(g.app.saved.trophies.got['secret-speed']), expected, `${thinkingMs}ms hint=${hint}`);
  }
});

test('连击奖杯按一轮内的最高连击发放', async () => {
  const full = createApp();
  full.app.start('lesson');
  await full.round({});
  assert.equal(full.app.scene.peak, ROUND_SIZE);
  assert.ok(full.app.saved.trophies.got['combo-5'], '一轮 5 题全对，连击奖杯拉满');
  assert.ok(full.app.saved.trophies.got['combo-4'] && full.app.saved.trophies.got['combo-3'], '连击低档也一起解锁');

  const broken = createApp();
  broken.app.start('lesson');
  await broken.round({ wrong: true });
  assert.equal(broken.app.saved.trophies.got['combo-3'], undefined, '答错就断连');
});

test('「更上一层」在把同一课已有的题型都练过之后解锁', async () => {
  const f = createApp();
  for (const type of TYPES) {
    f.app.setType(type.id, false);
    f.app.start('lesson');
    await f.round({});
  }
  assert.ok(f.app.saved.trophies.got['secret-advanced']);
  // 第 1 课四类题型都能凑满一轮 5 道，一轮正好全部练完。
  assert.equal(f.app.saved.learned.length, ROUND_SIZE * TYPES.length, '第 1 课 20 道题全部练过');

  const partial = createApp();
  for (const type of ['choice', 'blank']) {
    partial.app.setType(type, false);
    partial.app.start('lesson');
    await partial.round({});
  }
  assert.equal(partial.app.saved.trophies.got['secret-advanced'], undefined);
});

test('单日记录展示答对、差一点、连击与用时', async () => {
  const f = createApp();
  f.app.start('lesson');
  await f.round({ thinkingMs: 1000 });
  f.app.showDayLog('2026-09-30');
  const html = f.$('#day-list').innerHTML;
  assert.match(html, /独立答对\s*5/);
  assert.match(html, /差一点\s*0/);
  assert.match(html, /5\s*连击/);
  assert.match(html, /用时/);
  assert.equal(f.app.saved.history[0].total, 5);
  assert.ok(f.app.saved.history[0].timeMs >= 5000);
  assert.equal(f.app.saved.history[0].day, '2026-09-30');
});

test('当天没签到会弹出签到窗，领完后奖励徽章并解锁印章奖杯', async () => {
  const f = createApp();
  f.$('#open-bonus').click();
  assert.equal(f.$('#bonus-dialog').open, true);
  assert.equal(f.$('#bonus-ok').textContent, '立即领取');
  f.$('#bonus-ok').click();
  assert.equal(f.$('#bonus-dialog').open, false);
  assert.equal(f.stored().bonus.last, '2026-09-30');
  assert.equal(f.stored().bonus.run, 1);
  assert.equal(f.stored().bonus.stickers['2026-09-30'], 'star');
  await f.advance(350);
  assert.equal(f.$('#trophy-got-dialog').open, true);
  assert.match(f.$('#tg-list').innerHTML, /印章 1 枚/);
  f.$('#tg-ok').click();
  assert.equal(f.$('#trophy-got-dialog').open, false);
});

test('首页进度与奖杯数量会跟着学习记录更新', async () => {
  const f = createApp();
  assert.match(f.$('#home-progress').textContent, /答错也没关系/);
  f.app.start('lesson');
  await f.round({});
  f.app.home();
  assert.match(f.$('#home-progress').textContent, /已练过 5 \/ 1252 道题 · 完成 1 轮/);
  assert.match(f.$('#trophy-badge').textContent, /^\d+ \/ \d+$/);
  // 课程卡显示「本课该题型练过几道 / 共几道」。分母直接取题库实际题量，
  // 以后往第 1 课加题不用再回来改这个断言。
  const choicePool = QUESTIONS.filter((q) => q.lessonId === DEFAULT_BOOK.units[0].lessons[0].id && q.type === 'choice').length;
  assert.ok(choicePool > 5, '第 1 课的选择题池应多于一轮的题量');
  assert.match(f.$('#lesson-list').innerHTML, new RegExp(`<b>5</b>/${choicePool}`), '课程卡显示本课该题型的进度');
});

test('题库里的每道题都能被真实渲染并判对一次', async () => {
  const f = createApp();
  const byId = new Map(QUESTIONS.map((q) => [q.id, q]));
  for (const type of TYPES) {
    f.app.setType(type.id, false);
    f.app.start('lesson');
    for (const q of f.app.scene.questions) {
      assert.ok(byId.has(q.id));
      assert.equal(q.type, type.id);
      const buttons = f.$('#choices').children;
      const correct = buttons.find((b) => b.dataset.char === f.app.scene.correctKey);
      assert.ok(correct, `${q.id} 在候选里找不到正确项`);
      await f.app.choose(correct);
      assert.ok(['explain', 'finale'].includes(f.app.scene.phase), `答对后应进入解析：${q.id}`);
      assert.equal(f.app.scene.results.at(-1).id, q.id);
      assert.equal(f.app.scene.results.at(-1).firstTry, true);
      f.app.nextQuestion();
    }
  }
});
