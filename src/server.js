'use strict';

/**
 * server.js — Express API + static frontend host for the Smart Mess Meal Planner.
 *
 * Auth is a lightweight demo token scheme (base64 of the user id). This is NOT
 * production-grade security; it keeps the project installable and testable while
 * still demonstrating role-based access control at each endpoint.
 */

const express = require('express');
const path = require('path');
const db = require('./db');
const { predictHeadcount, flagHighWaste, isBeforeCutoff } = require('./prediction');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 3000;
const MA_WINDOW = 3; // moving-average window

/* --------------------------------------------------------------------------
 * Auth helpers
 * ------------------------------------------------------------------------ */
function tokenFor(userId) {
  return Buffer.from(`uid:${userId}`).toString('base64');
}
function userFromToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const m = decoded.match(/^uid:(\d+)$/);
    if (!m) return null;
    return db.prepare('SELECT id,name,email,role,block,diet FROM users WHERE id=?').get(Number(m[1]));
  } catch {
    return null;
  }
}
function auth(...roles) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.replace(/^Bearer\s+/i, '');
    const user = userFromToken(token);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    if (roles.length && !roles.includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden for your role' });
    }
    req.user = user;
    next();
  };
}

const now = () => new Date().toISOString();

/* --------------------------------------------------------------------------
 * Auth routes
 * ------------------------------------------------------------------------ */
app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email=? AND password=?').get(email, password);
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });
  res.json({
    token: tokenFor(user.id),
    user: { id: user.id, name: user.name, role: user.role, block: user.block, diet: user.diet },
  });
});

app.get('/api/me', auth(), (req, res) => res.json(req.user));

/* --------------------------------------------------------------------------
 * Meals
 * ------------------------------------------------------------------------ */
// Upcoming open meals (today onward)
app.get('/api/meals', auth(), (req, res) => {
  const todayYmd = new Date().toISOString().slice(0, 10);
  const meals = db
    .prepare('SELECT * FROM meals WHERE date >= ? ORDER BY date, type')
    .all(todayYmd);
  // attach this user's current response (if student)
  const out = meals.map((m) => {
    const r = db
      .prepare('SELECT status FROM responses WHERE meal_id=? AND user_id=?')
      .get(m.id, req.user.id);
    return { ...m, myStatus: r ? r.status : null, open: isBeforeCutoff(now(), m.cutoff) };
  });
  res.json(out);
});

/* --------------------------------------------------------------------------
 * Student: opt-in / opt-out  (enforces cutoff rule)
 * ------------------------------------------------------------------------ */
app.post('/api/meals/:id/respond', auth('student'), (req, res) => {
  const mealId = Number(req.params.id);
  const { status } = req.body || {};
  if (!['eating', 'skipping'].includes(status)) {
    return res.status(400).json({ error: 'status must be "eating" or "skipping"' });
  }
  const meal = db.prepare('SELECT * FROM meals WHERE id=?').get(mealId);
  if (!meal) return res.status(404).json({ error: 'Meal not found' });

  if (!isBeforeCutoff(now(), meal.cutoff)) {
    return res.status(409).json({ error: 'Cutoff has passed; response is locked' });
  }

  db.prepare(
    `INSERT INTO responses (meal_id,user_id,status,updated_at)
     VALUES (?,?,?,?)
     ON CONFLICT(meal_id,user_id) DO UPDATE SET status=excluded.status, updated_at=excluded.updated_at`
  ).run(mealId, req.user.id, status, now());

  res.json({ ok: true, mealId, status });
});

/* --------------------------------------------------------------------------
 * Prediction (kitchen + warden)
 * ------------------------------------------------------------------------ */
function predictionForMeal(meal) {
  // History = past actual_eaten for the SAME meal type, most recent last.
  const history = db
    .prepare(
      `SELECT c.actual_eaten AS v
       FROM consumption c JOIN meals m ON m.id = c.meal_id
       WHERE m.type = ? AND m.date < ?
       ORDER BY m.date ASC`
    )
    .all(meal.type, meal.date)
    .map((r) => r.v);

  const optIns = db
    .prepare("SELECT COUNT(*) c FROM responses WHERE meal_id=? AND status='eating'")
    .get(meal.id).c;
  const optOuts = db
    .prepare("SELECT COUNT(*) c FROM responses WHERE meal_id=? AND status='skipping'")
    .get(meal.id).c;
  const registered = db.prepare("SELECT COUNT(*) c FROM users WHERE role='student'").get().c;

  const predicted = predictHeadcount({
    history,
    window: MA_WINDOW,
    confirmedOptIns: optIns,
    confirmedOptOuts: optOuts,
    registeredTotal: registered,
  });
  return { predicted, optIns, optOuts, registered, history };
}

app.get('/api/predict', auth('kitchen', 'warden'), (req, res) => {
  const todayYmd = new Date().toISOString().slice(0, 10);
  const meals = db.prepare('SELECT * FROM meals WHERE date >= ? ORDER BY date, type').all(todayYmd);
  res.json(meals.map((m) => ({ meal: m, ...predictionForMeal(m) })));
});

/* --------------------------------------------------------------------------
 * Kitchen: log consumption + leftovers  -> auto-creates surplus alert
 * ------------------------------------------------------------------------ */
app.post('/api/meals/:id/consumption', auth('kitchen'), (req, res) => {
  const mealId = Number(req.params.id);
  const { cooked, actual_eaten } = req.body || {};
  if (![cooked, actual_eaten].every((n) => Number.isInteger(n) && n >= 0)) {
    return res.status(400).json({ error: 'cooked and actual_eaten must be non-negative integers' });
  }
  const meal = db.prepare('SELECT * FROM meals WHERE id=?').get(mealId);
  if (!meal) return res.status(404).json({ error: 'Meal not found' });

  const leftover = Math.max(0, cooked - actual_eaten);
  db.prepare(
    `INSERT INTO consumption (meal_id,cooked,actual_eaten,leftover,logged_at)
     VALUES (?,?,?,?,?)
     ON CONFLICT(meal_id) DO UPDATE SET cooked=excluded.cooked,
       actual_eaten=excluded.actual_eaten, leftover=excluded.leftover, logged_at=excluded.logged_at`
  ).run(mealId, cooked, actual_eaten, leftover, now());

  const waste = flagHighWaste({ cookedPortions: cooked, leftoverPortions: leftover });

  // Create a surplus alert for NGOs when there are leftovers.
  let surplus = null;
  if (leftover > 0) {
    const existing = db.prepare('SELECT * FROM surplus WHERE meal_id=?').get(mealId);
    if (existing) {
      db.prepare('UPDATE surplus SET portions=?, updated_at=? WHERE meal_id=?').run(leftover, now(), mealId);
      surplus = db.prepare('SELECT * FROM surplus WHERE meal_id=?').get(mealId);
    } else {
      const info = db
        .prepare(
          `INSERT INTO surplus (meal_id,portions,status,created_at,updated_at)
           VALUES (?,?, 'available', ?, ?)`
        )
        .run(mealId, leftover, now(), now());
      surplus = db.prepare('SELECT * FROM surplus WHERE id=?').get(info.lastInsertRowid);
    }
  }

  res.json({ ok: true, leftover, highWaste: waste.isHighWaste, wasteRatio: waste.wasteRatio, surplus });
});

/* --------------------------------------------------------------------------
 * Feedback & ratings (student)
 * ------------------------------------------------------------------------ */
app.post('/api/meals/:id/feedback', auth('student'), (req, res) => {
  const mealId = Number(req.params.id);
  const { rating, comment, is_issue } = req.body || {};
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'rating must be an integer 1-5' });
  }
  const meal = db.prepare('SELECT id FROM meals WHERE id=?').get(mealId);
  if (!meal) return res.status(404).json({ error: 'Meal not found' });

  db.prepare(
    `INSERT INTO feedback (meal_id,user_id,rating,comment,is_issue,created_at)
     VALUES (?,?,?,?,?,?)`
  ).run(mealId, req.user.id, rating, comment || '', is_issue ? 1 : 0, now());
  res.json({ ok: true });
});

// Warden/kitchen view feedback + complaints
app.get('/api/feedback', auth('warden', 'kitchen'), (req, res) => {
  const rows = db
    .prepare(
      `SELECT f.*, u.name AS user_name, m.date, m.type
       FROM feedback f JOIN users u ON u.id=f.user_id JOIN meals m ON m.id=f.meal_id
       ORDER BY f.created_at DESC LIMIT 200`
    )
    .all();
  res.json(rows);
});

/* --------------------------------------------------------------------------
 * NGO surplus: list / accept / confirm receipt
 * ------------------------------------------------------------------------ */
app.get('/api/surplus', auth('ngo', 'warden', 'kitchen'), (req, res) => {
  const rows = db
    .prepare(
      `SELECT s.*, m.date, m.type, m.menu
       FROM surplus s JOIN meals m ON m.id=s.meal_id
       ORDER BY s.created_at DESC`
    )
    .all();
  res.json(rows);
});

app.post('/api/surplus/:id/accept', auth('ngo'), (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM surplus WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'Surplus not found' });
  if (row.status !== 'available') return res.status(409).json({ error: `Already ${row.status}` });
  db.prepare("UPDATE surplus SET status='accepted', ngo_user_id=?, updated_at=? WHERE id=?")
    .run(req.user.id, now(), id);
  res.json({ ok: true });
});

app.post('/api/surplus/:id/confirm', auth('ngo'), (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM surplus WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'Surplus not found' });
  if (row.status !== 'accepted') return res.status(409).json({ error: 'Must be accepted first' });
  if (row.ngo_user_id !== req.user.id) return res.status(403).json({ error: 'Not your pickup' });
  db.prepare("UPDATE surplus SET status='received', updated_at=? WHERE id=?").run(now(), id);
  res.json({ ok: true });
});

/* --------------------------------------------------------------------------
 * Warden: weekly waste report + leaderboard + trends
 * ------------------------------------------------------------------------ */
app.get('/api/report/waste', auth('warden', 'kitchen'), (req, res) => {
  const rows = db
    .prepare(
      `SELECT m.date, m.type, c.cooked, c.actual_eaten, c.leftover
       FROM consumption c JOIN meals m ON m.id=c.meal_id
       ORDER BY m.date DESC, m.type LIMIT 60`
    )
    .all();
  const report = rows.map((r) => {
    const w = flagHighWaste({ cookedPortions: r.cooked, leftoverPortions: r.leftover });
    return { ...r, wasteRatio: Number(w.wasteRatio.toFixed(3)), highWaste: w.isHighWaste };
  });
  const totalCooked = report.reduce((a, r) => a + r.cooked, 0);
  const totalLeftover = report.reduce((a, r) => a + r.leftover, 0);
  res.json({
    rows: report,
    summary: {
      totalCooked,
      totalLeftover,
      overallWasteRatio: totalCooked ? Number((totalLeftover / totalCooked).toFixed(3)) : 0,
      highWasteDays: report.filter((r) => r.highWaste).length,
    },
  });
});

// Least-waste leaderboard by hostel block (lower waste = better rank).
app.get('/api/leaderboard', auth('warden', 'student', 'kitchen'), (req, res) => {
  // Approximate per-block waste by attributing leftovers proportionally to
  // each block's skip rate — a simple, explainable heuristic for the demo.
  const blocks = db.prepare("SELECT DISTINCT block FROM users WHERE role='student' AND block IS NOT NULL").all();
  const result = blocks.map((b) => {
    const skips = db
      .prepare(
        `SELECT COUNT(*) c FROM responses r JOIN users u ON u.id=r.user_id
         WHERE u.block=? AND r.status='skipping'`
      )
      .get(b.block).c;
    const total = db
      .prepare('SELECT COUNT(*) c FROM responses r JOIN users u ON u.id=r.user_id WHERE u.block=?')
      .get(b.block).c;
    const skipRate = total ? skips / total : 0;
    return { block: b.block, responses: total, skips, skipRate: Number(skipRate.toFixed(2)) };
  });
  // Students who reliably opt out (so food isn't cooked) = least waste contributors.
  result.sort((a, b) => b.skipRate - a.skipRate);
  result.forEach((r, i) => (r.rank = i + 1));
  res.json(result);
});

/* --------------------------------------------------------------------------
 * Menu vote (good-to-have)
 * ------------------------------------------------------------------------ */
app.post('/api/vote', auth('student'), (req, res) => {
  const { option } = req.body || {};
  if (!option) return res.status(400).json({ error: 'option required' });
  db.prepare(
    `INSERT INTO menu_votes (option,user_id,created_at) VALUES (?,?,?)
     ON CONFLICT(option,user_id) DO NOTHING`
  ).run(option, req.user.id, now());
  res.json({ ok: true });
});

app.get('/api/vote/results', auth(), (req, res) => {
  const rows = db
    .prepare('SELECT option, COUNT(*) votes FROM menu_votes GROUP BY option ORDER BY votes DESC')
    .all();
  res.json(rows);
});

/* --------------------------------------------------------------------------
 * Boot
 * ------------------------------------------------------------------------ */
if (require.main === module) {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Smart Mess Meal Planner running at http://localhost:${PORT}`);
  });
}

module.exports = app; // exported for Supertest / integration tests
