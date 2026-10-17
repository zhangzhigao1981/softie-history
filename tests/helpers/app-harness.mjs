import fs from 'node:fs';
import vm from 'node:vm';
import * as course from '../../js/course.js';
import * as quiz from '../../js/quiz.js';
import * as storage from '../../js/storage.js';
import * as quests from '../../js/quests.js';
import * as trophies from '../../js/trophies.js';
import * as choreography from '../../js/choreography.js';
import * as timer from '../../js/timer.js';
import { SpeechReader } from '../../js/speech.js';

/** 全量题库，方便测试直接取用真实的题目。 */
export const QUESTIONS = course.ALL_QUESTIONS;
export const BOOKS = course.BOOKS;
export const TYPES = course.TYPES;

// 在真实的业务模块上跑完整的 main.js：只替换浏览器渲染、音频与时钟，不注入任何生产环境钩子。
const source = fs.readFileSync(new URL('../../js/main.js', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n')
  .replace(/^import .*;\n/gm, '');
const noop = () => {};
const decode = (text) => String(text)
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

export function createApp({
  type = course.DEFAULT_TYPE_ID,
  unitId = course.DEFAULT_BOOK.units[0].id,
  lessonId = course.DEFAULT_BOOK.units[0].lessons[0].id,
  date = new Date(2026, 8, 30, 12),
  save = {},
  speechOptions = {},
  query,
  storageBlocked = false,
} = {}) {
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
      hidden: false, open: false, disabled: false, value: '', children: [], textContent: '', offsetWidth: 0,
      focus: noop, attrs: {}, setAttribute(name, value) { this.attrs[name] = value; }, animate: noop, remove: noop,
      append(...nodes) {
        this.children.push(...nodes);
        this.textContent = (this.textContent || '') + nodes.map(node => node.textContent || '').join('');
      }, replaceChildren(...children) { this.children = children; this.textContent = children.map(child => child.textContent || '').join(''); },
      querySelectorAll: () => [],
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
          const button = element(); button.dataset.char = decode(char); return button;
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
  const pips = Array.from({ length: course.ROUND_SIZE }, element);
  const typePills = course.TYPES.map(t => Object.assign(element(), { dataset: { mode: t.id } }));
  const $$ = selector => selector === '.word-cell' ? cells : selector === '.pip' ? pips
    : selector === '.choice' ? $('#choices').children : selector === '.mode-pill' ? typePills : [];
  const initial = storage.freshSave();
  Object.assign(initial, save);
  initial.settings = { ...initial.settings, ...(save.settings || {}), motion: false };
  const savedData = new Map([
    [course.SAVE_KEY, JSON.stringify(initial)],
    [course.UI_KEY, JSON.stringify({ bookId: course.DEFAULT_BOOK.id, unitId, lessonId, typeId: type })],
  ]);
  let reloaded = false;
  const localStorage = {
    getItem: key => { if (storageBlocked) throw Error('blocked'); return savedData.get(key) ?? null; },
    setItem: (key, value) => savedData.set(key, String(value)),
    removeItem: key => savedData.delete(key),
    clear: () => savedData.clear(),
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
    constructor(options) {
      super({
        ...options, ...speechOptions,
        setTimer: (fn, ms) => { const id = Symbol(); timers.set(id, { fn, at: clock + ms }); return id; },
        clearTimer: id => timers.delete(id),
      });
    }
  }
  const context = vm.createContext({
    ...course, ...quiz, ...storage, ...quests, ...trophies, ...choreography, ...timer,
    dayKey: (d = new FakeDate()) => storage.dayKey(d),
    currentStreak: (history, nc, today = new FakeDate()) => storage.currentStreak(history, nc, today),
    hammerOffer: (calendar, history, today = new FakeDate()) => storage.hammerOffer(calendar, history, today),
    claimLogin: (b, c, today = new FakeDate()) => storage.claimLogin(b, c, today),
    Date: FakeDate, URL, URLSearchParams, console, matchMedia: () => ({ matches: true }),
    location: { search: query ?? `?type=${type}`, href: `http://localhost/?type=${type}`, reload: () => { reloaded = true; } },
    history: { replaceState: noop }, window: { localStorage, scrollTo: noop },
    document: {
      body, hidden: false, querySelector: $, querySelectorAll: $$, getAnimations: () => [],
      addEventListener: (type, fn) => { documentEvents[type] = fn; }, createElement: element,
      createTextNode: text => ({ textContent: text }),
    },
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
  const app = vm.runInContext(`({
    start, home, choose, nextQuestion, showDayLog, speech, tickTimer, readQuestion, readExplanation,
    selectLesson, setType, syncTypePills,
    get scene() { return S; }, get saved() { return saved; }, get course() { return course; },
  })`, context);
  async function advance(ms) {
    clock += ms; dateMs += ms;
    frames.forEach(fn => fn(ms / 1000, clock));
    for (const [id, task] of [...timers]) if (task.at <= clock) { timers.delete(id); task.fn(); }
    // 结算动画使用 async wait，但不占用答题者的思考时间。
    for (let i = 0; i < 6; i++) await Promise.resolve();
  }
  async function answer({ thinkingMs = 1000, hint = false, wrong = false } = {}) {
    if (hint) $('#show-hint').click();
    await advance(thinkingMs);
    if (wrong) {
      const wrongButton = $('#choices').children.find(b => b.dataset.char !== app.scene.correctKey && !b.disabled);
      if (wrongButton) await app.choose(wrongButton);
    }
    while (app.scene.phase === 'answer') {
      const correct = $('#choices').children.find(b => b.dataset.char === app.scene.correctKey && !b.disabled);
      if (!correct) break;
      await app.choose(correct, app.scene.demo);
    }
    await advance(0);
  }
  async function round(options = {}) {
    while (app.scene.screen === 'play') { await answer(options); app.nextQuestion(); }
  }
  return {
    app, $, $$, advance, answer, round, cells, pips, typePills, musicGains,
    doc: context.document, document: context.document, documentEvents, localStorage,
    get reloaded() { return reloaded; },
    setDate: next => { dateMs = next.getTime(); },
    stored: () => JSON.parse(localStorage.getItem(course.SAVE_KEY)),
    storedUi: () => JSON.parse(localStorage.getItem(course.UI_KEY)),
  };
}
