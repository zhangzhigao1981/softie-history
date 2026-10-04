import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const baseline = JSON.parse(readFileSync(new URL('./upstream-baseline.json', import.meta.url)));
const hash = text => createHash('sha256').update(text).digest('hex');
test('original UI, sound, characters and effects match the pinned upstream bytes', () => {
  for (const [file, expected] of Object.entries(baseline.files)) {
    assert.equal(hash(readFileSync(new URL(`../${file}`, import.meta.url))), expected, file);
  }
});
test('all eight original stage and combo show functions remain unchanged', () => {
  const source = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  for (const [name, expected] of Object.entries(baseline.functions)) {
    const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
    assert.ok(start >= 0, name);
    const body = source.slice(start, source.indexOf('\n}', start) + 2);
    assert.equal(hash(body), expected, name);
  }
});
