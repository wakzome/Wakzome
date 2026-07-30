const PUBLIC_JS = [
  '/js/supabase-config.js',
  '/js/intro.js',
  '/js/shared.js',
];

async function verifyToken(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [header, body, signature] = parts;

  const secret = process.env.JWT_SECRET;
  if (!secret) return false;

  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(`${header}.${body}`);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData);

  const expectedSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  if (expectedSignature !== signature) return false;

  try {
    const payload = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
    if (Date.now() > payload.exp) return false;
    return true;
  } catch {
    return false;
  }
}

export default async function middleware(request) {
  const url = new URL(request.url);

  if (!url.pathname.startsWith('/js/')) {
    return;
  }

  if (PUBLIC_JS.includes(url.pathname)) {
    return;
  }

  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/(?:^|;\s*)wkz_session=([^;]+)/);
  const token = match ? match[1] : null;

  if (!token) {
    return new Response('No autorizado', { status: 401 });
  }

  const valid = await verifyToken(token);
  if (!valid) {
    return new Response('No autorizado', { status: 401 });
  }
}

export const config = {
  matcher: '/js/(.*)',
};
