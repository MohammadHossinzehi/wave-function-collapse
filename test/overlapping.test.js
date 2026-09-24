import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OverlappingModel, parseSample, agrees, symmetries } from '../src/overlapping.js';
import { OPPOSITE } from '../src/directions.js';
import { generate } from '../src/index.js';

const sample = (name) => readFileSync(new URL(`../samples/${name}.txt`, import.meta.url), 'utf8');

test('parseSample builds a palette and rejects ragged rows', () => {
  const s = parseSample('\nab\nba\n');
  assert.equal(s.width, 2);
  assert.equal(s.height, 2);
  assert.deepEqual(s.palette, ['a', 'b']);
  assert.deepEqual(Array.from(s.data), [0, 1, 1, 0]);
  assert.throws(() => parseSample('abc\nab'), /row 2/);
  assert.throws(() => parseSample('\n\n'), /empty/);
});

test('symmetries produce the 8 dihedral images of an asymmetric pattern', () => {
  const p = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const keys = new Set(symmetries(p, 3).map((q) => q.join()));
  assert.equal(keys.size, 8);
});

test('a uniform sample collapses to a single pattern', () => {
  const m = OverlappingModel.fromText('aaaa\naaaa\naaaa', { N: 3 });
  assert.equal(m.patterns.length, 1);
  assert.equal(m.weights[0], 12 * 8);
});

test('agrees() is consistent with its opposite direction, so the propagator is symmetric', () => {
  const m = OverlappingModel.fromText(sample('islands'), { N: 3 });
  const T = m.patterns.length;
  for (let d = 0; d < 4; d++) {
    for (let t1 = 0; t1 < T; t1++) {
      for (const t2 of m.propagator[d][t1]) {
        assert.ok(m.propagator[OPPOSITE[d]][t2].includes(t1));
      }
    }
  }
  assert.ok(agrees([1, 2, 3, 4], [2, 9, 4, 9], 1, 0, 2));
  assert.ok(!agrees([1, 2, 3, 4], [9, 9, 4, 9], 1, 0, 2));
});

function windowsAreLearned(model, image, periodic) {
  const { N } = model;
  const known = new Set(model.patterns.map((p) => p.join(',')));
  const xs = periodic ? image.width : image.width - N + 1;
  const ys = periodic ? image.height : image.height - N + 1;
  for (let y = 0; y < ys; y++) {
    for (let x = 0; x < xs; x++) {
      const w = [];
      for (let dy = 0; dy < N; dy++) {
        for (let dx = 0; dx < N; dx++) {
          w.push(image.data[((x + dx) % image.width) + ((y + dy) % image.height) * image.width]);
        }
      }
      if (!known.has(w.join(','))) return `window at ${x},${y} was never seen in the sample`;
    }
  }
  return null;
}

for (const name of ['maze', 'islands', 'bricks']) {
  test(`every ${name} output window is a learned pattern (bounded)`, () => {
    const m = OverlappingModel.fromText(sample(name), { N: 3 });
    const { image } = generate(m, { width: 30, height: 20, seed: 11 });
    assert.equal(image.width, 30);
    assert.equal(image.height, 20);
    assert.ok(image.data.every((c) => c >= 0));
    assert.equal(windowsAreLearned(m, image, false), null);
  });
}

test('periodic output tiles seamlessly', () => {
  const m = OverlappingModel.fromText(sample('maze'), { N: 3 });
  const { image } = generate(m, { width: 24, height: 24, periodic: true, seed: 2 });
  assert.equal(windowsAreLearned(m, image, true), null);
});

test('symmetry=1 keeps orientation (bricks stay horizontal)', () => {
  const m = OverlappingModel.fromText(sample('bricks'), { N: 3, symmetry: 1 });
  const { image } = generate(m, { width: 32, height: 16, seed: 4 });
  // mortar rows are fully '.', so some row must be all mortar
  const rows = [];
  for (let y = 0; y < image.height; y++) {
    rows.push(Array.from(image.data.slice(y * image.width, (y + 1) * image.width)));
  }
  const dot = m.palette.indexOf('.');
  assert.ok(rows.some((r) => r.every((c) => c === dot)));
});

test('rejects invalid options', () => {
  assert.throws(() => OverlappingModel.fromText('ab\nba', { N: 1 }), RangeError);
  assert.throws(() => OverlappingModel.fromText('ab\nba', { symmetry: 9 }), RangeError);
  assert.throws(() => OverlappingModel.fromText('ab\nba', { N: 3, periodicInput: false }), /smaller/);
  const m = OverlappingModel.fromText(sample('maze'), { N: 3 });
  assert.throws(() => m.waveSize(2, 10, false), RangeError);
});
