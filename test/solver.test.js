import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Solver } from '../src/solver.js';
import { OverlappingModel } from '../src/overlapping.js';

// Two patterns that must alternate in every direction: a checkerboard.
const checkerboard = {
  weights: [1, 1],
  propagator: [0, 1, 2, 3].map(() => [Int32Array.of(1), Int32Array.of(0)]),
};

// Every pattern may sit next to every other one.
const unconstrained = (weights) => ({
  weights,
  propagator: [0, 1, 2, 3].map(() => weights.map(() => Int32Array.from(weights.keys()))),
});

test('solves a checkerboard exactly', () => {
  const s = new Solver(checkerboard, { width: 6, height: 5, seed: 3 });
  assert.equal(s.run(), 'done');
  const o = s.observed();
  const first = o[0];
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 6; x++) assert.equal(o[x + y * 6], (first + x + y) % 2);
  }
  // one observation fixes everything; propagation does the rest
  assert.equal(s.stats.observations, 1);
});

test('detects unsatisfiable constraints (odd periodic checkerboard) via exhaustive backtracking', () => {
  const s = new Solver(checkerboard, { width: 3, height: 3, periodic: true, seed: 1 });
  assert.equal(s.run(), 'contradiction');
  // first choice fails, backtracking bans it, the only alternative fails too, no frames left
  assert.equal(s.stats.backtracks, 1);
  assert.equal(s.frames.length, 0);
});

test('same seed gives identical output, different seeds diverge', () => {
  const model = unconstrained([1, 1, 1, 1]);
  const run = (seed) => {
    const s = new Solver(model, { width: 12, height: 12, seed });
    s.run();
    return Array.from(s.observed());
  };
  assert.deepEqual(run(42), run(42));
  assert.notDeepEqual(run(42), run(43));
});

test('pattern weights drive frequencies', () => {
  const s = new Solver(unconstrained([9, 1]), { width: 60, height: 60, seed: 7 });
  s.run();
  const o = s.observed();
  const share = o.filter((t) => t === 0).length / o.length;
  assert.ok(share > 0.86 && share < 0.94, `expected about 0.9, got ${share}`);
});

test('fresh solver has uniform starting entropy', () => {
  const s = new Solver(unconstrained([1, 2, 3]), { width: 4, height: 4 });
  const expected = Math.log(6) - (2 * Math.log(2) + 3 * Math.log(3)) / 6;
  for (const e of s.entropies) assert.ok(Math.abs(e - expected) < 1e-12);
});

test('undo trail restores the exact previous state', () => {
  const model = OverlappingModel.fromText('#########\n#.......#\n#.#####.#\n#.#...#.#\n#.#.#.#.#\n#.#.#...#\n#.#.#####\n#.......#\n#########', { N: 3 });
  const s = new Solver(model, { width: 10, height: 10, seed: 5 });
  const wave = s.wave.slice();
  const compatible = s.compatible.slice();
  const ones = s.sumsOfOnes.slice();
  const mark = s.trail.length;
  for (let k = 0; k < 5; k++) s.step();
  assert.notDeepEqual(s.wave, wave);
  s._undoTo(mark);
  assert.deepEqual(s.wave, wave);
  assert.deepEqual(s.compatible, compatible);
  assert.deepEqual(s.sumsOfOnes, ones);
});

test('rejects bad input', () => {
  assert.throws(() => new Solver(checkerboard, { width: 0, height: 3 }), RangeError);
  assert.throws(() => new Solver({ weights: [1, 0], propagator: checkerboard.propagator }, { width: 2, height: 2 }), RangeError);
  assert.throws(() => new Solver({ weights: [], propagator: [[], [], [], []] }, { width: 2, height: 2 }));
});

test('step() reports progress and becomes idempotent once done', () => {
  const s = new Solver(unconstrained([1, 1]), { width: 3, height: 3 });
  let steps = 0;
  while (s.step() === 'running') steps++;
  assert.equal(s.status, 'done');
  assert.equal(steps, 9);
  assert.equal(s.step(), 'done');
});

test('backtracking rescues runs that would otherwise hit a contradiction', () => {
  const maze = OverlappingModel.fromText('#########\n#.......#\n#.#####.#\n#.#...#.#\n#.#.#.#.#\n#.#.#...#\n#.#.#####\n#.......#\n#########', { N: 3 });
  let rescued = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const withBt = new Solver(maze, { width: 40, height: 40, seed });
    assert.equal(withBt.run(), 'done', `seed ${seed}`);
    const without = new Solver(maze, { width: 40, height: 40, seed, maxBacktracks: 0 });
    if (without.run() === 'contradiction') {
      assert.ok(withBt.stats.backtracks > 0);
      rescued++;
    }
  }
  assert.ok(rescued > 0, 'expected at least one seed that needs backtracking');
});
