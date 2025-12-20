const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwXUhVIlUnNcwGbAAGIrn_fi86biNOzRdgXnP9ArxTZk2PEAVcTnvviCaMXC8hAN05K5g/exec"; 
const TOKEN = "aleLifeTracker_1999";

// State
let appData = { habits: [], habitLogs: [], settings: [], healthLogs: [] };
let currentTheme = localStorage.getItem('theme') || '#0a84ff';
let currentHabitId = null; // For modal

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    applyTheme(currentTheme); // Apply immediately
    fetchData();
});

async function fetchData() {
    try {
        const resp = await fetch(`${SCRIPT_URL}?token=${TOKEN}&action=getAll`);
        const data = await resp.json();
        appData = data;
        
        // Sync Theme if exists in DB
        const savedTheme = data.settings.find(s => s[0] === 'theme');
        if (savedTheme) {
            applyTheme(savedTheme[1]);
        }
        
        renderHabitDashboard();
    } catch (e) {
        console.error(e);
        document.getElementById('habits-list').innerText = "Error loading data.";
    }
}

// --- THEME ENGINE ---
function setTheme(color) {
    applyTheme(color);
    // Save to Local
    localStorage.setItem('theme', color);
    // Save to Cloud
    sendData({ action: 'saveSetting', key: 'theme', value: color });
}

function applyTheme(color) {
    currentTheme = color;
    document.documentElement.style.setProperty('--accent-color', color);
}

// --- ROUTING ---
function router(viewId) {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('overlay').style.display = 'none';
    
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active-view'));
    document.getElementById(viewId + '-view').classList.add('active-view');
    
    document.getElementById('page-title').innerText = viewId.charAt(0).toUpperCase() + viewId.slice(1);
    
    // Header Actions
    const actionArea = document.getElementById('header-action');
    actionArea.innerHTML = '';
    
    if (viewId === 'habits') {
        const addBtn = document.createElement('button');
        addBtn.innerText = "+";
        addBtn.style.fontSize = "24px";
        addBtn.onclick = () => document.getElementById('add-habit-modal').style.display = 'block';
        actionArea.appendChild(addBtn);
    }
}

function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    const open = sb.classList.contains('open');
    sb.classList.toggle('open');
    document.getElementById('overlay').style.display = open ? 'none' : 'block';
}

// --- HABIT DASHBOARD ---
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
    const days = getRecentDays(5); // Last 5 days
    
    // Header
    header.innerHTML = '<div></div>' + days.map(d => `
        <div>
            <div class="day-name">${d.toLocaleDateString('en-US', {weekday:'short'})}</div>
            <div class="day-num">${d.getDate()}</div>
        </div>
    `).join('');

    // List
    list.innerHTML = appData.habits.map(h => {
        const [id, name, freq, target] = h;
        return `
        <div class="habit-row">
            <div class="habit-label" onclick="openHabitDetail('${id}')">${name}</div>
            ${days.map(d => {
                const dateStr = d.toISOString().split('T')[0];
                const checked = checkStatus(id, dateStr);
                return `<div class="cell ${checked ? 'checked' : ''}" 
                        onclick="toggleHabit('${id}', '${dateStr}', this)">
                        ${checked ? '✔' : ''}
                        </div>`;
            }).join('')}
        </div>`;
    }).join('');
}

function checkStatus(id, dateStr) {
    return appData.habitLogs.some(l => l[0] == id && String(l[1]).startsWith(dateStr));
}

async function toggleHabit(id, date, el) {
    // Optimistic UI
    const isChecked = el.classList.contains('checked');
    el.classList.toggle('checked');
    el.innerText = isChecked ? '' : '✔';
    
    // Sync
    await sendData({ action: 'toggleHabit', habitId: id, date: date });
    
    // Update data locally to reflect change without full reload
    if(isChecked) {
        appData.habitLogs = appData.habitLogs.filter(l => !(l[0] == id && String(l[1]).startsWith(date)));
    } else {
        appData.habitLogs.push([id, date, 1]);
    }
    // If modal is open, refresh stats
    if(document.getElementById('habit-detail-modal').style.display === 'block') {
        renderHabitStats(id);
        renderCalendar(id);
    }
}

async function handleAddHabit() {
    const name = document.getElementById('newHabitName').value;
    if(!name) return;
    const id = Date.now().toString();
    const freq = document.getElementById('newHabitFreq').value;
    const target = document.getElementById('newHabitTarget').value;
    
    await sendData({ action: 'addHabit', id, name, frequency: freq, target });
    document.getElementById('add-habit-modal').style.display='none';
    fetchData(); // Reload
}

// --- HABIT DETAIL (BEAVER STYLE) ---
function openHabitDetail(id) {
    currentHabitId = id;
    const habit = appData.habits.find(h => h[0] == id);
    if(!habit) return;
    
    document.getElementById('modal-habit-title').innerText = habit[1];
    document.getElementById('habit-detail-modal').style.display = 'block';
    
    // Setup Edit Form
    document.getElementById('edit-freq').value = habit[2] || 'Daily';
    document.getElementById('edit-target').value = habit[3] || 1;
    document.getElementById('habit-edit-form').style.display = 'none';

    renderHabitStats(id);
    renderCalendar(id);
    renderHeatmap(id);
}

function closeHabitModal() {
    document.getElementById('habit-detail-modal').style.display = 'none';
    renderHabitDashboard(); // Refresh main view just in case
}

function renderHabitStats(id) {
    // Logic for Streaks and Completion
    const logs = appData.habitLogs.filter(l => l[0] == id).map(l => l[1].substring(0,10)).sort();
    
    // 1. Total
    document.getElementById('stat-total').innerText = logs.length;
    
    // 2. Streak (Simple daily logic)
    let streak = 0;
    const today = new Date().toISOString().split('T')[0];
    let checkDate = new Date();
    
    // Check if today or yesterday is logged to start streak
    if (logs.includes(today)) streak = 1;
    
    // Iterate backwards
    while(true) {
        checkDate.setDate(checkDate.getDate() - 1);
        const dateStr = checkDate.toISOString().split('T')[0];
        if (logs.includes(dateStr)) {
            streak++;
        } else if (dateStr !== today) { // If it's not today (which we already checked), break
            break;
        }
    }
    document.getElementById('stat-streak').innerText = streak;
    
    // 3. Rate (Last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentLogs = logs.filter(d => new Date(d) >= thirtyDaysAgo);
    const rate = Math.round((recentLogs.length / 30) * 100);
    document.getElementById('stat-rate').innerText = rate + "%";
}

function renderCalendar(id) {
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';
    
    const now = new Date();
    // Headers (S M T W T F S)
    const days = ['S','M','T','W','T','F','S'];
    days.forEach(d => grid.innerHTML += `<div style="font-size:10px; color:#888">${d}</div>`);
    
    // Get First day of current month
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Empty slots
    for(let i=0; i<firstDay; i++) {
        grid.innerHTML += '<div></div>';
    }
    
    // Days
    for(let i=1; i<=daysInMonth; i++) {
        const dateStr = new Date(year, month, i).toISOString().split('T')[0]; // Format with timezone care needed in prod, simplified here
        // Safe formatting for local comparison:
        const checkDate = new Date(year, month, i);
        const isoDate = new Date(checkDate.getTime() - (checkDate.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

        const isChecked = checkStatus(id, isoDate);
        const isToday = i === now.getDate();
        
        grid.innerHTML += `<div class="cal-day ${isChecked?'active':''} ${isToday?'today':''}">${i}</div>`;
    }
}

function renderHeatmap(id) {
    // Simplified 3-month grid (approx 90 days)
    const grid = document.getElementById('heatmap-grid');
    grid.innerHTML = '';
    
    const today = new Date();
    for(let i=90; i>=0; i--) {
        const d = new Date();
        d.setDate(today.getDate() - i);
        const isoDate = d.toISOString().split('T')[0];
        const isChecked = checkStatus(id, isoDate);
        
        grid.innerHTML += `<div class="heat-box ${isChecked?'filled':''}" title="${isoDate}"></div>`;
    }
}

// --- EDIT HABIT ---
function toggleEditHabit() {
    const form = document.getElementById('habit-edit-form');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

async function saveHabitConfig() {
    const freq = document.getElementById('edit-freq').value;
    const target = document.getElementById('edit-target').value;
    
    await sendData({
        action: 'updateHabit',
        id: currentHabitId,
        frequency: freq,
        target: target
    });
    alert("Saved");
    toggleEditHabit();
    fetchData();
}

// --- GENERIC SEND ---
async function sendData(payload) {
    payload.token = TOKEN;
    return await fetch(SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        body: JSON.stringify(payload)
    });
}
