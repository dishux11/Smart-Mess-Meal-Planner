# M4 — Testing, SQA & Maintenance

**Project:** Smart Mess Meal Planner

Contents: white-box tests on the prediction logic · black-box tests on opt-out & cutoff rules · Selenium script · SQA metrics · version control · maintenance note.

---

## 1. White-box testing — prediction logic

**Target:** `src/prediction.js` (pure, no I/O). **Tool:** Jest. **File:** `tests/prediction.test.js`.

White-box tests are designed from the *internal structure* of the code — every branch, boundary and error path is exercised, aiming for full statement and branch coverage.

### Coverage of control-flow paths

| Function | Paths / branches tested |
| --- | --- |
| `movingAverage` | empty-history early return; history shorter than window; history longer than window (trailing slice); rounding (half-up); window = 1; TypeError (non-array, non-finite value); RangeError (zero / negative / non-integer window) |
| `predictHeadcount` | pure trend; opt-outs reduce; opt-in floor; registered-total cap; never-negative clamp; empty history + opt-ins; invalid opt-in/out → RangeError |
| `flagHighWaste` | zero-cooked guard; ratio **exactly at** threshold (≥ boundary) flagged; ratio just below not flagged; custom threshold; negative-input TypeError |
| `isBeforeCutoff` | before → true; **equal to cutoff → false** (strict `<`); after → false; invalid date → TypeError |

### Boundary-value analysis (the core of white-box here)

| Input (leftover/cooked) | Ratio | Expected `isHighWaste` | Reason |
| --- | --- | --- | --- |
| 19 / 100 | 0.19 | false | just below 0.20 threshold |
| 20 / 100 | 0.20 | **true** | exactly at threshold (`>=`) |
| 21 / 100 | 0.21 | true | above threshold |

### Result (actual run)

```
PASS tests/prediction.test.js
---------------|---------|----------|---------|---------|
File           | % Stmts | % Branch | % Funcs | % Lines |
---------------|---------|----------|---------|---------|
prediction.js  |   100   |  97.72   |   100   |   100   |
---------------|---------|----------|---------|---------|
```

100% statement, function and line coverage; 97.7% branch coverage (the single uncovered branch is a defensive `Number.isFinite` guard on an infinite `registeredTotal` default, which is intentionally unreachable in normal use).

---

## 2. Black-box testing — opt-out & cutoff rules

**Target:** the HTTP API as a closed box. **Tools:** Jest + Supertest. **File:** `tests/api.test.js`.

Black-box tests exercise the system only through its public endpoints and assert on observable responses, using **equivalence partitioning** and **boundary analysis** on inputs — with no knowledge of the implementation.

### Equivalence partitions & boundaries

| Input domain | Partition | Test | Expected |
| --- | --- | --- | --- |
| Credentials | valid | correct email+password | 200 + token |
| Credentials | invalid | wrong password | 401 |
| Role vs. endpoint | unauthorised | student → `/api/predict` | 403 |
| Auth presence | missing | no token → `/api/meals` | 401 |
| Response status value | valid | `eating` / `skipping` | 200 |
| Response status value | invalid | `maybe` | 400 |
| Cutoff timing | before cutoff | respond to open meal | 200 |
| Cutoff timing | **after cutoff** | respond to past meal | **409 (locked)** |
| Consumption | leftovers > 0 | cooked 100 / eaten 70 | leftover 30, high-waste true, surplus created |

### Result (actual run)

```
PASS tests/api.test.js
  Authentication & RBAC (black-box)            4 passed
  Opt-in / opt-out rules (black-box)           4 passed
  Kitchen consumption -> surplus alert         1 passed
Tests: 9 passed, 9 total
```

Full suite: **33 tests passing** (24 white-box + 9 black-box).

---

## 3. Selenium end-to-end script

**File:** `tests/selenium.login_optin.js`. **Tool:** selenium-webdriver (Chrome).

Automates the highest-value user journey — **login + meal opt-in**:

1. Open the app, wait for the login form.
2. Enter student credentials and submit.
3. Wait for the student dashboard and meal cards to render.
4. Click *Eating* on the first open meal.
5. Assert that an `eating` badge appears.

It honours a `HEADLESS` env var (default headless, CI-friendly) and exits non-zero on any failed assertion, so it can be wired into CI once a browser is provisioned.

**Run:**
```bash
npm start            # terminal 1
npm run selenium     # terminal 2
# => "PASS: student logged in and opted into a meal successfully."
```

---

## 4. SQA metrics

### 4.1 Test metrics (from the actual suite)

| Metric | Value |
| --- | --- |
| Total automated tests | 33 |
| Tests passing | 33 (100%) |
| White-box unit tests | 24 |
| Black-box / integration tests | 9 |
| Statement coverage (prediction) | 100% |
| Branch coverage (prediction) | 97.7% |
| Test execution time (full suite) | ~7 s |

### 4.2 Product / size metrics

| Metric | Approx. value |
| --- | --- |
| Source LOC (`src/`) | ~520 |
| Test LOC (`tests/`) | ~300 |
| Test-to-code ratio | ~0.58 |
| Number of REST endpoints | 14 |
| Number of modules | 3 (prediction, db, server) |

### 4.3 Defect-density (illustrative, for the SQA report)

Defect density = defects found ÷ KLOC. With the prediction module isolated and fully covered, defects concentrate at integration points. Tracking template:

| Phase | Defects found | Severity split | Notes |
| --- | --- | --- | --- |
| Unit test (white-box) | e.g. 3 | 2 minor, 1 major | boundary rounding, floor logic |
| Integration (black-box) | e.g. 2 | 1 major (cutoff race), 1 minor | fixed via strict `<` |
| UI / Selenium | e.g. 1 | 1 minor | badge render timing |

### 4.4 Quality attributes mapped to evidence

| ISO-25010 attribute | Evidence in this project |
| --- | --- |
| Functional correctness | 33 passing tests against acceptance criteria |
| Reliability | Cutoff lock verified at the boundary and via API |
| Maintainability | Pure prediction module, ≥90% coverage, clear layering |
| Security (partial) | RBAC tested per endpoint; hardening backlog below |
| Portability | Zero native build; runs on Node ≥ 22.5 |

---

## 5. Version control (GitHub)

- **Repository layout** and branching model are described in `M3-scrum-agile.md` (§6): `main` (protected, releasable), `develop` (integration), `feature/US-x-*` per story.
- **Commit convention:** `US-<id>: <imperative summary>` so history maps to backlog items.
- **Tags:** `v0.1` at the end of Sprint 1, `v1.0` at the end of Sprint 2.
- **CI gate:** merges to `main` require a green pipeline (`.github/workflows/ci.yml`), enforcing the Definition of Done.
- `.gitignore` excludes `node_modules/`, coverage output, and the generated `*.db` files.

Suggested first-push commands:
```bash
git init
git add .
git commit -m "US-1..US-13: Smart Mess Meal Planner v1.0 with tests + CI"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```

---

## 6. Maintenance note

Classifying anticipated maintenance (per ISO/IEC 14764):

### 6.1 Corrective
- Edge cases in prediction when a meal type has **no history** (currently returns the opt-in floor or 0 — monitor and adjust if the kitchen reports under-prediction).
- Timezone handling for cutoffs: store/compare in UTC consistently when deployed across regions.

### 6.2 Adaptive
- **Security hardening backlog (required before real deployment):**
  - Hash passwords (bcrypt/argon2) instead of plain text.
  - Replace the base64 token with a signed, expiring JWT.
  - Serve over HTTPS; add rate limiting on `/api/login`.
  - Add server-side input validation middleware and audit logging.
- Swap the embedded SQLite for PostgreSQL/MySQL if the user base grows (the data layer is isolated in `src/db.js`, so only that file changes).
- Add a real notification channel for cutoff reminders (email/push) behind FR-15.

### 6.3 Perfective
- Upgrade the prediction from a fixed-window moving average to a **weighted** or **day-of-week-aware** average as more data accumulates (the `window` parameter and pure function make this a localised change).
- Add caching on the prediction and report endpoints.
- Enrich the leaderboard heuristic with actual per-block consumption once that data is captured.

### 6.4 Preventive
- Keep test coverage ≥ 90% on `prediction.js` as a merge gate.
- Dependency updates via scheduled CI (e.g. Dependabot).
- Periodic refactor of `server.js` into route modules as endpoints grow.

### Maintainability enablers already in place
- Business logic is **decoupled** from I/O (pure `prediction.js`), so the riskiest code is the most testable.
- Three clearly-separated layers (presentation / application / data).
- Automated tests + CI catch regressions on every change.
- Documentation (M1-M4 + README) kept in-repo and version-controlled, so it never drifts from the code.
