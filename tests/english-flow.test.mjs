import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './helpers/app-harness.mjs';
import { MODES } from '../js/modes.js';
import { answerAt } from '../js/idioms.js';
import { freshSave } from '../js/storage.js';

test('all three modes complete each level using whole words or letters through the original answer flow', async () => {
  for (const mode of Object.values(MODES)) for (const level of mode.levels) {
    const f = createApp({ mode: mode.id }); f.app.start('level', level.id);
    await f.round();
    assert.equal(f.app.scene.screen, 'result', `${mode.id}:${level.id}`);
    assert.equal(f.app.scene.results.length, 8);
    assert.equal(f.app.scene.peak, mode.id === 'spelling' && level.id === 3 ? 16 : 8);
    assert.equal(f.stored(mode.id).learned.length, 8);
    assert.ok(f.stored(mode.id).history[0].score === 100);
  }
});

test('whole-word cards keep the target masked until answer; spelling uses its actual letter count', async () => {
  for (const mode of Object.values(MODES)) {
    const f = createApp({ mode: mode.id }); f.app.start('level', 3);
    const q = f.app.scene.questions[0];
    assert.equal(f.cells.length, mode.id === 'spelling' ? q.word.length : 1);
    if (mode.id !== 'spelling') {
      assert.equal(f.cells[0].textContent, '?');
      assert.ok(!f.$('#context').textContent.includes(q.word));
      assert.ok(!f.$('#word-slots').attrs['aria-label'].includes(q.word));
    }
    assert.ok(f.$('#choices').children.some(button => button.dataset.char === answerAt(q, 0)));
    await f.answer(); assert.equal(f.cells.map(cell => cell.textContent).join(''), q.word);
  }
});

test('timeout fills every letter of a long word without undefined and sends it to review', async () => {
  const mode = MODES.spelling; const save = freshSave(mode);
  const q = mode.questions.find(q => q.word === 'elephant');
  save.review = [q.id];
  const f = createApp({ mode: mode.id, saves: { spelling: save } }); f.app.start('review');
  assert.equal(f.cells.length, 8);
  await f.advance(21000);
  assert.equal(f.app.scene.phase, 'explain');
  assert.equal(f.cells.map(cell => cell.textContent).join(''), 'elephant');
  assert.deepEqual(f.app.saved.review, [q.id]);
});

test('switching among all three modes does not transfer progress or pending trophies', async () => {
  const f = createApp();
  f.app.start('level', 1); await f.round();
  assert.equal(f.app.saved.learned.length, 8);
  for (const id of ['spelling', 'sentence']) {
    f.app.home(); f.app.setAudienceMode(id, false);
    assert.equal(f.app.saved.learned.length, 0); assert.equal(f.app.saved.history.length, 0);
    assert.equal(f.app.scene.earnedTrophies.length, 0);
  }
  f.app.setAudienceMode('meaning', false); assert.equal(f.app.saved.learned.length, 8);
});

test('the actual reset button clears only English saves and preserves the original game', () => {
  const f = createApp();
  f.localStorage.setItem('softie-idioms:children:v1', 'keep-original');
  f.localStorage.setItem('other-app', 'keep-other');
  f.$('#ask-reset').click(); f.$('#confirm-yes').click(); f.$('#confirm-yes').click();
  assert.equal(f.reloaded, true);
  assert.equal(f.localStorage.getItem('softie-idioms:children:v1'), 'keep-original');
  assert.equal(f.localStorage.getItem('other-app'), 'keep-other');
  assert.equal(f.localStorage.length, 2);
});

test('blocked browser storage still initializes the Chinese English-learning app', () => {
  const f = createApp({ storageBlocked: true, query: '' });
  assert.equal(f.app.scene.screen, 'home');
  assert.match(f.$('#home-progress').textContent, /一起读/);
  assert.equal(f.app.saved.learned.length, 0);
});
