// ══════════════════════════════════════════════════════════════
//  SUPABASE — configuración central
// ══════════════════════════════════════════════════════════════
async function initSupabase(sessionToken, credentials) {
  let url, key, adminToken;

  if (credentials) {
    // Usar credenciales recibidas directamente del login — sin llamada extra
    url        = credentials.url;
    key        = credentials.key;
    adminToken = credentials.adminToken;
  } else {
    // Fallback: pedir credenciales al servidor
    const res = await fetch('/api/config', {
      headers: { 'x-session-token': sessionToken }
    });
    if (!res.ok) throw new Error('No autorizado');
    const data = await res.json();
    url        = data.url;
    key        = data.key;
    adminToken = data.adminToken;
  }

  window.SUPABASE_URL = url;
  window.SUPABASE_KEY = key;
  window.ADMIN_TOKEN  = adminToken;
  window.sbClient = window.supabase.createClient(url, key);
  window.sbAdmin  = window.supabase.createClient(url, key, {
    global: { headers: { 'x-admin-token': adminToken } }
  });
}

window.initSupabase = initSupabase;
