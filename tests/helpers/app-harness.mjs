import fs from 'node:fs';
import vm from 'node:vm';
import * as modes from '../../js/modes.js';
import * as idioms from '../../js/idioms.js';
import * as storage from '../../js/storage.js';
import * as quests from '../../js/quests.js';
import * as trophies from '../../js/trophies.js';
import * as choreography from '../../js/choreography.js';
import * as timer from '../../js/timer.js';
import { SpeechReader } from '../../js/speech.js';

// Execute the complete application with its real data/gameplay modules. Only
// browser rendering, audio and the clock are replaced; no production hooks.
const source = fs.readFileSync(new URL('../../js/main.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '');
const noop = () => {};

export function createApp({ mode = 'meaning', date = new Date(2026, 8, 30, 12), saves = {}, speechOptions = {}, query, storageBlocked = false } = {}) {
  let dateMs = date.getTime();
  let clock = 0;
  const frames = [];
  const timers = new Map();
  const elements = new Map();
  const classes = () => {
    const values = new Set();
    return {
      add: (...names) => names.forEach(name => values.add(name)),
      remove: (...names) => names.forEach(name => values.delete(name)),
      contains: name => values.has(name),
      replace: (a, b) => { values.delete(a); values.add(b); },
      toggle: (name, on = !values.has(name)) => on ? values.add(name) : values.delete(name),
    };
  };
  function element() {
    return {
      dataset: {}, classList: classes(), style: { setProperty(name, value) { this[name] = value; } },
      hidden: false, open: false, disabled: false, value: '', children: [],
      focus: noop, attrs: {}, setAttribute(name, value) { this.attrs[name] = value; }, animate: noop, remove: noop,
      append: noop, replaceChildren(...children) { this.children = children; this.textContent = children.map(child => child.textContent || '').join(''); }, querySelectorAll: () => [],
      getBoundingClientRect: () => ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 }),
      addEventListener(type, fn) { this[type] = fn; },
      showModal() { this.open = true; }, close() { this.open = false; },
      set innerHTML(html) {
        this.html = html;
        if (html.includes('class="word-cell')) {
          cells.splice(0, cells.length, ...[...html.matchAll(/class="word-cell[^"]*"[^>]*>([^<]*)/g)].map(([, text]) => Object.assign(element(), { textContent: text })));
        }
        if (html.includes('class="pip"')) pips.splice(0, pips.length, ...[...html.matchAll(/class="pip"/g)].map(element));
        this.children = [...html.matchAll(/class="choice" data-char="([^"]+)"/g)].map(([, char]) => {
          const button = element(); button.dataset.char = char; return button;
        });
      },
      get innerHTML() { return this.html || ''; },
    };
  }
  const $ = selector => {
    if (!elements.has(selector)) elements.set(selector, element());
    return elements.get(selector);
  };
  const cells = Array.from({ length: 4 }, element);
  const pips = Array.from({ length: 8 }, element);
  const modePills = ['meaning', 'spelling', 'sentence'].map(id => Object.assign(element(), { dataset: { mode: id } }));
  const $$ = selector => selector === '.word-cell' ? cells : selector === '.pip' ? pips
    : selector === '.choice' ? $('#choices').children : selector === '.mode-pill' ? modePills : [];
  const savedData = new Map(Object.values(modes.MODES).map(mode => {
    const save = saves[mode.id] || storage.freshSave(mode);
    return [modes.saveKey(mode), JSON.stringify({ ...save, settings: { ...save.settings, motion: false } })];
  }));
  let reloaded = false;
  const localStorage = { getItem: key => { if (storageBlocked) throw Error('blocked'); return savedData.get(key) || null; }, setItem: (key, value) => savedData.set(key, String(value)),
    removeItem: key => savedData.delete(key), clear: () => savedData.clear(),
    get length() { return savedData.size; }, key: index => [...savedData.keys()][index] ?? null,
  };
  const documentEvents = {};
  class FakeDate extends Date {
    constructor(...args) { super(...(args.length ? args : [dateMs])); }
    static now() { return dateMs; }
  }
  const musicGains = [];
  class Audio {
    constructor() { return new Proxy({ reach: false, ctx: { currentTime: 0 }, g: { music: { gain: { value: 0.8, setTargetAtTime(value) { this.value = value; musicGains.push(value); } } } }, pulse: () => ({ kick: 0 }) }, { get: (obj, key) => obj[key] ?? noop }); }
  }
  class FX { constructor() { this.parts = []; } update() {} draw() {} }
  const body = Object.assign(element(), { dataset: {} });
  class TestSpeechReader extends SpeechReader {
    constructor(options) { super({ ...options, ...speechOptions,
      setTimer: (fn, ms) => { const id = Symbol(); timers.set(id, { fn, at: clock + ms }); return id; },
      clearTimer: id => timers.delete(id),
    }); }
  }
  const context = vm.createContext({
    ...modes, ...idioms, ...storage, ...quests, ...trophies, ...choreography, ...timer,
    dayKey: (d = new FakeDate()) => storage.dayKey(d),
    currentStreak: (history, nc, today = new FakeDate()) => storage.currentStreak(history, nc, today),
    hammerOffer: (calendar, history, today = new FakeDate()) => storage.hammerOffer(calendar, history, today),
    claimLogin: (b, c, today = new FakeDate()) => storage.claimLogin(b, c, today),
    Date: FakeDate, URL, URLSearchParams, console, matchMedia: () => ({ matches: true }),
    location: { search: query ?? `?mode=${mode}`, href: `http://localhost/?mode=${mode}`, reload: () => { reloaded = true; } },
    history: { replaceState: noop }, window: { localStorage, scrollTo: noop },
    document: { body, hidden: false, querySelector: $, querySelectorAll: $$, getAnimations: () => [], addEventListener: (type, fn) => { documentEvents[type] = fn; }, createElement: element, createTextNode: text => ({ textContent: text }) },
    AudioEngine: Audio, SpeechReader: TestSpeechReader, FX, Backdrop: class {}, mountSofties: () => [], softieSVG: () => '',
    bounce: noop, bubbleHit: async () => {}, startClock: noop,
    onFrame: fn => { frames.push(fn); return noop; }, centerOf: () => ({ x: 0, y: 0, w: 0, h: 0 }),
    tween: async () => {}, wait: async () => {}, lerp: (a, b, k) => a + (b - a) * k,
    rand: (a, b) => (a + b) / 2, easeOutBack: noop, easeInCubic: noop, easeOutQuint: noop,
    performance: { now: () => clock }, addEventListener: noop,
    setTimeout: (fn, ms) => { const id = Symbol(); timers.set(id, { fn, at: clock + ms }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  vm.runInContext(source, context);
  const app = vm.runInContext('({ start, home, setAudienceMode, choose, nextQuestion, showDayLog, speech, tickTimer, readQuestion, readExplanation, get scene() { return S; }, get saved() { return saved; } })', context);
  async function advance(ms) {
    clock += ms; dateMs += ms;
    frames.forEach(fn => fn(ms / 1000, clock));
    for (const [id, task] of [...timers]) if (task.at <= clock) { timers.delete(id); task.fn(); }
    // Finales use async waits, without spending the player's thinking budget.
    for (let i = 0; i < 6; i++) await Promise.resolve();
  }
  async function answer({ thinkingMs = 1000, hint = false, wrong = false } = {}) {
    if (hint) $('#show-hint').click();
    await advance(thinkingMs);
    if (wrong) {
      const q = app.scene.questions[app.scene.qi];
      await app.choose($('#choices').children.find(b => b.dataset.char !== idioms.answerAt(q, app.scene.step)));
    }
    while (app.scene.phase === 'answer') {
      const q = app.scene.questions[app.scene.qi];
      await app.choose($('#choices').children.find(b => b.dataset.char === idioms.answerAt(q, app.scene.step)), app.scene.demo);
    }
    await advance(0);
  }
  async function round(options = {}) {
    while (app.scene.screen === 'play') { await answer(options); app.nextQuestion(); }
  }
  return {
    app, $, advance, answer, round, cells, musicGains, document: context.document, documentEvents, localStorage, get reloaded() { return reloaded; },
    setDate: next => { dateMs = next.getTime(); },
    stored: id => JSON.parse(localStorage.getItem(modes.saveKey(modes.MODES[id]))),
  };
}

