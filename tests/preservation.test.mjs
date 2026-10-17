import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const baseline = JSON.parse(readFileSync(new URL('./upstream-baseline.json', import.meta.url)));

/** 统一换行符后再哈希，保证 Windows(CRLF) 与 macOS/Linux(LF) 结果一致。 */
const normalize = (text) => String(text).replace(/\r\n/g, '\n');
const hash = (text) => createHash('sha256').update(normalize(text)).digest('hex');

test('演出、音效、角色与整体样式文件保持上游原样未改动', () => {
  for (const [file, expected] of Object.entries(baseline.files)) {
    assert.equal(hash(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')), expected, file);
  }
});

test('八个舞台演出与连击函数保持上游原样未改动', () => {
  const source = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  for (const [name, expected] of Object.entries(baseline.functions)) {
    const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
    assert.ok(start >= 0, `${name} 函数已丢失`);
    const body = source.slice(start, source.indexOf('\n}', start) + 2);
    assert.equal(hash(body), expected, name);
  }
});
