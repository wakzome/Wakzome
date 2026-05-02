// ══════════════════════════════════════════════════════════════
//  SUPABASE — configuración central
// ══════════════════════════════════════════════════════════════
async function initSupabase(sessionToken) {
  const res = await fetch('/api/config', {
    headers: { 'x-session-token': sessionToken }
  });

  if (!res.ok) throw new Error('No autorizado');

  const { url, key, adminToken } = await res.json();

  window.SUPABASE_URL = url;
  window.SUPABASE_KEY = key;
  window.sbClient = window.supabase.createClient(url, key);
  window.sbAdmin  = window.supabase.createClient(url, key, {
    global: { headers: { 'x-admin-token': adminToken } }
  });
}

window.initSupabase = initSupabase;
