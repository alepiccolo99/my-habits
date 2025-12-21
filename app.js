const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwB49dnXc5wFyia7NTXHfgt0LJm6LX_nZWgssc_yEiY5UO6XtYoB71iUq06MxZ6QprvZA/exec"; 
const TOKEN = "aleLifeTracker_1999";

let appData = { habits: [], habitLogs: [], settings: [] };
let currentTheme = localStorage.getItem('theme') || '#0a84ff';
let currentHabitId = null; 
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
        if (savedTheme) {
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
    
    // FIX #4: Calculate RGBA for transparent background
    // Assumes color is HEX format (#RRGGBB)
    if(color.startsWith('#') && color.length === 7) {
        const r = parseInt(color.substr(1,2), 16);
        const g = parseInt(color.substr(3,2), 16);
        const b = parseInt(color.substr(5,2), 16);
        const rgbaVal = `rgba(${r}, ${g}, ${b}, 0.2)`;
        document.documentElement.style.setProperty('--accent-color-bg', rgbaVal);
    }
    
    const previewBox = document.getElementById('color-preview-box');
    if(previewBox) previewBox.style.backgroundColor = color;
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
        const addBtn = document.createElement('button');
        addBtn.innerHTML = "Add"; 
        // FIX #3: Use 'btn-secondary' to match Edit/Cancel buttons exactly
        addBtn.className = "btn-secondary"; 
        addBtn.onclick = openAddHabitModal;
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
    
    const validHabits = (appData.habits || []).filter(h => h[0] && h[1]);

    if (validHabits.length === 0) {
        list.innerHTML = `<div style="text-align:center; color:#555; margin-top:30px;">Tap "Add" to start tracking.</div>`;
        header.innerHTML = '';
        return;
    }

    const days = getRecentDays(5);
    const todayStr = new Date().toDateString(); 
    
    // FIX #1: Highlight applied to the whole wrapper (.day-wrapper-header)
    header.innerHTML = '<div></div>' + days.map(d => {
        const isToday = d.toDateString() === todayStr;
        return `
        <div class="day-wrapper-header ${isToday ? 'current' : ''}">
            <div class="day-name">${d.toLocaleDateString('en-US', {weekday:'short'})}</div>
            <div class="day-num">${d.getDate()}</div>
        </div>
        `;
    }).join('');

    list.innerHTML = validHabits.map(h => {
        const [id, name] = h;
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
    return appData.habitLogs.some(l => String(l[0]) === String(id) && String(l[1]).startsWith(dateStr));
}

async function toggleHabit(id, date, el) {
    const isChecked = el.classList.contains('checked');
    el.classList.toggle('checked');
    el.innerText = isChecked ? '' : '✔';
    
    await sendData({ action: 'toggleHabit', habitId: id, date: date });
    
    if(isChecked) {
        appData.habitLogs = appData.habitLogs.filter(l => !(String(l[0]) === String(id) && String(l[1]).startsWith(date)));
    } else {
        appData.habitLogs.push([id, date, 1]);
    }
    
    if(document.getElementById('habit-detail-modal').style.display === 'block') {
        renderHabitStats(id);
        renderCalendar(id);
        renderHeatmap(id);
    }
}

// --- HABIT DETAIL ---
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
    const logs = appData.habitLogs
        .filter(l => String(l[0]) === String(id))
        .map(l => String(l[1]).substring(0,10))
        .sort();
        
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

function changeCalendarMonth(delta) {
    calendarOffsetDate.setMonth(calendarOffsetDate.getMonth() + delta);
    renderCalendar(currentHabitId);
}

function renderCalendar(id) {
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';
    
    const displayDate = new Date(calendarOffsetDate);
    
    const days = ['M','T','W','T','F','S','S']; 
    days.forEach(d => grid.innerHTML += `<div style="font-size:10px; color:#888">${d}</div>`);
    
    document.getElementById('cal-month-name').innerText = displayDate.toLocaleDateString('en-US', {month: 'long', year: 'numeric'});
    
    const year = displayDate.getFullYear();
    const month = displayDate.getMonth();
    
    let firstDayIndex = new Date(year, month, 1).getDay(); 
    firstDayIndex = (firstDayIndex === 0) ? 6 : firstDayIndex - 1;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    for(let i=0; i<firstDayIndex; i++) grid.innerHTML += '<div></div>';
    
    const now = new Date();
    const isCurrentMonth = (now.getFullYear() === year && now.getMonth() === month);

    for(let i=1; i<=daysInMonth; i++) {
        const dStr = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        const isChecked = checkStatus(id, dStr);
        const isToday = isCurrentMonth && (i === now.getDate());
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
        const logs = appData.habitLogs
            .filter(l => String(l[0]) === String(id))
            .map(l => String(l[1]))
            .sort();
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
    
    const habitIdx = appData.habits.findIndex(h => String(h[0]) === String(currentHabitId));
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
    appData.habits = appData.habits.filter(h => String(h[0]) !== String(currentHabitId));
    closeHabitModal();
}

function openAddHabitModal() {
    document.getElementById('newHabitName').value = "";
    document.getElementById('newHabitFreq').value = "Daily";
    document.getElementById('newHabitTarget').value = "1";
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

async function sendData(payload) {
    payload.token = TOKEN;
    return await fetch(SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        body: JSON.stringify(payload)
    });
}
