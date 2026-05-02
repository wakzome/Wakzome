import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const sessions = new Map();

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

  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { tienda: resultado.tienda, rol: resultado.rol });

  setTimeout(() => sessions.delete(token), 8 * 60 * 60 * 1000);

  global._wkzSessions = sessions;

  return res.json({ token, tienda: resultado.tienda, rol: resultado.rol });
}
