// Browser capability only. No network API, recording or speech recognition.
const STALL_MS = 15000;      // 音色还没就绪时，最多等这么久
const MIN_SPEECH_MS = 5000;  // 一句最短按 5 秒算
const MS_PER_CHAR = 300;     // 中文按 0.85 倍速约 3.3 字/秒，留足余量
const MAX_SPEECH_MS = 90000; // 单句上限，防止真的卡死时一直占着倒计时
const SEGMENT_CHARS = 160;   // 超过这个长度就按句号切开，避免引擎自己截断

// 长材料整段塞给 speechSynthesis，部分引擎会在中途停住；按句切开逐句念更稳。
function splitLongText(text) {
  if (text.length <= SEGMENT_CHARS) return [text];
  const parts = [];
  let buffer = '';
  for (const char of text) {
    buffer += char;
    if ('。！？；\n'.includes(char) && buffer.trim().length >= 60) {
      parts.push(buffer.trim());
      buffer = '';
    }
  }
  if (buffer.trim()) parts.push(buffer.trim());
  return parts;
}

export class SpeechReader {
  constructor({ synth = globalThis.speechSynthesis, Utterance = globalThis.SpeechSynthesisUtterance,
    setTimer = (fn, ms) => globalThis.setTimeout(fn, ms), clearTimer = id => globalThis.clearTimeout(id),
    onBusy = () => {}, onStatus = () => {} } = {}) {
    Object.assign(this, { synth, Utterance, setTimer, clearTimer, onBusy, onStatus });
    this.busy = false;
    this.task = null;
    this.current = null;
  }

  cancel() {
    if (this.task) this.task.finish(false);
    this.current = null;
    try { this.synth?.cancel(); } catch { /* Browser may reject during teardown. */ }
  }

  speak(items, { localOnly = true, rate = 0.85 } = {}) {
    // cancel() 之后立刻 speak()，Chrome 有机会把这一句吞掉，等它真的停下来再开口。
    const wasSpeaking = !!this.task || !!this.synth?.speaking;
    this.cancel();
    if (!this.synth || !this.Utterance) {
      this.onStatus('这个浏览器暂不支持朗读，仍然可以继续玩。');
      return Promise.resolve(false);
    }
    const queue = (Array.isArray(items) ? items : [items])
      .filter(item => item?.text?.trim())
      .flatMap(item => splitLongText(item.text.trim()).map(text => ({ ...item, text })));
    if (!queue.length) return Promise.resolve(false);
    return new Promise(resolve => {
      const task = { timers: [], listeners: [], watchdog: null };
      this.task = task;
      const active = () => this.task === task;
      const stopWatchdog = () => {
        if (!task.watchdog) return;
        this.clearTimer(task.watchdog);
        task.watchdog = null;
      };
      // 每一句单独计时：整段共用一个 15 秒计时器的话，材料题念到一半就会被掐掉。
      const armWatchdog = ms => {
        stopWatchdog();
        task.watchdog = this.setTimer(() => {
          task.watchdog = null;
          fail('朗读没有响应，可点按钮重试。');
        }, ms);
        task.timers.push(task.watchdog);
      };
      task.finish = (ok, message = '') => {
        if (!active()) return;
        this.task = null;
        this.current = null;
        stopWatchdog();
        task.timers.forEach(id => this.clearTimer(id));
        task.listeners.forEach(([type, fn]) => this.synth.removeEventListener?.(type, fn));
        this.busy = false;
        this.onBusy(false);
        if (message) this.onStatus(message);
        resolve(ok);
      };
      const fail = message => {
        if (!active()) return;
        task.finish(false, message);
        try { this.synth.cancel(); } catch { /* Failure has already released the timer. */ }
      };
      this.busy = true;
      this.onBusy(true);
      this.onStatus('正在准备朗读…');
      armWatchdog(STALL_MS);

      const voices = () => {
        try { return this.synth.getVoices() || []; } catch { return []; }
      };
      const pick = lang => voices().filter(v => v.lang?.toLowerCase().replace('_', '-').startsWith(lang)
        && (!localOnly || v.localService === true))
        .sort((a, b) => Number(b.localService) - Number(a.localService) || Number(b.default) - Number(a.default))[0];
      let index = 0;
      const play = () => {
        if (!active()) return;
        if (index >= queue.length) { task.finish(true); this.onStatus('读完啦，可以再听一次。'); return; }
        const item = queue[index++];
        const language = item.lang || 'en';
        const voice = pick(language);
        if (!voice) {
          fail(`没有可用的${localOnly ? '本地' : ''}${language === 'zh' ? '中文' : '英语'}声音。可在系统安装声音，或在设置中允许其他声音。`);
          return;
        }
        try {
          const utterance = new this.Utterance(item.text);
          utterance.voice = voice;
          utterance.lang = voice.lang;
          utterance.volume = 1;
          utterance.rate = Math.max(0.65, Math.min(1.1, Number(rate) || 0.85));
          const turn = index;
          // 一直握着当前这句的引用，否则它可能被回收，声音会中途停住。
          this.current = utterance;
          utterance.onend = () => {
            if (!active() || index !== turn) return;
            stopWatchdog();
            this.current = null;
            play();
          };
          utterance.onerror = () => {
            if (!active() || index !== turn) return;
            fail('朗读暂时无法播放，可点按钮重试。');
          };
          // 语速越慢，同一句要的时间越长，别按固定秒数把人掐断。
          const pace = (Number(rate) || 0.85) / 0.85;
          const budgetMs = MIN_SPEECH_MS + (item.text.length * MS_PER_CHAR) / Math.max(0.6, pace);
          armWatchdog(Math.max(MIN_SPEECH_MS, Math.min(MAX_SPEECH_MS, budgetMs)));
          this.onStatus('正在朗读…');
          this.synth.speak(utterance);
        } catch { fail('朗读暂时无法播放，可点按钮重试。'); }
      };
      // Chrome may expose an empty list until voiceschanged. Wait only a bounded time.
      const start = () => {
        if (!active()) return;
        if (queue.every(item => pick(item.lang || 'en'))) { play(); return; }
        let started = false;
        const begin = () => {
          if (!active() || started) return;
          started = true;
          this.synth.removeEventListener?.('voiceschanged', ready);
          play();
        };
        const ready = () => { if (queue.every(item => pick(item.lang || 'en'))) begin(); };
        this.synth.addEventListener?.('voiceschanged', ready);
        task.listeners.push(['voiceschanged', ready]);
        task.timers.push(this.setTimer(begin, 800));
      };
      if (wasSpeaking && this.synth?.speaking) task.timers.push(this.setTimer(start, 120));
      else start();
    });
  }
}
