# Smart Mess Meal Planner

A web-based system that cuts hostel/campus mess food waste. Students opt in or out of meals before a cutoff, the kitchen sees a predicted headcount and logs leftovers, the warden reviews waste trends and complaints, and NGOs get surplus alerts and confirm pickups.

Built for a software-engineering course project. The repository contains both the **working application** and the **M1-M4 engineering deliverables** (in `docs/`).

---

## Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | Plain HTML / CSS / vanilla JS (single page) | No build step, instantly runnable, easy to grade |
| Backend | Node.js + Express | Lightweight REST API |
| Database | `node:sqlite` (built into Node ≥ 22.5) | Zero native build, file-based, auto-seeded |
| Prediction | Simple Moving Average (pure function) | Clear, testable white-box logic (M4) |
| Tests | Jest (unit + API), Selenium WebDriver (E2E) | White-box, black-box, UI automation |
| CI | GitHub Actions | Runs tests on every push/PR (M3) |

> **Node version:** requires **Node.js ≥ 22.5.0** because the app uses the built-in `node:sqlite` module. Check with `node --version`.

---

## Quick start

```bash
npm install        # installs express + dev tools (no native compilation)
npm start          # starts the server on http://localhost:3000
```

Open http://localhost:3000 and log in with any demo account below. The database
file (`mess.db`) is created and seeded automatically on first run with 8 users,
a week of past consumption history, and open meals for today + tomorrow.

### Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Student | `asha@campus.edu` | `student123` |
| Student | `rahul@campus.edu` | `student123` |
| Kitchen staff | `kitchen@campus.edu` | `kitchen123` |
| Warden / Admin | `warden@campus.edu` | `warden123` |
| NGO volunteer | `ngo@foodbank.org` | `ngo123` |

---

## Feature map (scope coverage)

**Must-have**
- Role-based login (student / kitchen / warden / ngo) — enforced on every API route.
- Meal opt-in / opt-out with a **cutoff time** — responses lock after cutoff.
- Headcount **prediction** via moving average + advance responses.
- Kitchen dashboard with predicted counts and consumption logging.
- Leftover logging (auto-computes waste ratio, flags high-waste meals).
- Feedback, 1-5 star rating, and quality-issue reporting.
- NGO **surplus alert** → accept pickup → confirm receipt workflow.

**Good-to-have**
- Weekly waste report with summary stats (warden).
- Menu-vote feature (student).
- Least-waste **leaderboard** by hostel block (warden).
- Special-diet tagging on student profiles (`vegetarian`, `vegan`, `gluten-free`).

**Out of scope (by design):** payments, IoT weighing scales, billing.

---

## How prediction works

`src/prediction.js` is a pure module (no I/O) so it is trivially unit-testable:

- `movingAverage(history, window=3)` — simple moving average of the last `window` actual headcounts for the same meal type.
- `predictHeadcount({history, confirmedOptIns, confirmedOptOuts, registeredTotal})` — blends the trend with firm advance responses: opt-outs reduce the count, opt-ins form a floor, and the registered-student total is a hard cap.
- `flagHighWaste({cooked, leftover, threshold=0.2})` — flags a meal when leftover/cooked ≥ 20%.
- `isBeforeCutoff(now, cutoff)` — the rule that governs whether opt-in/out is still allowed.

---

## Running the tests

```bash
npm run test:unit   # white-box unit tests on prediction logic (Jest)
npm run test:api    # black-box API tests for opt-out & cutoff rules (Jest + Supertest)
npm test            # full suite
npx jest --coverage --runInBand --forceExit   # with coverage report

# End-to-end (needs the server running + Chrome + chromedriver):
npm start           # terminal 1
npm run selenium    # terminal 2 — logs in as a student and opts into a meal
```

---

## Project layout

```
smart-mess-planner/
├── src/
│   ├── prediction.js     # pure, testable prediction + rules
│   ├── db.js             # schema + auto-seed (node:sqlite)
│   └── server.js         # Express API + static host, role-based auth
├── public/               # frontend (index.html, styles.css, app.js)
├── tests/
│   ├── prediction.test.js      # white-box unit tests
│   ├── api.test.js             # black-box API/integration tests
│   └── selenium.login_optin.js # Selenium E2E script
├── .github/workflows/ci.yml    # GitHub Actions CI
└── docs/                 # M1-M4 engineering deliverables
    ├── M1-process-ethics-sdg.md
    ├── M2-requirements-design.md
    ├── M3-scrum-agile.md
    └── M4-testing-sqa.md
```

---

## REST API summary

| Method | Route | Role | Purpose |
| --- | --- | --- | --- |
| POST | `/api/login` | any | Authenticate, returns token |
| GET | `/api/meals` | any | Upcoming meals + my response + open/closed |
| POST | `/api/meals/:id/respond` | student | Opt in/out (enforces cutoff) |
| GET | `/api/predict` | kitchen, warden | Predicted headcount per meal |
| POST | `/api/meals/:id/consumption` | kitchen | Log cooked/eaten → leftover + surplus alert |
| POST | `/api/meals/:id/feedback` | student | Rating, comment, quality issue |
| GET | `/api/feedback` | warden, kitchen | View feedback/complaints |
| GET | `/api/surplus` | ngo, warden, kitchen | Surplus alerts |
| POST | `/api/surplus/:id/accept` | ngo | Accept a pickup |
| POST | `/api/surplus/:id/confirm` | ngo | Confirm receipt |
| GET | `/api/report/waste` | warden, kitchen | Weekly waste report |
| GET | `/api/leaderboard` | warden, student, kitchen | Least-waste block ranking |
| POST | `/api/vote` | student | Menu vote |
| GET | `/api/vote/results` | any | Vote tallies |

---

## Security note (academic scope)

Passwords are stored in plain text and the auth token is a base64 user id —
deliberately simple so the project is easy to run and test. For production you
would hash passwords (bcrypt/argon2), issue signed JWTs, and serve over HTTPS.
See `docs/M4-testing-sqa.md` (maintenance note) for the hardening backlog.
