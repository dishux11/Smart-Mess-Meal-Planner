'use strict';

/**
 * prediction.js
 * ----------------------------------------------------------------------------
 * Pure, side-effect-free headcount prediction logic for the Smart Mess Meal
 * Planner. Kept separate from the server so it is trivially unit-testable
 * (white-box) in M4. No database, no I/O, no framework here on purpose.
 */

/**
 * Simple Moving Average over the last `window` values of a history array.
 *
 * @param {number[]} history  Past actual headcounts, oldest-to-newest.
 * @param {number}   window   Number of trailing samples to average (default 3).
 * @returns {number} The moving average, rounded to the nearest integer.
 *                   Returns 0 when there is no history.
 * @throws {TypeError}  if history is not an array of finite numbers.
 * @throws {RangeError} if window is not a positive integer.
 */
function movingAverage(history, window = 3) {
  if (!Array.isArray(history)) {
    throw new TypeError('history must be an array');
  }
  if (!Number.isInteger(window) || window <= 0) {
    throw new RangeError('window must be a positive integer');
  }
  for (const v of history) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new TypeError('history must contain only finite numbers');
    }
  }
  if (history.length === 0) {
    return 0;
  }
  // Use the last `window` samples, or everything we have if history is shorter.
  const slice = history.slice(-window);
  const sum = slice.reduce((acc, v) => acc + v, 0);
  return Math.round(sum / slice.length);
}

/**
 * Predict the headcount for an upcoming meal.
 *
 * Blends the historical moving average with the firm advance opt-ins that
 * students have already submitted. The confirmed opt-ins act as a floor:
 * we never predict fewer than the number of students who explicitly said
 * "I will eat".
 *
 * @param {object}   opts
 * @param {number[]} opts.history        Past actual headcounts, oldest-to-newest.
 * @param {number}   [opts.window=3]     Moving-average window.
 * @param {number}   [opts.confirmedOptIns=0]  Students who opted IN for this meal.
 * @param {number}   [opts.confirmedOptOuts=0] Students who opted OUT for this meal.
 * @param {number}   [opts.registeredTotal]    Total enrolled students (upper cap).
 * @returns {number} Predicted headcount (integer, never negative).
 */
function predictHeadcount({
  history = [],
  window = 3,
  confirmedOptIns = 0,
  confirmedOptOuts = 0,
  registeredTotal = Infinity,
} = {}) {
  if (!Number.isInteger(confirmedOptIns) || confirmedOptIns < 0) {
    throw new RangeError('confirmedOptIns must be a non-negative integer');
  }
  if (!Number.isInteger(confirmedOptOuts) || confirmedOptOuts < 0) {
    throw new RangeError('confirmedOptOuts must be a non-negative integer');
  }

  const base = movingAverage(history, window);

  // Subtract explicit opt-outs from the historical trend, but never go below
  // the confirmed opt-in floor.
  let predicted = Math.max(base - confirmedOptOuts, confirmedOptIns);

  // Cannot exceed the number of registered students.
  if (Number.isFinite(registeredTotal)) {
    predicted = Math.min(predicted, registeredTotal);
  }

  return Math.max(0, Math.round(predicted));
}

/**
 * Decide whether a day/meal is a HIGH-WASTE event.
 *
 * Waste ratio = leftoverPortions / cookedPortions. A meal is flagged when the
 * ratio meets or exceeds the threshold (default 20%).
 *
 * @param {object} opts
 * @param {number} opts.cookedPortions
 * @param {number} opts.leftoverPortions
 * @param {number} [opts.threshold=0.2]
 * @returns {{isHighWaste: boolean, wasteRatio: number}}
 */
function flagHighWaste({ cookedPortions, leftoverPortions, threshold = 0.2 }) {
  if (typeof cookedPortions !== 'number' || cookedPortions < 0) {
    throw new TypeError('cookedPortions must be a non-negative number');
  }
  if (typeof leftoverPortions !== 'number' || leftoverPortions < 0) {
    throw new TypeError('leftoverPortions must be a non-negative number');
  }
  if (cookedPortions === 0) {
    return { isHighWaste: false, wasteRatio: 0 };
  }
  const wasteRatio = leftoverPortions / cookedPortions;
  return { isHighWaste: wasteRatio >= threshold, wasteRatio };
}

/**
 * Determine whether an opt-in/opt-out action is still allowed, given the meal
 * cutoff time. This is the rule exercised by the black-box tests in M4.
 *
 * @param {Date|string|number} now        Current time.
 * @param {Date|string|number} cutoff     Meal cutoff time.
 * @returns {boolean} true if the student may still change their response.
 */
function isBeforeCutoff(now, cutoff) {
  const nowMs = new Date(now).getTime();
  const cutMs = new Date(cutoff).getTime();
  if (Number.isNaN(nowMs) || Number.isNaN(cutMs)) {
    throw new TypeError('now and cutoff must be valid dates');
  }
  return nowMs < cutMs;
}

module.exports = {
  movingAverage,
  predictHeadcount,
  flagHighWaste,
  isBeforeCutoff,
};
