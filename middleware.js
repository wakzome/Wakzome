export default function middleware(request) {
  const url = new URL(request.url);

  // Solo actuar en rutas /js/
  if (!url.pathname.startsWith('/js/')) {
    return;
  }

  // Leer cookie wkz_session
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/(?:^|;\s*)wkz_session=([^;]+)/);
  const token = match ? match[1] : null;

  // Sin token → redirigir al login
  if (!token) {
    return Response.redirect(new URL('/', request.url), 302);
  }

  // Verificar que no esté expirado
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return Response.redirect(new URL('/', request.url), 302);
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (Date.now() > payload.exp) {
      return Response.redirect(new URL('/', request.url), 302);
    }
  } catch {
    return Response.redirect(new URL('/', request.url), 302);
  }

  // Token válido → dejar pasar
}

export const config = {
  matcher: '/js/(.*)',
};
