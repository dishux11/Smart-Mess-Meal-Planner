# M1 — Process Model, Ethics, and SDG Mapping

**Project:** Smart Mess Meal Planner
**Module deliverable:** Justify the software process model, write an ethics note (student data and food fairness), and map the project to the UN Sustainable Development Goals.

---

## 1. Process model — why Agile (Scrum)

We adopt **Agile, run as Scrum**, rather than a plan-driven model (Waterfall) or a purely incremental one.

### 1.1 Why Agile fits this project

| Project characteristic | Implication | Why Agile answers it |
| --- | --- | --- |
| Requirements are not fully known up front | We learned real needs only after interviewing students, the mess manager and a warden (see M2) | Agile embraces evolving requirements instead of freezing them early |
| Multiple distinct user roles with competing needs | Student convenience vs. kitchen planning vs. NGO logistics | Short sprints let us deliver and validate one role's slice at a time |
| Prediction logic needs tuning against real data | A moving-average model must be observed and adjusted | Iterative sprints allow measure → learn → refine cycles |
| Small academic team, fixed deadline | Limited capacity, hard end date | Time-boxed sprints and a prioritised backlog force us to ship the must-haves first |
| Stakeholders available for feedback | Students and staff can review each increment | Sprint reviews turn that availability into a steering mechanism |

### 1.2 Why not the alternatives

- **Waterfall** assumes stable, fully specified requirements and defers all testing and user feedback to the end. Here the requirements genuinely shifted after stakeholder interviews, and late feedback would be costly — a poor fit.
- **Big-bang / code-and-fix** gives no process control, no backlog, and no quality gates — unacceptable for a graded engineering project.
- **Spiral** is risk-driven and heavyweight; appropriate for large, high-risk systems, but overkill for a focused campus web app on a semester timeline.

### 1.3 How Agile is actually applied (forward reference to M3)

- **Two sprints**, each time-boxed (2 weeks in plan).
- **Product backlog** of 10-15 user stories, prioritised MoSCoW-style (must/should/could).
- **Planning poker** for effort estimation.
- **Scrum roles**: Product Owner, Scrum Master, Development Team.
- **GitHub Actions CI** gives continuous feedback on every commit — the "working software" heartbeat of Agile.

Sprint 1 ships the must-have core (auth, opt-in/opt-out with cutoff, prediction, kitchen logging). Sprint 2 ships the NGO surplus flow plus good-to-haves (waste report, menu vote, leaderboard). Full detail is in `M3-scrum-agile.md`.

---

## 2. Ethics note

The system handles **student personal data** and makes decisions that affect **food fairness**. Three ethical lenses apply: privacy, fairness, and dignity.

### 2.1 Student data (privacy)

- **Data minimisation.** We collect only what the service needs: name, email, role, hostel block, an optional diet tag, and per-meal responses. We do **not** collect religion, health conditions, or payment data. The diet tag (e.g. "vegan", "gluten-free") is sensitive-adjacent, so it is optional and self-declared, used only to tag menus, never to single out individuals.
- **Purpose limitation.** Attendance responses are used for headcount prediction and waste reduction only — not for monitoring, attendance-based penalties, or disciplinary action. A student skipping meals must never become grounds for suspicion.
- **Consent and transparency.** Students should be told, at sign-up, exactly what is logged and why. Opting out of a meal is a normal, encouraged action, not a flagged behaviour.
- **Security (and its current limits).** For the academic build, passwords are stored in plain text and tokens are simple — this is called out honestly in the README and the M4 maintenance note, with a concrete hardening backlog (hashing, signed tokens, HTTPS, role-scoped audit logs). Shipping this to real students would require that hardening first.
- **Aggregation over identification.** Reports, trends and the block leaderboard are presented as **aggregates**. The leaderboard ranks *blocks*, not named students, to avoid public shaming of individuals.

### 2.2 Food fairness

- **No one goes hungry to cut waste.** The prediction model is advisory. Confirmed opt-ins act as a hard floor, and the kitchen is encouraged to keep a small safety buffer so that under-prediction never leaves a student with "nothing left".
- **Equitable surplus distribution.** Surplus is routed to NGOs/volunteers for people in need, with an explicit accept→confirm handshake so food is actually collected and not re-wasted. The design treats surplus food as something owed to the community, not discarded property.
- **Dietary inclusion.** Special-diet tagging helps ensure that vegetarian/vegan/gluten-free students are planned for, rather than being an afterthought that forces them to skip.
- **Fair incentives.** The leaderboard rewards *accurate advance responses* (which reduce over-cooking), not simply eating less. The metric is designed so a block cannot "win" by making students go without food.

### 2.3 Accountability

- Complaints and quality issues are first-class: students can flag a meal, and the warden sees them. This keeps power balanced — the people affected by the food have a documented voice.

---

## 3. UN Sustainable Development Goal (SDG) mapping

| SDG | Goal | How this project contributes |
| --- | --- | --- |
| **SDG 2 — Zero Hunger** | End hunger, ensure access to food | Surplus food is redirected to NGOs/volunteers for people in need instead of being thrown away; prediction prevents the "nothing left" scenario for students. |
| **SDG 12 — Responsible Consumption & Production** | Halve per-capita food waste (target 12.3) | The core purpose: advance opt-out + headcount prediction reduce over-cooking; leftover logging and the waste report make waste measurable and actionable. |
| **SDG 11 — Sustainable Cities & Communities** | Reduce the environmental impact of communities | Less wasted food means lower resource use (water, energy, landfill methane) per campus meal. |
| **SDG 13 — Climate Action** | Combat climate change | Food waste is a significant source of greenhouse-gas emissions; cutting mess waste directly lowers the campus's food-related emissions. |

### Primary vs. supporting

- **Primary:** SDG 12 (responsible consumption) and SDG 2 (zero hunger) — these are the project's reason for existing.
- **Supporting:** SDG 11 and SDG 13 — achieved as a consequence of reducing waste.

### Measurable indicators we can report

- Overall waste ratio (leftover ÷ cooked) trend over time — from `/api/report/waste`.
- Number of high-waste meals flagged per week.
- Portions of surplus food successfully delivered to NGOs (accepted → received).
- Advance-response rate (share of students opting in/out before cutoff).
