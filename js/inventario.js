(function () {

  // ══════════════════════════════════════════════════════════════
  //  INVENTARIO — cliente Supabase y arranque del módulo
  //
  //  Este archivo solo se descarga tras un login de inventario
  //  válido (ver attemptInventarioLogin en shared.js). El token
  //  recibido aquí vive en sessionStorage y viaja en la cabecera
  //  x-inventario-token en cada petición: es lo que las políticas
  //  RLS de Postgres usan para autorizar (o no) cada operación.
  // ══════════════════════════════════════════════════════════════

  const WKZ_INV_SUPABASE_URL = 'https://wmvucabpkixdzeanfrzx.supabase.co';
  const WKZ_INV_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdnVjYWJwa2l4ZHplYW5mcnp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2NzI2NzgsImV4cCI6MjA4OTI0ODY3OH0.6es0OAupDi1EUflFZ3DxYH2ippcESXIiLR-RZBGAVgM';

  function openInventarioApp(token) {
    if (!token) return;

    window.sbInventario = window.supabase.createClient(WKZ_INV_SUPABASE_URL, WKZ_INV_SUPABASE_ANON_KEY, {
      auth: {
        persistSession:   false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: 'wakzome-sb-inventario'
      },
      db: { schema: 'inventario' },
      global: { headers: { 'x-inventario-token': token } }
    });

    window._wkzInventarioToken = token;

    // Punto de continuación: aquí arrancará la pantalla de
    // selección de tienda (siguiente paso del desarrollo).
  }

  window.openInventarioApp = openInventarioApp;

})();
