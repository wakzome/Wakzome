// ══════════════════════════════════════════════════════════════
//  SUPABASE — configuración central
//
//  Nota: la autenticación de la app es propia (login → /api/config
//  + cabecera x-admin-token). NO se usa Supabase Auth (GoTrue) para
//  sesiones de usuario. Por eso ambos clientes desactivan la
//  persistencia/refresco de sesión y usan storageKey distintos:
//  así se elimina el aviso "Multiple GoTrueClient instances detected"
//  y el estado de auth/Realtime compartido que lo provoca.
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

  // Opciones de auth comunes: sin sesión GoTrue persistente ni auto-refresh.
  // Cada cliente lleva un storageKey único para no colisionar entre sí.
  const baseAuth = {
    persistSession:   false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  };

  window.sbClient = window.supabase.createClient(url, key, {
    auth: Object.assign({ storageKey: 'wakzome-sb-client' }, baseAuth)
  });

  window.sbAdmin = window.supabase.createClient(url, key, {
    auth: Object.assign({ storageKey: 'wakzome-sb-admin' }, baseAuth),
    global: { headers: { 'x-admin-token': adminToken } }
  });
}
window.initSupabase = initSupabase;
