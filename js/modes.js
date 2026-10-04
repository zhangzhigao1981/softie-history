import { VOCABULARY } from './content/vocabulary.js';

const copy = {
  titleLead: '英语', titleAccent: '泡泡', tagline: '软乎乎的英语游乐场', eyebrow: '小小英语，大大能量',
  stationSuffix: '小站', stationStart: '从「{name}」出发', stageReady: '泡泡小队，准备好啦',
  intro: '听一听，选一选，让简单英语冒个泡。', placement: '测测我的起点',
  levelHeading: '选一种玩法，再选一站', footer: '答错也没关系，一起读一读。',
  ready: '选一个答案，让软乎乎送过去吧。', wrong: '差一点点，再看看中文提示吧。',
  correct: '气泡命中！选对啦。', finished: '单词收集成功！一起读一读。',
  resultTitle: '每一点进步\n都值得庆祝。', learned: '今天又练了一个单词', unlearned: '先来认识这个新单词',
  home: '回到英语游乐场', disclaimer: '儿童英语启蒙：三种玩法自由选择，三个难度不对应年级。练过不代表已掌握，记得多听、多用。',
  logoBits: ['听', '说'],
};

function makeMode(id, label, details) {
  return {
    id, label, theme: 'children', version: 1,
    questions: VOCABULARY.map(v => {
      const spelling = id === 'spelling';
      const first = Math.min(v.word.length - 1, Math.floor(v.word.length / 2));
      const blanks = spelling ? (v.level === 3 ? [0, first] : [first]) : [0];
      return { ...v, id: `${id}:${v.id}`, vocabId: v.id, type: id, parts: spelling ? [...v.word] : [v.word], blanks };
    }),
    levels: [
      { id: 1, name: '萌芽', label: `${details[0]} · 每题 30 秒`, color: 'mint', seconds: 30 },
      { id: 2, name: '成长', label: `${details[1]} · 每题 24 秒`, color: 'blue', seconds: 24 },
      { id: 3, name: '绽放', label: `${details[2]} · 每题 20 秒`, color: 'violet', seconds: 20 },
    ],
    rules: { roundSize: 8, placementPerLevel: 2, demoPerLevel: 2 },
    copy: { ...copy },
  };
}

export const MODES = {
  meaning: makeMode('meaning', '单词识义', ['看中文选单词', '认识生活单词', '认识更多单词']),
  spelling: makeMode('spelling', '单词拼写', ['听单词补字母', '单字母填空', '双字母接力']),
  sentence: makeMode('sentence', '情境填词', ['读简单短句', '生活情境填词', '短句表达接力']),
};
export const DEFAULT_MODE = MODES.meaning;
export function getMode(id) { return MODES[id] || DEFAULT_MODE; }
export function saveKey(mode) { return `softie-english:${mode.id}:v${mode.version}`; }
