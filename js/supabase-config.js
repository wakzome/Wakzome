// ══════════════════════════════════════════════════════════════
//  SUPABASE — configuración central
// ══════════════════════════════════════════════════════════════
const SUPABASE_URL = 'https://wmvucabpkixdzeanfrzx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Wx9SAdPR0kRX-KAsVIj02w_4Y37IyEU';
const sbClient     = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Cliente exclusivo para el admin — incluye token de acceso
const sbAdmin = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  global: { headers: { 'x-admin-token': 'wkz-admin-2025-secret' } }
});
