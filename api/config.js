export default function handler(req, res) {
  const token = req.headers['x-session-token'];

  if (!token) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const sessions = global._wkzSessions;
  if (!sessions || !sessions.has(token)) {
    return res.status(401).json({ error: 'Sesión inválida' });
  }

  res.setHeader('Access-Control-Allow-Origin', 'https://wakzome.com');
  
  res.json({
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
    adminToken: process.env.ADMIN_TOKEN
  });
}
