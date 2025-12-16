// ---------- Simple Habit Tracker (GitHub Pages + Google Sheets API) ----------

let state = {
  habits: [],
  logs: {},        // { "YYYY-MM-DD": { habitId: 0/1 } }
  weekStart: startOfWeek(new Date()) // Monday
};

const cfg = loadCfg();
initSettingsUI(cfg);

const el = {
  grid: document.getElementById("grid"),
  weekTitle: document.getElementById("weekTitle"),
  prevWeek: document.getElementById("prevWeek"),
  nextWeek: document.getElementById("nextWeek"),
  reloadBtn: document.getElementById("reloadBtn"),
  newHabit: document.getElementById("newHabit"),
  addHabitBtn: document.getElementById("addHabitBtn")
};

el.prevWeek.onclick = () => { state.weekStart = addDays(state.weekStart, -7); render(); };
el.nextWeek.onclick = () => { state.weekStart = addDays(state.weekStart, 7); render(); };
el.reloadBtn.onclick = () => loadAll();
el.addHabitBtn.onclick = () => addHabit();

if (cfg.apiUrl && cfg.token) {
  loadAll();
} else {
  renderEmpty("Open Settings and paste API URL + Token.");
}

async function loadAll() {
  const cfg = loadCfg();
  if (!cfg.apiUrl || !cfg.token) {
    renderEmpty("Missing API config. Open Settings.");
    return;
  }
  renderEmpty("Loading...");
  const url = `${cfg.apiUrl}?action=getAll&token=${encodeURIComponent(cfg.token)}`;
  const res = await fetch(url);
  const data = await res.json();

  if (!data.ok) {
    renderEmpty("API error: " + (data.error || "unknown"));
    return;
  }

  state.habits = data.habits || [];
  state.logs = data.logs || {};
  render();
}

async function addHabit() {
  const name = (el.newHabit.value || "").trim();
  if (!name) return;

  const cfg = loadCfg();
  const url = `${cfg.apiUrl}?action=addHabit&token=${encodeURIComponent(cfg.token)}`;

  el.addHabitBtn.disabled = true;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });
    const data = await res.json();
    if (!data.ok) alert("Error: " + (data.error || "unknown"));
    el.newHabit.value = "";
    await loadAll();
  } finally {
    el.addHabitBtn.disabled = false;
  }
}

async function toggle(habitId, dateISO, newVal) {
  const cfg = loadCfg();
  const url = `${cfg.apiUrl}?action=toggle&token=${encodeURIComponent(cfg.token)}`;

  // optimistic UI
  if (!state.logs[dateISO]) state.logs[dateISO] = {};
  state.logs[dateISO][habitId] = newVal ? 1 : 0;
  render();

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ habitId, date: dateISO, value: newVal ? 1 : 0 })
  });
  const data = await res.json();
  if (!data.ok) {
    alert("Save failed: " + (data.error || "unknown"));
    await loadAll();
  }
}

function render() {
  const days = [...Array(7)].map((_, i) => addDays(state.weekStart, i));
  const dayLabels = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

  const title = `${fmtDate(state.weekStart)} → ${fmtDate(days[6])}`;
  el.weekTitle.textContent = title;

  const thead = `
    <thead>
      <tr>
        <th>Habit</th>
        ${days.map((d,i)=>`<th>${dayLabels[i]}<div style="font-size:11px;color:#6b7280">${d.getDate()}</div></th>`).join("")}
      </tr>
    </thead>
  `;

  const tbodyRows = state.habits.map(h => {
    const tds = days.map(d => {
      const iso = toISO(d);
      const v = (state.logs[iso] && state.logs[iso][h.id]) ? 1 : 0;
      const cls = v ? "cell on" : "cell off";
      const symbol = v ? "✓" : "×";
      return `<td class="${cls}" data-habit="${h.id}" data-date="${iso}" data-val="${v}">${symbol}</td>`;
    }).join("");

    return `<tr><td>${escapeHtml(h.name)}</td>${tds}</tr>`;
  }).join("");

  const table = `<table>${thead}<tbody>${tbodyRows || ""}</tbody></table>`;
  el.grid.innerHTML = table;

  // click handlers
  el.grid.querySelectorAll("td.cell").forEach(td => {
    td.addEventListener("click", () => {
      const habitId = td.dataset.habit;
      const dateISO = td.dataset.date;
      const cur = Number(td.dataset.val) || 0;
      const next = cur ? 0 : 1;
      toggle(habitId, dateISO, next);
    });
  });

  if (!state.habits.length) {
    // show a hint when no habits
    el.grid.innerHTML += `<p class="hint" style="margin-top:10px">No habits yet. Add one below.</p>`;
  }
}

function renderEmpty(msg) {
  el.weekTitle.textContent = "";
  el.grid.innerHTML = `<p class="hint">${escapeHtml(msg)}</p>`;
}

/* ------------------ Settings UI ------------------ */
function initSettingsUI(cfg){
  const apiUrl = document.getElementById("apiUrl");
  const apiToken = document.getElementById("apiToken");
  const saveCfgBtn = document.getElementById("saveCfg");
  const clearCfgBtn = document.getElementById("clearCfg");

  apiUrl.value = cfg.apiUrl || "";
  apiToken.value = cfg.token || "";

  saveCfgBtn.onclick = () => {
    const c = { apiUrl: apiUrl.value.trim(), token: apiToken.value.trim() };
    localStorage.setItem("habit_cfg", JSON.stringify(c));
    alert("Saved! Now reload.");
  };
  clearCfgBtn.onclick = () => {
    localStorage.removeItem("habit_cfg");
    apiUrl.value = "";
    apiToken.value = "";
    alert("Cleared.");
  };
}

function loadCfg(){
  try { return JSON.parse(localStorage.getItem("habit_cfg") || "{}"); }
  catch { return {}; }
}

/* ------------------ Date helpers ------------------ */
function startOfWeek(d){
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Mon=0
  x.setHours(0,0,0,0);
  x.setDate(x.getDate() - day);
  return x;
}
function addDays(d,n){
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function toISO(d){
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth()+1).padStart(2,"0");
  const da = String(x.getDate()).padStart(2,"0");
  return `${y}-${m}-${da}`;
}
function fmtDate(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

/* ------------------ Small utils ------------------ */
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}
