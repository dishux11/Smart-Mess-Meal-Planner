'use strict';
/* Front-end controller for the Smart Mess Meal Planner. Vanilla JS, no build step. */

const API = '';
let token = localStorage.getItem('mess_token') || null;
let me = null;

const $ = (id) => document.getElementById(id);
const show = (id) => { document.querySelectorAll('.view').forEach(v => v.classList.add('hidden')); $(id).classList.remove('hidden'); };

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

/* ---------------- Auth ---------------- */
async function login() {
  $('loginError').textContent = '';
  try {
    const { token: t, user } = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ email: $('email').value.trim(), password: $('password').value }),
    });
    token = t; me = user;
    localStorage.setItem('mess_token', t);
    enterApp();
  } catch (e) {
    $('loginError').textContent = e.message;
  }
}

function logout() {
  token = null; me = null; localStorage.removeItem('mess_token');
  $('userBox').classList.add('hidden');
  show('loginView');
}

async function enterApp() {
  me = await api('/api/me');
  $('userBox').classList.remove('hidden');
  $('userLabel').textContent = `${me.name} · ${me.role}`;
  if (me.role === 'student') { show('studentView'); loadStudent(); }
  else if (me.role === 'kitchen') { show('kitchenView'); loadKitchen(); }
  else if (me.role === 'warden') { show('wardenView'); loadWarden(); }
  else if (me.role === 'ngo') { show('ngoView'); loadNgo(); }
}

/* ---------------- Student ---------------- */
async function loadStudent() {
  const meals = await api('/api/meals');
  $('studentMeals').innerHTML = meals.map(mealCard).join('');
  wireStudent(meals);
  loadVotes();
  fillMarquee();
}

/* duplicate the phrase so the -50% keyframe loops seamlessly */
function fillMarquee() {
  const el = document.getElementById('mq1');
  if (!el) return;
  const phrase = 'ZERO WASTE • EAT RIGHT • SKIP SMART • FEED MORE • ';
  const line = phrase.repeat(4);
  el.innerHTML = `<span>${line}</span><span>${line}</span>`;
}

function mealCard(m) {
  const statusBadge = m.myStatus
    ? `<span class="badge ${m.myStatus}">${m.myStatus}</span>`
    : '<span class="badge closed">no response</span>';
  const lock = m.open ? '' : '<span class="badge closed">cutoff passed</span>';
  return `<div class="meal" data-id="${m.id}">
    <h3>${m.type} ${lock}</h3>
    <div class="date">${m.date} · cutoff ${new Date(m.cutoff).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>
    <div class="menu">${m.menu}</div>
    <div>${statusBadge}</div>
    <div class="row">
      <button class="pill dark eat" ${m.open ? '' : 'disabled'}>Eating</button>
      <button class="pill ghost skip" ${m.open ? '' : 'disabled'}>Skip</button>
    </div>
    <div class="feedback">
      <div class="stars" data-rating="0">
        ${[1,2,3,4,5].map(i=>`<span data-v="${i}">★</span>`).join('')}
      </div>
      <label class="inline">Comment<input class="fb-comment" placeholder="optional" /></label>
      <label class="inline" style="flex-direction:row;align-items:center;gap:6px;margin-top:6px">
        <input type="checkbox" class="fb-issue" style="width:auto"/> Report a quality issue
      </label>
      <button class="pill ghost send-fb" style="margin-top:8px">Submit rating</button>
    </div>
  </div>`;
}

function wireStudent(meals) {
  document.querySelectorAll('#studentMeals .meal').forEach((card) => {
    const id = Number(card.dataset.id);
    card.querySelector('.eat').onclick = () => respond(id, 'eating');
    card.querySelector('.skip').onclick = () => respond(id, 'skipping');
    // stars
    const stars = card.querySelector('.stars');
    stars.querySelectorAll('span').forEach((s) => {
      s.onclick = () => {
        const v = Number(s.dataset.v);
        stars.dataset.rating = v;
        stars.querySelectorAll('span').forEach((x) => x.classList.toggle('on', Number(x.dataset.v) <= v));
      };
    });
    card.querySelector('.send-fb').onclick = async () => {
      const rating = Number(stars.dataset.rating);
      if (!rating) { alert('Pick a star rating first'); return; }
      await api(`/api/meals/${id}/feedback`, {
        method: 'POST',
        body: JSON.stringify({
          rating,
          comment: card.querySelector('.fb-comment').value,
          is_issue: card.querySelector('.fb-issue').checked,
        }),
      });
      alert('Thanks for the feedback!');
    };
  });
}

async function respond(mealId, status) {
  try {
    await api(`/api/meals/${mealId}/respond`, { method: 'POST', body: JSON.stringify({ status }) });
    loadStudent();
  } catch (e) { alert(e.message); }
}

async function loadVotes() {
  const r = await api('/api/vote/results');
  $('voteResults').textContent = r.length
    ? 'Current votes: ' + r.map((x) => `${x.option} (${x.votes})`).join(', ')
    : 'No votes yet.';
}
document.addEventListener('click', async (e) => {
  if (e.target.classList.contains('vote')) {
    await api('/api/vote', { method: 'POST', body: JSON.stringify({ option: e.target.dataset.opt }) });
    loadVotes();
  }
});

/* ---------------- Kitchen ---------------- */
async function loadKitchen() {
  const preds = await api('/api/predict');
  $('predictTable').innerHTML = `<div class="tablewrap"><table>
    <tr><th>Date</th><th>Meal</th><th>Predicted</th><th>Opt-in</th><th>Opt-out</th><th>History (MA3)</th></tr>
    ${preds.map(p => `<tr>
      <td>${p.meal.date}</td><td style="text-transform:capitalize">${p.meal.type}</td>
      <td><b>${p.predicted}</b></td><td>${p.optIns}</td><td>${p.optOuts}</td>
      <td class="muted">${p.history.slice(-3).join(', ') || '—'}</td></tr>`).join('')}
  </table></div>`;

  $('consumptionForms').innerHTML = preds.map(p => `<div class="meal" data-id="${p.meal.id}">
    <h3>${p.meal.type}</h3><div class="date">${p.meal.date}</div>
    <div class="menu">Predicted: <b>${p.predicted}</b></div>
    <label class="inline">Cooked portions<input type="number" class="cooked" min="0" value="${p.predicted + 10}"/></label>
    <label class="inline">Actually eaten<input type="number" class="eaten" min="0" value="${p.predicted}"/></label>
    <button class="pill dark log" style="margin-top:10px">Log consumption</button>
  </div>`).join('');

  document.querySelectorAll('#consumptionForms .meal').forEach((card) => {
    card.querySelector('.log').onclick = async () => {
      const id = Number(card.dataset.id);
      const cooked = Number(card.querySelector('.cooked').value);
      const actual_eaten = Number(card.querySelector('.eaten').value);
      try {
        const r = await api(`/api/meals/${id}/consumption`, {
          method: 'POST', body: JSON.stringify({ cooked, actual_eaten }),
        });
        $('kitchenMsg').innerHTML = `Logged. Leftover: <b>${r.leftover}</b> · Waste ratio ${(r.wasteRatio*100).toFixed(0)}% ${r.highWaste ? '<span class="badge warn">HIGH WASTE</span>' : ''} ${r.surplus ? '· NGO surplus alert created' : ''}`;
      } catch (e) { $('kitchenMsg').textContent = e.message; }
    };
  });
}

/* ---------------- Warden ---------------- */
async function loadWarden() {
  const rep = await api('/api/report/waste');
  const s = rep.summary;
  $('wasteSummary').innerHTML = `
    <div class="stat"><div class="n">${s.totalCooked}</div><div class="l">Cooked</div></div>
    <div class="stat"><div class="n">${s.totalLeftover}</div><div class="l">Leftover</div></div>
    <div class="stat"><div class="n">${(s.overallWasteRatio*100).toFixed(0)}%</div><div class="l">Waste ratio</div></div>
    <div class="stat"><div class="n">${s.highWasteDays}</div><div class="l">High-waste meals</div></div>`;
  $('wasteTable').innerHTML = `<div class="tablewrap"><table>
    <tr><th>Date</th><th>Meal</th><th>Cooked</th><th>Eaten</th><th>Leftover</th><th>Waste</th></tr>
    ${rep.rows.map(r => `<tr>
      <td>${r.date}</td><td style="text-transform:capitalize">${r.type}</td>
      <td>${r.cooked}</td><td>${r.actual_eaten}</td><td>${r.leftover}</td>
      <td class="${r.highWaste ? 'hw' : ''}">${(r.wasteRatio*100).toFixed(0)}%</td></tr>`).join('')}
  </table></div>`;

  const lb = await api('/api/leaderboard');
  $('leaderboard').innerHTML = `<div class="tablewrap"><table>
    <tr><th>Rank</th><th>Block</th><th>Responses</th><th>Opt-outs</th><th>Opt-out rate</th></tr>
    ${lb.map(r => `<tr><td>#${r.rank}</td><td>${r.block}</td><td>${r.responses}</td><td>${r.skips}</td><td>${(r.skipRate*100).toFixed(0)}%</td></tr>`).join('')}
  </table></div>`;

  const fb = await api('/api/feedback');
  $('feedbackList').innerHTML = fb.length ? `<div class="tablewrap"><table>
    <tr><th>Date</th><th>Meal</th><th>By</th><th>Rating</th><th>Comment</th><th>Issue?</th></tr>
    ${fb.map(f => `<tr><td>${f.date}</td><td style="text-transform:capitalize">${f.type}</td>
      <td>${f.user_name}</td><td>${'★'.repeat(f.rating)}</td><td>${f.comment||''}</td>
      <td>${f.is_issue ? '<span class="badge warn">issue</span>' : ''}</td></tr>`).join('')}
  </table></div>` : '<p class="muted">No feedback yet.</p>';
}

/* ---------------- NGO ---------------- */
async function loadNgo() {
  const list = await api('/api/surplus');
  $('surplusList').innerHTML = list.length ? list.map(s => `<div class="meal" data-id="${s.id}">
    <h3>${s.type} surplus</h3><div class="date">${s.date}</div>
    <div class="menu">${s.menu}</div>
    <div><b>${s.portions}</b> portions · <span class="badge ${s.status==='available'?'eating':s.status==='accepted'?'warn':'closed'}">${s.status}</span></div>
    <div class="row">
      <button class="pill dark accept" ${s.status!=='available'?'disabled':''}>Accept pickup</button>
      <button class="pill ghost confirm" ${s.status!=='accepted'?'disabled':''}>Confirm received</button>
    </div>
  </div>`).join('') : '<p class="muted">No surplus alerts right now.</p>';

  document.querySelectorAll('#surplusList .meal').forEach((card) => {
    const id = Number(card.dataset.id);
    card.querySelector('.accept').onclick = async () => { try { await api(`/api/surplus/${id}/accept`, {method:'POST'}); loadNgo(); } catch(e){ alert(e.message);} };
    card.querySelector('.confirm').onclick = async () => { try { await api(`/api/surplus/${id}/confirm`, {method:'POST'}); loadNgo(); } catch(e){ alert(e.message);} };
  });
}

/* ---------------- Boot ---------------- */
$('loginBtn').onclick = login;
$('logoutBtn').onclick = logout;
$('password').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
if (token) enterApp().catch(() => logout()); else show('loginView');
