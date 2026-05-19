export default function middleware(request) {
  const url = new URL(request.url);

  // Solo proteger archivos dentro de /js/
  if (!url.pathname.startsWith('/js/')) {
    return new Response(null, { status: 200 });
  }

  // Leer la cookie wkz_session
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k, v.join('=')];
    })
  );
  const token = cookies['wkz_session'];

  // Sin token → redirigir al login
  if (!token) {
    return Response.redirect(new URL('/', request.url));
  }

  // Verificar que el token no esté expirado
  try {
    const body = token.split('.')[1];
    const payload = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
    if (Date.now() > payload.exp) {
      return Response.redirect(new URL('/', request.url));
    }
  } catch {
    return Response.redirect(new URL('/', request.url));
  }

  // Token válido → dejar pasar
  return new Response(null, { status: 200 });
}

export const config = {
  matcher: ['/js/:path*'],
};
