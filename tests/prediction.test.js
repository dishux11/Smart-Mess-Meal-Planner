'use strict';

/**
 * WHITE-BOX unit tests for the prediction logic (M4).
 * These tests are written against the internal structure of the functions:
 * every branch, boundary and error path in prediction.js is exercised, aiming
 * for full statement + branch coverage of movingAverage / predictHeadcount /
 * flagHighWaste / isBeforeCutoff.
 */

const {
  movingAverage,
  predictHeadcount,
  flagHighWaste,
  isBeforeCutoff,
} = require('../src/prediction');

describe('movingAverage — white-box (branch coverage)', () => {
  test('empty history returns 0 (early-return branch)', () => {
    expect(movingAverage([])).toBe(0);
  });

  test('history shorter than window averages all available samples', () => {
    // window 3 but only 2 samples -> (100+120)/2 = 110
    expect(movingAverage([100, 120], 3)).toBe(110);
  });

  test('history longer than window uses only the trailing window', () => {
    // last 3 of [10,20,120,118,125] -> (120+118+125)/3 = 121
    expect(movingAverage([10, 20, 120, 118, 125], 3)).toBe(121);
  });

  test('rounds to nearest integer', () => {
    // (100+101)/2 = 100.5 -> rounds to 101 (Math.round half-up)
    expect(movingAverage([100, 101], 2)).toBe(101);
  });

  test('custom window of 1 returns the latest value', () => {
    expect(movingAverage([50, 60, 77], 1)).toBe(77);
  });

  test('throws TypeError when history is not an array', () => {
    expect(() => movingAverage('nope')).toThrow(TypeError);
  });

  test('throws TypeError when history has a non-finite value', () => {
    expect(() => movingAverage([1, NaN, 3])).toThrow(TypeError);
    expect(() => movingAverage([1, '2', 3])).toThrow(TypeError);
  });

  test('throws RangeError for non-positive / non-integer window', () => {
    expect(() => movingAverage([1, 2], 0)).toThrow(RangeError);
    expect(() => movingAverage([1, 2], -2)).toThrow(RangeError);
    expect(() => movingAverage([1, 2], 1.5)).toThrow(RangeError);
  });
});

describe('predictHeadcount — white-box', () => {
  test('pure trend when no opt-ins/opt-outs', () => {
    expect(predictHeadcount({ history: [120, 118, 125], window: 3 })).toBe(121);
  });

  test('opt-outs reduce the prediction', () => {
    // base 121 - 10 opt-outs = 111
    expect(predictHeadcount({ history: [120, 118, 125], confirmedOptOuts: 10 })).toBe(111);
  });

  test('confirmed opt-ins act as a floor', () => {
    // base 100 but 150 students already opted in -> floor to 150
    expect(predictHeadcount({ history: [100, 100, 100], confirmedOptIns: 150 })).toBe(100 === 100 ? Math.max(100, 150) : 0);
    expect(predictHeadcount({ history: [100, 100, 100], confirmedOptIns: 150, registeredTotal: 500 })).toBe(150);
  });

  test('registeredTotal caps the prediction', () => {
    expect(predictHeadcount({ history: [400, 400, 400], registeredTotal: 300 })).toBe(300);
  });

  test('never returns a negative number', () => {
    expect(predictHeadcount({ history: [5, 5, 5], confirmedOptOuts: 100 })).toBe(0);
  });

  test('empty history with opt-ins returns opt-in floor', () => {
    expect(predictHeadcount({ history: [], confirmedOptIns: 42 })).toBe(42);
  });

  test('throws on invalid opt-in / opt-out values', () => {
    expect(() => predictHeadcount({ confirmedOptIns: -1 })).toThrow(RangeError);
    expect(() => predictHeadcount({ confirmedOptOuts: 2.5 })).toThrow(RangeError);
  });
});

describe('flagHighWaste — white-box (threshold boundaries)', () => {
  test('zero cooked => not high waste, ratio 0 (guard branch)', () => {
    expect(flagHighWaste({ cookedPortions: 0, leftoverPortions: 0 })).toEqual({ isHighWaste: false, wasteRatio: 0 });
  });

  test('ratio exactly at threshold is flagged (>= boundary)', () => {
    // 20/100 = 0.20 == default threshold 0.2 -> flagged
    expect(flagHighWaste({ cookedPortions: 100, leftoverPortions: 20 }).isHighWaste).toBe(true);
  });

  test('ratio just below threshold is NOT flagged', () => {
    expect(flagHighWaste({ cookedPortions: 100, leftoverPortions: 19 }).isHighWaste).toBe(false);
  });

  test('custom threshold honoured', () => {
    expect(flagHighWaste({ cookedPortions: 100, leftoverPortions: 10, threshold: 0.05 }).isHighWaste).toBe(true);
  });

  test('throws on negative inputs', () => {
    expect(() => flagHighWaste({ cookedPortions: -1, leftoverPortions: 0 })).toThrow(TypeError);
    expect(() => flagHighWaste({ cookedPortions: 10, leftoverPortions: -3 })).toThrow(TypeError);
  });
});

describe('isBeforeCutoff — white-box', () => {
  const cutoff = '2026-11-10T18:00:00.000Z';
  test('time before cutoff => true', () => {
    expect(isBeforeCutoff('2026-11-10T17:59:59.000Z', cutoff)).toBe(true);
  });
  test('time equal to cutoff => false (strict <)', () => {
    expect(isBeforeCutoff(cutoff, cutoff)).toBe(false);
  });
  test('time after cutoff => false', () => {
    expect(isBeforeCutoff('2026-11-10T18:00:01.000Z', cutoff)).toBe(false);
  });
  test('throws on invalid dates', () => {
    expect(() => isBeforeCutoff('not-a-date', cutoff)).toThrow(TypeError);
  });
});
