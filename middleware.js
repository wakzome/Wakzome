// Archivos públicos (necesarios para el login)
const PUBLIC_PATHS = [
  '/js/supabase-config.js',
  '/js/intro.js',
  '/js/shared.js',
];

export default function middleware(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // Solo proteger /js/* y /app.html
  const isProtectedJs = path.startsWith('/js/') && !PUBLIC_PATHS.includes(path);
  const isAppHtml = path === '/app.html';

  if (!isProtectedJs && !isAppHtml) {
    return;
  }

  // Leer cookie wkz_session
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/(?:^|;\s*)wkz_session=([^;]+)/);
  const token = match ? match[1] : null;

  if (!token) {
    return Response.redirect(new URL('/', request.url), 302);
  }

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return Response.redirect(new URL('/', request.url), 302);
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (Date.now() > payload.exp) return Response.redirect(new URL('/', request.url), 302);
  } catch {
    return Response.redirect(new URL('/', request.url), 302);
  }
}

export const config = {
  matcher: ['/js/(.*)', '/app.html'],
};
