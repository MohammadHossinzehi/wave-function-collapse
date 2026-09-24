import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const run = (...args) => spawnSync(process.execPath, ['cli.js', ...args], { cwd: root, encoding: 'utf8' });

test('overlapping CLI prints an image of the requested size', () => {
  const r = run('overlapping', 'samples/maze.txt', '--width', '20', '--height', '7', '--seed', '9', '--stats');
  assert.equal(r.status, 0, r.stderr);
  const rows = r.stdout.trimEnd().split('\n');
  assert.equal(rows.length, 7);
  assert.ok(rows.every((row) => row.length === 20));
  assert.match(r.stderr, /patterns=\d+/);
});

test('tiled CLI scales by tile size', () => {
  const r = run('tiled', 'tilesets/pipes.json', '--width', '5', '--height', '4');
  assert.equal(r.status, 0, r.stderr);
  const rows = r.stdout.trimEnd().split('\n');
  assert.equal(rows.length, 12);
  assert.equal(rows[0].length, 15);
});

test('CLI output is deterministic for a seed', () => {
  const a = run('overlapping', 'samples/islands.txt', '--seed', '5');
  const b = run('overlapping', 'samples/islands.txt', '--seed', '5');
  assert.equal(a.stdout, b.stdout);
});

test('CLI rejects bad usage', () => {
  assert.equal(run().status, 2);
  assert.equal(run('bogus', 'x').status, 2);
  assert.equal(run('overlapping', 'samples/maze.txt', '--width').status, 2);
});
