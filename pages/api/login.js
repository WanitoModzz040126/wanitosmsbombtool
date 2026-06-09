// pages/api/login.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { key, hwid } = req.body;
  if (!key || !hwid) return res.status(400).json({ error: 'Missing key or HWID' });

  // 🔁 REPLACE WITH YOUR GITHUB RAW URL
  const GITHUB_KEY_URL = 'https://raw.githubusercontent.com/WanitoModzz040126/Wanito-key/refs/heads/main/key.json?token=GHSAT0AAAAAAD62HUSDTOD35JGL5POZ6REI2RIBVCA';

  try {
    const keyRes = await fetch(GITHUB_KEY_URL);
    if (!keyRes.ok) throw new Error('Key server unreachable');
    const keyData = await keyRes.json();
    const keyInfo = keyData.keys?.[key];

    if (!keyInfo) return res.status(401).json({ error: 'Invalid key' });
    if (keyInfo.hwid !== hwid) return res.status(401).json({ error: 'HWID mismatch – key locked to another device' });
    if (keyInfo.expiry !== 'lifetime' && new Date(keyInfo.expiry) < new Date()) {
      return res.status(401).json({ error: 'Key expired' });
    }

    // Generate a short‑lived session token (not mandatory but keeps state)
    const token = Buffer.from(`${key}:${Date.now()}`).toString('base64');
    return res.json({ success: true, token, expiry: keyInfo.expiry, duration: keyInfo.duration });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Key validation service error' });
  }
}