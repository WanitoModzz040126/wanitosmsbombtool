import { useState, useEffect, useRef } from 'react';

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [hwid, setHwid] = useState('');
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [expiry, setExpiry] = useState('');
  const [phone, setPhone] = useState('');
  const [batches, setBatches] = useState(5);
  const [attacking, setAttacking] = useState(false);
  const [stats, setStats] = useState({ total: 0, success: 0, fail: 0 });
  const [logs, setLogs] = useState([]);
  const eventSource = useRef(null);

  // Generate HWID on load
  useEffect(() => {
    generateHWID().then(setHwid);
  }, []);

  async function generateHWID() {
    const parts = [];
    parts.push(navigator.userAgent);
    parts.push(navigator.language);
    parts.push(screen.width + 'x' + screen.height + 'x' + screen.colorDepth);
    parts.push(new Date().getTimezoneOffset());
    parts.push(navigator.hardwareConcurrency || 0);
    const canvas = document.createElement('canvas');
    canvas.width = 200; canvas.height = 50;
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(0, 0, 100, 50);
    ctx.fillStyle = '#069';
    ctx.fillText('WanitoModz', 2, 15);
    parts.push(canvas.toDataURL());
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(parts.join('|')));
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function copyHWID() {
    await navigator.clipboard.writeText(hwid);
    alert('HWID copied to clipboard!');
  }

  async function handleLogin() {
    if (!key) { setError('Enter license key'); return; }
    setError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, hwid })
      });
      const data = await res.json();
      if (data.success) {
        setLoggedIn(true);
        setExpiry(data.expiry === 'lifetime' ? 'Lifetime' : new Date(data.expiry).toLocaleDateString());
        startEventStream();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Connection error');
    }
  }

  function startEventStream() {
    if (eventSource.current) eventSource.current.close();
    const es = new EventSource('/api/attack');
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'log') {
        setLogs(prev => [data, ...prev].slice(0, 200));
      } else if (data.type === 'stats') {
        setStats(data.message);
      } else if (data.type === 'completed') {
        setAttacking(false);
        setStats(data.message);
      } else if (data.type === 'batch_start') {
        setLogs(prev => [{ type: 'system', timestamp: new Date().toLocaleTimeString(), message: data.message }, ...prev].slice(0, 200));
      }
    };
    eventSource.current = es;
  }

  async function startAttack() {
    if (!phone || !/^09?\d{9}$/.test(phone)) {
      alert('Enter valid Philippine number (e.g., 09123456789)');
      return;
    }
    setAttacking(true);
    setStats({ total: 0, success: 0, fail: 0 });
    setLogs([]);
    try {
      const res = await fetch('/api/attack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, batches, token: 'dummy' })
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error);
        setAttacking(false);
      }
    } catch (err) {
      alert('Start failed');
      setAttacking(false);
    }
  }

  async function stopAttack() {
    await fetch('/api/attack', { method: 'DELETE' });
    setAttacking(false);
  }

  const successRate = stats.total > 0 ? ((stats.success / stats.total) * 100).toFixed(1) : 0;

  if (!loggedIn) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="brand-icon">💣</div>
          <h1>WANITOMODZ</h1>
          <p className="sub">SMS BOMB TOOL</p>
          <div className="input-group">
            <input type="text" placeholder="License Key" value={key} onChange={e => setKey(e.target.value)} />
          </div>
          <div className="hwid-row">
            <input type="text" readOnly value={hwid} placeholder="HWID" />
            <button onClick={copyHWID} className="copy-btn">📋 Copy</button>
          </div>
          <button onClick={handleLogin} className="login-btn">UNLOCK TOOL</button>
          {error && <p className="error">{error}</p>}
          <p className="footer">© 2026 WanitoModz | HWID Lock</p>
        </div>
        <style jsx>{`
          .login-container {
            display: flex; justify-content: center; align-items: center; min-height: 100vh;
            background: linear-gradient(135deg, #0a0c12 0%, #0f121c 100%);
            font-family: 'Inter', sans-serif;
          }
          .login-card {
            background: #141722; border-radius: 32px; border: 1px solid rgba(255,255,255,0.08);
            padding: 40px 32px; width: 380px; box-shadow: 0 25px 50px -12px black;
            text-align: center;
          }
          .brand-icon { font-size: 64px; margin-bottom: 16px; }
          h1 { font-size: 28px; font-weight: 800; background: linear-gradient(135deg,#fff,#ff3e6c); -webkit-background-clip: text; background-clip: text; color: transparent; }
          .sub { color: #a0a5b5; margin-bottom: 32px; }
          .input-group input, .hwid-row input {
            width: 100%; padding: 14px 16px; background: #1e2432; border: 1px solid #2a2f3f;
            border-radius: 60px; color: white; font-size: 15px; margin-bottom: 16px;
            outline: none;
          }
          .hwid-row { display: flex; gap: 12px; margin-bottom: 24px; }
          .hwid-row input { flex: 1; margin-bottom: 0; }
          .copy-btn { background: #2a2f3f; border: none; border-radius: 60px; padding: 0 20px; color: white; cursor: pointer; }
          .login-btn { width: 100%; padding: 14px; background: linear-gradient(135deg,#ff3e6c,#d62e56); border: none;
            border-radius: 60px; color: white; font-weight: 700; cursor: pointer; transition: 0.2s; }
          .login-btn:hover { transform: scale(1.02); }
          .error { color: #ff4444; margin-top: 16px; font-size: 13px; }
          .footer { margin-top: 32px; font-size: 12px; color: #a0a5b5; }
        `}</style>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="header">
        <div className="logo"><span className="gradient">WANITOMODZ</span> BOMBER</div>
        <div className="user"><span className="badge">Valid until: {expiry}</span><button className="logout" onClick={() => location.reload()}>Logout</button></div>
      </div>
      <div className="grid">
        <div className="card">
          <h2>🎯 Attack Controls</h2>
          <div className="row">
            <input type="tel" placeholder="09123456789" value={phone} onChange={e => setPhone(e.target.value)} />
            <input type="number" min="1" max="100" value={batches} onChange={e => setBatches(parseInt(e.target.value) || 1)} />
          </div>
          <div className="buttons">
            <button onClick={startAttack} disabled={attacking} className="start">▶ START BOMBING</button>
            <button onClick={stopAttack} disabled={!attacking} className="stop">⏹ STOP</button>
          </div>
          <div className="note">15 services | Parallel attack | Automatic cooldown</div>
        </div>
        <div className="card">
          <h2>📊 Live Statistics</h2>
          <div className="stats">
            <div><span>Total</span><strong>{stats.total}</strong></div>
            <div><span>Success</span><strong style={{color:'#00e676'}}>{stats.success}</strong></div>
            <div><span>Failed</span><strong style={{color:'#ff4444'}}>{stats.fail}</strong></div>
            <div><span>Rate</span><strong>{successRate}%</strong></div>
          </div>
        </div>
        <div className="card full-width">
          <h2>📜 Live Logs</h2>
          <div className="logs">
            {logs.map((log, i) => (
              <div key={i} className={`log-entry ${log.success ? 'success' : log.type === 'system' ? 'system' : 'fail'}`}>
                <span className="time">{log.timestamp}</span>
                {log.batch && <span className="batch">[Batch {log.batch}]</span>}
                <span className="service">{log.service || log.message?.split(' ')[0]}</span>
                <span className="msg">{log.message || (log.success ? '✓ Success' : '✗ Failed')}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <style jsx>{`
        .dashboard { max-width: 1400px; margin: 0 auto; padding: 24px; font-family: 'Inter', sans-serif; background: #0a0c12; min-height: 100vh; color: white; }
        .header { display: flex; justify-content: space-between; align-items: center; background: #141722; border-radius: 60px; padding: 12px 24px; margin-bottom: 32px; border: 1px solid rgba(255,255,255,0.08); }
        .logo { font-size: 24px; font-weight: 800; }
        .gradient { background: linear-gradient(135deg,#fff,#ff3e6c); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .badge { background: #1e2432; padding: 6px 16px; border-radius: 60px; font-size: 13px; margin-right: 16px; }
        .logout { background: none; border: 1px solid #ff3e6c; padding: 6px 16px; border-radius: 60px; color: white; cursor: pointer; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        .card { background: #141722; border-radius: 28px; border: 1px solid rgba(255,255,255,0.08); padding: 28px; transition: 0.2s; }
        .full-width { grid-column: span 2; }
        h2 { font-size: 20px; margin-bottom: 20px; display: flex; align-items: center; gap: 8px; }
        .row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
        .row input { background: #1e2432; border: 1px solid #2a2f3f; border-radius: 60px; padding: 12px 20px; color: white; font-size: 15px; outline: none; }
        .buttons { display: flex; gap: 16px; }
        .start, .stop { flex: 1; padding: 12px; border-radius: 60px; font-weight: 700; border: none; cursor: pointer; transition: 0.2s; }
        .start { background: linear-gradient(135deg,#00e676,#00b35e); color: white; }
        .stop { background: #ff4444; color: white; }
        .start:disabled, .stop:disabled { opacity: 0.5; cursor: not-allowed; }
        .note { margin-top: 20px; font-size: 12px; color: #a0a5b5; text-align: center; }
        .stats { display: grid; grid-template-columns: repeat(4,1fr); gap: 16px; text-align: center; }
        .stats div { background: #1e2432; padding: 16px; border-radius: 20px; }
        .stats span { display: block; font-size: 13px; color: #a0a5b5; margin-bottom: 8px; }
        .stats strong { font-size: 28px; }
        .logs { background: #0a0c12; border-radius: 20px; height: 320px; overflow-y: auto; padding: 12px; font-family: monospace; font-size: 12px; }
        .log-entry { padding: 8px 12px; margin-bottom: 6px; border-left: 3px solid; border-radius: 10px; background: #1e2432; display: flex; gap: 12px; flex-wrap: wrap; }
        .log-entry.success { border-left-color: #00e676; }
        .log-entry.fail { border-left-color: #ff4444; }
        .log-entry.system { border-left-color: #ffb74d; }
        .time { color: #a0a5b5; font-size: 11px; }
        .batch { color: #ffb74d; }
        .service { font-weight: 600; min-width: 100px; }
        .msg { word-break: break-word; }
        @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } .full-width { grid-column: span 1; } }
      `}</style>
    </div>
  );
}
