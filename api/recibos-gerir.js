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
  } catch { return null; }
}

function getCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  const match = cookieHeader.split(';').map(c => c.trim()).find(c => c.startsWith(name + '='));
  return match ? match.slice(name.length + 1) : null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  const token =
    getCookie(req.headers.cookie, 'wkz_session') ||
    req.headers['x-session-token'] || null;

  if (!token) return res.status(401).json({ error: 'Não autorizado' });

  const payload = verifyToken(token);
  if (!payload)            return res.status(401).json({ error: 'Sessão inválida' });
  if (payload.rol !== 'admin') return res.status(403).json({ error: 'Acesso negado' });

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  /* ── GET: listar todas as colaboradoras ── */
  if (req.method === 'GET') {
    const { data, error } = await sb
      .from('recibos_funcionarias')
      .select('id, nome, senha, ativo')
      .order('nome');
    if (error) { console.error('[recibos-gerir] GET', error.message); return res.status(500).json({ error: error.message }); }
    return res.json({ funcionarias: data || [] });
  }

  /* ── POST: ações CRUD ── */
  if (req.method === 'POST') {
    const { action, id, nome, senha } = req.body || {};

    if (action === 'add') {
      if (!nome || !nome.trim()) return res.status(400).json({ error: 'Nome obrigatório' });
      const { data, error } = await sb
        .from('recibos_funcionarias')
        .insert({ nome: nome.trim().toUpperCase(), senha: senha || null, ativo: true })
        .select('id, nome, senha, ativo')
        .single();
      if (error) return res.status(400).json({ error: error.message });
      return res.json({ funcionaria: data });
    }

    if (action === 'update_senha') {
      if (!id) return res.status(400).json({ error: 'ID obrigatório' });
      const { error } = await sb
        .from('recibos_funcionarias')
        .update({ senha: senha || null })
        .eq('id', id);
      if (error) return res.status(400).json({ error: error.message });
      return res.json({ ok: true });
    }

    if (action === 'delete') {
      if (!id) return res.status(400).json({ error: 'ID obrigatório' });
      const { error } = await sb
        .from('recibos_funcionarias')
        .delete()
        .eq('id', id);
      if (error) return res.status(400).json({ error: error.message });
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: 'Ação inválida' });
  }

  return res.status(405).end();
}
