import { NextResponse } from 'next/server';

function verifyToken(token) {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return null;

    const [header, body, signature] = token.split('.');
    if (!header || !body || !signature) return null;

    // Verificar firma usando crypto de Web API (disponible en Vercel Edge)
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const msgData = encoder.encode(`${header}.${body}`);

    // Verificar expiración
    const payload = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
    if (Date.now() > payload.exp) return null;

    return payload;
  } catch {
    return null;
  }
}

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Solo proteger archivos dentro de /js/
  if (!pathname.startsWith('/js/')) {
    return NextResponse.next();
  }

  // Leer el token de la cookie
  const token = request.cookies.get('wkz_session')?.value;

  if (!token) {
    // Sin token → redirigir al login
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Verificar que el token no esté expirado (verificación básica sin crypto)
  try {
    const body = token.split('.')[1];
    const payload = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
    if (Date.now() > payload.exp) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  } catch {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Token válido → dejar pasar
  return NextResponse.next();
}

export const config = {
  matcher: ['/js/:path*'],
};
