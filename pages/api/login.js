import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { key, hwid } = req.body;
  if (!key || !hwid) return res.status(400).json({ error: 'Missing key or HWID' });

  try {
    // Basahin ang key.json mula sa project root
    const keyFilePath = path.join(process.cwd(), 'key.json');
    const keyFileContent = fs.readFileSync(keyFilePath, 'utf8');
    const keyData = JSON.parse(keyFileContent);
    const keyInfo = keyData.keys?.[key];

    if (!keyInfo) return res.status(401).json({ error: 'Invalid key' });
    if (keyInfo.hwid !== hwid) return res.status(401).json({ error: 'HWID mismatch – key locked to another device' });
    if (keyInfo.expiry !== 'lifetime' && new Date(keyInfo.expiry) < new Date()) {
      return res.status(401).json({ error: 'Key expired' });
    }

    const token = Buffer.from(`${key}:${Date.now()}`).toString('base64');
    return res.json({ success: true, token, expiry: keyInfo.expiry, duration: keyInfo.duration });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Key validation service error' });
  }
}