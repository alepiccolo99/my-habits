const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwOxeByDn4rO2N0ukrh_1OceA6QulPBGaodQFJXDrnegh_0RclSiOozUsgcrdoh9VI3Ww/exec";
const TOKEN = "aleLifeTracker_1999";

// Stato Globale
let appData = {
    habits: [],
    habitLogs: [],
    healthLogs: [],
    exercises: [],
    workoutLogs: [],
    foods: [],
    dietLogs: []
};

// --- INIT & FETCH ---
async function fetchData() {
    try {
        const resp = await fetch(`${SCRIPT_URL}?token=${TOKEN}&action=getAll`);
        const data = await resp.json();
        appData = data;
        
        console.log("Dati ricevuti:", appData);
        renderAll();
    } catch (e) {
        console.error("Errore fetch:", e);
        alert("Errore caricamento dati. Controlla connessione.");
    }
}

function renderAll() {
    renderHabits();
    renderHealth();
    populateDropdowns();
    renderWorkoutLogs();
    renderDietLogs();
}

// --- ROUTING & UI ---
function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('overlay');
    sb.classList.toggle('open');
    ov.classList.toggle('active');
}

function router(viewId) {
    // Chiudi sidebar
    toggleSidebar();
    
    // Aggiorna titolo
    document.getElementById('page-title').innerText = viewId.charAt(0).toUpperCase() + viewId.slice(1);
    
    // Nascondi tutte le view
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active-view'));
    
    // Mostra quella giusta
    document.getElementById(viewId + '-view').classList.add('active-view');

    // Aggiorna menu attivo
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    // (Opzionale: logica per evidenziare bottone menu corretto)
}

function switchTab(section, tabName) {
    const parent = document.getElementById(section + '-view');
    // Bottoni
    parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active'); // Il bottone cliccato
    
    // Contenuto
    parent.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(`${section}-${tabName}-tab`).classList.add('active');
}

// --- HELPER GENERICO INVIO ---
async function sendData(payload) {
    payload.token = TOKEN;
    // Optimistic UI updates dovrebbero avvenire PRIMA di chiamare questo
    await fetch(SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        body: JSON.stringify(payload)
    });
    // Ricarica soft per sincronizzare ID reali e conferme
    fetchData(); 
}

// ================= HABITS LOGIC =================
function getWeekDays() {
    const days = [];
    const now = new Date();
    for (let i = 0; i < 5; i++) {
        const d = new Date();
        d.setDate(now.getDate() - (4 - i));
        days.push(d.toISOString().split('T')[0]);
    }
    return days;
}

function renderHabits() {
    const list = document.getElementById('habits-list');
    const header = document.getElementById('week-header');
    const days = getWeekDays();

    // Header Giorni con nuovo stile
    header.innerHTML = '<div class="habit-name-spacer"></div>' + 
        days.map(d => {
            const dateObj = new Date(d);
            // Usa 'it-IT' per i giorni in italiano
            const dayName = dateObj.toLocaleDateString('it-IT', {weekday:'short'}).toUpperCase();
            const dayNumber = dateObj.getDate();
            return `<div>
                        <div class="day-label">${dayName}</div>
                        <div class="day-number">${dayNumber}</div>
                    </div>`;
        }).join('');

    // Lista Habits (Rimane simile, ma il CSS ora la gestisce meglio)
    list.innerHTML = appData.habits.map(h => {
        const habitId = h[0];
        const habitName = h[1];
        return `
        <div class="habit-row">
            <div class="habit-label">${habitName}</div>
            ${days.map(d => {
                const isChecked = appData.habitLogs.some(l => 
                    l[0] == habitId && new Date(l[1]).toISOString().split('T')[0] === d
                );
                // Usiamo ✓ per checked, nulla per empty
                return `<div class="cell ${isChecked ? 'checked' : 'empty'}" 
                        onclick="toggleHabit('${habitId}', '${d}', this)">
                    ${isChecked ? '✓' : ''}
                </div>`;
            }).join('')}
        </div>`;
    }).join('');
}

function toggleHabit(id, date, el) {
    const isChecked = el.classList.contains('checked');
    // Se era checked, diventa empty e togliamo la spunta.
    // Se era empty, diventa checked e mettiamo la spunta.
    el.className = isChecked ? 'cell empty' : 'cell checked';
    el.innerText = isChecked ? '' : '✓';
    
    sendData({ action: 'toggleHabit', habitId: id, date: date });
}

function handleAddHabit() {
    const name = document.getElementById('newHabitName').value;
    if(!name) return;
    const id = Date.now().toString();
    sendData({ action: 'addHabit', id: id, name: name });
    document.getElementById('newHabitName').value = '';
}

// ================= HEALTH LOGIC =================
function handleAddMetric() {
    const type = document.getElementById('healthType').value;
    const value = document.getElementById('healthValue').value;
    const notes = document.getElementById('healthNotes').value;
    
    if(!value) return alert("Inserisci un valore");
    
    sendData({
        action: 'addMetric',
        date: new Date().toISOString(),
        type: type, value: value, notes: notes
    });
    alert("Salvato!");
}

function renderHealth() {
    const container = document.getElementById('health-list');
    // Prendi ultimi 10 log, inverti ordine
    const logs = [...appData.healthLogs].reverse().slice(0, 10);
    
    container.innerHTML = logs.map(l => `
        <div class="log-item">
            <div><strong>${l[1]}</strong>: ${l[2]}</div>
            <div class="log-meta">${new Date(l[0]).toLocaleDateString()} - ${l[3]}</div>
        </div>
    `).join('');
}

// ================= WORKOUT LOGIC =================
function handleAddExercise() {
    const name = document.getElementById('exName').value;
    const group = document.getElementById('exMuscle').value;
    const pattern = document.getElementById('exPattern').value;
    
    if(!name) return;
    const id = "ex_" + Date.now();
    
    sendData({ action: 'addExercise', id:id, name:name, group:group, pattern:pattern });
    alert("Esercizio Aggiunto");
}

function handleLogWorkout() {
    const exId = document.getElementById('workoutExerciseSelect').value;
    const w = document.getElementById('woWeight').value;
    const r = document.getElementById('woReps').value;
    const s = document.getElementById('woSets').value;
    const rpe = document.getElementById('woRPE').value;
    
    sendData({
        action: 'logWorkout',
        date: new Date().toISOString(),
        exerciseId: exId, weight: w, reps: r, sets: s, rpe: rpe
    });
    alert("Set Registrato");
}

function renderWorkoutLogs() {
    const container = document.getElementById('workout-history');
    const logs = [...appData.workoutLogs].reverse().slice(0, 10);
    
    container.innerHTML = logs.map(l => {
        // Trova nome esercizio da ID
        const exName = appData.exercises.find(e => e[0] === l[1])?.[1] || "Unknown Exercise";
        return `
        <div class="log-item">
            <div><strong>${exName}</strong></div>
            <div class="log-meta">${l[2]}kg x ${l[3]} reps x ${l[4]} sets (RPE ${l[5]})</div>
        </div>`;
    }).join('');
}

// ================= DIET LOGIC =================
function handleAddFood() {
    const name = document.getElementById('foodName').value;
    // ... raccogli tutti gli altri field ...
    // Per brevità di esempio prendo i principali
    const cals = document.getElementById('foodCals').value;
    
    if(!name) return;
    const id = "food_" + Date.now();
    
    sendData({
        action: 'addFood', id: id, name: name,
        brand: document.getElementById('foodBrand').value,
        serving: document.getElementById('foodServing').value,
        cals: cals,
        prot: document.getElementById('foodProt').value,
        fat: document.getElementById('foodFat').value,
        carbs: document.getElementById('foodCarbs').value,
        fiber: "", salt: "" // Aggiungi input se vuoi
    });
    alert("Cibo aggiunto al DB");
}

function handleLogFood() {
    const fId = document.getElementById('dietFoodSelect').value;
    const qty = document.getElementById('dietQty').value;
    
    sendData({
        action: 'logFood',
        date: new Date().toISOString(),
        foodId: fId, quantity: qty
    });
    alert("Mangiato!");
}

function renderDietLogs() {
    const container = document.getElementById('diet-history');
    const logs = [...appData.dietLogs].reverse().slice(0, 10);
    
    container.innerHTML = logs.map(l => {
        const food = appData.foods.find(f => f[0] === l[1]);
        const fName = food ? food[1] : "Unknown";
        const totalCals = food ? Math.round(food[4] * l[2]) : 0;
        
        return `
        <div class="log-item">
            <div><strong>${fName}</strong> (x${l[2]})</div>
            <div class="log-meta">${totalCals} kcal - ${new Date(l[0]).toLocaleTimeString()}</div>
        </div>`;
    }).join('');
}

// ================= SHARED =================
function populateDropdowns() {
    // Workout Select
    const wSelect = document.getElementById('workoutExerciseSelect');
    wSelect.innerHTML = appData.exercises.map(e => `<option value="${e[0]}">${e[1]}</option>`).join('');
    
    // Diet Select
    const dSelect = document.getElementById('dietFoodSelect');
    dSelect.innerHTML = appData.foods.map(f => `<option value="${f[0]}">${f[1]} (${f[4]} kcal)</option>`).join('');
}

// Avvio
fetchData();
