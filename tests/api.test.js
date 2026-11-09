'use strict';

/**
 * BLACK-BOX / integration tests for opt-out and cutoff rules (M4).
 * These treat the HTTP API as a black box: we drive it only through its public
 * endpoints and assert on observable responses, with no knowledge of the
 * internal implementation. Each test uses a fresh, isolated SQLite file.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

// Isolate the DB per test run BEFORE requiring the app.
const tmpDb = path.join(os.tmpdir(), `mess-test-${Date.now()}.db`);
process.env.MESS_DB_PATH = tmpDb;

const request = require('supertest');
const app = require('../src/server');
const db = require('../src/db');

async function loginAs(email, password) {
  const res = await request(app).post('/api/login').send({ email, password });
  return res.body.token;
}

afterAll(() => {
  try { fs.unlinkSync(tmpDb); } catch {}
  ['-wal', '-shm'].forEach((s) => { try { fs.unlinkSync(tmpDb + s); } catch {} });
});

describe('Authentication & RBAC (black-box)', () => {
  test('valid login returns a token and role', async () => {
    const res = await request(app).post('/api/login').send({ email: 'asha@campus.edu', password: 'student123' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('student');
    expect(typeof res.body.token).toBe('string');
  });

  test('invalid credentials are rejected', async () => {
    const res = await request(app).post('/api/login').send({ email: 'asha@campus.edu', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  test('student cannot access kitchen prediction endpoint', async () => {
    const token = await loginAs('asha@campus.edu', 'student123');
    const res = await request(app).get('/api/predict').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('unauthenticated request is blocked', async () => {
    const res = await request(app).get('/api/meals');
    expect(res.status).toBe(401);
  });
});

describe('Opt-in / opt-out rules (black-box)', () => {
  let studentToken;
  let openMeal;

  beforeAll(async () => {
    studentToken = await loginAs('asha@campus.edu', 'student123');
    const meals = await request(app).get('/api/meals').set('Authorization', `Bearer ${studentToken}`);
    openMeal = meals.body.find((m) => m.open === true);
  });

  test('a student can opt OUT (skip) before cutoff', async () => {
    const res = await request(app)
      .post(`/api/meals/${openMeal.id}/respond`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ status: 'skipping' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('skipping');
  });

  test('a student can switch back to eating before cutoff', async () => {
    const res = await request(app)
      .post(`/api/meals/${openMeal.id}/respond`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ status: 'eating' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('eating');
  });

  test('invalid status value is rejected (equivalence partition)', async () => {
    const res = await request(app)
      .post(`/api/meals/${openMeal.id}/respond`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ status: 'maybe' });
    expect(res.status).toBe(400);
  });

  test('responding after the cutoff is locked (409)', async () => {
    // Create a meal whose cutoff is already in the past.
    const info = db
      .prepare("INSERT INTO meals (date,type,menu,cutoff) VALUES ('2020-01-01','lunch','Old meal','2020-01-01T11:00:00.000Z')")
      .run();
    const pastMealId = info.lastInsertRowid;
    const res = await request(app)
      .post(`/api/meals/${pastMealId}/respond`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ status: 'skipping' });
    expect(res.status).toBe(409);
  });
});

describe('Kitchen consumption -> surplus alert pipeline (black-box)', () => {
  test('logging leftovers creates an NGO surplus alert and flags high waste', async () => {
    const kitchenToken = await loginAs('kitchen@campus.edu', 'kitchen123');
    const preds = await request(app).get('/api/predict').set('Authorization', `Bearer ${kitchenToken}`);
    const meal = preds.body[0].meal;

    const res = await request(app)
      .post(`/api/meals/${meal.id}/consumption`)
      .set('Authorization', `Bearer ${kitchenToken}`)
      .send({ cooked: 100, actual_eaten: 70 }); // 30 leftover => 30% waste
    expect(res.status).toBe(200);
    expect(res.body.leftover).toBe(30);
    expect(res.body.highWaste).toBe(true);
    expect(res.body.surplus).not.toBeNull();

    // NGO should now see it as available.
    const ngoToken = await loginAs('ngo@foodbank.org', 'ngo123');
    const surplus = await request(app).get('/api/surplus').set('Authorization', `Bearer ${ngoToken}`);
    const item = surplus.body.find((s) => s.meal_id === meal.id);
    expect(item.status).toBe('available');

    // Accept then confirm.
    const accept = await request(app).post(`/api/surplus/${item.id}/accept`).set('Authorization', `Bearer ${ngoToken}`);
    expect(accept.status).toBe(200);
    const confirm = await request(app).post(`/api/surplus/${item.id}/confirm`).set('Authorization', `Bearer ${ngoToken}`);
    expect(confirm.status).toBe(200);
  });
});
