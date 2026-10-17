import test from 'node:test';
import assert from 'node:assert/strict';
import { SpeechReader } from '../js/speech.js';
import { createApp, TYPES } from './helpers/app-harness.mjs';
import { freshSave } from '../js/storage.js';

const localEnglish = { lang: 'en-US', localService: true, default: false };
const localChinese = { lang: 'zh-CN', localService: true, default: false };
class Utterance { constructor(text) { this.text = text; } }
function browser(voices = [localEnglish, localChinese]) {
  const events = new Map();
  return {
    voices, spoken: [], cancels: 0,
    getVoices() { return this.voices; },
    speak(u) { this.spoken.push(u); }, cancel() { this.cancels++; },
    addEventListener(type, fn) { events.set(type, fn); },
    removeEventListener(type, fn) { if (events.get(type) === fn) events.delete(type); },
    voicesChanged() { events.get('voiceschanged')?.(); },
  };
}
function service(synth = browser()) {
  const jobs = new Map(); let now = 0; let seq = 0;
  const busy = [], status = [];
  const reader = new SpeechReader({
    synth, Utterance, onBusy: v => busy.push(v), onStatus: v => status.push(v),
    setTimer: (fn, ms) => { jobs.set(++seq, { fn, at: now + ms }); return seq; }, clearTimer: id => jobs.delete(id),
  });
  function advance(ms) { now += ms; for (const [id, job] of [...jobs]) if (job.at <= now) { jobs.delete(id); job.fn(); } }
  return { reader, synth, busy, status, advance, jobs };
}

test('朗读引擎：只挑本地音色，优先匹配语言', async () => {
  const f = service(browser([{ lang: 'en-US', localService: false, default: true }, localEnglish, localChinese]));
  const done = f.reader.speak([{ text: '虎门', lang: 'en' }, { text: '鸦片战争', lang: 'zh' }], { rate: 0.85 });
  assert.equal(f.synth.spoken[0].voice, localEnglish);
  assert.equal(f.synth.spoken[0].rate, 0.85);
  f.synth.spoken[0].onend();
  assert.equal(f.synth.spoken[1].voice, localChinese);
  // 迟到的重复回调不能跳过当前这句。
  f.synth.spoken[0].onend(); f.synth.spoken[0].onerror();
  assert.equal(f.reader.busy, true);
  f.synth.spoken[1].onend();
  assert.equal(await done, true);
  assert.deepEqual(f.busy, [true, false]);
  assert.equal(f.jobs.size, 0);
});

test('朗读引擎：音色列表为空时等 voiceschanged，再开始播放', async () => {
  const f = service(browser([]));
  const done = f.reader.speak({ text: '虎门销烟', lang: 'zh' });
  assert.equal(f.reader.busy, true); assert.equal(f.synth.spoken.length, 0);
  f.synth.voices = [localChinese]; f.synth.voicesChanged();
  assert.equal(f.synth.spoken.length, 1);
  f.advance(900); assert.equal(f.synth.spoken.length, 1);
  f.synth.spoken[0].onend(); assert.equal(await done, true);
});

test('朗读引擎：缺少本地音色时不偷偷用在线音色，也不把游戏卡住', async () => {
  const remote = { lang: 'zh-CN', localService: false };
  const f = service(browser([remote]));
  const done = f.reader.speak({ text: '虎门销烟', lang: 'zh' });
  f.advance(800);
  assert.equal(await done, false); assert.equal(f.reader.busy, false);
  assert.equal(f.synth.spoken.length, 0); assert.match(f.status.at(-1), /本地/);
  const optedIn = f.reader.speak({ text: '虎门销烟', lang: 'zh' }, { localOnly: false });
  assert.equal(f.synth.spoken[0].voice, remote);
  f.synth.spoken[0].onend(); assert.equal(await optedIn, true);
});

test('朗读引擎：替换与取消会忽略上一句迟到的回调', async () => {
  const f = service();
  const old = f.reader.speak({ text: '虎门', lang: 'zh' }); const first = f.synth.spoken[0];
  const next = f.reader.speak({ text: '厦门', lang: 'zh' });
  assert.equal(await old, false); first.onend(); first.onerror();
  assert.equal(f.reader.busy, true); assert.equal(f.synth.spoken.length, 2);
  f.reader.cancel(); f.synth.spoken[1].onend();
  assert.equal(await next, false); assert.equal(f.reader.busy, false); assert.equal(f.jobs.size, 0);
});

test('朗读引擎：加载被取消、播放报错与看门狗都会释放忙碌状态', async () => {
  const empty = service(browser([])); const pending = empty.reader.speak({ text: '虎门' });
  empty.reader.cancel(); empty.synth.voices = [localChinese]; empty.synth.voicesChanged(); empty.advance(16000);
  assert.equal(await pending, false); assert.equal(empty.synth.spoken.length, 0);
  for (const action of ['error', 'timeout', 'throw']) {
    const f = service();
    if (action === 'throw') f.synth.speak = () => { throw Error('blocked'); };
    const done = f.reader.speak({ text: '虎门' });
    if (action === 'error') f.synth.spoken[0].onerror();
    if (action === 'timeout') f.advance(15000);
    assert.equal(await done, false, action); assert.equal(f.reader.busy, false, action); assert.equal(f.jobs.size, 0);
  }
});

test('朗读引擎：浏览器不支持时只给一句提示，不阻断游戏', async () => {
  const f = service(null);
  assert.equal(await f.reader.speak({ text: '虎门' }), false);
  assert.equal(f.reader.busy, false); assert.match(f.status.at(-1), /继续玩/);
});

test('朗读期间暂停计入答题时间，只压低背景音乐，读完再恢复', async () => {
  const synth = browser(); const f = createApp({ speechOptions: { synth, Utterance } });
  f.app.start('lesson');
  const budget = f.app.scene.timeLeft;
  assert.equal(f.app.speech.busy, true);
  await f.advance(4000); assert.equal(f.app.scene.timeLeft, budget); assert.equal(f.app.scene.playMs, 0);
  assert.equal(synth.spoken[0].lang, 'zh-CN'); assert.equal(f.musicGains.at(-1), 0.1);
  synth.spoken[0].onend(); assert.equal(f.musicGains.at(-1), 0.8);
  await f.advance(1000); assert.equal(f.app.scene.timeLeft, budget - 1000);
});

test('点候选朗读只朗读、不作答；回首页与换题型都会中止朗读', () => {
  const synth = browser(); const f = createApp({ speechOptions: { synth, Utterance } });
  f.app.start('lesson');
  const before = f.app.scene.step;
  f.$('#candidate-speech').click({ target: { closest: () => ({ dataset: { speech: '扭转对华贸易逆差' } }) } });
  assert.equal(f.app.scene.step, before); assert.equal(f.app.scene.results.length, 0);
  assert.equal(synth.spoken.at(-1).text, '扭转对华贸易逆差');
  f.app.home(); assert.equal(f.app.speech.busy, false); assert.equal(f.musicGains.at(-1), 0.8);
  f.app.start('lesson'); f.app.setType('material', false); assert.equal(f.app.speech.busy, false);
});

test('自动朗读先念材料再念题干，且不泄露答案', async () => {
  const synth = browser(); const f = createApp({ type: 'material', speechOptions: { synth, Utterance } });
  f.app.start('lesson');
  const q = f.app.scene.questions[0];
  assert.equal(synth.spoken.length, 1, '一次只念一句，下一句等上一句读完');
  assert.equal(synth.spoken[0].lang, 'zh-CN');
  assert.equal(synth.spoken[0].text, `材料：${q.material}`);
  synth.spoken[0].onend();
  assert.equal(synth.spoken[1].text, q.stem, '材料念完接着念设问');
  assert.ok(!synth.spoken.some((u) => u.text.includes(q.options[q.answer])), '朗读不能把答案念出来');
  synth.spoken[1].onend();

  await f.answer({});
  const answer = synth.spoken.find((u) => u.text.startsWith('答案是'));
  assert.ok(answer, '作答后要念出正确答案');
  assert.equal(answer.text, `答案是${q.options[q.answer]}。`);
  const old = synth.spoken.at(-1); f.app.nextQuestion(); old.onend();
  assert.equal(f.app.scene.qi, 1);
  f.app.home();
});

test('四种题型都能自动朗读，填空题的空格会读成「空格」', async () => {
  for (const type of TYPES) {
    const synth = browser(); const f = createApp({ type: type.id, speechOptions: { synth, Utterance } });
    f.app.start('lesson');
    const q = f.app.scene.questions[0];
    const first = synth.spoken[0];
    assert.equal(first.lang, 'zh-CN', type.label);
    assert.equal(synth.spoken.length, 1);
    if (type.id === 'material') assert.equal(first.text, `材料：${q.material}`);
    else {
      assert.ok(!first.text.includes('材料：'), `${type.label} 不念材料`);
      if (type.id === 'blank') assert.ok(!first.text.includes('____') && first.text.includes('空格'), '空格要念出来');
      else assert.equal(first.text, q.stem);
    }
    f.app.home();
  }
});

test('关掉自动朗读后不再自动出声，但手动朗读仍可用', () => {
  const save = freshSave();
  save.settings.autoSpeak = false;
  const synth = browser(); const f = createApp({ save, speechOptions: { synth, Utterance } });
  f.app.start('lesson');
  assert.equal(synth.spoken.length, 0);
  f.$('#read-question').click(); assert.equal(synth.spoken.length, 1);
  f.app.home();
});

test('切到后台会中止朗读，并把隐藏期间的时间排除在计时之外', async () => {
  const synth = browser(); const f = createApp({ speechOptions: { synth, Utterance } });
  f.app.start('lesson'); const budget = f.app.scene.timeLeft;
  f.document.hidden = true; f.documentEvents.visibilitychange();
  assert.equal(f.app.speech.busy, false); assert.equal(f.musicGains.at(-1), 0.8);
  await f.advance(60000); assert.equal(f.app.scene.timeLeft, budget);
  f.document.hidden = false; f.documentEvents.visibilitychange();
  await f.advance(1000); assert.equal(f.app.scene.timeLeft, budget - 1000);
});

test('浏览器不响应朗读时，看门狗会放开倒计时', async () => {
  const synth = browser(); const f = createApp({ speechOptions: { synth, Utterance } });
  f.app.start('lesson'); const budget = f.app.scene.timeLeft;
  await f.advance(15000); assert.equal(f.app.speech.busy, false); assert.equal(f.app.scene.timeLeft, budget);
  await f.advance(1000); assert.equal(f.app.scene.timeLeft, budget - 1000);
  assert.equal(f.musicGains.at(-1), 0.8);
});

test('默认计时器绑定正确，不会抛 illegal invocation', async () => {
  const synth = browser();
  const reader = new SpeechReader({ synth, Utterance });
  const pending = reader.speak({ text: '虎门', lang: 'zh' });
  assert.equal(reader.busy, true);
  synth.spoken[0]?.onend?.();
  assert.equal(await pending, true);
  assert.equal(reader.busy, false);
});

test('演示模式也会自动朗读题目，方便没人操作时也能看懂', () => {
  const synth = browser(); const f = createApp({ speechOptions: { synth, Utterance } });
  f.app.start('demo');
  const q = f.app.scene.questions[0];
  assert.equal(synth.spoken.length, 1);
  assert.equal(synth.spoken[0].lang, 'zh-CN');
  const expected = q.material ? `材料：${q.material}` : q.stem.replace(/____/g, '空格');
  assert.equal(synth.spoken[0].text, expected);
  f.app.home();
});
