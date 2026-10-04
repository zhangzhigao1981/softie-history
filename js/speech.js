// Browser capability only. No network API, recording or speech recognition.
export class SpeechReader {
  constructor({ synth = globalThis.speechSynthesis, Utterance = globalThis.SpeechSynthesisUtterance,
    setTimer = (fn, ms) => globalThis.setTimeout(fn, ms), clearTimer = id => globalThis.clearTimeout(id),
    onBusy = () => {}, onStatus = () => {} } = {}) {
    Object.assign(this, { synth, Utterance, setTimer, clearTimer, onBusy, onStatus });
    this.busy = false;
    this.task = null;
  }

  cancel() {
    if (this.task) this.task.finish(false);
    try { this.synth?.cancel(); } catch { /* Browser may reject during teardown. */ }
  }

  speak(items, { localOnly = true, rate = 0.85 } = {}) {
    this.cancel();
    if (!this.synth || !this.Utterance) {
      this.onStatus('这个浏览器暂不支持朗读，仍然可以继续玩。');
      return Promise.resolve(false);
    }
    const queue = (Array.isArray(items) ? items : [items]).filter(item => item?.text?.trim());
    if (!queue.length) return Promise.resolve(false);
    return new Promise(resolve => {
      const task = { timers: [], listeners: [] };
      this.task = task;
      const active = () => this.task === task;
      task.finish = (ok, message = '') => {
        if (!active()) return;
        this.task = null;
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
      task.timers.push(this.setTimer(() => fail('朗读没有响应，可点按钮重试。'), 15000));

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
          utterance.rate = Math.max(0.65, Math.min(1.1, Number(rate) || 0.85));
          const turn = index;
          utterance.onend = () => { if (active() && index === turn) play(); };
          utterance.onerror = () => { if (active() && index === turn) fail('朗读暂时无法播放，可点按钮重试。'); };
          this.onStatus('正在朗读…');
          this.synth.speak(utterance);
        } catch { fail('朗读暂时无法播放，可点按钮重试。'); }
      };
      // Chrome may expose an empty list until voiceschanged. Wait only a bounded time.
      if (queue.every(item => pick(item.lang || 'en'))) play();
      else {
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
      }
    });
  }
}
