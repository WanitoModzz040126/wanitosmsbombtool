async function generateHWID() {
    const components = [];
    components.push(navigator.userAgent);
    components.push(navigator.language);
    components.push(screen.width + 'x' + screen.height + 'x' + screen.colorDepth);
    components.push(new Date().getTimezoneOffset());
    components.push(navigator.hardwareConcurrency || 0);
    const canvas = document.createElement('canvas'); canvas.width = 200; canvas.height = 50;
    const ctx = canvas.getContext('2d'); ctx.textBaseline = 'top'; ctx.font = '14px Arial';
    ctx.fillStyle = '#f60'; ctx.fillRect(0,0,100,50); ctx.fillStyle = '#069'; ctx.fillText('WanitoModz',2,15);
    components.push(canvas.toDataURL());
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(components.join('|')));
    return Array.from(new Uint8Array(hashBuffer)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

let ws = null, authToken = null, currentHwid = null;
const loginScreen = document.getElementById('login-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const loginBtn = document.getElementById('login-btn');
const licenseKeyInput = document.getElementById('license-key');
const loginError = document.getElementById('login-error');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const targetNumber = document.getElementById('target-number');
const batchCount = document.getElementById('batch-count');
const logoutBtn = document.getElementById('logout-btn');
const expiryBadge = document.getElementById('expiry-badge');
const statTotal = document.getElementById('stat-total');
const statSuccess = document.getElementById('stat-success');
const statFail = document.getElementById('stat-fail');
const statRate = document.getElementById('stat-rate');
const logContainer = document.getElementById('log-container');

function addLog(service, message, success, batch=null) {
    const div = document.createElement('div');
    div.className = `log-entry ${success ? 'success' : 'fail'}`;
    const prefix = batch ? `[Batch ${batch}]` : '';
    div.innerHTML = `<strong>${new Date().toLocaleTimeString()}</strong> ${prefix} <span style="color:${success?'#00e676':'#ff4444'}">${service}</span> → ${message}`;
    logContainer.appendChild(div); div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function addSystemLog(msg) {
    const div = document.createElement('div');
    div.className = 'log-entry system';
    div.innerHTML = `<strong>${new Date().toLocaleTimeString()}</strong> ⚙️ ${msg}`;
    logContainer.appendChild(div); div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function updateStats(stats) {
    statTotal.innerText = stats.total || 0;
    statSuccess.innerText = stats.success || 0;
    statFail.innerText = stats.fail || 0;
    const rate = stats.total > 0 ? ((stats.success/stats.total)*100).toFixed(1) : 0;
    statRate.innerText = `${rate}%`;
}
function connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${location.host}`);
    ws.onopen = () => { ws.send(JSON.stringify({ type:'auth', token:authToken })); addSystemLog('WebSocket ready.'); };
    ws.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if(data.type === 'log') addLog(data.service, data.message, data.success, data.batch);
        else if(data.type === 'stats') updateStats(data.stats);
        else if(data.type === 'batch_start') addSystemLog(`Starting Batch ${data.batch} of ${data.total}...`);
        else if(data.type === 'completed') {
            addSystemLog(`✅ Attack completed! Total: ${data.stats.total} | Success: ${data.stats.success} | Failed: ${data.stats.fail}`);
            startBtn.disabled = false; stopBtn.disabled = true;
        }
    };
    ws.onclose = () => { addSystemLog('WebSocket disconnected, reconnecting...'); setTimeout(connectWebSocket,3000); };
}

loginBtn.onclick = async () => {
    const key = licenseKeyInput.value.trim();
    if(!key) { loginError.innerText = 'Enter license key'; return; }
    loginBtn.disabled = true; loginBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Verifying...';
    try {
        const hwid = await generateHWID();
        currentHwid = hwid;
        const res = await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ key, hwid }) });
        const data = await res.json();
        if(data.success) {
            authToken = data.token;
            expiryBadge.innerText = `Valid until: ${data.expiry === 'lifetime' ? 'Lifetime' : new Date(data.expiry).toLocaleDateString()}`;
            loginScreen.classList.remove('active');
            dashboardScreen.classList.add('active');
            addSystemLog(`Welcome! Key activated (${data.duration})`);
            connectWebSocket();
        } else { loginError.innerText = data.error; }
    } catch(err) { loginError.innerText = 'Connection error'; }
    finally { loginBtn.disabled = false; loginBtn.innerHTML = '<i class="fas fa-unlock-alt"></i> UNLOCK TOOL'; }
};

startBtn.onclick = async () => {
    const phone = targetNumber.value.trim();
    const batches = parseInt(batchCount.value);
    if(!phone) { addSystemLog('❌ Enter target number'); return; }
    if(isNaN(batches) || batches<1 || batches>100) { addSystemLog('❌ Batches 1-100'); return; }
    startBtn.disabled = true; stopBtn.disabled = false;
    addSystemLog(`🔥 Starting attack on +63${phone.replace(/^0/,'')} | ${batches} batches | 15 services each`);
    try {
        const res = await fetch('/api/start-attack', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ phone, batches, token:authToken }) });
        if(!res.ok) { const err = await res.json(); addSystemLog(`❌ ${err.error}`); startBtn.disabled = false; stopBtn.disabled = true; }
    } catch(e) { addSystemLog(`❌ ${e.message}`); startBtn.disabled = false; stopBtn.disabled = true; }
};
stopBtn.onclick = async () => {
    await fetch('/api/stop-attack', { method:'POST' });
    addSystemLog('⏹️ Attack stopped by user');
    startBtn.disabled = false; stopBtn.disabled = true;
};
logoutBtn.onclick = () => { if(ws) ws.close(); location.reload(); };
addSystemLog('Ready. Enter your license key.');