import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

function verifyToken(token) {
  try {
    const [header, body, signature] = token.split('.');
    const expected = crypto
      .createHmac('sha256', process.env.JWT_SECRET)
      .update(`${header}.${body}`)
      .digest('base64url');
    if (expected !== signature) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function getCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(';')
    .map(c => c.trim())
    .find(c => c.startsWith(name + '='));
  return match ? match.slice(name.length + 1) : null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  // Aceitar token via cookie (same-origin) ou header (fallback)
  const token =
    getCookie(req.headers.cookie, 'wkz_session') ||
    req.headers['x-session-token'] ||
    null;

  if (!token) return res.status(401).json({ error: 'Não autorizado' });

  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Sessão inválida' });

  // Apenas admins acedem a dados salariais
  if (payload.rol !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  // Service role key — bypassa RLS, nunca exposta ao browser
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await supabase
    .from('recibos_funcionarias')
    .select('nome, senha')
    .eq('ativo', true);

  if (error) {
    console.error('[recibos-senhas] DB error:', error.message);
    return res.status(500).json({ error: 'Erro na base de dados' });
  }

  // Sem cache — dados sensíveis
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.json({ senhas: data || [] });
}
