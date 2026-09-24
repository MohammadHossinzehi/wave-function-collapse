import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TiledModel, rotateTile, edgesFit } from '../src/tiled.js';
import { generate } from '../src/index.js';

const tileset = (name) => JSON.parse(readFileSync(new URL(`../tilesets/${name}.json`, import.meta.url), 'utf8'));

test('rotateTile turns edges and pixels clockwise', () => {
  const corner = { name: 'c', edges: ['a', 'b', 'c', 'd'], pixels: ['.#.', '.##', '...'] };
  const r = rotateTile(corner);
  assert.deepEqual(r.edges, ['d', 'a', 'b', 'c']);
  assert.deepEqual(r.pixels, ['...', '.##', '.#.']);
  let back = corner;
  for (let i = 0; i < 4; i++) back = rotateTile(back);
  assert.deepEqual(back, corner);
});

test('rotation variants are deduplicated by symmetry', () => {
  const m = new TiledModel(tileset('pipes'));
  const count = (name) => m.variants.filter((v) => v.name === name).length;
  assert.equal(count('empty'), 1);
  assert.equal(count('straight'), 2);
  assert.equal(count('corner'), 4);
  assert.equal(count('tee'), 4);
  assert.equal(count('cross'), 1);
  // total weight of a tile is preserved across its variants
  const cornerWeight = m.variants.filter((v) => v.name === 'corner').reduce((a, v) => a + v.weight, 0);
  assert.ok(Math.abs(cornerWeight - 1.5) < 1e-12);
});

test('edge labels match when reversed (clockwise reading)', () => {
  assert.ok(edgesFit('010', '010'));
  assert.ok(edgesFit('LSS', 'SSL'));
  assert.ok(!edgesFit('LSS', 'LSS'));
});

function checkAdjacency(model, solver) {
  const o = solver.observed();
  const { width: W, height: H } = solver;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = model.variants[o[x + y * W]];
      if (x + 1 < W) {
        const b = model.variants[o[x + 1 + y * W]];
        if (!edgesFit(a.edges[1], b.edges[3])) return `${a.id} | ${b.id} at ${x},${y}`;
      }
      if (y + 1 < H) {
        const b = model.variants[o[x + (y + 1) * W]];
        if (!edgesFit(a.edges[2], b.edges[0])) return `${a.id} / ${b.id} at ${x},${y}`;
      }
    }
  }
  return null;
}

for (const name of ['pipes', 'coast']) {
  for (const seed of [1, 2, 3]) {
    test(`${name} seed ${seed}: every pair of neighbouring tiles fits`, () => {
      const m = new TiledModel(tileset(name));
      const { solver, image } = generate(m, { width: 14, height: 9, seed });
      assert.equal(checkAdjacency(m, solver), null);
      assert.equal(image.width, 14 * m.tileSize);
      assert.ok(image.data.every((c) => c >= 0));
    });
  }
}

test('rotations:false keeps a tile in its authored orientation', () => {
  const m = new TiledModel({
    tiles: [
      { name: 'h', rotations: false, edges: ['0', '1', '0', '1'], pixels: ['-'] },
      { name: 'blank', edges: ['0', '0', '0', '0'], pixels: [' '] },
    ],
  });
  assert.equal(m.variants.length, 2);
});

test('rejects malformed tilesets', () => {
  assert.throws(() => new TiledModel({ tiles: [] }));
  assert.throws(() => new TiledModel({ tiles: [{ name: 'x', edges: ['a'], pixels: ['.'] }] }), /edges/);
  assert.throws(
    () => new TiledModel({ tiles: [{ name: 'x', edges: ['a', 'a', 'a', 'a'], pixels: ['..', '.'] }] }),
    /square/,
  );
});
