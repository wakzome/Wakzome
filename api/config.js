import crypto from 'crypto';

function verifyToken(token) {
  try {
    const [header, body, signature] = token.split('.');
    const expected = crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    if (expected !== signature) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export default function handler(req, res) {
  const token = req.headers['x-session-token'];
  if (!token) return res.status(401).json({ error: 'No autorizado' });

  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Sesión inválida' });

  res.json({
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
    adminToken: process.env.ADMIN_TOKEN
  });
}
