// Archivos necesarios para mostrar el login — NO bloquear
const PUBLIC_JS = [
  '/js/supabase-config.js',
  '/js/intro.js',
  '/js/shared.js',
];

export default function middleware(request) {
  const url = new URL(request.url);

  // Solo actuar en rutas /js/
  if (!url.pathname.startsWith('/js/')) {
    return;
  }

  // Dejar pasar los JS del login
  if (PUBLIC_JS.includes(url.pathname)) {
    return;
  }

  // Para el resto, verificar cookie
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/(?:^|;\s*)wkz_session=([^;]+)/);
  const token = match ? match[1] : null;

  if (!token) {
    return new Response('No autorizado', { status: 401 });
  }

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return new Response('No autorizado', { status: 401 });
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (Date.now() > payload.exp) return new Response('No autorizado', { status: 401 });
  } catch {
    return new Response('No autorizado', { status: 401 });
  }

  // Token válido → dejar pasar
}

export const config = {
  matcher: '/js/(.*)',
};
