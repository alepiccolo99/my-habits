const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbybQvYzPIvCXhzIUZY3mXbeFx9VNjTekj4yjXIjsn69lZJ-SrqAfSJ17nllZHVCd1nvnQ/exec"; 
const TOKEN = "aleLifeTracker_1999";

let appData = { habits: [], habitLogs: [], healthMetrics: [], healthLogs: [], settings: [] };
let currentTheme = localStorage.getItem('theme') || '#0a84ff';
let currentHabitId = null; 
let currentHealthId = null;
let calendarOffsetDate = new Date(); 

document.addEventListener('DOMContentLoaded', () => {
    applyTheme(currentTheme); 
    fetchData();
});

async function fetchData() {
    const loader = document.getElementById('loading-overlay');
    try {
        const resp = await fetch(`${SCRIPT_URL}?token=${TOKEN}&action=getAll`);
        const data = await resp.json();
        appData = data;
        
        const savedTheme = data.settings.find(s => s[0] === 'theme');
        if (savedTheme && savedTheme[1] && savedTheme[1] !== currentTheme) {
            applyTheme(savedTheme[1]);
            const picker = document.getElementById('themeColorPicker');
            if(picker) picker.value = savedTheme[1];
        }
        
        router('habits');
    } catch (e) {
        console.error("Fetch Error:", e);
    } finally {
        if(loader) loader.style.display = 'none';
    }
}

// --- ROUTING ---
function router(viewId) {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('overlay').style.display = 'none';
    
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active-view'));
    const target = document.getElementById(viewId + '-view');
    if(target) target.classList.add('active-view');
    
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById('nav-' + viewId);
    if(activeBtn) activeBtn.classList.add('active');
    
    document.getElementById('page-title').innerText = viewId.charAt(0).toUpperCase() + viewId.slice(1);
    const actionArea = document.getElementById('header-action');
    actionArea.innerHTML = '';
    
    if (viewId === 'habits') {
        createAddButton(actionArea, openAddHabitModal);
        renderHabitDashboard();
    } else if (viewId === 'health') {
        createAddButton(actionArea, openAddHealthModal);
        renderHealthDashboard();
    }
}

function createAddButton(container, onClickFn) {
    const addBtn = document.createElement('button');
    addBtn.innerHTML = "Add"; 
    addBtn.className = "btn-secondary"; 
    addBtn.onclick = onClickFn;
    container.appendChild(addBtn);
}

function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    const open = sb.classList.contains('open');
    sb.classList.toggle('open');
    document.getElementById('overlay').style.display = open ? 'none' : 'block';
}

// --- HABITS DASHBOARD & LOGIC (Condensed for brevity, kept full functionality) ---
function getRecentDays(n) {
    const dates = [];
    for(let i=0; i<n; i++) {
        const d = new Date();
        d.setDate(d.getDate() - (n-1) + i);
        dates.push(d);
    }
    return dates;
}

function renderHabitDashboard() {
    const list = document.getElementById('habits-list');
    const header = document.getElementById('week-header');
    
    const validHabits = (appData.habits || []).filter(h => h[0] && h[1] && h[4] !== true);
    if (validHabits.length === 0) {
        list.innerHTML = `<div style="text-align:center; color:#555; margin-top:30px;">Tap "Add" to start tracking.</div>`;
        header.innerHTML = ''; return;
    }

    const days = getRecentDays(5);
    const todayStr = new Date().toDateString(); 
    
    header.innerHTML = '<div></div>' + days.map(d => {
        const isToday = d.toDateString() === todayStr;
        return `<div class="day-wrapper-header ${isToday ? 'current' : ''}"><div class="day-name">${d.toLocaleDateString('en-US', {weekday:'short'})}</div><div class="day-num">${d.getDate()}</div></div>`;
    }).join('');

    list.innerHTML = validHabits.map(h => {
        const [id, name] = h;
        return `<div class="habit-row">
            <div class="habit-label" onclick="openHabitDetail('${id}')">${name}</div>
            ${days.map(d => {
                const dateStr = d.toISOString().split('T')[0];
                const checked = appData.habitLogs.some(l => String(l[0]) === String(id) && String(l[1]).startsWith(dateStr));
                const symbol = checked ? '✔' : '✕';
                return `<div class="cell ${checked ? 'checked' : ''}" onclick="toggleHabit('${id}', '${dateStr}', this)">${symbol}</div>`;
            }).join('')}
        </div>`;
    }).join('');
}

async function toggleHabit(id, date, el) {
    const isChecked = el.classList.contains('checked');
    el.classList.toggle('checked');
    el.innerText = isChecked ? '✕' : '✔';
    await sendData({ action: 'toggleHabit', habitId: id, date: date });
    if(isChecked) appData.habitLogs = appData.habitLogs.filter(l => !(String(l[0]) === String(id) && String(l[1]).startsWith(date)));
    else appData.habitLogs.push([id, date, 1]);
    if(document.getElementById('habit-detail-modal').style.display === 'block') { renderHabitStats(id); renderCalendar(id); renderHeatmap(id); }
}

// --- HEALTH DASHBOARD & LOGIC ---

function renderHealthDashboard() {
    const list = document.getElementById('health-list');
    const header = document.getElementById('health-week-header');
    
    // HealthMetrics structure: id, name, unit, goal, archived
    const validMetrics = (appData.healthMetrics || []).filter(m => m[0] && m[1] && m[4] !== true);

    if (validMetrics.length === 0) {
        list.innerHTML = `<div style="text-align:center; color:#555; margin-top:30px;">Tap "Add" to start tracking health.</div>`;
        header.innerHTML = ''; return;
    }

    const days = getRecentDays(5);
    const todayStr = new Date().toDateString();

    header.innerHTML = '<div></div>' + days.map(d => {
        const isToday = d.toDateString() === todayStr;
        return `<div class="day-wrapper-header ${isToday ? 'current' : ''}"><div class="day-name">${d.toLocaleDateString('en-US', {weekday:'short'})}</div><div class="day-num">${d.getDate()}</div></div>`;
    }).join('');

    list.innerHTML = validMetrics.map(m => {
        const [id, name, unit] = m;
        return `<div class="habit-row">
            <div class="habit-label" onclick="openHealthDetail('${id}')">${name} <span style="font-size:12px; color:#666; margin-left:5px"> ${unit || ''}</span></div>
            ${days.map(d => {
                const dateStr = d.toISOString().split('T')[0];
                const val = getHealthValue(id, dateStr);
                const displayVal = val !== null ? val : '·';
                const isEmpty = val === null;
                return `<div class="cell cell-value ${isEmpty?'empty':''}" onclick="promptLogHealth('${id}', '${dateStr}')">${displayVal}</div>`;
            }).join('')}
        </div>`;
    }).join('');
}

function getHealthValue(metricId, dateStr) {
    // HealthLogs: Date, MetricID, Value
    const log = appData.healthLogs.find(l => String(l[1]) === String(metricId) && String(l[0]).startsWith(dateStr));
    return log ? log[2] : null;
}

async function promptLogHealth(id, dateStr) {
    const currentVal = getHealthValue(id, dateStr) || "";
    const newVal = prompt(`Enter value for ${dateStr}:`, currentVal);
    
    if (newVal !== null && newVal.trim() !== "") {
        const numVal = parseFloat(newVal);
        // Optimistic update
        let logIndex = appData.healthLogs.findIndex(l => String(l[1]) === String(id) && String(l[0]).startsWith(dateStr));
        if (logIndex > -1) {
            appData.healthLogs[logIndex][2] = numVal;
        } else {
            appData.healthLogs.push([dateStr, id, numVal, ""]);
        }
        renderHealthDashboard();
        
        await sendData({ action: 'logHealth', metricId: id, date: dateStr, value: numVal });
    }
}

// --- HEALTH DETAIL & CHART ---

function openHealthDetail(id) {
    currentHealthId = id;
    const metric = appData.healthMetrics.find(m => String(m[0]) === String(id));
    if(!metric) return;
    
    document.getElementById('modal-health-title').innerText = metric[1];
    document.getElementById('health-detail-modal').style.display = 'block';
    
    document.getElementById('edit-health-name').value = metric[1];
    document.getElementById('edit-health-unit').value = metric[2] || '';
    document.getElementById('edit-health-goal').value = metric[3] || '';
    document.getElementById('health-edit-form').style.display = 'none';

    renderHealthStats(id);
    renderHealthChart(id);
}

function closeHealthModal() {
    document.getElementById('health-detail-modal').style.display = 'none';
    renderHealthDashboard();
}

function toggleEditHealth() {
    const form = document.getElementById('health-edit-form');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

function renderHealthStats(id) {
    // Filter logs for this metric
    const logs = appData.healthLogs.filter(l => String(l[1]) === String(id)).map(l => parseFloat(l[2]));
    
    let avg = 0, min = 0, max = 0;
    if(logs.length > 0) {
        min = Math.min(...logs);
        max = Math.max(...logs);
        const sum = logs.reduce((a, b) => a + b, 0);
        avg = (sum / logs.length).toFixed(1);
    }
    
    document.getElementById('health-avg').innerText = avg;
    document.getElementById('health-min').innerText = min;
    document.getElementById('health-max').innerText = max;
}

function renderHealthChart(id) {
    if(!id) id = currentHealthId;
    const container = document.getElementById('health-chart-container');
    const range = document.getElementById('chart-range-select').value;
    const metric = appData.healthMetrics.find(m => String(m[0]) === String(id));
    const goal = metric[3] ? parseFloat(metric[3]) : null;

    // Filter Data by Time Range
    let cutoff = new Date();
    if (range === 'week') cutoff.setDate(cutoff.getDate() - 7);
    else if (range === 'month') cutoff.setDate(cutoff.getDate() - 30);
    else if (range === 'year') cutoff.setFullYear(cutoff.getFullYear() - 1);
    else cutoff = new Date('2000-01-01');

    const dataPoints = appData.healthLogs
        .filter(l => String(l[1]) === String(id))
        .map(l => ({ date: new Date(l[0]), val: parseFloat(l[2]) }))
        .filter(d => d.date >= cutoff)
        .sort((a,b) => a.date - b.date);

    if (dataPoints.length < 2) {
        container.innerHTML = '<div style="display:flex;height:100%;align-items:center;justify-content:center;color:#666">Not enough data to chart</div>';
        return;
    }

    // Determine Min/Max for Y-Axis
    let yMin = Math.min(...dataPoints.map(d => d.val));
    let yMax = Math.max(...dataPoints.map(d => d.val));
    if (goal) {
        yMin = Math.min(yMin, goal);
        yMax = Math.max(yMax, goal);
    }
    // Add padding
    const padding = (yMax - yMin) * 0.1;
    yMin -= padding; if(yMin < 0) yMin = 0;
    yMax += padding;

    // SVG Dimensions
    const w = container.offsetWidth;
    const h = container.offsetHeight;
    const xPad = 30; // Left padding for axis text
    const yPad = 20; // Bottom padding

    // Scale Functions
    const getX = (date) => xPad + ((date - dataPoints[0].date) / (dataPoints[dataPoints.length-1].date - dataPoints[0].date)) * (w - xPad - 10);
    const getY = (val) => h - yPad - ((val - yMin) / (yMax - yMin)) * (h - yPad - 10);

    // Build Line Path
    let dPath = `M ${getX(dataPoints[0].date)} ${getY(dataPoints[0].val)}`;
    dataPoints.slice(1).forEach(p => {
        dPath += ` L ${getX(p.date)} ${getY(p.val)}`;
    });

    let svg = `<svg viewBox="0 0 ${w} ${h}">`;
    
    // Draw Goal Line
    if (goal) {
        const yGoal = getY(goal);
        svg += `<line x1="${xPad}" y1="${yGoal}" x2="${w}" y2="${yGoal}" class="chart-goal-line" />`;
        svg += `<text x="${w-5}" y="${yGoal-5}" text-anchor="end" class="chart-text">Goal: ${goal}</text>`;
    }

    // Draw Data Line
    svg += `<path d="${dPath}" class="chart-line" />`;

    // Draw Axis Labels (Start/End Date & Min/Max Val)
    svg += `<text x="${xPad}" y="${h-5}" class="chart-text">${dataPoints[0].date.toLocaleDateString(undefined, {month:'short', day:'numeric'})}</text>`;
    svg += `<text x="${w-30}" y="${h-5}" class="chart-text">${dataPoints[dataPoints.length-1].date.toLocaleDateString(undefined, {month:'short', day:'numeric'})}</text>`;
    svg += `<text x="0" y="${getY(yMax)+5}" class="chart-text">${Math.round(yMax)}</text>`;
    svg += `<text x="0" y="${getY(yMin)}" class="chart-text">${Math.round(yMin)}</text>`;

    svg += `</svg>`;
    container.innerHTML = svg;
}

// --- ADD/UPDATE/DELETE HEALTH ---

function openAddHealthModal() {
    document.getElementById('newHealthName').value = "";
    document.getElementById('newHealthUnit').value = "";
    document.getElementById('newHealthGoal').value = "";
    document.getElementById('add-health-modal').style.display = 'block';
}

async function handleAddHealth() {
    const name = document.getElementById('newHealthName').value;
    if(!name) return;
    const id = Date.now().toString();
    const unit = document.getElementById('newHealthUnit').value;
    const goal = document.getElementById('newHealthGoal').value;
    
    await sendData({ action: 'addHealthMetric', id, name, unit, goal });
    
    appData.healthMetrics.push([id, name, unit, goal, false]);
    document.getElementById('add-health-modal').style.display='none';
    renderHealthDashboard();
}

async function saveHealthConfig() {
    const name = document.getElementById('edit-health-name').value;
    const unit = document.getElementById('edit-health-unit').value;
    const goal = document.getElementById('edit-health-goal').value;
    
    await sendData({ action: 'updateHealthMetric', id: currentHealthId, name, unit, goal });
    
    const idx = appData.healthMetrics.findIndex(m => String(m[0]) === String(currentHealthId));
    if(idx > -1) {
        appData.healthMetrics[idx][1] = name;
        appData.healthMetrics[idx][2] = unit;
        appData.healthMetrics[idx][3] = goal;
    }
    toggleEditHealth();
    openHealthDetail(currentHealthId);
}

async function deleteCurrentHealth() {
    if(!confirm("Archive this metric?")) return;
    await sendData({ action: 'deleteHealthMetric', id: currentHealthId });
    const idx = appData.healthMetrics.findIndex(m => String(m[0]) === String(currentHealthId));
    if(idx > -1) appData.healthMetrics[idx][4] = true;
    closeHealthModal();
}

// --- SHARED HELPERS ---

function openAddHabitModal() {
    document.getElementById('newHabitName').value = "";
    document.getElementById('add-habit-modal').style.display = 'block';
}

async function handleAddHabit() {
    const name = document.getElementById('newHabitName').value;
    if(!name) return;
    const id = Date.now().toString();
    const freq = document.getElementById('newHabitFreq').value;
    const target = document.getElementById('newHabitTarget').value;
    await sendData({ action: 'addHabit', id, name, frequency: freq, target });
    appData.habits.push([id, name, freq, target, false]);
    document.getElementById('add-habit-modal').style.display='none';
    renderHabitDashboard();
}

// --- HABIT DETAIL HELPERS (Kept for completeness) ---
function openHabitDetail(id) {
    currentHabitId = id;
    const habit = appData.habits.find(h => String(h[0]) === String(id));
    if(!habit) return;
    calendarOffsetDate = new Date();
    document.getElementById('modal-habit-title').innerText = habit[1];
    document.getElementById('habit-detail-modal').style.display = 'block';
    document.getElementById('edit-name').value = habit[1];
    document.getElementById('edit-freq').value = habit[2] || 'Daily';
    document.getElementById('edit-target').value = habit[3] || 1;
    document.getElementById('habit-edit-form').style.display = 'none';
    renderHabitStats(id); renderCalendar(id); renderHeatmap(id);
}
function closeHabitModal() { document.getElementById('habit-detail-modal').style.display = 'none'; renderHabitDashboard(); }
function toggleEditHabit() { const form = document.getElementById('habit-edit-form'); form.style.display = form.style.display === 'none' ? 'block' : 'none'; }
async function saveHabitConfig() {
    const name = document.getElementById('edit-name').value;
    const freq = document.getElementById('edit-freq').value;
    const target = document.getElementById('edit-target').value;
    await sendData({ action: 'updateHabit', id: currentHabitId, name, frequency: freq, target });
    const habitIdx = appData.habits.findIndex(h => String(h[0]) === String(currentHabitId));
    if(habitIdx > -1) { appData.habits[habitIdx][1] = name; appData.habits[habitIdx][2] = freq; appData.habits[habitIdx][3] = target; }
    toggleEditHabit(); openHabitDetail(currentHabitId);
}
async function deleteCurrentHabit() {
    if(!confirm("Archive this habit?")) return;
    await sendData({ action: 'deleteHabit', id: currentHabitId });
    const habitIdx = appData.habits.findIndex(h => String(h[0]) === String(currentHabitId));
    if(habitIdx > -1) { appData.habits[habitIdx][4] = true; }
    closeHabitModal();
}
function renderHabitStats(id) {
    const logs = appData.habitLogs.filter(l => String(l[0]) === String(id)).map(l => String(l[1]).substring(0,10)).sort();
    document.getElementById('stat-total').innerText = logs.length;
    let streak = 0; const today = new Date().toISOString().split('T')[0]; let checkDate = new Date();
    if (logs.includes(today)) streak = 1;
    let loopLimit = 365; while(loopLimit > 0) { checkDate.setDate(checkDate.getDate() - 1); const dateStr = checkDate.toISOString().split('T')[0]; if (logs.includes(dateStr)) streak++; else if (dateStr !== today) break; loopLimit--; }
    document.getElementById('stat-streak').innerText = streak;
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentLogs = logs.filter(d => new Date(d) >= thirtyDaysAgo);
    const rate = Math.round((recentLogs.length / 30) * 100);
    document.getElementById('stat-rate').innerText = rate + "%";
}
function changeCalendarMonth(delta) { calendarOffsetDate.setMonth(calendarOffsetDate.getMonth() + delta); renderCalendar(currentHabitId); }
function renderCalendar(id) {
    const grid = document.getElementById('calendar-grid'); grid.innerHTML = ''; const displayDate = new Date(calendarOffsetDate);
    const days = ['M','T','W','T','F','S','S']; days.forEach(d => grid.innerHTML += `<div style="font-size:10px; color:#888">${d}</div>`);
    document.getElementById('cal-month-name').innerText = displayDate.toLocaleDateString('en-US', {month: 'long', year: 'numeric'});
    const year = displayDate.getFullYear(); const month = displayDate.getMonth();
    let firstDayIndex = new Date(year, month, 1).getDay(); firstDayIndex = (firstDayIndex === 0) ? 6 : firstDayIndex - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for(let i=0; i<firstDayIndex; i++) grid.innerHTML += '<div></div>';
    const now = new Date(); const isCurrentMonth = (now.getFullYear() === year && now.getMonth() === month);
    for(let i=1; i<=daysInMonth; i++) {
        const dStr = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        const isChecked = appData.habitLogs.some(l => String(l[0]) === String(id) && String(l[1]).startsWith(dStr));
        const isToday = isCurrentMonth && (i === now.getDate());
        grid.innerHTML += `<div class="cal-day ${isChecked?'active':''} ${isToday?'today':''}">${i}</div>`;
    }
}
function renderHeatmap(id) {
    if(!id) id = currentHabitId;
    const mode = document.getElementById('heatmap-select').value;
    const grid = document.getElementById('heatmap-grid'); grid.innerHTML = '';
    const today = new Date(); let startDate = new Date();
    if (mode === '3months') { startDate.setMonth(today.getMonth() - 2); startDate.setDate(1); }
    else if (mode === 'year') { startDate.setFullYear(today.getFullYear() - 1); }
    else if (mode === 'all') { startDate = new Date('2025-01-01'); }
    const diffTime = Math.abs(today - startDate); const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    for(let i=0; i<=diffDays; i++) {
        const d = new Date(startDate); d.setDate(startDate.getDate() + i); if (d > today) break;
        const dateStr = d.toISOString().split('T')[0];
        const isChecked = appData.habitLogs.some(l => String(l[0]) === String(id) && String(l[1]).startsWith(dateStr));
        grid.innerHTML += `<div class="heat-box ${isChecked?'filled':''}" title="${dateStr}"></div>`;
    }
}

// --- THEME ---
function updateThemeFromPicker(color) { applyTheme(color); localStorage.setItem('theme', color); sendData({ action: 'saveSetting', key: 'theme', value: color }); }
function applyTheme(color) {
    currentTheme = color; document.documentElement.style.setProperty('--accent-color', color);
    if(color.startsWith('#') && color.length === 7) {
        const r = parseInt(color.substr(1,2), 16); const g = parseInt(color.substr(3,2), 16); const b = parseInt(color.substr(5,2), 16);
        document.documentElement.style.setProperty('--accent-color-bg', `rgba(${r}, ${g}, ${b}, 0.2)`);
    }
    const previewBox = document.getElementById('color-preview-box'); if(previewBox) previewBox.style.backgroundColor = color;
}
async function sendData(payload) { payload.token = TOKEN; return await fetch(SCRIPT_URL, { method: "POST", mode: "no-cors", body: JSON.stringify(payload) }); }
