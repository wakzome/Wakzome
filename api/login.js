import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

function createToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 8 * 60 * 60 * 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { clave } = req.body;
  if (!clave) return res.status(400).json({ error: 'Clave requerida' });

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );

  const { data, error } = await supabase
    .rpc('validar_clave', { p_clave: clave });

  const resultado = data && data[0] ? data[0] : null;

  if (error || !resultado) {
    return res.status(401).json({ error: 'Clave incorrecta' });
  }

  // Registrar acceso
  await supabase.from('access_log').insert({
    nombre: resultado.nombre || resultado.tienda,
    tienda: resultado.tienda,
    rol:    resultado.rol
  }).catch(() => {});

  const token = createToken({ tienda: resultado.tienda, rol: resultado.rol });

  return res.json({
    token,
    tienda: resultado.tienda,
    rol:    resultado.rol,
    nombre: resultado.nombre,
    url:    process.env.SUPABASE_URL,
    key:    process.env.SUPABASE_KEY,
    adminToken: process.env.ADMIN_TOKEN
  });
}
