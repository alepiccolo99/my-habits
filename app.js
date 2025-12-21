const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyUn2YlTK1EOPpQvQ71tG3zgBo7Z5N2YvDUrG0oEMua44SuTSUSQXOz3mewk9eSuVgv2Q/exec"; 
const TOKEN = "aleLifeTracker_1999";

let appData = { habits: [], habitLogs: [], settings: [] };
let currentTheme = localStorage.getItem('theme') || '#0a84ff';
let currentHabitId = null; 
let calendarOffsetDate = new Date(); 

document.addEventListener('DOMContentLoaded', () => {
    applyTheme(currentTheme); 
    fetchData();
});

// --- DATE HELPER (Strict Local Date) ---
function getLocalDateString(dateObj) {
    if (!dateObj) return "";
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

async function fetchData() {
    const loader = document.getElementById('loading-overlay');
    try {
        const resp = await fetch(`${SCRIPT_URL}?token=${TOKEN}&action=getAll`);
        const data = await resp.json();
        
        // Sanitize Dates immediately
        if(data.habitLogs) {
            data.habitLogs.forEach(row => { row[1] = String(row[1]).split('T')[0]; });
        }
        
        appData = data;
        
        // Apply Theme
        const savedTheme = data.settings.find(s => s[0] === 'theme');
        if (savedTheme && savedTheme[1]) applyTheme(savedTheme[1]);
        
        renderHabitDashboard();
    } catch (e) {
        console.error("Error:", e);
        alert("Could not load data.");
    } finally {
        if(loader) loader.style.display = 'none';
    }
}

// --- RENDER ---

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
    
    // Valid Habits
    const habits = appData.habits || [];

    if (habits.length === 0) {
        list.innerHTML = `<div style="text-align:center; color:#555; margin-top:40px;">No habits yet.<br>Click + to add one.</div>`;
        header.innerHTML = ''; return;
    }

    const days = getRecentDays(5);
    const todayStr = getLocalDateString(new Date()); 
    
    // Header
    header.innerHTML = '<div></div>' + days.map(d => {
        const dStr = getLocalDateString(d);
        const isToday = dStr === todayStr;
        return `<div class="day-col-header ${isToday ? 'today' : ''}">
                    <div class="day-name">${d.toLocaleDateString('en-US', {weekday:'short'})}</div>
                    <div class="day-num">${d.getDate()}</div>
                </div>`;
    }).join('');

    // List
    list.innerHTML = habits.map(h => {
        const [id, name] = h;
        return `<div class="habit-row">
            <div class="habit-label" onclick="openHabitDetail('${id}')">${name}</div>
            ${days.map(d => {
                const dateStr = getLocalDateString(d);
                const checked = appData.habitLogs.some(l => String(l[0]) === String(id) && String(l[1]) === dateStr);
                // FIXED: Default gray '✕', Checked colored '✔'
                const symbol = checked ? '✔' : '✕';
                return `<div class="cell ${checked ? 'checked' : ''}" onclick="toggleHabit('${id}', '${dateStr}', this)">${symbol}</div>`;
            }).join('')}
        </div>`;
    }).join('');
}

// --- ACTIONS ---

async function toggleHabit(id, dateStr, el) {
    const isChecked = el.classList.contains('checked');
    
    // Optimistic UI - Update symbol logic
    if (isChecked) {
        el.classList.remove('checked');
        el.innerText = '✕'; // Back to gray cross
        appData.habitLogs = appData.habitLogs.filter(l => !(String(l[0]) === String(id) && String(l[1]) === dateStr));
    } else {
        el.classList.add('checked');
        el.innerText = '✔'; // To colored tick
        appData.habitLogs.push([id, dateStr, 1]);
    }
    
    await sendData({ action: 'toggleHabit', habitId: id, date: dateStr });
    
    // Refresh modals if open
    if(document.getElementById('habit-detail-modal').style.display === 'block') {
        renderHabitStats(id); renderCalendar(id);
    }
}

async function handleAddHabit() {
    const name = document.getElementById('newHabitName').value;
    if(!name) return;
    const id = Date.now().toString();
    const freq = document.getElementById('newHabitFreq').value;
    const target = document.getElementById('newHabitTarget').value;
    
    appData.habits.push([id, name, freq, target]);
    document.getElementById('add-habit-modal').style.display='none';
    renderHabitDashboard();
    
    await sendData({ action: 'addHabit', id, name, frequency: freq, target });
}

async function saveHabitConfig() {
    const name = document.getElementById('edit-name').value;
    const freq = document.getElementById('edit-freq').value;
    const target = document.getElementById('edit-target').value;
    
    const idx = appData.habits.findIndex(h => String(h[0]) === String(currentHabitId));
    if(idx > -1) {
        appData.habits[idx][1] = name;
        appData.habits[idx][2] = freq;
        appData.habits[idx][3] = target;
    }
    
    toggleEditHabit();
    document.getElementById('modal-habit-title').innerText = name;
    renderHabitDashboard();
    
    await sendData({ action: 'updateHabit', id: currentHabitId, name, frequency: freq, target });
}

async function deleteCurrentHabit() {
    if(!confirm("Delete this habit and ALL its history? This cannot be undone.")) return;
    
    appData.habits = appData.habits.filter(h => String(h[0]) !== String(currentHabitId));
    appData.habitLogs = appData.habitLogs.filter(l => String(l[0]) !== String(currentHabitId));
    
    closeHabitModal();
    renderHabitDashboard();
    
    await sendData({ action: 'deleteHabit', id: currentHabitId });
}

// --- DETAILS & STATS ---

function openHabitDetail(id) {
    currentHabitId = id;
    const habit = appData.habits.find(h => String(h[0]) === String(id));
    if(!habit) return;
    
    calendarOffsetDate = new Date();
    document.getElementById('modal-habit-title').innerText = habit[1];
    document.getElementById('edit-name').value = habit[1];
    document.getElementById('edit-freq').value = habit[2] || 'Daily';
    document.getElementById('edit-target').value = habit[3] || 1;
    
    document.getElementById('habit-edit-form').style.display = 'none';
    document.getElementById('habit-detail-modal').style.display = 'block';
    
    renderHabitStats(id);
    renderCalendar(id);
}

function closeHabitModal() { document.getElementById('habit-detail-modal').style.display = 'none'; renderHabitDashboard(); }
function toggleEditHabit() { 
    const form = document.getElementById('habit-edit-form'); 
    form.style.display = form.style.display === 'none' ? 'block' : 'none'; 
}

function renderHabitStats(id) {
    const logs = appData.habitLogs.filter(l => String(l[0]) === String(id)).map(l => String(l[1])).sort();
    
    document.getElementById('stat-total').innerText = logs.length;
    
    let streak = 0; 
    const today = getLocalDateString(new Date()); 
    let checkDate = new Date();
    
    if (logs.includes(today)) streak = 1; 
    let limit = 365;
    while(limit > 0) {
        checkDate.setDate(checkDate.getDate() - 1);
        const dStr = getLocalDateString(checkDate);
        if (logs.includes(dStr)) streak++; else if (dStr !== today) break;
        limit--;
    }
    document.getElementById('stat-streak').innerText = streak;
    
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recent = logs.filter(d => d >= getLocalDateString(thirtyDaysAgo));
    document.getElementById('stat-rate').innerText = Math.round((recent.length / 30) * 100) + "%";
}

function changeCalendarMonth(delta) { calendarOffsetDate.setMonth(calendarOffsetDate.getMonth() + delta); renderCalendar(currentHabitId); }

function renderCalendar(id) {
    const grid = document.getElementById('calendar-grid'); 
    grid.innerHTML = ''; 
    const displayDate = new Date(calendarOffsetDate);
    
    const days = ['M','T','W','T','F','S','S']; 
    days.forEach(d => grid.innerHTML += `<div style="font-size:10px; color:#666">${d}</div>`);
    
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
        const isChecked = appData.habitLogs.some(l => String(l[0]) === String(id) && String(l[1]) === dStr);
        const isToday = isCurrentMonth && (i === now.getDate());
        
        grid.innerHTML += `<div class="cal-day ${isChecked?'active':''} ${isToday?'today':''}">${i}</div>`;
    }
}

// --- SETTINGS ---
function openSettings() { 
    document.getElementById('settings-modal').style.display = 'block'; 
    document.getElementById('themeColorPicker').value = currentTheme; 
    document.getElementById('color-icon').style.color = currentTheme;
}
function openAddHabitModal() { document.getElementById('newHabitName').value = ""; document.getElementById('add-habit-modal').style.display = 'block'; }

function updateThemeFromPicker(color) { 
    applyTheme(color); 
    localStorage.setItem('theme', color); 
    // Update the icon color immediately
    const icon = document.getElementById('color-icon');
    if(icon) icon.style.color = color;
    
    sendData({ action: 'saveSetting', key: 'theme', value: color }); 
}

function applyTheme(color) {
    currentTheme = color; 
    document.documentElement.style.setProperty('--accent-color', color);
    if(color.startsWith('#') && color.length === 7) {
        const r = parseInt(color.substr(1,2), 16); 
        const g = parseInt(color.substr(3,2), 16); 
        const b = parseInt(color.substr(5,2), 16);
        document.documentElement.style.setProperty('--accent-color-bg', `rgba(${r}, ${g}, ${b}, 0.2)`);
    }
}

async function sendData(payload) { 
    payload.token = TOKEN; 
    return await fetch(SCRIPT_URL, { method: "POST", mode: "no-cors", body: JSON.stringify(payload) }); 
}
