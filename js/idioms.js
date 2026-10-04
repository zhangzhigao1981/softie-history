// Pure gameplay logic shared by audience modes; content and copy live in modes.js.
import { DEFAULT_MODE } from './modes.js';

export const partsFor = q => q.parts || [...q.word];
export const answerAt = (q, step) => partsFor(q)[q.blanks[step]];
const LETTERS = [...'abcdefghijklmnopqrstuvwxyz'];
const SIMILAR = { a: 'eoi', e: 'aio', i: 'ely', o: 'auc', u: 'voa', b: 'dpq', d: 'bpq', p: 'bqd', q: 'pgb', m: 'nwr', n: 'mhr' };

export function shuffle(items, rng = Math.random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

export function optionsFor(q, step, rng = Math.random, mode = DEFAULT_MODE) {
  const answer = answerAt(q, step);
  let candidates;
  if (q.type === 'spelling') {
    const index = q.blanks[step];
    candidates = [...new Set([...(SIMILAR[answer] || ''), ...shuffle(LETTERS, rng)])].filter(c => c !== answer);
    // Avoid an alternative valid bank word for the same visible spelling.
    candidates = candidates.filter(c => !mode.questions.some(other => other.word === q.word.slice(0, index) + c + q.word.slice(index + 1)));
  } else candidates = [...new Set(q.distractors)].filter(word => word !== answer);
  return shuffle([answer, ...candidates.slice(0, 3)], rng);
}

export function makeRound(level, { mode = DEFAULT_MODE, count = mode.rules.roundSize, seen = [], rng = Math.random } = {}) {
  const pool = mode.questions.filter(q => q.level === level);
  const known = new Set(seen);
  const fresh = shuffle(pool.filter(q => !known.has(q.id)), rng);
  const review = shuffle(pool.filter(q => known.has(q.id)), rng);
  const newCount = Math.min(fresh.length, Math.max(3, count - review.length));
  return shuffle([...fresh.slice(0, newCount), ...review.slice(0, count - newCount)], rng).slice(0, count);
}

export function placementRound(rng = Math.random, mode = DEFAULT_MODE) {
  return mode.levels.flatMap((l) => makeRound(l.id, { count: mode.rules.placementPerLevel, rng, mode }));
}

export function recommendedLevel(results, mode = DEFAULT_MODE) {
  // A small, non-diagnostic check: pass each earlier level before moving up.
  let recommended = mode.levels[0].id;
  for (let i = 0; i < mode.levels.length - 1; i++) {
    if (results.filter((r) => r.level === mode.levels[i].id && r.firstTry).length < mode.rules.placementPerLevel) break;
    recommended = mode.levels[i + 1].id;
  }
  return recommended;
}

export function recordAnswer(save, q, firstTry, { demo = false, placement = false } = {}) {
  if (demo || placement) return;
  if (!save.learned.includes(q.id)) save.learned.push(q.id);
  if (firstTry) save.review = save.review.filter((id) => id !== q.id);
  else if (!save.review.includes(q.id)) save.review.push(q.id);
}

