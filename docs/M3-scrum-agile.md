# M3 — Scrum / Agile Execution

**Project:** Smart Mess Meal Planner

Contents: Scrum roles · user stories · product backlog · planning-poker estimation · two sprint plans · GitHub Actions CI.

---

## 1. Scrum roles

| Role | Who | Responsibilities |
| --- | --- | --- |
| **Product Owner (PO)** | Team member A | Owns the product backlog, prioritises stories (MoSCoW), represents students/mess/warden/NGO, accepts completed stories against acceptance criteria. |
| **Scrum Master (SM)** | Team member B | Facilitates ceremonies (planning, daily stand-up, review, retro), removes blockers, protects the sprint scope, keeps CI green. |
| **Development Team** | Members C, D (+ A, B hands-on) | Cross-functional: build the frontend, API, DB and tests. Self-organising; collectively owns the sprint backlog and the Definition of Done. |

**Definition of Done (DoD):** code merged to `main` via PR · unit/API tests passing · CI green · acceptance criteria met · README/docs updated if behaviour changed.

---

## 2. User stories (13)

Format: *As a `<role>`, I want `<goal>` so that `<benefit>`.* Each has an ID, priority and acceptance criteria.

| ID | Story | Priority |
| --- | --- | --- |
| US-1 | As a **student**, I want to log in so that I see only my own meal options. | Must |
| US-2 | As a **student**, I want to skip tomorrow's dinner before the cutoff so that food isn't cooked for me. | Must |
| US-3 | As a **student**, I want to change my response until the cutoff so that I can decide late. | Must |
| US-4 | As a **student**, I want my response locked after the cutoff so that planning is reliable. | Must |
| US-5 | As a **kitchen manager**, I want to see the predicted headcount so that I cook the right quantity. | Must |
| US-6 | As a **manager**, I want to log leftover food after each meal so that waste is tracked. | Must |
| US-7 | As the **system**, I want to flag high-waste meals so that trends surface automatically. | Must |
| US-8 | As a **student**, I want to rate a meal and report quality issues so that I have a voice. | Should |
| US-9 | As an **NGO volunteer**, I want an alert when surplus food is available so that I can arrange a pickup. | Must |
| US-10 | As an **NGO volunteer**, I want to accept and confirm a pickup so that collection is tracked. | Must |
| US-11 | As a **warden**, I want a weekly waste report so that I can act on high-waste days. | Should |
| US-12 | As a **student**, I want to vote on the menu so that popular dishes are served. | Could |
| US-13 | As a **warden**, I want a least-waste block leaderboard so that I can encourage good behaviour. | Could |

### Sample acceptance criteria

- **US-2:** Given it is before dinner's cutoff, when I tap *Skip*, then my response is saved as *skipping* and the predicted headcount drops.
- **US-4:** Given the cutoff has passed, when I try to change my response, then the action is rejected (HTTP 409) and the UI shows *cutoff passed*.
- **US-5:** Given 7 days of history, when I open the kitchen dashboard, then each upcoming meal shows a predicted number and the opt-in/opt-out counts.
- **US-9:** Given leftovers were logged, when I open the NGO view, then an *available* surplus item appears with the portion count.

---

## 3. Product backlog (prioritised)

Ordered by value and dependency. Points are planning-poker estimates (§4).

| Rank | Story | MoSCoW | Points | Sprint |
| --- | --- | --- | --- | --- |
| 1 | US-1 Login + RBAC | Must | 5 | 1 |
| 2 | US-2 Opt-out before cutoff | Must | 3 | 1 |
| 3 | US-3 Editable response | Must | 2 | 1 |
| 4 | US-4 Lock after cutoff | Must | 3 | 1 |
| 5 | US-5 Predicted headcount | Must | 8 | 1 |
| 6 | US-6 Log leftovers | Must | 5 | 1 |
| 7 | US-7 Flag high-waste | Must | 2 | 1 |
| 8 | US-9 Surplus alert | Must | 3 | 2 |
| 9 | US-10 Accept/confirm pickup | Must | 5 | 2 |
| 10 | US-8 Rating & issue report | Should | 3 | 2 |
| 11 | US-11 Weekly waste report | Should | 5 | 2 |
| 12 | US-12 Menu vote | Could | 2 | 2 |
| 13 | US-13 Block leaderboard | Could | 3 | 2 |

**Total:** 49 points. Sprint 1 = 28 pts (must-have core), Sprint 2 = 21 pts.

---

## 4. Planning-poker estimation

The team estimated in **story points** on a modified Fibonacci scale (1, 2, 3, 5, 8, 13). Each member revealed a card simultaneously; divergent estimates triggered discussion, then a re-vote.

### Example round — US-5 "Predicted headcount"

| Round | Dev C | Dev D | PO | SM | Outcome |
| --- | --- | --- | --- | --- | --- |
| 1 | 13 | 5 | 8 | 8 | Spread 5-13 → discuss |
| — | *Dev C thought it needed a full ML model; clarified that a simple moving average is enough. Dev D flagged the need to blend opt-ins.* | | | | |
| 2 | 8 | 8 | 8 | 5 | Converged → **8 points** |

### Final estimates

| Story | Final points | Rationale |
| --- | --- | --- |
| US-1 | 5 | Auth + middleware + 4 role routes |
| US-2 | 3 | Single endpoint + UI buttons |
| US-3 | 2 | Upsert on existing response |
| US-4 | 3 | Cutoff rule + 409 handling + tests |
| US-5 | 8 | Prediction logic + history query + dashboard |
| US-6 | 5 | Consumption form + leftover compute |
| US-7 | 2 | Pure flag function |
| US-8 | 3 | Rating UI + endpoint |
| US-9 | 3 | Auto-create alert on leftovers |
| US-10 | 5 | Two-step state machine + guards |
| US-11 | 5 | Aggregation + summary stats |
| US-12 | 2 | Vote endpoint + tally |
| US-13 | 3 | Per-block heuristic + ranking |

**Velocity assumption:** ~25-28 points/sprint for the team's capacity.

---

## 5. Sprint plans

### Sprint 1 — "Core loop: decide → predict → log" (28 pts)

**Sprint goal:** A student can opt in/out before a cutoff; the kitchen sees a prediction and logs leftovers with high-waste flagging.

- Backlog: US-1, US-2, US-3, US-4, US-5, US-6, US-7.
- Ceremonies: planning (day 1), daily stand-up, review + retro (day 10).

| Day | Focus |
| --- | --- |
| 1-2 | Project scaffold, DB schema, seed data, CI pipeline skeleton |
| 3-4 | US-1 auth + RBAC; US-2/US-3 opt-in/out |
| 5-6 | US-4 cutoff lock + tests; `prediction.js` pure module |
| 7-8 | US-5 prediction dashboard; US-6 consumption logging |
| 9 | US-7 high-waste flag; white-box + black-box tests |
| 10 | Review, retro, tag `v0.1` |

**Sprint 1 review outcome (plan):** core loop demoed to a stand-in mess manager; feedback → add a safety buffer suggestion to the cooked field (carried into UI defaults).

### Sprint 2 — "Close the loop: surplus, voice, oversight" (21 pts)

**Sprint goal:** Surplus reaches NGOs; students have a voice; the warden has oversight.

- Backlog: US-9, US-10, US-8, US-11, US-12, US-13.

| Day | Focus |
| --- | --- |
| 1-2 | US-9 surplus alert auto-creation; US-10 accept/confirm state machine |
| 3-4 | US-8 rating + issue reporting |
| 5-6 | US-11 weekly waste report + summary stats |
| 7-8 | US-12 menu vote; US-13 block leaderboard |
| 9 | Hardening, full regression, coverage check |
| 10 | Review, retro, tag `v1.0` |

### Burndown (illustrative, Sprint 1)

```
Points remaining
28 |●
   |  ●
21 |    ●
   |      ●
14 |        ●
   |          ●
 7 |            ●
   |              ●___
 0 +----------------●----
     1  2  3 ... 8  9 10  (day)
```

---

## 6. GitHub Actions CI

CI is defined in `.github/workflows/ci.yml` and runs on every push and PR to `main`/`develop`.

Pipeline stages:
1. Checkout + set up Node (matrix: 22.x, 24.x — required for built-in `node:sqlite`).
2. `npm ci` (install).
3. Lint.
4. **White-box** unit tests (`npm run test:unit`).
5. **Black-box** API tests (`npm run test:api`).
6. Full suite **with coverage**, uploaded as a build artifact.

This gives the team a green/red signal on every commit — the Agile "working software" feedback loop. A red pipeline blocks merge, enforcing the Definition of Done.

### Branching model
- `main` — always releasable, protected (PR + green CI required).
- `develop` — integration branch.
- `feature/US-x-*` — one branch per story, merged via PR after review.
