'use strict';

/**
 * db.js — SQLite data layer for the Smart Mess Meal Planner.
 * Uses better-sqlite3 (synchronous, zero-config, file-based).
 * On first run it creates the schema and seeds demo data so the app is usable
 * immediately without any manual setup.
 */

const path = require('path');
const { DatabaseSync } = require('node:sqlite'); // built-in, no native build step

const DB_PATH = process.env.MESS_DB_PATH || path.join(__dirname, '..', 'mess.db');

const db = new DatabaseSync(DB_PATH);
// Use WAL in normal runs for concurrency; tests set MESS_DB_PATH and we keep the
// default rollback journal there so no -wal/-shm handles linger after the suite.
if (!process.env.MESS_DB_PATH) {
  db.exec('PRAGMA journal_mode = WAL;');
}
db.exec('PRAGMA foreign_keys = ON;');

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      email      TEXT NOT NULL UNIQUE,
      password   TEXT NOT NULL,            -- demo only: plain text; hash in prod
      role       TEXT NOT NULL CHECK (role IN ('student','kitchen','warden','ngo')),
      block      TEXT,                      -- hostel block, students only
      diet       TEXT DEFAULT 'none'        -- special-diet tag
    );

    CREATE TABLE IF NOT EXISTS meals (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      date       TEXT NOT NULL,             -- YYYY-MM-DD
      type       TEXT NOT NULL CHECK (type IN ('breakfast','lunch','dinner')),
      menu       TEXT,
      cutoff     TEXT NOT NULL,             -- ISO datetime
      UNIQUE(date, type)
    );

    CREATE TABLE IF NOT EXISTS responses (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      meal_id    INTEGER NOT NULL REFERENCES meals(id),
      user_id    INTEGER NOT NULL REFERENCES users(id),
      status     TEXT NOT NULL CHECK (status IN ('eating','skipping')),
      updated_at TEXT NOT NULL,
      UNIQUE(meal_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS consumption (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      meal_id         INTEGER NOT NULL UNIQUE REFERENCES meals(id),
      cooked          INTEGER NOT NULL,
      actual_eaten    INTEGER NOT NULL,
      leftover        INTEGER NOT NULL,
      logged_at       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      meal_id    INTEGER NOT NULL REFERENCES meals(id),
      user_id    INTEGER NOT NULL REFERENCES users(id),
      rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment    TEXT,
      is_issue   INTEGER NOT NULL DEFAULT 0, -- 1 = quality complaint
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS surplus (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      meal_id      INTEGER NOT NULL REFERENCES meals(id),
      portions     INTEGER NOT NULL,
      status       TEXT NOT NULL DEFAULT 'available'
                     CHECK (status IN ('available','accepted','received')),
      ngo_user_id  INTEGER REFERENCES users(id),
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS menu_votes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      option     TEXT NOT NULL,
      user_id    INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      UNIQUE(option, user_id)
    );
  `);
}

function seed() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return; // already seeded

  const insertUser = db.prepare(
    `INSERT INTO users (name,email,password,role,block,diet)
     VALUES (@name,@email,@password,@role,@block,@diet)`
  );

  const users = [
    { name: 'Asha Rao',    email: 'asha@campus.edu',   password: 'student123', role: 'student', block: 'A', diet: 'vegetarian' },
    { name: 'Rahul Nair',  email: 'rahul@campus.edu',  password: 'student123', role: 'student', block: 'A', diet: 'none' },
    { name: 'Meera Iyer',  email: 'meera@campus.edu',  password: 'student123', role: 'student', block: 'B', diet: 'vegan' },
    { name: 'Sam Khan',    email: 'sam@campus.edu',    password: 'student123', role: 'student', block: 'B', diet: 'none' },
    { name: 'Priya Das',   email: 'priya@campus.edu',  password: 'student123', role: 'student', block: 'C', diet: 'gluten-free' },
    { name: 'Kitchen Lead', email: 'kitchen@campus.edu', password: 'kitchen123', role: 'kitchen', block: null, diet: 'none' },
    { name: 'Warden Gupta', email: 'warden@campus.edu',  password: 'warden123',  role: 'warden',  block: null, diet: 'none' },
    { name: 'FoodBank NGO', email: 'ngo@foodbank.org',   password: 'ngo123',     role: 'ngo',     block: null, diet: 'none' },
  ];
  db.exec('BEGIN');
  users.forEach((r) => insertUser.run(r));
  db.exec('COMMIT');

  // Build meals for the last 7 days + today + tomorrow so prediction has history.
  const today = new Date();
  const ymd = (d) => d.toISOString().slice(0, 10);
  const cutoffFor = (d, type) => {
    const c = new Date(d);
    const hours = { breakfast: 7, lunch: 11, dinner: 18 }[type];
    c.setHours(hours, 0, 0, 0);
    return c.toISOString();
  };

  const insertMeal = db.prepare(
    'INSERT OR IGNORE INTO meals (date,type,menu,cutoff) VALUES (?,?,?,?)'
  );
  const insertCons = db.prepare(
    `INSERT OR IGNORE INTO consumption (meal_id,cooked,actual_eaten,leftover,logged_at)
     VALUES (?,?,?,?,?)`
  );
  const menus = {
    breakfast: 'Idli, sambar, chutney',
    lunch: 'Rice, dal, mixed veg, curd',
    dinner: 'Chapati, paneer curry, salad',
  };

  // Past 7 days with recorded consumption (gives the moving average real data).
  const pastCounts = [120, 118, 125, 110, 130, 115, 122];
  for (let i = 7; i >= 1; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    ['breakfast', 'lunch', 'dinner'].forEach((type) => {
      insertMeal.run(ymd(d), type, menus[type], cutoffFor(d, type));
      const mealId = db.prepare('SELECT id FROM meals WHERE date=? AND type=?').get(ymd(d), type).id;
      const eaten = pastCounts[7 - i] - (type === 'breakfast' ? 10 : 0);
      const cooked = eaten + 15; // typically over-cooked
      insertCons.run(mealId, cooked, eaten, cooked - eaten, cutoffFor(d, type));
    });
  }

  // Today + tomorrow: open meals, no consumption yet.
  [0, 1].forEach((offset) => {
    const d = new Date(today);
    d.setDate(today.getDate() + offset);
    ['breakfast', 'lunch', 'dinner'].forEach((type) => {
      insertMeal.run(ymd(d), type, menus[type], cutoffFor(d, type));
    });
  });
}

init();
seed();

module.exports = db;
