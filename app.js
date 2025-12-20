const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwB49dnXc5wFyia7NTXHfgt0LJm6LX_nZWgssc_yEiY5UO6XtYoB71iUq06MxZ6QprvZA/exec"; 
const TOKEN = "aleLifeTracker_1999";

let appData = { habits: [], habitLogs: [], settings: [] };
let currentTheme = localStorage.getItem('theme') || '#0a84ff';
let currentHabitId = null; 

document.addEventListener('DOMContentLoaded', () => {
    applyTheme(currentTheme);
    fetchData();
});

async function fetchData() {
    try {
        const resp = await fetch(`${SCRIPT_URL}?token=${TOKEN}&action=getAll`);
        const data = await resp.json();
        appData = data;
        
        const savedTheme = data.settings.find(s => s[0] === 'theme');
        if (savedTheme) {
            applyTheme(savedTheme[1]);
            document.getElementById('themeColorPicker').value = savedTheme[1];
        }
        
        // Load default view
        router('habits');
    } catch (e) {
        console.error(e);
        document.getElementById('habits-list').innerText = "Loading failed.";
    }
}

// --- THEME ---
function updateThemeFromPicker(color) {
    setTheme(color);
}

function setTheme(color) {
    applyTheme(color);
    localStorage.setItem('theme', color);
    sendData({ action: 'saveSetting', key: 'theme', value: color });
}

function applyTheme(color) {
    currentTheme = color;
    document.documentElement.style.setProperty('--accent-color', color);
}

// --- ROUTING & NAVIGATION FIX ---
function router(viewId) {
    // 1. Close Sidebar / Overlay
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('overlay').style.display = 'none';
    
    // 2. Switch Views (Hide all, show target)
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active-view'));
    const target = document.getElementById(viewId + '-view');
    if(target) target.classList.add('active-view');
    
    // 3. FIX: Sidebar Active State
    // Remove 'active' from ALL sidebar buttons
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    
    // Add 'active' ONLY to the current button (using the ID we added in HTML)
    const activeBtn = document.getElementById('nav-' + viewId);
    if(activeBtn) {
        activeBtn.classList.add('active');
    }
    
    // 4. Update Header
    document.getElementById('page-title').innerText = viewId.charAt(0).toUpperCase() + viewId.slice(1);
    const actionArea = document.getElementById('header-action');
    actionArea.innerHTML = '';
    
    // Header Actions (Habits only)
    if (viewId === 'habits') {
        const addBtn = document.createElement('button');
        addBtn.innerHTML = "+"; 
        addBtn.className = "btn-secondary btn-header-add"; 
        addBtn.onclick = () => document.getElementById('add-habit-modal').style.display = 'block';
        actionArea.appendChild(addBtn);
        renderHabitDashboard();
    }
}

function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    const open = sb.classList.contains('open');
    sb.classList.toggle('open');
    document.getElementById('overlay').style.display = open ? 'none' : 'block';
}

// --- HABITS DASHBOARD ---
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
    const days = getRecentDays(5);
    const todayStr = new Date().toDateString(); 
    
    header.innerHTML = '<div></div>' + days.map(d => `
        <div>
            <div class="day-name">${d.toLocaleDateString('en-US', {weekday:'short'})}</div>
            <div class="day-num">${d.getDate()}</div>
        </div>
    `).join('');

    list.innerHTML = appData.habits.map(h => {
        const [id, name] = h;
        return `
        <div class="habit-row">
            <div class="habit-label" onclick="openHabitDetail('${id}')">${name}</div>
            ${days.map(d => {
                const dateStr = d.toISOString().split('T')[0];
                const checked = checkStatus(id, dateStr);
                const isToday = d.toDateString() === todayStr;
                
                return `<div class="cell ${checked ? 'checked' : ''} ${isToday ? 'current-day' : ''}" 
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
    const isChecked = el.classList.contains('checked');
    el.classList.toggle('checked');
    el.innerText = isChecked ? '' : '✔';
    
    await sendData({ action: 'toggleHabit', habitId: id, date: date });
    
    if(isChecked) {
        appData.habitLogs = appData.habitLogs.filter(l => !(l[0] == id && String(l[1]).startsWith(date)));
    } else {
        appData.habitLogs.push([id, date, 1]);
    }
    
    if(document.getElementById('habit-detail-modal').style.display === 'block') {
        openHabitDetail(id); 
    }
}

// --- HABIT DETAIL ---
function openHabitDetail(id) {
    currentHabitId = id;
    const habit = appData.habits.find(h => h[0] == id);
    if(!habit) return;
    
    document.getElementById('modal-habit-title').innerText = habit[1];
    document.getElementById('habit-detail-modal').style.display = 'block';
    
    document.getElementById('edit-name').value = habit[1];
    document.getElementById('edit-freq').value = habit[2] || 'Daily';
    document.getElementById('edit-target').value = habit[3] || 1;
    document.getElementById('habit-edit-form').style.display = 'none';

    renderHabitStats(id);
    renderCalendar(id);
    renderHeatmap(id);
}

function closeHabitModal() {
    document.getElementById('habit-detail-modal').style.display = 'none';
    renderHabitDashboard();
}

function toggleEditHabit() {
    const form = document.getElementById('habit-edit-form');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

function renderHabitStats(id) {
    const logs = appData.habitLogs.filter(l => l[0] == id).map(l => l[1].substring(0,10)).sort();
    
    document.getElementById('stat-total').innerText = logs.length;
    
    let streak = 0;
    const today = new Date().toISOString().split('T')[0];
    let checkDate = new Date();
    if (logs.includes(today)) streak = 1;
    
    let loopLimit = 365; 
    while(loopLimit > 0) {
        checkDate.setDate(checkDate.getDate() - 1);
        const dateStr = checkDate.toISOString().split('T')[0];
        if (logs.includes(dateStr)) streak++;
        else if (dateStr !== today) break;
        loopLimit--;
    }
    document.getElementById('stat-streak').innerText = streak;
    
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
    const days = ['M','T','W','T','F','S','S']; 
    days.forEach(d => grid.innerHTML += `<div style="font-size:10px; color:#888">${d}</div>`);
    
    document.getElementById('cal-month-name').innerText = now.toLocaleDateString('en-US', {month: 'long', year: 'numeric'});
    
    const year = now.getFullYear();
    const month = now.getMonth();
    
    let firstDayIndex = new Date(year, month, 1).getDay(); 
    firstDayIndex = (firstDayIndex === 0) ? 6 : firstDayIndex - 1;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    for(let i=0; i<firstDayIndex; i++) grid.innerHTML += '<div></div>';
    
    for(let i=1; i<=daysInMonth; i++) {
        const dStr = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        const isChecked = checkStatus(id, dStr);
        const isToday = i === now.getDate();
        grid.innerHTML += `<div class="cal-day ${isChecked?'active':''} ${isToday?'today':''}">${i}</div>`;
    }
}

function renderHeatmap(id) {
    if(!id) id = currentHabitId;
    
    const mode = document.getElementById('heatmap-select').value;
    const grid = document.getElementById('heatmap-grid');
    grid.innerHTML = '';
    
    const today = new Date();
    let startDate = new Date();
    
    if (mode === '3months') {
        startDate.setMonth(today.getMonth() - 2); 
        startDate.setDate(1);
    } else if (mode === 'year') {
        startDate.setFullYear(today.getFullYear() - 1);
    } else if (mode === 'all') {
        startDate = new Date('2025-01-01');
        const logs = appData.habitLogs.filter(l => l[0] == id).map(l => l[1]).sort();
        if(logs.length > 0) {
            const firstLog = new Date(logs[0]);
            if (firstLog < startDate) startDate = firstLog;
        }
    }

    const diffTime = Math.abs(today - startDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    for(let i=0; i<=diffDays; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        if (d > today) break;
        
        const dateStr = d.toISOString().split('T')[0];
        const isChecked = checkStatus(id, dateStr);
        grid.innerHTML += `<div class="heat-box ${isChecked?'filled':''}" title="${dateStr}"></div>`;
    }
}

async function saveHabitConfig() {
    const name = document.getElementById('edit-name').value;
    const freq = document.getElementById('edit-freq').value;
    const target = document.getElementById('edit-target').value;
    
    await sendData({
        action: 'updateHabit',
        id: currentHabitId,
        name: name,
        frequency: freq,
        target: target
    });
    alert("Saved");
    
    const habitIdx = appData.habits.findIndex(h => h[0] == currentHabitId);
    if(habitIdx > -1) {
        appData.habits[habitIdx][1] = name;
        appData.habits[habitIdx][2] = freq;
        appData.habits[habitIdx][3] = target;
    }
    toggleEditHabit();
    openHabitDetail(currentHabitId);
}

async function deleteCurrentHabit() {
    if(!confirm("Delete this habit?")) return;
    await sendData({ action: 'deleteHabit', id: currentHabitId });
    appData.habits = appData.habits.filter(h => h[0] != currentHabitId);
    closeHabitModal();
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

async function sendData(payload) {
    payload.token = TOKEN;
    return await fetch(SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        body: JSON.stringify(payload)
    });
}
