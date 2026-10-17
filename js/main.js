import { SpeechReader } from './speech.js';
import { startClock, onFrame, centerOf, tween, wait, lerp, rand, easeOutBack, easeInCubic, easeOutQuint } from './core.js';
import { AudioEngine } from './audio.js';
import { FX } from './fx.js';
import { Backdrop } from './bg.js';
import { mountSofties, softieSVG, bounce, bubbleHit } from './softie.js';
import { TYPES, TYPE_MAP, DEFAULT_TYPE_ID, BOOKS, ALL_QUESTIONS, ROUND_SIZE, REVIEW_SIZE, UI_KEY, SAVE_KEY, findBook, findUnit, findLesson, questionsOf, countByType, DEFAULT_BOOK, firstPlayableLesson, bookQuestionCount, lessonQuestionCount } from './course.js';
import { makeRound, optionsFor, recordAnswer, shuffle } from './quiz.js';
import { loadSave, persistSave, resetAllSaves, dayKey, currentStreak, bestStreak, hammerOffer, useHammer, playedDays, STICKERS, claimLogin, stickerOn, bonusState } from './storage.js';
import { ensureDailyQuests, questText, feedQuestEvent, isAllQuestsDone, claimQuestReward } from './quests.js';
import { TROPHIES, extractTrophyMetrics, evaluateTrophies, getEarnedTrophiesCount, RANK_NAMES } from './trophies.js';
import { energyAt, musicAt, crowdAt, correctParticles, celebrationParticles, finaleParticles, gainEnergy, displayEnergy } from './choreography.js';
import { questionSeconds, countdown } from './timer.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let storage;
try { storage = window.localStorage; } catch { /* Private browser storage can be blocked. */ }
const params = new URLSearchParams(location.search);
let saved = loadSave(storage);
try { if (!storage?.getItem(SAVE_KEY)) saved.settings.motion = !matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* Use default settings. */ }

// 当前选中的课程位置与题型，单独存在一个轻量键里，不进入学习记录。
// 默认落在第一本有题目的册上；没有题目的册照样浏览，只是进不了关卡。
const opening = firstPlayableLesson(DEFAULT_BOOK);
const course = {
  bookId: DEFAULT_BOOK.id,
  unitId: opening.unit.id,
  lessonId: opening.lesson.id,
  typeId: DEFAULT_TYPE_ID,
};
try {
  const raw = storage?.getItem(UI_KEY);
  if (raw) {
    const v = JSON.parse(raw);
    if (v && typeof v === 'object') {
      if (BOOKS.some((b) => b.id === v.bookId)) course.bookId = v.bookId;
      if (findBook(course.bookId).units.some((u) => u.id === v.unitId)) course.unitId = v.unitId;
      if (findUnit(findBook(course.bookId), course.unitId)?.lessons.some((l) => l.id === v.lessonId)) course.lessonId = v.lessonId;
      if (TYPE_MAP[v.typeId]) course.typeId = v.typeId;
    }
  }
} catch { /* Storage may be blocked. */ }
if (TYPE_MAP[params.get('type')]) course.typeId = params.get('type');

const currentBook = () => findBook(course.bookId);
const currentUnit = () => findUnit(currentBook(), course.unitId);
const currentLesson = () => findLesson(currentUnit(), course.lessonId);
const currentType = () => TYPE_MAP[course.typeId];
function saveCourse() { try { storage?.setItem(UI_KEY, JSON.stringify(course)); } catch { /* Storage may be blocked. */ } }
function selectLesson(unitId, lessonId) {
  course.unitId = unitId;
  course.lessonId = lessonId;
  saveCourse();
}

const copy = {
  title: '历史足迹',
  tagline: '软乎乎的历史研习场',
  eyebrow: '一寸光阴一寸史',
  intro: '读史料，选答案，让历史冒个泡。',
  courseHeading: '先选一册，再挑单元和课',
  typeHeading: '再选一种题型',
  startLabel: '开始闯关',
  pendingLabel: '这本还在补题',
  ready: '选一个答案，让软乎乎送过去吧。',
  wrong: '差一点点，再读一遍题干吧。',
  correct: '气泡命中！选对啦。',
  finished: '又攻克一个知识点！',
  learned: '这个知识点记牢了',
  unlearned: '先来认识这个知识点',
  footer: '答错也没关系，一起读一读。',
  home: '回到历史研习场',
  resultTitle: '每一点进步\n都值得庆祝。',
  disclaimer: '初中历史（统编版 2025 版）：七上、七下、八上、八下四册目录，选择、判断、填空、材料四种题型自由选择。练过不代表已掌握，记得回看教材。',
  logoBits: ['历', '史'],
};

const audio = new AudioEngine();
const fx = new FX($('#fx'), 300);
const fxBack = new FX($('#fx-back'), 520);
// This is the original 2D backdrop, not a 3D scene or WebGPU renderer.
const bg = new Backdrop($('#bg'), $('#rays-fallback'));
const homeActors = mountSofties($('#home-softies'));
const actors = mountSofties($('#play-softies'));
const resultActors = mountSofties($('#result-softies'));
const S = { screen: 'home', run: 0, questions: [], qi: 0, step: 0, ready: false, phase: 'answer', demo: false, kind: 'lesson', typeId: DEFAULT_TYPE_ID, correctKey: null, firstTry: true, misses: 0, combo: 0, peak: 0, energy: 0, E: .02, flash: 0, shake: 0, results: [], stepMisses: 0, earnedTrophies: [], bonusOpen: false, pendingLoginBonus: null };
Object.assign(S, { visualE: .02, shownEnergy: 0, energyUnit: 0, idleAt: 0 });
let musicBaseGain = null;
let duckRestoreTimer = null;
function duckBackground(busy, { immediate = false } = {}) {
  const gain = audio.g?.music?.gain;
  if (!gain || !audio.ctx) return;
  // Keep a stable baseline: AudioParam.value can still be mid-ramp when a
  // cancelled utterance is immediately replaced by the next one.
  if (musicBaseGain === null) musicBaseGain = gain.value;
  if (duckRestoreTimer) {
    clearTimeout(duckRestoreTimer);
    duckRestoreTimer = null;
  }
  try { gain.cancelScheduledValues?.(audio.ctx.currentTime); } catch { /* Audio context may be closing. */ }

  if (busy) {
    // 朗读时更大幅度降低背景音乐（降至原音量的 12.5%），让朗读语音更突出、听得更清脆响亮
    try { gain.setTargetAtTime(musicBaseGain * 0.125, audio.ctx.currentTime, 0.04); } catch { /* Audio context may be closing. */ }
  } else {
    // 朗读结束后不立刻切回背景音乐，留出 1.0 秒沉浸思考时间，随后平滑淡入（timeConstant 0.6s）
    const delay = immediate ? 0 : 1.0;
    const fade = immediate ? 0.04 : 0.6;
    try { gain.setTargetAtTime(musicBaseGain * 1, audio.ctx.currentTime + delay, fade); } catch { /* Audio context may be closing. */ }
    if (!immediate && typeof setTimeout === 'function') {
      duckRestoreTimer = setTimeout(() => {
        try { gain.setTargetAtTime(musicBaseGain * 1, audio.ctx.currentTime, 0.5); } catch {}
      }, 1000);
    }
  }
}
const speech = new SpeechReader({
  onBusy: busy => { S.clockAt = performance.now(); duckBackground(busy); },
  onStatus: message => { $('#tts-note').textContent = message; },
});
const speakerIconSVG = '<svg class="speaker-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M9 3.5 L4.5 7 H1.5 C1 7 .5 7.5 .5 8 V12 C.5 12.5 1 13 1.5 13 H4.5 L9 16.5 C9.7 17 10.5 16.5 10.5 15.7 V4.3 C10.5 3.5 9.7 3 9 3.5 Z" fill="currentColor"/><path class="speaker-wave" d="M13.5 6.5 C14.8 7.8 14.8 12.2 13.5 13.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path class="speaker-wave" d="M16 4 C18.5 6.5 18.5 13.5 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
function read(items) {
  if (document.hidden || paused()) return;
  audio.unlock();
  return speech.speak(items, { localOnly: saved.settings.localOnly, rate: saved.settings.speechRate });
}
function readQuestion() {
  const q = activeQuestion();
  if (!q || S.phase !== 'answer') return;
  const items = [];
  if (q.material) items.push({ text: `材料：${q.material}`, lang: 'zh' });
  items.push({ text: q.type === 'blank' ? q.stem.replace(/____/g, '空格') : q.stem, lang: 'zh' });
  return read(items);
}
function readExplanation() {
  const q = activeQuestion();
  if (!q || S.phase !== 'explain') return;
  return read([{ text: `答案是${q.options[q.answer]}。`, lang: 'zh' }, { text: q.explain, lang: 'zh' }]);
}
const timers = new Set();
let pendingHammer = null;
let bonusTimer = 0;
const motionValue = () => {
  if (typeof saved.settings.motion === 'boolean') return saved.settings.motion ? 1 : 0;
  if (typeof saved.settings.motion === 'number' && Number.isFinite(saved.settings.motion)) {
    return Math.max(0, Math.min(1, saved.settings.motion));
  }
  return 1;
};
const reduced = () => motionValue() <= 0.001;
const paused = () => document.hidden || S.screen === 'settings' || $('#leave-dialog').open;
const activeQuestion = () => S.questions[S.qi];
const secondsOf = (q) => questionSeconds(TYPE_MAP[q?.type || course.typeId]);

let lastClickSoundTime = 0;
function playClickSound(type = 'bubble') {
  if (!saved.settings?.sound || audio.muted) return;
  const now = performance.now();
  if (now - lastClickSoundTime < 30) return;
  lastClickSoundTime = now;
  audio.unlock();
  const t = audio.now();
  switch (type) {
    case 'primary':
      audio.play('pop', t, { v: 0.22, f: 540 });
      audio.play('blip', t + 0.025, { m: 84, v: 0.14 });
      audio.play('bell', t + 0.05, { m: 91, v: 0.09, dur: 0.5 });
      break;
    case 'tab':
      audio.play('pop', t, { v: 0.18, f: 640 });
      audio.play('blip', t + 0.02, { m: 81, v: 0.11 });
      break;
    case 'back':
      audio.play('pop', t, { v: 0.15, f: 430 });
      break;
    case 'toggle-on':
      audio.play('pop', t, { v: 0.18, f: 560 });
      audio.play('blip', t + 0.025, { m: 84, v: 0.12 });
      break;
    case 'toggle-off':
      audio.play('pop', t, { v: 0.14, f: 420 });
      break;
    case 'softie':
      audio.play('pop', t, { v: 0.2, f: 600 });
      audio.jump(0.7);
      break;
    case 'bubble':
    default:
      audio.play('pop', t, { v: 0.16, f: 490 + Math.random() * 80 });
      audio.play('blip', t + 0.02, { m: 76 + Math.floor(Math.random() * 5), v: 0.08 });
      break;
  }
}

function startHomeMusic() {
  if (!saved.settings?.sound || audio.muted || S.screen === 'play') return;
  audio.unlock();
  audio.setLevel(0, 102);
  audio.key = 0;
  audio.setReach?.(false);
  audio.startMusic();
}

function persist() { $('#storage-note').hidden = persistSave(storage, saved); }
function later(fn, ms) {
  const run = S.run;
  const id = setTimeout(() => { timers.delete(id); if (run === S.run) fn(); }, ms);
  timers.add(id);
}
function cancelRun() {
  speech.cancel();
  S.run += 1;
  timers.forEach(clearTimeout); timers.clear();
  $('#bubble-layer').replaceChildren(); $('#cutins').replaceChildren();
  $('#show-actors').replaceChildren();
  document.body.classList.remove('reach');
  audio.setReach(false);
  S.ready = false; S.flash = 0; S.shake = 0;
  S.earnedTrophies = [];
  $('#question-card').style.transform = '';
}
function showScreen(screen) {
  S.screen = screen;
  document.body.dataset.screen = screen;
  for (const el of $$('.screen')) el.hidden = el.id !== screen;
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function applySettings() {
  const m = motionValue();
  const isReduced = reduced();
  document.body.classList.toggle('reduced', isReduced);
  document.body.classList.toggle('motion-enabled', !isReduced);
  audio.setMuted(!saved.settings.sound);
  audio.setVolume(saved.settings.volume);
  if (!saved.settings.sound) {
    audio.stopMusic();
  } else if (S.screen === 'home' || S.screen === 'settings') {
    startHomeMusic();
  }
  fx.reduced = fxBack.reduced = isReduced;
  fx.motion = fxBack.motion = m;
  if ($('#sound-setting')) $('#sound-setting').checked = saved.settings.sound;
  if ($('#sound-toggle-text')) $('#sound-toggle-text').textContent = saved.settings.sound ? '开启' : '关闭';
  if ($('#sound-toggle-btn')) {
    $('#sound-toggle-btn').classList.toggle('off', !saved.settings.sound);
    $('#sound-toggle-btn').setAttribute('aria-pressed', String(saved.settings.sound));
  }
  if ($('#motion-setting')) {
    $('#motion-setting').value = Math.round(m * 100);
    $('#motion-setting').style.setProperty('--v', m);
    $('#motion-setting').checked = !isReduced;
  }
  if ($('#motion-val')) $('#motion-val').textContent = `${Math.round(m * 100)}%`;
  $('#open-settings')?.setAttribute('title', isReduced ? '游戏设置 · 动效已减少' : '游戏设置');
  $('#open-settings')?.setAttribute('aria-label', isReduced ? '游戏设置 · 动效已减少' : '游戏设置');
  if ($('#volume-setting')) {
    $('#volume-setting').value = Math.round(saved.settings.volume * 100);
    $('#volume-setting').style.setProperty('--v', saved.settings.volume);
  }
  if ($('#volume-value')) $('#volume-value').textContent = `${Math.round(saved.settings.volume * 100)}%`;
  $('#auto-speak-setting').checked = saved.settings.autoSpeak;
  $('#local-voice-setting').checked = saved.settings.localOnly;
  $('#speech-rate').value = Math.round(saved.settings.speechRate * 100);
  $('#speech-rate-value').textContent = `${saved.settings.speechRate.toFixed(2)}×`;
  if (isReduced) {
    fx.parts = []; fxBack.parts = [];
    for (const a of document.getAnimations()) a.cancel();
    S.shake = 0; S.flash = 0;
    $('#cutins').replaceChildren(); $('#show-actors').replaceChildren();
  }
  setShowLevel();
}

function setMotion(v, { persist: shouldPersist = true } = {}) {
  const m = Math.max(0, Math.min(1, Number(v)));
  saved.settings.motion = m;
  const isReduced = m <= 0.001;
  fx.reduced = fxBack.reduced = isReduced;
  fx.motion = fxBack.motion = m;
  document.body.classList.toggle('reduced', isReduced);
  document.body.classList.toggle('motion-enabled', !isReduced);
  const sl = $('#motion-setting');
  if (sl) {
    sl.value = Math.round(m * 100);
    sl.style.setProperty('--v', m);
    sl.checked = !isReduced;
  }
  const valEl = $('#motion-val');
  if (valEl) valEl.textContent = `${Math.round(m * 100)}%`;
  $('#open-settings')?.setAttribute('title', isReduced ? '游戏设置 · 动效已减少' : '游戏设置');
  $('#open-settings')?.setAttribute('aria-label', isReduced ? '游戏设置 · 动效已减少' : '游戏设置');
  if (isReduced) {
    fx.parts = []; fxBack.parts = [];
    for (const a of document.getAnimations()) a.cancel();
    S.shake = 0; S.flash = 0;
    $('#cutins').replaceChildren(); $('#show-actors').replaceChildren();
  }
  if (shouldPersist) persist();
}

let lastSliderFx = 0;
function motionSliderFx(v) {
  const t = performance.now();
  if (t - lastSliderFx < 70) return;
  lastSliderFx = t;
  const sl = $('#motion-setting');
  if (!sl || !sl.getBoundingClientRect) return;
  const rect = sl.getBoundingClientRect();
  const x = rect.left + 16 + (rect.width - 32) * v;
  const y = rect.top + rect.height / 2;
  if (saved.settings?.sound && !audio.muted) {
    audio.unlock();
    audio.play('blip', audio.now(), { m: 60 + Math.round(v * 24), v: 0.05 + 0.08 * v });
  }
  if (v <= 0.001) return;
  if (fx && fx.burst) {
    fx.burst(x, y, { count: Math.round(2 + 26 * v), speed: 160 + 520 * v, kinds: ['confetti', 'spark'], up: 120, life: 0.5 });
  }
  if (v > 0.5 && fx && fx.ring) {
    fx.ring(x, y, { color: v > 0.85 ? '#ffd23f' : '#ff7ab6', radius: 20 + 50 * v, width: 5 });
  }
}
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();

function updateDailyQuests(event) {
  // Settle completed old saves before replacing yesterday's task list.
  let rewards = claimQuestReward(saved.quests) ? 1 : 0;
  const changed = ensureDailyQuests(saved.quests, dayKey(), { typeId: course.typeId, reviewCount: saved.review.length });
  if (event) feedQuestEvent(saved.quests, event);
  if (claimQuestReward(saved.quests)) rewards += 1;
  if (rewards) {
    saved.calendar.hammers = Math.min(3, (saved.calendar.hammers || 0) + rewards);
    audio.jingle();
  }
  if (changed || rewards) persist();
}

const HAMMER_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true"><g stroke="#302238" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"><path d="M44.5 40 L55.5 40 L57 97 L43 97Z" fill="#3b6bff"/><path d="M44 60 L56 57 M44 74 L56 71 M44 88 L56 85" fill="none" stroke-width="2.6"/><rect x="13" y="12" width="74" height="30" rx="13" fill="#ff7ab6"/><rect x="5" y="8" width="15" height="38" rx="6" fill="#ffd23f"/><rect x="80" y="8" width="15" height="38" rx="6" fill="#ffd23f"/><path d="M28 20 Q50 15 72 20" fill="none" stroke="#fff" stroke-width="3" opacity=".85"/></g></svg>`;

const TROPHY_COL = {
  bronze: ['#eea36b', '#b8672b'],
  silver: ['#eef1f7', '#9aa6bf'],
  gold: ['#ffd23f', '#d99400'],
  rainbow: ['#ff9ccc', '#7a4bff'],
  secret: ['#c7a8ff', '#7a4bff'],
  none: ['#eceaf3', '#b9bbd8']
};

function trophySvg(rank = 'gold') {
  const [c0, c1] = TROPHY_COL[rank] || TROPHY_COL.gold;
  const rb = rank === 'rainbow';
  const fill = rb ? 'url(#tg-rb)' : c0;
  return `<svg viewBox="-20 -20 40 40" aria-hidden="true">${rb ? '<defs><linearGradient id="tg-rb" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#ff7ab6"/><stop offset=".4" stop-color="#ffd23f"/><stop offset=".7" stop-color="#3fdcb0"/><stop offset="1" stop-color="#8fb4ff"/></linearGradient></defs>' : ''}<g stroke="#302238" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"><path d="M-10.5 -12 C-18 -12 -18 -1 -8 1 M10.5 -12 C18 -12 18 -1 8 1" fill="none" stroke-width="2.6"/><path d="M-11 -16 H11 V-7 C11 2 5.5 6.5 0 6.5 C-5.5 6.5 -11 2 -11 -7Z" fill="${fill}"/><path d="M-3 6.5 L3 6.5 L4.2 11.5 L-4.2 11.5Z" fill="${c1}"/><rect x="-9.5" y="11.5" width="19" height="5.5" rx="2" fill="${fill}"/><path d="M0 -12.5 L1.6 -8.8 L5.6 -8.5 L2.6 -5.9 L3.5 -2 L0 -4.1 L-3.5 -2 L-2.6 -5.9 L-5.6 -8.5 L-1.6 -8.8Z" fill="#fff" stroke-width="1.2"/></g></svg>`;
}

function checkTrophies() {
  const earned = evaluateTrophies(saved.trophies, extractTrophyMetrics({
    ...saved, streak: bestStreak(saved.history, saved.calendar.nocount),
  }), Date.now());
  S.earnedTrophies.push(...earned);
  return earned;
}

function showEarnedTrophies() {
  if (!S.earnedTrophies.length) return;
  $('#tg-list').innerHTML = S.earnedTrophies.map(t => `<div class="tg-item rank-${t.rank}">
    <div class="tg-item-icon">${trophySvg(t.rank)}</div>
    <div class="tg-item-info"><b>${t.name}</b><small>${t.desc}</small></div>
  </div>`).join('');
  S.earnedTrophies = [];
  audio.jingle();
  $('#trophy-got-dialog').showModal();
}

function updateActionBadges() {
  const calDot = $('#cal-dot');
  if (calDot) {
    const todayStr = dayKey();
    const playedToday = playedDays(saved.history).has(todayStr);
    calDot.hidden = playedToday;
  }

  const bonusDot = $('#bonus-dot');
  if (bonusDot) {
    bonusDot.hidden = Boolean(saved.bonus?.last === dayKey());
  }

  const questDot = $('#quest-dot');
  if (questDot) {
    const allDone = isAllQuestsDone(saved.quests);
    const hasUnclaimed = allDone && !saved.quests?.rewarded;
    questDot.hidden = allDone && Boolean(saved.quests?.rewarded);
    questDot.classList.toggle('reward-ready', hasUnclaimed);
  }
}

function renderQuests() {
  updateDailyQuests();
  const allDone = isAllQuestsDone(saved.quests);
  const card = $('#quests');
  if (card) card.classList.toggle('all-done', allDone);
  const dialog = $('#quests-dialog');
  if (dialog) dialog.classList.toggle('all-done', allDone);

  const rewardEl = $('#quest-reward');
  const rewardText = $('#quest-reward-text');
  if (allDone) {
    if (rewardEl) rewardEl.classList.add('claimed');
    if (rewardText) rewardText.textContent = '今日委托全部达成！奖励已结算';
  } else {
    if (rewardEl) rewardEl.classList.remove('claimed');
    if (rewardText) rewardText.textContent = '全部达成领金锤';
  }

  const list = $('#quest-list');
  if (list && saved.quests.list) {
    list.innerHTML = saved.quests.list.map((q) => {
      const pct = Math.min(100, Math.round((q.prog / q.goal) * 100));
      return `<li class="${q.done ? 'done' : ''}">
        <span class="qchk">${q.done ? '✓' : ''}</span>
        <span class="qt">${questText(q)}</span>
        <span class="qp">${q.prog}/${q.goal}</span>
        <div class="qbar"><div class="qbar-fill" style="width:${pct}%"></div></div>
      </li>`;
    }).join('');
  }
  updateActionBadges();
}

function renderCalendar() {
  const calTitle = $('#cal-title');
  if (calTitle) calTitle.textContent = `${calYear} 年 ${calMonth + 1} 月`;

  const streak = currentStreak(saved.history, saved.calendar.nocount);
  const best = bestStreak(saved.history, saved.calendar.nocount);
  const todayStr = dayKey();
  const playedToday = playedDays(saved.history).has(todayStr);

  const badges = [];
  if (streak >= 1) badges.push(`<span class="cal-badge${streak >= 3 ? ' hot' : ''}">连续研习 <b>${streak}</b> 天${playedToday ? '' : ' (今日待打卡)'}</span>`);
  else badges.push(`<span class="cal-badge">从今天开启打卡</span>`);
  if (best >= 2) badges.push(`<span class="cal-badge best">最高 <b>${best}</b> 天</span>`);
  if (saved.bonus?.total) badges.push(`<span class="cal-badge stk">特别印章 <b>${saved.bonus.total}</b> 枚</span>`);
  badges.push(`<span class="cal-badge hmr" title="补签金锤"><i class="hmr-icon" aria-hidden="true">${HAMMER_SVG}</i> <b>${saved.calendar.hammers || 0}</b> 把</span>`);
  if ($('#cal-badges')) $('#cal-badges').innerHTML = badges.join('');

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const nocount = saved.calendar.nocount || {};
  const questDoneDays = saved.quests?.doneDays || {};

  let html = '';
  for (let i = 0; i < firstDay; i++) {
    html += '<span class="cal-day blank"></span>';
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayRecords = (saved.history || []).filter((h) => h.day === dStr);
    const cls = ['cal-day'];
    if (dStr === todayStr) cls.push('today');
    const isNocount = !dayRecords.length && nocount[dStr];
    if (isNocount) cls.push('nocount');
    const sticker = saved.bonus?.stickers?.[dStr];
    const stk = sticker ? `<span class="stk">${stickerSvg(sticker)}</span>` : '';

    if (dayRecords.length > 0) {
      cls.push('played');
      const bestScore = Math.max(...dayRecords.map((h) => h.score || 0));
      const star = questDoneDays[dStr] ? '<span class="qd-star" aria-label="今日委托达成">★</span>' : '';
      html += `<button type="button" class="${cls.join(' ')}" data-day="${dStr}" aria-label="${dStr} 挑战 ${dayRecords.length} 次 最高 ${bestScore} 分"><span class="n">${d}</span>${stampSvg(bestScore)}<span class="sc">${bestScore}</span>${stk}${star}</button>`;
    } else if (isNocount) {
      html += `<span class="${cls.join(' ')}"><span class="n">${d}</span><span class="nc-label">补签</span>${stk}</span>`;
    } else {
      html += `<span class="${cls.join(' ')}"><span class="n">${d}</span>${stk}</span>`;
    }
  }

  if ($('#cal-grid')) $('#cal-grid').innerHTML = html;

  const now = new Date();
  if ($('#cal-next')) {
    $('#cal-next').disabled = calYear > now.getFullYear() || (calYear === now.getFullYear() && calMonth >= now.getMonth());
  }
  updateActionBadges();
}

function checkHammer() {
  const offer = hammerOffer(saved.calendar, saved.history);
  if (offer && offer.hammersNeeded > 0) {
    const dialog = $('#hammer-dialog');
    const msg = $('#hammer-msg');
    if (dialog && msg && !dialog.open) {
      pendingHammer = { ...offer, day: dayKey(), typeId: course.typeId };
      msg.innerHTML = `你缺席了 <b>${offer.missed.length}</b> 天，是否消耗 <b>${offer.hammersNeeded}</b> 把补签金锤接续连续打卡纪录？`;
      dialog.showModal();
      saved.calendar.asked = dayKey();
      persist();
    }
  }
}

// 日历打卡成绩花丸手绘印章 (Hanamaru score stamp)
function stampSvg(score) {
  const gold = score >= 100;
  const col = gold ? '#ff4f6d' : '#ff7ab6';
  return `<svg class="cal-score-stamp" viewBox="-20 -20 40 40" aria-hidden="true"><path d="M-2 -15 C10 -16 16 -6 14 4 C12 13 1 17 -8 13 C-16 9 -16 -4 -8 -11 C-3 -15 5 -14 9 -10" fill="none" stroke="${col}" stroke-width="3" stroke-linecap="round"/>${gold ? '<path d="M0 -19 l2 4 4 .5 -3 3 .8 4 -3.8 -2 -3.8 2 .8 -4 -3 -3 4 -.5z" fill="#ffd23f" stroke="#302238" stroke-width="1.2" stroke-linejoin="round"/>' : ''}</svg>`;
}

// 每日签到印章图案 (hand-cut paper shapes)
function stickerSvg(type) {
  const k = '#1b1d4d';
  const shapes = {
    star: `<path d="M0 -17 L5 -6 L17 -5 L8 3 L11 15 L0 9 L-11 15 L-8 3 L-17 -5 L-5 -6Z" fill="#ffd23f" stroke="${k}" stroke-width="2.5" stroke-linejoin="round"/>`,
    heart: `<path d="M0 15 C-20 2 -15 -14 -6 -13 C-2 -13 0 -9 0 -7 C0 -9 2 -13 6 -13 C15 -14 20 2 0 15Z" fill="#ff7ab6" stroke="${k}" stroke-width="2.5"/>`,
    flower: `${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-9" rx="6.5" ry="9" transform="rotate(${a})" fill="#8fb4ff" stroke="${k}" stroke-width="2.2"/>`).join('')}<circle r="6" fill="#ffd23f" stroke="${k}" stroke-width="2.2"/>`,
    note: `<path d="M-4 9 V-13 L12 -16 V5" fill="none" stroke="${k}" stroke-width="3.5" stroke-linejoin="round"/><ellipse cx="-9" cy="10" rx="6.5" ry="5" fill="#3fdcb0" stroke="${k}" stroke-width="2.5"/><ellipse cx="7" cy="6" rx="6.5" ry="5" fill="#3fdcb0" stroke="${k}" stroke-width="2.5"/>`,
    clover: `${[0, 90, 180, 270].map((a) => `<circle cx="0" cy="-7.5" r="7" transform="rotate(${a})" fill="#6fd66f" stroke="${k}" stroke-width="2.2"/>`).join('')}<path d="M2 6 Q6 12 5 17" stroke="${k}" stroke-width="2.5" fill="none"/>`,
    hanamaru: `<path d="M-2 -15 C10 -16 16 -6 14 4 C12 13 1 17 -8 13 C-16 9 -16 -4 -8 -11 C-3 -15 5 -14 9 -10" fill="none" stroke="#ff4f6d" stroke-width="3.5" stroke-linecap="round"/><path d="M-6 -1 Q0 -9 6 -1 Q0 7 -6 -1Z" fill="#ffb3d6" stroke="#ff4f6d" stroke-width="2"/>`,
    crown: `<g stroke="${k}" stroke-width="1.8"><circle cx="-14" cy="3" r="7.5" fill="#ffd23f"/><circle cx="-14" cy="3" r="5" fill="#fff3c4"/><circle cx="14" cy="3" r="7.5" fill="#ffd23f"/><circle cx="14" cy="3" r="5" fill="#fff3c4"/><ellipse cy="4" rx="12.5" ry="10.5" fill="#ffd23f"/><ellipse cy="5.5" rx="10" ry="7.5" fill="#fff3e4"/><circle cx="-4.5" cy="5" r="2.6" fill="#fff" stroke-width="1"/><circle cx="-4.5" cy="5" r="1.9" fill="#ff97bf" stroke-width="1"/><circle cx="4.5" cy="5" r="2.6" fill="#fff" stroke-width="1"/><circle cx="4.5" cy="5" r="1.9" fill="#ff97bf" stroke-width="1"/><path d="M-2 9 Q0 10.5 2 9" fill="none" stroke-width="1.2" stroke-linecap="round"/><path d="M-9 -4 L-9 -14 L-4.5 -9 L0 -16 L4.5 -9 L9 -14 L9 -4Z" fill="#ff97bf" stroke-linejoin="round"/></g>`,
  };
  return `<svg viewBox="-20 -20 40 40" aria-hidden="true">${shapes[type] || shapes.star}</svg>`;
}

function openBonus(res, { isManual = false } = {}) {
  const dialog = $('#bonus-dialog');
  if (!dialog) return;
  S.pendingLoginBonus = null;
  S.bonusOpen = true;

  const runEl = $('#bonus-run');
  if (runEl) {
    runEl.innerHTML = res.run >= 2 ? `连续<b>${res.run}</b>天签到` : '今日签到奖励';
  }

  const slots = [];
  for (let i = 1; i <= 7; i++) {
    const got = i <= res.slot;
    const isToday = i === res.slot;
    const type = STICKERS[i - 1];
    const stampingCls = (isToday && !isManual) ? ' stamping' : '';
    const todayCls = isToday ? ' today' : '';
    const bigCls = i === 7 ? ' big' : '';
    const gotCls = got ? ' got' : '';
    slots.push(`<div class="bonus-slot${gotCls}${todayCls}${stampingCls}${bigCls}"><span class="d">第${i}天</span>${got ? stickerSvg(type) : (i === 7 ? '？' : i)}</div>`);
  }
  const gridEl = $('#bonus-grid');
  if (gridEl) gridEl.innerHTML = slots.join('');

  const noteEl = $('#bonus-note');
  if (noteEl) {
    noteEl.textContent = res.slot === 7
      ? '恭喜连续签到 7 天！特别印章已达成！'
      : `再签到 ${7 - res.slot} 天即可获得特别印章`;
  }

  const okBtn = $('#bonus-ok');
  if (okBtn) okBtn.textContent = isManual ? '我知道啦' : '立即领取';

  audio.unlock();
  dialog.showModal();

  if (!isManual && !S.reduced) {
    setTimeout(() => {
      if (!S.bonusOpen) return;
      const el = $('#bonus-grid .today');
      if (!el) return;
      const c = centerOf(el);
      audio.play('blip', audio.now(), { m: 84, v: 0.12 });
      audio.unit(res.slot === 7 ? 1 : 0.4);
      fx.burst(c.x, c.y, {
        count: res.slot === 7 ? 60 : 24,
        kinds: ['star', 'confetti', ...(res.slot === 7 ? ['coin', 'heart'] : [])],
        speed: res.slot === 7 ? 700 : 380,
        up: 150,
      });
      if (homeActors[2]) bounce(homeActors[2], { big: res.slot === 7, audio });
    }, 700);
  }

  okBtn?.focus({ preventScroll: true });
}

function closeBonus() {
  const dialog = $('#bonus-dialog');
  if (dialog?.open) dialog.close();
  S.bonusOpen = false;
  playClickSound('primary');
  renderCalendar();
  updateActionBadges();
  persist();

  const newlyEarned = checkTrophies();
  if (newlyEarned.length) {
    persist();
    if ($('#trophy-badge')) $('#trophy-badge').textContent = `${getEarnedTrophiesCount(saved.trophies)} / ${TROPHIES.length}`;
    setTimeout(() => {
      showEarnedTrophies();
    }, 280);
  }
}

function claimAndOpenBonus() {
  const res = S.pendingLoginBonus || claimLogin(saved.bonus, saved.calendar, new Date());
  if (res) {
    S.pendingLoginBonus = res;
    persist();
    openBonus(res, { isManual: false });
  }
}

function checkLoginBonus() {
  if (S.demo || S.screen !== 'home' || S.bonusOpen) return;
  if (saved.bonus?.last === dayKey()) return;
  const hammerDialog = $('#hammer-dialog');
  if (hammerDialog?.open) return;
  const guideDialog = $('#guide-dialog');
  if (guideDialog?.open) return;
  const settingsDialog = $('#settings-dialog');
  if (settingsDialog?.open) return;

  clearTimeout(bonusTimer);
  bonusTimer = setTimeout(() => {
    if (S.demo || S.screen !== 'home' || S.bonusOpen) return;
    if (saved.bonus?.last === dayKey()) return;
    const h = $('#hammer-dialog');
    if (h?.open) return;
    claimAndOpenBonus();
  }, 500);
}

function renderTrophiesModal(filter = 'all') {
  const dialog = $('#trophy-dialog');
  if (!dialog) return;
  $$('.tr-filter button').forEach(button => button.classList.toggle('active', button.dataset.f === filter));

  const earned = getEarnedTrophiesCount(saved.trophies);
  if ($('#trophy-count')) $('#trophy-count').textContent = `${earned} / ${TROPHIES.length}`;

  const container = $('#tr-list');
  if (!container) return;

  const got = saved.trophies?.got || {};
  let list = TROPHIES;
  if (filter === 'got') list = TROPHIES.filter((t) => got[t.id]);
  else if (filter === 'next') list = TROPHIES.filter((t) => !got[t.id]);

  container.innerHTML = list.map((t) => {
    const isGot = Boolean(got[t.id]);
    return `<div class="tr-card rank-${t.rank} ${isGot ? 'got' : 'locked'}">
      <div class="tr-card-icon">${isGot ? trophySvg(t.rank) : '<svg viewBox="-16 -16 32 32" class="tr-lock-svg"><rect x="-7" y="-2" width="14" height="12" rx="2.5" fill="#e2d8ce" stroke="#302238" stroke-width="2"/><path d="M-4.5 -2 V-7 C-4.5 -9.5 4.5 -9.5 4.5 -7 V-2" fill="none" stroke="#302238" stroke-width="2.2" stroke-linecap="round"/><circle cx="0" cy="4" r="1.3" fill="#302238"/></svg>'}</div>
      <div class="tr-card-info">
        <b>${t.name} <small>(${RANK_NAMES[t.rank] || ''})</small></b>
        <small>${t.desc}</small>
      </div>
      <span class="tr-card-status">${isGot ? '已达成' : '未解锁'}</span>
    </div>`;
  }).join('');
}

function showDayLog(dateStr) {
  const records = (saved.history || []).filter((h) => h.day === dateStr);
  if (!records.length) return;
  const dialog = $('#day-log-dialog');
  if (!dialog) return;
  if ($('#day-title')) $('#day-title').textContent = `${dateStr} 研习记录`;
  if ($('#day-list')) {
    $('#day-list').innerHTML = records.map((r, i) => {
      const where = r.kind === 'review' ? '错题重练' : (r.lesson || '历史研习');
      const typeName = r.type ? ` · ${r.type}` : '';
      const count = r.total == null ? `${r.solved ?? 0} 题` : `${r.solved}/${r.total} 题`;
      const duration = r.timeMs == null ? '' : ` · 用时 ${Math.round(r.timeMs / 1000)} 秒`;
      return `<li>
        <div><span>第 ${i + 1} 轮 · ${where}${typeName}</span>
          <small>答对 ${count} · 独立答对 ${r.firstTry ?? 0} · 差一点 ${r.misses ?? 0} · ${r.combo ?? 0} 连击${duration}</small></div>
        <b class="dl-score">${r.score} 分</b>
      </li>`;
    }).join('');
  }
  dialog.showModal();
}

const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
function unitLabel(u) { return u.no >= 1 ? `第${CN_NUM[u.no - 1] || u.no}单元` : '导言与学法'; }

function renderBookTabs() {
  const box = $('#book-tabs');
  if (!box) return;
  box.innerHTML = BOOKS.map((book) => {
    const active = book.id === course.bookId;
    const count = bookQuestionCount(book);
    const tally = count ? `${count} 题` : '待补题';
    return `<button type="button" class="book-tab${active ? ' active' : ''}${count ? '' : ' is-empty'}"`
      + ` data-book="${book.id}" role="tab" aria-selected="${active ? 'true' : 'false'}">`
      + `<strong>${book.title}</strong><small>${tally}</small></button>`;
  }).join('');
}

function refreshHome() {
  const bk = currentBook();
  const un = currentUnit();
  const type = currentType();
  if (!un.lessons.some((l) => l.id === course.lessonId)) course.lessonId = un.lessons[0].id;

  renderBookTabs();

  $('#unit-tabs').innerHTML = bk.units.map((u) => {
    const active = u.id === course.unitId;
    return `<button type="button" class="unit-tab${active ? ' active' : ''}" data-unit="${u.id}" role="tab" aria-selected="${active ? 'true' : 'false'}"><small>${unitLabel(u)}</small><strong>${u.name}</strong></button>`;
  }).join('');

  $('#lesson-list').innerHTML = un.lessons.map((l) => {
    const qs = questionsOf(l, course.typeId);
    const learned = qs.filter((q) => saved.learned.includes(q.id)).length;
    const active = l.id === course.lessonId;
    const tally = qs.length
      ? `<b>${learned}</b>/${qs.length}`
      : '<span class="lesson-todo">待补</span>';
    return `<button type="button" class="lesson-card${active ? ' active' : ''}" data-lesson="${l.id}" aria-pressed="${active ? 'true' : 'false'}"><span class="lesson-no">${l.label}</span><span class="lesson-title">${l.title}</span><span class="lesson-count" aria-label="本课该题型练过 ${learned} 道，共 ${qs.length} 道">${tally}</span></button>`;
  }).join('');

  const les = currentLesson();
  const pool = questionsOf(les, course.typeId);
  const playable = pool.length > 0;
  $('#start-round').disabled = !playable;
  $('#start-round').classList.toggle('is-empty', !playable);
  $('#start-label').textContent = playable ? `${copy.startLabel} · ${type.label}` : copy.pendingLabel;
  $('#start-note').textContent = playable
    ? `${les.label} ${les.title} · 一轮 ${ROUND_SIZE} 题 · 每题 ${type.seconds} 秒`
    : `${bk.title} · ${les.label} ${les.title} 还没有${type.label}，换一册或换一种题型看看`;
  $('#review-count').textContent = saved.review.length;
  $('#start-review').disabled = !saved.review.length;
  const done = ALL_QUESTIONS.filter((q) => saved.learned.includes(q.id)).length;
  $('#home-progress').textContent = done
    ? `已练过 ${done} / ${ALL_QUESTIONS.length} 道题 · 完成 ${saved.rounds} 轮`
    : copy.footer;

  // Re-evaluate existing progress after catalogue updates without dropping old records.
  const newlyEarned = evaluateTrophies(saved.trophies, extractTrophyMetrics({
    ...saved, streak: bestStreak(saved.history, saved.calendar.nocount),
  }), Date.now());
  if (newlyEarned.length) persist();
  const earned = getEarnedTrophiesCount(saved.trophies);
  if ($('#trophy-badge')) $('#trophy-badge').textContent = `${earned} / ${TROPHIES.length}`;

  renderQuests();
  renderCalendar();
  checkHammer();
  checkLoginBonus();
}
function home() {
  cancelRun(); S.demo = false; S.E = .02;
  setShowLevel();
  fx.parts = []; fxBack.parts = [];
  if (saved.settings?.sound && !audio.muted) {
    startHomeMusic();
  } else {
    audio.stopMusic();
  }
  $('#open-settings').disabled = false;
  refreshHome(); showScreen('home'); $('#start-round').focus({ preventScroll: true });
}
function start(kind = 'lesson') {
  cancelRun(); audio.unlock();
  updateDailyQuests();
  let questions;
  if (kind === 'review') {
    questions = shuffle(ALL_QUESTIONS.filter((q) => saved.review.includes(q.id))).slice(0, REVIEW_SIZE);
  } else if (kind === 'demo') {
    questions = shuffle(ALL_QUESTIONS).slice(0, ROUND_SIZE);
  } else {
    questions = makeRound(questionsOf(currentLesson(), course.typeId), { count: ROUND_SIZE, seen: saved.learned });
  }
  if (!questions.length) { home(); return; }
  Object.assign(S, { questions, kind, qi: 0, step: 0, combo: 0, peak: 0, misses: 0, playMs: 0, energy: 0, shownEnergy: 0, energyUnit: 0, E: .08, results: [], demo: kind === 'demo', phase: 'answer', demoSlipped: false });
  actors.forEach((a) => { a.hidden = true; });
  $('#open-settings').disabled = S.demo;
  const les = currentLesson();
  $('#play-title').textContent = S.demo
    ? '跟着气泡小队玩一轮'
    : kind === 'review'
      ? '错题重练'
      : `${les.label} ${les.title}`;
  $('#demo-banner').hidden = !S.demo;
  $('#exit-game').hidden = S.demo;
  $('#pips').innerHTML = questions.map(() => '<span class="pip"></span>').join('');
  audio.key = 0; audio.startMusic(); audio.jingle();
  showScreen('play'); setupQuestion();
}
function updateEnergy() {
  $('#energy-value').textContent = S.energy ? displayEnergy(S.shownEnergy) : '0';
  $('#energy-fill').style.width = `${Math.min(100, S.energy / 3 * 100)}%`;
  $('#combo').textContent = S.combo;
  $('#combo-mult').textContent = `能量 ×${(1 + Math.min(1, S.combo / 20)).toFixed(2)}`;
  $('#combo-fill').style.transform = `scaleX(${Math.min(1, S.combo / 20)})`;
  $('#combo-box').classList.toggle('hot', S.combo >= 5);
  $('#combo-box').setAttribute('aria-label', `${S.combo} 连击，能量倍率 ${(1 + Math.min(1, S.combo / 20)).toFixed(2)}`);
  $('#hud-solved').textContent = S.results.filter((r) => r.completed).length;
  $('#hud-total').textContent = S.questions.length;
  $('#hud-misses').textContent = S.misses;
}
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 把题干、材料和作答槽摆到题面卡片上。填空题的槽直接嵌在题干里，其余题型单列。
function renderContext(q, type) {
  // 题型同时挂到 body 上，答案格与选项密度靠它切换版式。
  document.body.dataset.questionType = q.type;
  $('#type-tag').textContent = type.label;
  $('#stem-guide').textContent = type.guide;
  const mat = $('#material-text');
  if (q.material) { mat.textContent = q.material; mat.hidden = false; } else { mat.textContent = ''; mat.hidden = true; }
  const stem = $('#stem-text');
  const slots = $('#word-slots');
  slots.className = q.type === 'blank' ? 'word-slots inline' : 'word-slots';
  stem.replaceChildren();
  if (q.type === 'blank') {
    const [before, after = ''] = q.stem.split('____');
    stem.append(document.createTextNode(before), slots, document.createTextNode(after));
  } else {
    stem.append(document.createTextNode(q.stem));
    $('#slot-home').append(slots);
  }
  const label = q.type === 'blank' ? '题干中待填的空格' : '你的答案';
  slots.innerHTML = `<span class="word-cell blank" data-index="0" aria-label="${label}">?</span>`;
  updateOptionFont(q);
}
function updateOptionFont(q) {
  const options = q.options || [''];
  const longest = Math.max(1, ...options.map((o) => o.length));
  const box = $('#choices');
  if (q.type === 'judge') {
    box.dataset.density = 'pair';
    box.style.setProperty('--option-font', '26px');
    return;
  }
  if (q.type === 'blank') {
    // 填空题的候选都是一两个词，固定两列，词短就放大字。
    box.dataset.density = 'pair';
    box.style.setProperty('--option-font', `${longest <= 3 ? 22 : longest <= 5 ? 20 : 16}px`);
    return;
  }
  // 选择题 / 材料题的选项是成句的中文，短选项并排两列，长选项单列铺开。
  const pair = longest <= 6;
  box.dataset.density = pair ? 'pair' : 'stack';
  box.style.setProperty('--option-font', `${pair ? (longest <= 4 ? 26 : 20) : longest <= 18 ? 20 : longest <= 28 ? 17 : 15}px`);
}
function setupQuestion() {
  speech.cancel();
  $('#tts-note').textContent = '';
  const q = activeQuestion();
  const type = TYPE_MAP[q.type];
  S.typeId = q.type;
  document.body.dataset.questionType = q.type;
  Object.assign(S, { step: 0, firstTry: true, stepMisses: 0, questionMisses: S.misses, phase: 'answer', ready: true });
  S.timeLeft = secondsOf(q) * 1000; S.clockAt = performance.now(); S.lastTick = null;
  $('#next-question').disabled = false;
  $('#read-question').className = 'speaker-btn icon-only';
  $('#read-question').hidden = false;
  $('#read-question').innerHTML = speakerIconSVG;
  $('#read-question').setAttribute('aria-label', '朗读题目');
  $('#read-question').title = '朗读题目';
  updateTimer();
  S.E = energyAt(S.qi, S.questions.length);
  const music = musicAt(S.E);
  audio.setLevel(music.level, music.bpm);
  setShowLevel();
  audio.key = S.qi === S.questions.length - 1 ? 2 : 0;
  $('#question-number').textContent = `${String(S.qi + 1).padStart(2, '0')} / ${String(S.questions.length).padStart(2, '0')}`;
  $('#level-tag').textContent = `${q.lessonLabel} · ${type.label}`;
  $('#blank-count').textContent = type.note;
  renderContext(q, type);
  $('.choice-note').innerHTML = q.type === 'judge'
    ? '点一个判断，发射气泡 <span>键盘 1—2 也可以</span>'
    : '点一个答案，发射气泡 <span>键盘 1—4 也可以</span>';
  $('#feedback').textContent = copy.ready;
  $('#stamp').replaceChildren();
  $('#answer-area').hidden = false; $('#explanation').hidden = true; $('#hint').hidden = true;
  $('#show-hint').hidden = false;
  $('#show-hint').disabled = S.demo;
  $$('.pip').forEach((p, i) => {
    p.classList.toggle('now', i === S.qi); p.classList.toggle('done', i < S.qi);
    p.style.setProperty('--pip-color', ['#5278ff', '#52dfb5', '#ff6b8b', '#ffcf3f'][Math.min(3, Math.floor(energyAt(i, S.questions.length) * 4.5))]);
    p.classList.toggle('rainbow', i < S.qi && energyAt(i, S.questions.length) > .85);
  });
  $('#pips').setAttribute('aria-label', `已完成 ${S.qi} 题，共 ${S.questions.length} 题`);
  updateEnergy(); renderChoices();
  if (!reduced()) {
    const card = $('#question-card');
    card.animate(S.E < .4 ? [{ opacity: 0, transform: 'translateX(60px) rotate(3deg)' }, { opacity: 1, transform: 'none' }] : [{ opacity: 0, transform: 'translateY(-100px) rotate(-8deg) scale(.8)' }, { opacity: 1, transform: 'scale(1.04,.96)', offset: .75 }, { opacity: 1, transform: 'none' }], { duration: 450, easing: 'ease-out' });
    if (S.E > .35) { const c = centerOf(card); fx.puff(c.x - c.w / 2, c.y + c.h / 2, 5); fx.puff(c.x + c.w / 2, c.y + c.h / 2, 5); audio.land(); }
    if (S.E > .22) cutin(S.qi === S.questions.length - 1 ? '最后一题！' : `第 ${S.qi + 1} 题`);
  }
  if (saved.settings.autoSpeak) readQuestion();
  if (S.demo) scheduleDemo();
}
function renderChoices() {
  const q = activeQuestion();
  $$('.word-cell').forEach((el) => el.classList.add('active'));
  const options = optionsFor(q, Math.random, q.type);
  S.correctKey = options.find((o) => o.correct)?.key ?? null;
  const longest = Math.max(1, ...options.map((o) => o.key.length));
  $('#bubble-layer').style.setProperty('--bubble-font', `${q.type === 'blank' ? Math.min(22, 58 / longest) : 27}px`);
  $('#choices').innerHTML = options.map((o, i) => `<button type="button" class="choice" data-char="${escapeHtml(o.key)}" data-text="${escapeHtml(o.text)}" aria-label="选项 ${i + 1}：${escapeHtml(o.text)}"><small aria-hidden="true">${i + 1}</small><span class="choice-text">${escapeHtml(o.text)}</span></button>`).join('');
  $('#choices').classList.remove('busy');
  $('#candidate-speech').innerHTML = options.map((o) => `<button type="button" class="speaker-btn icon-only" data-speech="${escapeHtml(o.text)}" aria-label="朗读 ${escapeHtml(o.text)}" title="朗读 ${escapeHtml(o.text)}">${speakerIconSVG}</button>`).join('');
  const team = actors.filter((a) => !a.hidden);
  actors.forEach((a) => a.classList.toggle('active-actor', a === team[S.qi % team.length]));
  $('#actor-caption').textContent = '泡泡小队，准备好啦';
}
async function choose(button, automated = false) {
  if (!S.ready || S.screen !== 'play' || S.phase !== 'answer' || paused() || (S.demo && !automated) || button.disabled) return;
  speech.cancel();
  const run = S.run; const q = activeQuestion(); const step = S.step;
  const valid = () => S.run === run && S.screen === 'play' && activeQuestion() === q;
  const correct = button.dataset.char === S.correctKey;
  const slot = $('.word-cell');
  S.ready = false; $('#choices').classList.add('busy');
  audio.unlock(); audio.keyTap(S.combo);
  try {
    await bubbleHit($('.active-actor'), button, slot, { correct, reduced: reduced(), layer: $('#bubble-layer'), fx, audio, valid, motion: () => !reduced() });
    if (!valid()) return;
    if (correct) {
      slot.textContent = button.dataset.char;
      slot.setAttribute('aria-label', button.dataset.char);
      slot.classList.remove('active', 'blank'); slot.classList.add('ok'); button.classList.add('picked');
      S.combo += 1; S.peak = Math.max(S.peak, S.combo);
      const prevEnergy = S.energy;
      S.energy = gainEnergy(S.energy, S.qi, step, q.blanks.length, S.questions.length, S.combo);
      updateEnergy();
      const c = centerOf(slot);
      if (step + 1 < q.blanks.length) audio.correct(S.combo, S.E);
      if (!reduced()) {
        slot.animate([{ transform: 'scale(1.4)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' });
        correctParticles(fx, fxBack, S.E, c.x, c.y);
        if (S.E > .5) S.shake = Math.max(S.shake, 2 + 3 * S.E);
        if (S.E > .12) fx.text(c.x, c.y - 30, `+${Math.max(1, Math.round(10 ** S.energy - 10 ** prevEnergy))}`, { color: '#8fd3ff', size: 16 + 10 * S.E, vy: -120 });
        actors.filter((a) => !a.hidden).forEach((a) => bounce(a, { big: S.E > .7 }));
      }
      S.step += 1; S.stepMisses = 0; $('#hint').hidden = true;
      $('#feedback').textContent = copy.correct;
      if (S.combo > 0 && S.combo % 5 === 0) cutin(`${S.combo} 连击！`);
      if (S.step >= q.blanks.length) completeQuestion();
      else { renderChoices(); S.ready = true; if (S.demo) scheduleDemo(); }
    } else {
      S.firstTry = false; S.misses += 1; S.combo = 0; S.stepMisses += 1;
      audio.wrong(S.E); updateEnergy();
      if (!reduced()) {
        const actor = $('.active-actor'); const c = centerOf(actor);
        actor.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.4,.55) rotate(-12deg)' }, { transform: 'translateY(-18px) scale(.8,1.2)' }, { transform: 'none' }], { duration: 620, easing: 'ease-out' });
        fx.burst(c.x, c.y - 20, { count: 10, kinds: ['star'], speed: 220, up: 60 });
        fx.ring(c.x, c.y, { color: '#fff', radius: 60, width: 7 });
        if (S.E > .5) { S.shake = Math.max(S.shake, 8); S.flash = Math.max(S.flash, .12); }
      }
      button.disabled = true; button.classList.add('rejected');
      $('#feedback').textContent = `${copy.wrong} 再试一个答案吧。`;
      slot.classList.remove('bad'); void slot.offsetWidth; slot.classList.add('bad');
      $('#choices').classList.remove('busy'); S.ready = true;
      if (S.stepMisses >= 2) hint();
      if (S.demo) scheduleDemo();
    }
  } catch (err) {
    if (valid()) { S.ready = true; $('#choices').classList.remove('busy'); $('#feedback').textContent = '气泡没跟上，再点一次试试。'; }
    console.error(err);
  }
}
function hint() {
  if (!S.ready || S.phase !== 'answer') return;
  S.firstTry = false;
  const q = activeQuestion();
  const wrongs = $$('.choice').filter((b) => b.dataset.char !== S.correctKey && !b.disabled);
  if (wrongs.length > 1) {
    const pick = wrongs[Math.floor(Math.random() * wrongs.length)];
    pick.disabled = true;
    pick.classList.add('hint-choice');
  }
  $('#hint').textContent = q.type === 'blank'
    ? `💡 正确答案是 ${q.options[q.answer].length} 个字。`
    : q.type === 'judge'
      ? '💡 想一想，这句话有没有偷换时间、地点或人物。'
      : '💡 已经帮你排除一个错误选项，再读一遍题干。';
  $('#hint').hidden = false;
  $('#feedback').textContent = '用了提示也没关系，读懂题干最重要。';
  if (S.stepMisses >= 3) $$('.choice').find((b) => b.dataset.char === S.correctKey)?.classList.add('hint-choice');
}
function completeQuestion(skipped = false, timedOut = false) {
  speech.cancel();
  const q = activeQuestion();
  S.phase = 'explain'; S.ready = false;
  const firstTry = S.firstTry && !skipped;
  S.results.push({ id: q.id, type: q.type, firstTry, completed: !skipped });
  recordAnswer(saved, q, firstTry, { demo: S.demo });
  if (!S.demo) {
    saved.stats.problems = (saved.stats.problems || 0) + (skipped ? 0 : 1);
    if (firstTry) saved.stats.firstTry = (saved.stats.firstTry || 0) + 1;
    if (S.kind === 'review' && firstTry) saved.stats.reviewSolved = (saved.stats.reviewSolved || 0) + 1;
    saved.stats.misses += S.misses - S.questionMisses;
    saved.stats.maxCombo = Math.max(saved.stats.maxCombo || 0, S.combo);

    const thinkingMs = secondsOf(q) * 1000 - S.timeLeft;
    if (firstTry && thinkingMs <= 5000) saved.stats.flags.speedy = true;
    const energy = Math.round(10 ** S.energy);
    if (energy >= 1000) saved.stats.flags.energy = true;

    updateDailyQuests({
      type: 'solve',
      firstTry,
      review: S.kind === 'review',
      combo: S.combo,
      energy,
    });

    checkTrophies();
    persist();
  }
  const reach = audio.reach; audio.setReach(false);
  document.body.classList.remove('reach');
  if (!skipped) {
    if (reach) audio.reachHit(S.E); else audio.clear(S.E);
    celebrate(reach); drawStamp();
  } else {
    S.combo = 0; updateEnergy();
    const cell = $('.word-cell');
    if (cell) {
      cell.textContent = q.options[q.answer];
      cell.setAttribute('aria-label', q.options[q.answer]);
      cell.classList.remove('active', 'blank');
    }
  }
  $$('.pip')[S.qi].classList.replace('now', 'done');
  $$('.pip')[S.qi].classList.toggle('rainbow', S.E > .85);
  updateEnergy();
  $('#pips').setAttribute('aria-label', `已完成 ${S.qi + 1} 题，共 ${S.questions.length} 题`);
  $('#actor-caption').textContent = '泡泡小队，为你欢呼';
  $('#feedback').textContent = timedOut ? '时间到！读懂这道题，下一题再挑战。' : copy.finished;
  updateTimer();
  $('#answer-area').hidden = true; $('#explanation').hidden = false;
  $('#read-question').hidden = true;
  $('#answer-word').textContent = q.options[q.answer];
  $('#meaning').textContent = q.explain;
  if ($('.explain-heading span')) $('.explain-heading span').textContent = skipped ? copy.unlearned : copy.learned;
  $('#example').textContent = `教材定位：${q.unitName} · ${q.lessonLabel} ${q.lessonTitle}`;
  if (!S.demo && saved.settings.autoSpeak) readExplanation();
  $('#next-question').textContent = S.qi === S.questions.length - 1 ? '这一轮完成啦 →' : '记好啦，下一题 →';
  if (!S.demo) $('#next-question').focus({ preventScroll: true });
  if (S.qi === S.questions.length - 1 && !skipped) playFinale();
  else if (S.demo) later(() => demoNext(), 2200);
}
function nextQuestion() {
  if (S.screen !== 'play' || S.phase !== 'explain' || paused()) return;
  speech.cancel();
  if (S.qi + 1 >= S.questions.length) finish();
  else { S.qi += 1; setupQuestion(); }
}
function updateTimer() {
  const active = S.phase === 'answer' && !speech.busy;
  const seconds = Math.ceil((S.timeLeft || 0) / 1000);
  $('#time-left').textContent = `${seconds}`;
  $('#timer-label').textContent = active ? '剩余' : '已暂停';
  $('#question-timer').classList.toggle('hurry', active && seconds <= 5);
  $('#question-timer').setAttribute('aria-label', active ? `本题还剩 ${seconds} 秒` : speech.busy ? '朗读中，倒计时已暂停' : '阅读解释，倒计时已暂停');
  $('#time-fill').style.transform = `scaleX(${Math.max(0, S.timeLeft || 0) / (secondsOf(activeQuestion()) * 1000)})`;
}
function tickTimer(t) {
  const elapsed = S.clockAt == null ? 0 : t - S.clockAt;
  S.clockAt = t;
  if (S.screen !== 'play') return;
  if (!paused() && !speech.busy) S.playMs += Math.max(0, elapsed);
  const active = S.phase === 'answer' && S.ready && !paused() && !speech.busy;
  S.timeLeft = countdown(S.timeLeft, elapsed, active);
  updateTimer();
  if (!active) return;
  const seconds = Math.ceil(S.timeLeft / 1000);
  if (seconds > 0 && seconds <= 5 && seconds !== S.lastTick) { S.lastTick = seconds; audio.tick(seconds <= 1); }
  if (S.timeLeft <= 0) {
    S.firstTry = false; S.misses += 1; audio.wrong(S.E);
    completeQuestion(true, true);
  }
}
// All delayed show work belongs to this run. A cancelled scene cannot affect
// a later question, home screen, or the user's reduced-motion preference.
function showTween(el, duration, draw, ease) {
  const run = S.run;
  const question = activeQuestion();
  return tween(duration, (k) => { if (run === S.run && !reduced() && el.isConnected && (el.id !== 'question-card' || question === activeQuestion())) draw(k); }, ease);
}
function setShowLevel() {
  const level = S.screen === 'home' ? 0 : musicAt(S.E).level;
  for (let i = 0; i <= 10; i++) document.body.classList.toggle(`lv${i}`, i <= level);
  const count = reduced() ? 1 : crowdAt(S.E);
  actors.forEach((actor, i) => {
    const joining = actor.hidden && i < count;
    actor.hidden = i >= count;
    if (joining && !reduced()) actor.animate([
      { transform: `translate(${i % 2 ? -180 : 180}px,0) scale(.8)` },
      { transform: 'translate(0,-80px) scale(.9,1.1)', offset: .5 },
      { transform: 'none' },
    ], { duration: 520, easing: 'ease-out' });
  });
}
async function cutin(text) {
  if (reduced()) return;
  audio.cutin();
  const E = S.E; const r = $('.play-stage').getBoundingClientRect();
  const h = 58 + 26 * Math.min(1, E);
  const palettes = [['#3b6bff', '#5b8cff'], ['#ff7ab6', '#ff9ccc'], ['#ffb000', '#ffd23f'], ['#1b1d4d', '#3b3f8f']];
  const pal = palettes[Math.min(3, Math.floor(E * 3.6))];
  const el = Object.assign(document.createElement('div'), { className: 'cutin-band' });
  el.style.cssText = `top:${r.top + r.height / 2 - h / 2}px;height:${h}px;--c1:${pal[0]};--c2:${pal[1]}`;
  el.innerHTML = '<div class="band-bg"></div><div class="band-text"></div>';
  el.lastChild.textContent = text;
  $('#cutins').append(el);
  await showTween(el, 240, (k) => { el.style.transform = `translateX(${(1 - k) * 110}%) rotate(-6deg) scaleY(${.6 + .4 * k})`; }, easeOutBack);
  await wait(360 + 160 * E);
  await showTween(el, 200, (k) => { el.style.transform = `translateX(${-k * 110}%) rotate(-6deg)`; }, easeInCubic);
  el.remove();
}
function celebrate(big = false) {
  if (reduced()) return;
  const E = S.E; const c = centerOf($('#question-card')); const W = innerWidth; const H = innerHeight;
  const run = S.run;
  actors.filter((a) => !a.hidden).forEach((actor, i) => later(() => bounce(actor, { big: E > .5 || big, reduced: reduced(), spin: E > .5 && Math.random() < .5, audio: i === 0 ? audio : null, valid: () => run === S.run && !reduced() }), i * 60));
  celebrationParticles(fx, fxBack, E, big, c.x, c.y - c.h * .1, W, H);
  if (E > .5) S.flash = Math.max(S.flash, .25 * E);
  if (big) S.flash = 1;
  if (E > .74 || big) parade(E, big);
  S.shake = Math.max(S.shake, 3 + 9 * E + (big ? 6 : 0));
  showTween($('#question-card'), 260, (k) => { $('#question-card').style.transform = `scale(${1 + Math.sin(k * Math.PI) * .04 * E})`; });
}
function parade(E = S.E, big = false) {
  if (reduced() || $('.parade-actor')) return;
  const stage = $('.play-stage').getBoundingClientRect();
  const dir = Math.random() < .5 ? 1 : -1;
  const n = Math.round(3 + 4 * Math.min(1, E) + (big ? 2 : 0));
  for (let i = 0; i < n; i++) {
    const el = Object.assign(document.createElement('div'), { className: 'parade-actor' });
    el.innerHTML = softieSVG(['pink', 'blue', 'yellow', 'mint', 'violet'][i % 5], { happy: true });
    el.style.width = `${64 + rand(0, 24)}px`;
    const y = stage.top + rand(stage.height * .25, stage.height * .55);
    const x0 = dir > 0 ? -80 - i * 70 : innerWidth + 80 + i * 70;
    const x1 = dir > 0 ? innerWidth + 80 : -80;
    const hops = 5 + Math.floor(rand(0, 3)); const height = rand(30, 70);
    const spin = Math.random() < .25 ? 360 * dir : 0;
    $('#show-actors').append(el);
    showTween(el, hops * rand(300, 380), (k) => {
      const lift = Math.sin((k * hops % 1) * Math.PI);
      el.style.transform = `translate(${lerp(x0, x1, k)}px,${y - lift * height}px) rotate(${spin * k}deg) scale(${1 - lift * .12},${1 + lift * .12})`;
    }, (k) => k).then(() => el.remove());
  }
}
function drawStamp() {
  const E = S.E; const flower = E >= .45; const el = $('#stamp');
  let spiral = ''; let petals = '';
  for (let i = 0; i <= 90; i++) { const t = i / 90; const a = -1.9 + t * (flower ? 2.3 : 1.12) * Math.PI * 2; const r = flower ? 9 + t * 29 : 44 + t * 7 + Math.sin(t * 9) * 1.2; spiral += `${i ? 'L' : 'M'}${Math.cos(a) * r} ${Math.sin(a) * r}`; }
  for (let i = 0; i < 11; i++) { const a = i / 11 * Math.PI * 2; const b = (i + 1) / 11 * Math.PI * 2; const m = (a + b) / 2; petals += `${i ? '' : `M${Math.cos(a) * 45.24} ${Math.sin(a) * 45.24}`} Q${Math.cos(m) * 64.96} ${Math.sin(m) * 64.96} ${Math.cos(b) * 45.24} ${Math.sin(b) * 45.24}`; }
  const color = E > .85 ? 'url(#stamp-rainbow)' : '#ff4f6d';
  el.style.width = el.style.height = `${flower ? 150 : 110}px`; el.style.opacity = 1;
  el.innerHTML = `<svg viewBox="-70 -70 140 140"><defs><linearGradient id="stamp-rainbow" x2="1" y2="1"><stop stop-color="#ff4f6d"/><stop offset=".35" stop-color="#ffb000"/><stop offset=".65" stop-color="#3fdcb0"/><stop offset="1" stop-color="#3b6bff"/></linearGradient></defs><path d="${spiral}" fill="none" stroke="${color}" stroke-width="7.5" stroke-linecap="round"/>${flower ? `<path d="${petals}" fill="none" stroke="${color}" stroke-width="6.5" stroke-linecap="round"/>` : ''}</svg>`;
  const paths = [...el.querySelectorAll('path')];
  if (reduced()) return;
  const token = el.firstChild;
  paths.forEach((p) => { p.style.strokeDasharray = p.style.strokeDashoffset = p.getTotalLength(); });
  showTween(el, 260 + (flower ? 120 : 0), (k) => {
    if (el.firstChild !== token) return;
    paths.forEach((p, i) => { p.style.strokeDashoffset = p.getTotalLength() * (1 - (i ? Math.max(0, (k - .4) / .6) : Math.min(1, k * (flower ? 1.6 : 1)))); });
    el.style.transform = `rotate(${-20 + 20 * k}deg) scale(${1.3 - .3 * k})`;
  }).then(() => {
    if (E > .85) showTween(el, 900, (k) => { if (el.firstChild === token) el.style.transform = `rotate(${k * 360}deg)`; }, easeOutQuint);
  });
  later(() => { if (el.firstChild === token) el.style.opacity = 0; }, 1500);
}
async function unitSlam(value, finale = false) {
  if (reduced()) return;
  if (!finale) audio.unit(S.E);
  const box = $('.energy-row').getBoundingClientRect();
  const stage = $('.play-stage').getBoundingClientRect();
  const big = finale || (S.E > .45 && value !== 100);
  const el = Object.assign(document.createElement('div'), { className: 'unit-slam', textContent: String(value) });
  el.style.fontSize = `${finale ? Math.min(110, innerWidth * .26) : big ? 64 + 40 * S.E : 30}px`;
  if (finale) el.style.color = '#ff7ab6';
  $('#cutins').append(el);
  const x = big ? innerWidth / 2 : box.right - 45;
  const y = finale ? innerHeight * .2 : big ? stage.top + stage.height * .35 : box.bottom + 4;
  el.style.left = `${x - el.offsetWidth / 2}px`; el.style.top = `${y - el.offsetHeight / 2}px`;
  if (big && !finale) {
    fx.burst(x, y, { count: 30 + 40 * S.E, kinds: ['coin', 'star', 'spark'], speed: 600 });
    fx.ring(x, y, { color: '#ffd23f', radius: 180, width: 12 }); S.shake = Math.max(S.shake, 6);
  }
  await showTween(el, finale ? 320 : big ? 280 : 200, (k) => {
    el.style.transform = `scale(${lerp(finale ? 4 : big ? 3.2 : 1.8, 1, k)}) rotate(${lerp(-18, -4, k)}deg)`; el.style.opacity = Math.min(1, k * 2);
  }, easeOutBack);
  await wait(finale ? 1500 : big ? 520 : 400);
  await showTween(el, finale ? 300 : 260, (k) => {
    el.style.transform = finale ? `scale(${1 + k * .3}) rotate(-6deg)` : `translate(${(box.right - 45 - x) * k}px,${(box.top - y) * k}px) scale(${1 - .8 * k}) rotate(-4deg)`;
    el.style.opacity = 1 - k;
  }, easeInCubic);
  el.remove();
}
async function playFinale() {
  const run = S.run;
  const valid = () => run === S.run && S.screen === 'play';
  const visual = () => valid() && !reduced();
  S.phase = 'finale'; $('#next-question').disabled = true;
  audio.finale();
  await wait(120);
  if (!valid()) return;
  if (visual()) {
    S.flash = 1;
    finaleParticles(fx, fxBack, innerWidth, innerHeight);
    const giant = Object.assign(document.createElement('div'), { className: 'giant-softie' });
    giant.innerHTML = softieSVG('pink', { happy: true });
    $('#show-actors').append(giant);
    await showTween(giant, 700, (k) => { giant.style.transform = `translate(-50%,${(1 - k) * 110}%)`; }, easeOutBack);
    if (!valid()) return;
    if (visual()) { unitSlam(S.kind === 'placement' ? '出发！' : '100分', true); S.shake = 16; }
    for (let i = 0; i < 3; i++) {
      await showTween(giant, 260, (k) => { giant.style.transform = `translate(-50%,${-Math.sin(k * Math.PI) * 60}px) rotate(${Math.sin(k * Math.PI * 2) * 6}deg) scale(${1 + Math.sin(k * Math.PI) * .12},${1 - Math.sin(k * Math.PI) * .12})`; });
      if (!valid()) return;
    }
    if (visual()) parade(1, true);
    await wait(900);
    if (!valid()) return;
    if (visual()) finaleParticles(fx, fxBack, innerWidth, innerHeight, true);
    await showTween(giant, 500, (k) => { giant.style.transform = `translate(-50%,${k * 110}%)`; }, easeInCubic);
    giant.remove();
  } else await wait(800);
  if (!valid()) return;
  S.phase = 'explain'; $('#next-question').disabled = false;
  if (S.demo) later(demoNext, 800);
}
function finish() {
  if (!S.demo) {
    saved.rounds += 1;
    const todayStr = dayKey();
    const head = S.questions[0];
    saved.history.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      day: todayStr,
      at: Date.now(),
      score: 100,
      solved: S.results.filter((r) => r.completed).length,
      misses: S.misses,
      firstTry: S.results.filter((r) => r.firstTry).length,
      combo: S.peak,
      type: S.kind === 'review' ? '错题重练' : (TYPE_MAP[S.typeId]?.label || ''),
      lesson: S.kind === 'review' ? '错题重练' : `${head.unitName} · ${head.lessonLabel} ${head.lessonTitle}`,
      kind: S.kind,
      total: S.questions.length,
      timeMs: Math.round(S.playMs),
    });

    const firstTryCount = S.results.filter(r => r.firstTry && r.completed).length;
    if (firstTryCount === S.questions.length) {
      saved.stats.perfects = (saved.stats.perfects || 0) + 1;
    }
    saved.stats.playMs += Math.round(S.playMs);

    updateDailyQuests({
      type: 'round',
      score: 100,
      solved: S.results.filter((r) => r.completed).length,
      total: S.questions.length,
      firstTryCount,
    });

    const dayOfWeek = new Date().getDay();
    saved.stats.flags = saved.stats.flags || {};
    saved.stats.flags.firstPlay = true;
    if (dayOfWeek === 0 || dayOfWeek === 6) saved.stats.flags.weekend = true;
    const hour = new Date().getHours();
    if (hour >= 22 || hour < 6) saved.stats.flags.night = true;
    // 「更上一层」：当前这一课的四种题型都至少练过一轮。
    const covered = new Map();
    for (const q of currentLesson()?.questions || []) {
      covered.set(q.type, Boolean(covered.get(q.type)) || saved.learned.includes(q.id));
    }
    if (covered.size === TYPES.length && [...covered.values()].every(Boolean)) saved.stats.flags.advanced = true;

    checkTrophies();
    persist();
  }
  showScreen('result'); S.ready = false;
  audio.setReach(false);
  $('#result-eyebrow').textContent = S.demo ? '演示完成 · 没有写入学习记录' : '泡泡小队，为你欢呼';
  $('#result-title').textContent = copy.resultTitle;
  $('#result-score').textContent = '100';
  $('#score-label').textContent = '完成分';
  const first = S.results.filter((r) => r.firstTry).length;
  $('#result-summary').textContent = `完成 ${S.questions.length} 道题，就值得满分庆祝。\n其中 ${first} 道没有用提示、一次就答对了。`;
  $('#result-details').innerHTML = `<div class="result-detail"><b>${S.results.length}</b><span>完成题目</span></div><div class="result-detail"><b>${S.peak}</b><span>最高连击</span></div><div class="result-detail"><b>${S.energy ? displayEnergy(S.energy) : 0}</b><span>快乐能量</span></div>`;

  const rQuests = $('#r-quests');
  if (rQuests) {
    if (!S.demo && saved.quests?.list) {
      rQuests.innerHTML = `<div class="qm-head"><span>今日委托进度</span><span class="quest-reward"><span class="qham">${HAMMER_SVG}</span></span></div>
        <ol class="quest-list">
          ${saved.quests.list.map((q) => {
            const pct = Math.min(100, Math.round((q.prog / q.goal) * 100));
            return `<li class="${q.done ? 'done' : ''}">
              <span class="qchk">${q.done ? '✓' : ''}</span>
              <span class="qt">${questText(q)}</span>
              <span class="qp">${q.prog}/${q.goal}</span>
              <div class="qbar"><div class="qbar-fill" style="width:${pct}%"></div></div>
            </li>`;
          }).join('')}
        </ol>`;
      rQuests.hidden = false;
    } else {
      rQuests.hidden = true;
    }
  }

  $('#result-start').textContent = S.demo ? '我也来试试 →' : '再来一轮 →';
  $('#result-review').hidden = S.demo || !saved.review.length;
  $('#result-home').textContent = copy.home;
  if (!reduced()) {
    resultActors.forEach((a, i) => later(() => bounce(a, { big: true, reduced: reduced() }), i * 130));
  }
  $('#result-title').focus({ preventScroll: true });
  later(() => audio.stopMusic(), 4000);

  if (S.earnedTrophies.length) later(showEarnedTrophies, 1200);

  if (S.demo) later(() => { if (paused()) return demoReturn(); home(); }, 5500);
}
function demoReturn() { later(() => { if (paused()) demoReturn(); else home(); }, 500); }
function scheduleDemo() {
  later(() => {
    if (paused()) { scheduleDemo(); return; }
    if (speech.busy) { later(scheduleDemo, 350); return; }
    if (!S.demo || !S.ready) return;
    const q = activeQuestion(); const correct = S.correctKey;
    const buttons = $$('.choice').filter((b) => !b.disabled);
    const miss = S.qi === 1 && S.step === 0 && !S.demoSlipped;
    if (miss) S.demoSlipped = true;
    const button = buttons.find((b) => miss ? b.dataset.char !== correct : b.dataset.char === correct);
    if (button) choose(button, true);
  }, 950);
}
function demoNext() { if (paused()) later(demoNext, 500); else nextQuestion(); }

// 表面文案：历史研习场。
document.body.dataset.mode = 'children';
document.title = `软乎乎 · ${copy.title}`;
$('#brand-slime').innerHTML = softieSVG();
$('.brand small').textContent = copy.tagline;
if ($('#home .eyebrow')) $('#home .eyebrow').textContent = copy.eyebrow;
$('.intro').textContent = copy.intro;
$('#course-heading').textContent = copy.courseHeading;
$('#type-heading').textContent = copy.typeHeading;
$('.explain-heading span').textContent = copy.learned;
$('#mode-disclaimer').textContent = copy.disclaimer;
$('#settings-softie').innerHTML = softieSVG('pink', { happy: true });
function renderTimingChips() {
  const chips = $('#timing-chips');
  if (chips) chips.innerHTML = TYPES.map((t) => `<span>${t.label}<b>${t.seconds}秒</b></span>`).join('');
}
renderTimingChips();

function initLogoBurst() {
  const star = (R, r, n, jitter = 0, seed = 1) => {
    let d = ''; let s0 = seed;
    const rnd = () => { s0 = (s0 * 9301 + 49297) % 233280; return s0 / 233280; };
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
      const rr = (i % 2 ? r : R) * (1 + (rnd() - 0.5) * jitter);
      d += `${i ? 'L' : 'M'}${(Math.cos(a) * rr).toFixed(1)} ${(Math.sin(a) * rr).toFixed(1)}`;
    }
    return `${d}Z`;
  };
  const path = $('#logo-burst-path');
  const inner = $('#logo-burst-inner');
  if (path) path.setAttribute('d', star(96, 66, 14, 0.14, 7));
  if (inner) inner.setAttribute('d', star(70, 52, 14, 0.1, 3));
}
initLogoBurst();

const modeSelect = $('#mode-select');
if (modeSelect) {
  modeSelect.innerHTML = TYPES.map((t) => `<option value="${t.id}">${t.label}</option>`).join('');
  modeSelect.value = course.typeId;
  modeSelect.addEventListener('change', () => setType(modeSelect.value, false));
}

function syncTypePills() {
  $$('.mode-pill').forEach((btn) => {
    const active = btn.dataset.mode === course.typeId;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-checked', active ? 'true' : 'false');
  });
  if ($('#logo-bit-1')) $('#logo-bit-1').textContent = copy.logoBits[0];
  if ($('#logo-bit-2')) $('#logo-bit-2').textContent = copy.logoBits[1];
}
syncTypePills();

function setType(newTypeId, playFx = true) {
  if (!TYPE_MAP[newTypeId] || course.typeId === newTypeId) return;
  cancelRun();
  course.typeId = newTypeId;
  saveCourse();
  if (modeSelect) modeSelect.value = newTypeId;
  syncTypePills();
  try {
    const url = new URL(location.href);
    url.searchParams.set('type', newTypeId);
    url.searchParams.delete('demo');
    history.replaceState(null, '', url);
  } catch { /* URL may be unavailable. */ }
  refreshHome();

  if (playFx) {
    audio.unlock();
    playClickSound('tab');
    const toggleEl = $('#mode-toggle');
    if (toggleEl) {
      const rect = toggleEl.getBoundingClientRect();
      fx.puff(rect.left + rect.width / 2, rect.top + rect.height / 2, 8);
    }
  }
}

$('#mode-toggle')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.mode-pill');
  if (btn && btn.dataset.mode) setType(btn.dataset.mode, true);
});
$$('.mode-pill').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.dataset.mode) setType(btn.dataset.mode, true);
  });
});
$('.brand').addEventListener('click', (e) => {
  e.preventDefault();
  playClickSound('bubble');
  if (S.screen === 'play' && !S.demo) { speech.cancel(); $('#leave-dialog').showModal(); }
  else home();
});
$('#book-tabs')?.addEventListener('click', (e) => {
  const b = e.target.closest('[data-book]');
  if (!b || b.dataset.book === course.bookId) return;
  playClickSound('tab');
  cancelRun();
  const book = findBook(b.dataset.book);
  const opened = firstPlayableLesson(book);
  course.bookId = book.id;
  course.unitId = opened.unit.id;
  course.lessonId = opened.lesson.id;
  saveCourse();
  refreshHome();
});
$('#unit-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-unit]');
  if (!b || b.dataset.unit === course.unitId) return;
  playClickSound('tab');
  cancelRun();
  const u = findUnit(currentBook(), b.dataset.unit);
  course.unitId = u.id;
  course.lessonId = u.lessons[0].id;
  saveCourse();
  refreshHome();
});
$('#lesson-list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-lesson]');
  if (!b || b.dataset.lesson === course.lessonId) return;
  playClickSound('primary');
  cancelRun();
  selectLesson(course.unitId, b.dataset.lesson);
  refreshHome();
});
$('#start-round').addEventListener('click', () => {
  playClickSound('primary');
  start('lesson');
});
$('#start-review').addEventListener('click', () => {
  playClickSound('primary');
  start('review');
});
$('#start-demo').addEventListener('click', () => {
  playClickSound('primary');
  start('demo');
});
$('#open-trophy')?.addEventListener('click', () => {
  playClickSound('bubble');
  renderTrophiesModal('all');
  $('#trophy-dialog')?.showModal();
});
$('#close-trophy')?.addEventListener('click', () => {
  playClickSound('back');
  $('#trophy-dialog')?.close();
});
$('.tr-filter')?.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (btn && btn.dataset.f) {
    playClickSound('tab');
    $$('.tr-filter button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    renderTrophiesModal(btn.dataset.f);
  }
});
$('#tg-ok')?.addEventListener('click', () => {
  playClickSound('primary');
  $('#trophy-got-dialog')?.close();
});
$('#close-tg')?.addEventListener('click', () => {
  playClickSound('back');
  $('#trophy-got-dialog')?.close();
});
$('#trophy-got-dialog')?.addEventListener('click', (e) => {
  if (e.target === $('#trophy-got-dialog')) {
    playClickSound('back');
    $('#trophy-got-dialog').close();
  }
});
$('#cal-prev')?.addEventListener('click', () => {
  playClickSound('tab');
  if (calMonth === 0) { calMonth = 11; calYear -= 1; }
  else { calMonth -= 1; }
  renderCalendar();
});
$('#cal-next')?.addEventListener('click', () => {
  playClickSound('tab');
  if (calMonth === 11) { calMonth = 0; calYear += 1; }
  else { calMonth += 1; }
  renderCalendar();
});
$('#cal-grid')?.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-day]');
  if (btn && btn.dataset.day) {
    playClickSound('bubble');
    showDayLog(btn.dataset.day);
  }
});
$('#close-day')?.addEventListener('click', () => {
  playClickSound('back');
  $('#day-log-dialog')?.close();
});
$('#hammer-yes')?.addEventListener('click', () => {
  playClickSound('primary');
  if (pendingHammer?.typeId === course.typeId && pendingHammer.day === dayKey()
    && useHammer(saved.calendar, saved.history, pendingHammer.missed, new Date())) {
    saved.stats.flags.hammerUsed = true;
    checkTrophies();
    persist();
    renderCalendar();
    $('#trophy-badge').textContent = `${getEarnedTrophiesCount(saved.trophies)} / ${TROPHIES.length}`;
  }
  pendingHammer = null;
  $('#hammer-dialog')?.close();
  showEarnedTrophies();
  checkLoginBonus();
});
$('#hammer-no')?.addEventListener('click', () => {
  playClickSound('back');
  pendingHammer = null;
  $('#hammer-dialog')?.close();
  checkLoginBonus();
});
$('#hammer-dialog')?.addEventListener('cancel', () => {
  pendingHammer = null;
  checkLoginBonus();
});
$('#open-guide')?.addEventListener('click', () => {
  playClickSound('bubble');
  audio.unlock();
  $('#guide-dialog')?.showModal();
});
$('#close-guide')?.addEventListener('click', () => {
  playClickSound('back');
  $('#guide-dialog')?.close();
});
$('#guide-confirm')?.addEventListener('click', () => {
  playClickSound('primary');
  $('#guide-dialog')?.close();
});
$('#open-quests')?.addEventListener('click', () => {
  playClickSound('bubble');
  audio.unlock();
  renderQuests();
  $('#quests-dialog')?.showModal();
});
$('#close-quests')?.addEventListener('click', () => {
  playClickSound('back');
  $('#quests-dialog')?.close();
});
$('#quests-confirm')?.addEventListener('click', () => {
  playClickSound('primary');
  $('#quests-dialog')?.close();
});
$('#quests-dialog')?.addEventListener('click', (e) => {
  if (e.target === $('#quests-dialog')) {
    playClickSound('back');
    $('#quests-dialog').close();
  }
});
$('#open-calendar')?.addEventListener('click', () => {
  playClickSound('bubble');
  audio.unlock();
  renderCalendar();
  $('#calendar-dialog')?.showModal();
});
$('#close-calendar')?.addEventListener('click', () => {
  playClickSound('back');
  $('#calendar-dialog')?.close();
});
$('#calendar-confirm')?.addEventListener('click', () => {
  playClickSound('primary');
  $('#calendar-dialog')?.close();
});
$('#calendar-dialog')?.addEventListener('click', (e) => {
  if (e.target === $('#calendar-dialog')) {
    playClickSound('back');
    $('#calendar-dialog').close();
  }
});
$('#open-bonus')?.addEventListener('click', () => {
  playClickSound('bubble');
  audio.unlock();
  if (saved.bonus?.last !== dayKey()) {
    claimAndOpenBonus();
  } else {
    const slot = ((saved.bonus.run - 1) % 7) + 1;
    openBonus({
      run: saved.bonus.run,
      slot,
      type: saved.bonus.stickers?.[dayKey()] || STICKERS[slot - 1],
      total: saved.bonus.total,
    }, { isManual: true });
  }
});
$('#bonus-ok')?.addEventListener('click', () => {
  closeBonus();
});
$('#close-bonus')?.addEventListener('click', () => {
  closeBonus();
});
$('#bonus-dialog')?.addEventListener('cancel', (e) => {
  e.preventDefault();
  closeBonus();
});
$('#bonus-dialog')?.addEventListener('click', (e) => {
  if (e.target === $('#bonus-dialog')) {
    closeBonus();
  }
});
$('#choices').addEventListener('click', (e) => { const b = e.target.closest('.choice'); if (b) choose(b); });
$('#show-hint').addEventListener('click', () => {
  playClickSound('bubble');
  hint();
});
$('#next-question').addEventListener('click', () => {
  playClickSound('primary');
  if (!S.demo) nextQuestion();
});
$('#exit-game').addEventListener('click', () => {
  playClickSound('bubble');
  speech.cancel(); $('#leave-dialog').showModal();
  $('#keep-playing').focus();
});
$('#keep-playing').addEventListener('click', () => {
  playClickSound('bubble');
  $('#leave-dialog').close();
});
$('#leave-confirm').addEventListener('click', () => {
  playClickSound('back');
  $('#leave-dialog').close();
  home();
});
$('#stop-demo').addEventListener('click', () => {
  playClickSound('back');
  home();
});
$('#result-home').addEventListener('click', () => {
  playClickSound('back');
  home();
});
$('#result-start').addEventListener('click', () => {
  playClickSound('primary');
  start(S.kind === 'review' ? 'review' : 'lesson');
});
$('#result-review').addEventListener('click', () => {
  playClickSound('primary');
  start('review');
});
$('#open-settings').addEventListener('click', () => {
  if (S.screen !== 'home') return;
  playClickSound('bubble');
  audio.unlock();
  showScreen('settings');
  $('#settings-title').focus({ preventScroll: true });
});
$('#close-settings').addEventListener('click', () => {
  playClickSound('back');
  home();
});
$('#settings-demo').addEventListener('click', () => {
  playClickSound('primary');
  start('demo');
});
$('#volume-setting').addEventListener('input', (e) => {
  const v = Number(e.target.value) / 100;
  saved.settings.volume = v;
  e.target.style.setProperty('--v', v);
  audio.setVolume(saved.settings.volume);
  $('#volume-value').textContent = `${e.target.value}%`;
  if (saved.settings?.sound && !audio.muted) {
    audio.unlock();
    audio.play('blip', audio.now(), { m: 68 + Math.round(saved.settings.volume * 24), v: 0.14 });
  }
});
$('#volume-setting').addEventListener('change', (e) => {
  e.target.style.setProperty('--v', Number(e.target.value) / 100);
  persist();
  audio.unlock();
  if (saved.settings?.sound && !audio.muted) playClickSound('bubble');
});
$('#sound-setting').addEventListener('change', (e) => {
  saved.settings.sound = e.target.checked;
  audio.unlock();
  applySettings();
  persist();
  playClickSound(saved.settings.sound ? 'toggle-on' : 'toggle-off');
});
$('#motion-setting').addEventListener('input', (e) => {
  const v = Number(e.target.value) / 100;
  setMotion(v, { persist: false });
  motionSliderFx(v);
});
$('#motion-setting').addEventListener('change', (e) => {
  const v = e.target.type === 'checkbox' ? (e.target.checked ? 1 : 0) : (Number(e.target.value) / 100);
  setMotion(v, { persist: true });
  playClickSound(v > 0.001 ? 'toggle-on' : 'toggle-off');
});

$('#read-question').addEventListener('click', readQuestion);
$('#read-explanation').addEventListener('click', readExplanation);
$('#candidate-speech').addEventListener('click', e => {
  const button = e.target.closest('[data-speech]');
  if (button && S.ready && S.phase === 'answer') read({ text: button.dataset.speech, lang: 'zh' });
});
$('#auto-speak-setting').addEventListener('change', e => {
  saved.settings.autoSpeak = e.target.checked; speech.cancel(); persist();
});
$('#local-voice-setting').addEventListener('change', e => {
  saved.settings.localOnly = e.target.checked; speech.cancel(); persist();
});
$('#speech-rate').addEventListener('input', e => {
  saved.settings.speechRate = Math.max(0.65, Math.min(1.1, Number(e.target.value) / 100));
  $('#speech-rate-value').textContent = `${saved.settings.speechRate.toFixed(2)}×`;
});
$('#speech-rate').addEventListener('change', persist);

let confirmStep = 1;
function openResetConfirm() {
  confirmStep = 1;
  renderResetConfirm();
  $('#confirm-dialog')?.showModal?.();
}
function renderResetConfirm() {
  if (confirmStep === 1) {
    $('#confirm-title').textContent = '全部重置';
    $('#confirm-msg').innerHTML = '确定要清除此设备上的所有英语练习记录、成就与签到数据吗？<br><small>清除后数据将无法恢复。</small>';
    $('#confirm-no').textContent = '再想想';
    $('#confirm-yes').textContent = '继续重置';
    $('#confirm-yes').className = 'danger-btn';
  } else {
    $('#confirm-title').textContent = '真的要重置吗？';
    $('#confirm-msg').innerHTML = '<strong>清除后数据无法恢复！</strong><br>所有关卡进度、成就奖杯、签到与每日委托都将重置为初始状态。';
    $('#confirm-no').textContent = '再想想';
    $('#confirm-yes').textContent = '确认全部重置';
    $('#confirm-yes').className = 'danger-btn urgent';
  }
}
function onConfirmYes() {
  if (confirmStep === 1) {
    confirmStep = 2;
    renderResetConfirm();
    playClickSound('toggle-off');
  } else {
    playClickSound('primary');
    resetAllSaves(storage);
    location.reload();
  }
}
function closeResetConfirm() {
  $('#confirm-dialog')?.close?.();
  confirmStep = 1;
}

$('#ask-reset')?.addEventListener('click', () => {
  playClickSound('back');
  openResetConfirm();
});
$('#confirm-yes')?.addEventListener('click', onConfirmYes);
$('#confirm-no')?.addEventListener('click', () => {
  playClickSound('back');
  closeResetConfirm();
});
$('#close-confirm')?.addEventListener('click', () => {
  playClickSound('back');
  closeResetConfirm();
});
$('#confirm-dialog')?.addEventListener('click', (e) => {
  if (e.target.id === 'confirm-dialog') closeResetConfirm();
});
addEventListener('keydown', (e) => {
  if (S.bonusOpen && (e.key === 'Escape' || e.key === 'Enter')) { e.preventDefault(); closeBonus(); return; }
  if (S.screen === 'settings' && e.key === 'Escape') { e.preventDefault(); home(); return; }
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || paused()) return;
  if (S.demo && e.key === 'Escape') { e.preventDefault(); home(); return; }
  if (S.screen !== 'play' || S.demo) return;
  if (/^[1-4]$/.test(e.key)) { e.preventDefault(); const b = $$('.choice')[Number(e.key) - 1]; if (b) choose(b); }
  if (e.key === 'Escape') { e.preventDefault(); speech.cancel(); $('#leave-dialog').showModal(); }
});
document.addEventListener('visibilitychange', () => {
  S.clockAt = performance.now();
  if (document.hidden) {
    speech.cancel();
    audio.stopMusic();
  } else if (saved.settings?.sound && !audio.muted) {
    if (S.screen === 'play') audio.startMusic();
    else if (S.screen === 'home' || S.screen === 'settings') startHomeMusic();
  }
});
homeActors.forEach((a) => {
  a.addEventListener('pointerenter', () => {
    bounce(a, { reduced: reduced() });
    if (saved.settings?.sound && !audio.muted) playClickSound('softie');
  });
  a.addEventListener('click', () => {
    bounce(a, { big: true, reduced: reduced() });
    if (saved.settings?.sound && !audio.muted) playClickSound('softie');
  });
});

// Global catch-all to guarantee every button on Home, Settings, and Dialogs has a click sound
document.addEventListener('click', (e) => {
  const btn = e.target?.closest?.('button, [role="button"], .mode-pill');
  if (!btn || btn.disabled) return;
  if (S.screen === 'play' && !e.target.closest?.('dialog')) return;
  playClickSound('bubble');
});

const unlockAndStartHomeMusic = () => {
  if (saved.settings?.sound && !audio.muted) {
    audio.unlock();
    if (S.screen === 'home' || S.screen === 'settings') startHomeMusic();
  }
};
addEventListener('pointerdown', unlockAndStartHomeMusic, { once: true, capture: true });
addEventListener('keydown', unlockAndStartHomeMusic, { once: true, capture: true });

onFrame((dt, t) => {
  tickTimer(t);
  if (document.hidden) return;
  if (S.screen === 'home' && saved.quests.day !== dayKey()) refreshHome();
  const audioPaused = document.hidden || (S.screen === 'play' && $('#leave-dialog').open);
  if (!audioPaused) audio.update();
  const pulse = audio.pulse();
  const kick = reduced() || (S.screen === 'play' && paused()) || !audio.playing ? 0 : pulse.kick * (S.E >= .05 ? 1 : .2);
  document.body.style.setProperty('--kick', kick.toFixed(3));
  if (S.shownEnergy < S.energy && S.screen === 'play') {
    S.shownEnergy = Math.min(S.energy, S.shownEnergy + Math.max(.02, (S.energy - S.shownEnergy) * Math.min(1, dt * 7)));
    $('#energy-value').textContent = displayEnergy(S.shownEnergy);
    const unit = Math.floor(S.shownEnergy + 1e-9);
    if (unit >= 2 && unit > S.energyUnit) unitSlam(10 ** unit);
    S.energyUnit = unit;
  }
  S.shake = Math.max(0, S.shake - dt * 30);
  const shake = !reduced() && S.shake > .1 ? S.shake * motionValue() : 0;
  const sx = rand(-shake, shake); const sy = rand(-shake, shake);
  $('.play-stage').style.translate = `${sx}px ${sy}px`;
  $('.energy-row').style.translate = `${sx * .5}px ${sy * .5}px`;
  S.flash = Math.max(0, S.flash - dt * 3.2);
  $('#flash').style.opacity = reduced() ? 0 : (S.flash ** 1.5 * .6 * motionValue()).toFixed(3);
  if (!reduced()) {
    S.visualE = lerp(S.visualE, S.screen === 'home' ? .04 : S.E, Math.min(1, dt * 2.2));
    const st = bg.state; const r = $('.play-stage').getBoundingClientRect();
    st.E = S.visualE; st.kick = kick; st.flash = S.flash;
    st.reach = lerp(st.reach, audio.reach ? 1 : 0, Math.min(1, dt * 5));
    st.hue += dt * .03 * S.visualE;
    st.cx = lerp(st.cx || innerWidth / 2, innerWidth / 2, Math.min(1, dt * 3));
    st.cy = lerp(st.cy || innerHeight * .4, S.screen === 'play' ? r.top + r.height * .55 : innerHeight * .4, Math.min(1, dt * 3));
    bg.render(t);
    if (S.screen === 'play' && !paused() && S.ready && !audio.reach && S.E > .3 && t > S.idleAt) {
      S.idleAt = t + rand(2200, 4200) / (.6 + S.E);
      bounce(actors.filter((a) => !a.hidden)[Math.floor(rand(0, crowdAt(S.E)))], { big: S.E > .6 });
    }
  }
  if ((S.screen === 'home' || S.screen === 'settings') && !reduced() && saved.settings?.sound && !audio.muted && audio.playing) {
    if (!S.ambientAt) S.ambientAt = t + rand(4500, 8500);
    if (t > S.ambientAt) {
      S.ambientAt = t + rand(5000, 9500);
      const notes = [72, 76, 79, 84];
      const m = notes[Math.floor(Math.random() * notes.length)];
      audio.play('pluck', audio.now(), { m, v: 0.08, dur: 0.5 });
      if (Math.random() < 0.4) {
        audio.play('pop', audio.now() + 0.08, { v: 0.06, f: 520 + Math.random() * 120 });
      }
    }
  }
  const burst = $('.logo-burst');
  if (burst && S.screen === 'home' && !reduced()) {
    burst.style.setProperty('--spin', (t / 1000 * 12) % 360);
  }
  fx.update(dt); fxBack.update(dt); fxBack.draw(); fx.draw();
});
applySettings(); refreshHome(); showScreen('home'); startClock();
if (saved.settings?.sound && !audio.muted) {
  startHomeMusic();
}
if (params.has('demo')) start('demo');

