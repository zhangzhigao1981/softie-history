import test from 'node:test';
import assert from 'node:assert/strict';
import { SpeechReader } from '../js/speech.js';
import { createApp } from './helpers/app-harness.mjs';
import { MODES } from '../js/modes.js';
import { freshSave } from '../js/storage.js';

const localEnglish = { lang: 'en-US', localService: true, default: false };
const localChinese = { lang: 'zh-CN', localService: true, default: false };
class Utterance { constructor(text) { this.text = text; } }
function browser(voices = [localEnglish, localChinese]) {
  const events = new Map();
  return { voices, spoken: [], cancels: 0,
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
  const reader = new SpeechReader({ synth, Utterance, onBusy: v => busy.push(v), onStatus: v => status.push(v),
    setTimer: (fn, ms) => { jobs.set(++seq, { fn, at: now + ms }); return seq; }, clearTimer: id => jobs.delete(id),
  });
  function advance(ms) { now += ms; for (const [id, job] of [...jobs]) if (job.at <= now) { jobs.delete(id); job.fn(); } }
  return { reader, synth, busy, status, advance, jobs };
}

test('local-only picks the matching local language over a default remote voice', async () => {
  const f = service(browser([{ lang: 'en-US', localService: false, default: true }, localEnglish, localChinese]));
  const done = f.reader.speak([{ text: 'cat', lang: 'en' }, { text: '猫', lang: 'zh' }], { rate: 0.85 });
  assert.equal(f.synth.spoken[0].voice, localEnglish);
  assert.equal(f.synth.spoken[0].rate, 0.85);
  f.synth.spoken[0].onend();
  assert.equal(f.synth.spoken[1].voice, localChinese);
  // A duplicate old completion must not skip the current utterance.
  f.synth.spoken[0].onend(); f.synth.spoken[0].onerror();
  assert.equal(f.reader.busy, true);
  f.synth.spoken[1].onend();
  assert.equal(await done, true);
  assert.deepEqual(f.busy, [true, false]);
  assert.equal(f.jobs.size, 0);
});

test('empty voice lists wait for voiceschanged and then start', async () => {
  const f = service(browser([]));
  const done = f.reader.speak({ text: 'cat', lang: 'en' });
  assert.equal(f.reader.busy, true); assert.equal(f.synth.spoken.length, 0);
  f.synth.voices = [localEnglish]; f.synth.voicesChanged();
  assert.equal(f.synth.spoken.length, 1);
  f.advance(900); assert.equal(f.synth.spoken.length, 1);
  f.synth.spoken[0].onend(); assert.equal(await done, true);
});

test('missing local voices never silently use a remote voice or leave the game paused', async () => {
  const remote = { lang: 'en-US', localService: false };
  const f = service(browser([remote]));
  const done = f.reader.speak({ text: 'cat', lang: 'en' });
  f.advance(800);
  assert.equal(await done, false); assert.equal(f.reader.busy, false);
  assert.equal(f.synth.spoken.length, 0); assert.match(f.status.at(-1), /本地英语/);
  const optedIn = f.reader.speak({ text: 'cat', lang: 'en' }, { localOnly: false });
  assert.equal(f.synth.spoken[0].voice, remote);
  f.synth.spoken[0].onend(); assert.equal(await optedIn, true);
});

test('replacement and cancellation ignore late callbacks from the previous task', async () => {
  const f = service();
  const old = f.reader.speak({ text: 'cat', lang: 'en' }); const first = f.synth.spoken[0];
  const next = f.reader.speak({ text: 'dog', lang: 'en' });
  assert.equal(await old, false); first.onend(); first.onerror();
  assert.equal(f.reader.busy, true); assert.equal(f.synth.spoken.length, 2);
  f.reader.cancel(); f.synth.spoken[1].onend();
  assert.equal(await next, false); assert.equal(f.reader.busy, false); assert.equal(f.jobs.size, 0);
});

test('voice loading cancellation, playback errors and watchdog all release busy state', async () => {
  const empty = service(browser([])); const pending = empty.reader.speak({ text: 'cat' });
  empty.reader.cancel(); empty.synth.voices = [localEnglish]; empty.synth.voicesChanged(); empty.advance(16000);
  assert.equal(await pending, false); assert.equal(empty.synth.spoken.length, 0);
  for (const action of ['error', 'timeout', 'throw']) {
    const f = service();
    if (action === 'throw') f.synth.speak = () => { throw Error('blocked'); };
    const done = f.reader.speak({ text: 'cat' });
    if (action === 'error') f.synth.spoken[0].onerror();
    if (action === 'timeout') f.advance(15000);
    assert.equal(await done, false, action); assert.equal(f.reader.busy, false, action); assert.equal(f.jobs.size, 0);
  }
});

test('unsupported browser is a nonblocking capability message', async () => {
  const f = service(null);
  assert.equal(await f.reader.speak({ text: 'cat' }), false);
  assert.equal(f.reader.busy, false); assert.match(f.status.at(-1), /继续玩/);
});

test('app pauses thinking during speech, ducks only music, and restores it after completion', async () => {
  const synth = browser(); const f = createApp({ speechOptions: { synth, Utterance } });
  f.app.start('level', 1);
  const budget = f.app.scene.timeLeft;
  assert.equal(f.app.speech.busy, true);
  await f.advance(4000); assert.equal(f.app.scene.timeLeft, budget); assert.equal(f.app.scene.playMs, 0);
  assert.equal(synth.spoken[0].lang, 'zh-CN'); assert.equal(f.musicGains.at(-1), 0.1);
  synth.spoken[0].onend(); assert.equal(f.musicGains.at(-1), 0.8);
  await f.advance(1000); assert.equal(f.app.scene.timeLeft, budget - 1000);
});

test('candidate speech does not select an answer; home and mode switching cancel speech', async () => {
  const synth = browser(); const f = createApp({ speechOptions: { synth, Utterance } });
  f.app.start('level', 1);
  const before = f.app.scene.step;
  f.$('#candidate-speech').click({ target: { closest: () => ({ dataset: { speech: 'cat' } }) } });
  assert.equal(f.app.scene.step, before); assert.equal(f.app.scene.results.length, 0);
  assert.equal(synth.spoken.at(-1).text, 'cat');
  f.app.home(); assert.equal(f.app.speech.busy, false); assert.equal(f.musicGains.at(-1), 0.8);
  f.app.start('level', 1); f.app.setAudienceMode('sentence', false); assert.equal(f.app.speech.busy, false);
});

test('automatic meaning/sentence cues do not disclose English answers; spelling may hear the word', async () => {
  for (const mode of Object.values(MODES)) {
    const synth = browser(); const f = createApp({ mode: mode.id, speechOptions: { synth, Utterance } });
    f.app.start('level', 1);
    const q = f.app.scene.questions[0];
    assert.equal(synth.spoken[0].lang, mode.id === 'spelling' ? 'en-US' : 'zh-CN');
    if (mode.id === 'spelling') assert.equal(synth.spoken[0].text, q.word);
    else assert.ok(!synth.spoken[0].text.includes(q.word));
    await f.answer();
    assert.equal(f.app.scene.phase, 'explain');
    assert.equal(synth.spoken.at(-1).text, q.word);
    const old = synth.spoken.at(-1); f.app.nextQuestion(); old.onend();
    assert.equal(f.app.scene.qi, 1);
    f.app.home();
  }
});

test('manual speech is available with automatic reading disabled', () => {
  const save = freshSave(); save.settings.autoSpeak = false;
  const synth = browser(); const f = createApp({ saves: { meaning: save }, speechOptions: { synth, Utterance } });
  f.app.start('level', 1); assert.equal(synth.spoken.length, 0);
  f.$('#read-question').click(); assert.equal(synth.spoken.length, 1); f.app.home();
});

test('backgrounding cancels speech and excludes hidden elapsed time', async () => {
  const synth = browser(); const f = createApp({ speechOptions: { synth, Utterance } });
  f.app.start('level', 1); const budget = f.app.scene.timeLeft;
  f.document.hidden = true; f.documentEvents.visibilitychange();
  assert.equal(f.app.speech.busy, false); assert.equal(f.musicGains.at(-1), 0.8);
  await f.advance(60000); assert.equal(f.app.scene.timeLeft, budget);
  f.document.hidden = false; f.documentEvents.visibilitychange();
  await f.advance(1000); assert.equal(f.app.scene.timeLeft, budget - 1000);
});

test('an unresponsive browser releases the app countdown after the speech watchdog', async () => {
  const synth = browser(); const f = createApp({ speechOptions: { synth, Utterance } });
  f.app.start('level', 1); const budget = f.app.scene.timeLeft;
  await f.advance(15000); assert.equal(f.app.speech.busy, false); assert.equal(f.app.scene.timeLeft, budget);
  await f.advance(1000); assert.equal(f.app.scene.timeLeft, budget - 1000);
  assert.equal(f.musicGains.at(-1), 0.8);
});

test('default timers are properly bound and do not throw illegal invocation', async () => {
  const synth = browser();
  const reader = new SpeechReader({ synth, Utterance });
  const pending = reader.speak({ text: 'cat', lang: 'en' });
  assert.equal(reader.busy, true);
  synth.spoken[0]?.onend?.();
  assert.equal(await pending, true);
  assert.equal(reader.busy, false);
});
