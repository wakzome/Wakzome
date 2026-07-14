import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';
// Import estático só para forçar o bundler da Vercel a incluir o worker no
// deploy — pdfjs-dist carrega-o com um require relativo em runtime que o
// bundler não segue se não houver nenhuma referência estática a ele.
import 'pdfjs-dist/legacy/build/pdf.worker.js';

const BUCKET = 'recibos';

// ── Auth: mesmo esquema HMAC usado em recibos-senhas.js / recibos-gerir.js ──
function verifyToken(token) {
  try {
    const [header, body, signature] = token.split('.');
    const expected = crypto
      .createHmac('sha256', process.env.JWT_SECRET)
      .update(`${header}.${body}`)
      .digest('base64url');
    if (expected !== signature) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function getCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(';')
    .map(c => c.trim())
    .find(c => c.startsWith(name + '='));
  return match ? match.slice(name.length + 1) : null;
}

// ── Mês a processar: mesma regra de recibos.js (rDetectMes) ──
function detectMes() {
  const now = new Date();
  const day = now.getDate();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  if (day <= 9) {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    return `${String(prevMonth).padStart(2, '0')}-${prevYear}`;
  }
  return `${String(month).padStart(2, '0')}-${year}`;
}

function isValidMes(mes) {
  return /^(0[1-9]|1[0-2])-\d{4}$/.test(mes);
}

// ── Sanitização de nome: idêntica a rSanitizeName em recibos.js ──
function sanitizeName(name) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .toLowerCase();
}

// ── Normalização de texto: idêntica a rNormalize em recibos.js ──
function normalizeText(str) {
  return str
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePT(str) {
  return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
}

async function extractFirstPageText(pdfBytes, password) {
  const loadingTask = pdfjsLib.getDocument({
    data: pdfBytes,
    password: password || undefined,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const doc = await loadingTask.promise;
  try {
    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    const items = [...content.items].sort((a, b) => {
      const yDiff = Math.round(b.transform[5]) - Math.round(a.transform[5]);
      return yDiff !== 0 ? yDiff : a.transform[4] - b.transform[4];
    });
    return items.map(it => it.str).join(' ');
  } finally {
    await doc.destroy();
  }
}

// ── Parser dos valores do recibo (texto já normalizado: maiúsculas, sem acentos) ──
function parseRecibo(rawText) {
  const text = normalizeText(rawText);
  const out = {
    vencimentoBase: 0,
    subsAlimentacao: 0,
    faltasDesconto: 0,
    segurancaSocial: 0,
    totalAbonos: 0,
    totalDescontos: 0,
    totalAReceber: 0,
    camposEmFalta: [],
  };

  const mVenc = text.match(/VENCIMENTO BASE\s+([\d.,]+)/);
  if (mVenc) out.vencimentoBase = parsePT(mVenc[1]);
  else out.camposEmFalta.push('vencimentoBase');

  // Linha de ganho: "SUBS. ALIMENTACAO 20D 5,80 116,00" (dias, v.unit, abono)
  const mAlim = text.match(/ALIMENTACAO\s+(\d+)\s*D\s+([\d.,]+)\s+([\d.,]+)/);
  if (mAlim) out.subsAlimentacao = parsePT(mAlim[3]);
  else out.camposEmFalta.push('subsAlimentacao');

  // Linha de desconto: "FALTAS ... SUBS. ALIMENTACAO 10D 58,00" (opcional — nem todo mês tem faltas)
  const mFaltas = text.match(/FALTAS[\s\S]*?ALIMENTACAO\s+(\d+)\s*D\s+([\d.,]+)/);
  if (mFaltas) out.faltasDesconto = parsePT(mFaltas[2]);

  const mSS = text.match(/SEGURANCA SOCIAL\s*\(\s*\d+(?:[.,]\d+)?\s*%\s*\)\s*([\d.,]+)/);
  if (mSS) out.segurancaSocial = parsePT(mSS[1]);
  else out.camposEmFalta.push('segurancaSocial');

  const mTotal = text.match(/\bTOTAL\s+(?!A\s+RECEBER)([\d.,]+)\s+([\d.,]+)/);
  if (mTotal) {
    out.totalAbonos = parsePT(mTotal[1]);
    out.totalDescontos = parsePT(mTotal[2]);
  } else {
    out.camposEmFalta.push('totalAbonos', 'totalDescontos');
  }

  const mReceber = text.match(/TOTAL A RECEBER\s+([\d.,]+)/);
  if (mReceber) out.totalAReceber = parsePT(mReceber[1]);
  else out.camposEmFalta.push('totalAReceber');

  return out;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  // ── 1. Autenticação: exige sessão válida com rol='nadiya' ──
  const token =
    getCookie(req.headers.cookie, 'wkz_session') ||
    req.headers['x-session-token'] ||
    null;

  if (!token) return res.status(401).json({ error: 'Não autorizado' });

  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Sessão inválida' });
  if (payload.rol !== 'nadiya') return res.status(403).json({ error: 'Acesso negado' });

  const nomeRecibo = process.env.NADIYA_NOME_RECIBO;
  if (!nomeRecibo) {
    console.error('[nadiya-recibo] NADIYA_NOME_RECIBO não configurada no ambiente');
    return res.status(500).json({ error: 'Configuração em falta no servidor' });
  }

  const mesParam = typeof req.query.mes === 'string' ? req.query.mes : null;
  const mes = mesParam && isValidMes(mesParam) ? mesParam : detectMes();

  // ── 2. Service role: nunca exposta ao browser, bypassa RLS ──
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: funcionaria, error: dbError } = await sb
    .from('recibos_funcionarias')
    .select('nome, senha, ativo')
    .eq('nome', nomeRecibo)
    .maybeSingle();

  if (dbError) {
    console.error('[nadiya-recibo] Erro DB:', dbError.message);
    return res.status(500).json({ error: 'Erro na base de dados' });
  }
  if (!funcionaria || !funcionaria.ativo) {
    return res.status(404).json({ error: 'Colaboradora não encontrada ou inativa' });
  }
  if (!funcionaria.senha) {
    console.error('[nadiya-recibo] Colaboradora sem senha configurada em recibos_funcionarias');
    return res.status(500).json({ error: 'Recibo sem senha configurada' });
  }

  // ── 3. Localizar o(s) ficheiro(s) do mês no bucket, por prefixo de nome ──
  const prefix = sanitizeName(funcionaria.nome);
  const { data: files, error: listError } = await sb.storage.from(BUCKET).list(mes, { search: prefix });

  if (listError) {
    console.error('[nadiya-recibo] Erro ao listar storage:', listError.message);
    return res.status(500).json({ error: 'Erro ao consultar o storage' });
  }

  const matches = (files || [])
    .filter(f => f.name.startsWith(prefix) && f.name.endsWith('.pdf'))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (matches.length === 0) {
    return res.json({ mes, encontrado: false, motivo: 'Recibo do mês ainda não publicado' });
  }

  // Em meses com mais de uma página (ex.: subsídio de férias), usa-se a primeira
  // e assinala-se o aviso — o cálculo mensal padrão assume um único recibo.
  const avisoMultiplasPaginas = matches.length > 1;
  const alvo = matches[0];

  const { data: fileBlob, error: downloadError } = await sb.storage
    .from(BUCKET)
    .download(`${mes}/${alvo.name}`);

  if (downloadError) {
    console.error('[nadiya-recibo] Erro ao descarregar:', downloadError.message);
    return res.status(500).json({ error: 'Erro ao descarregar o recibo' });
  }

  const pdfBytes = new Uint8Array(await fileBlob.arrayBuffer());

  // ── 4. Desencriptar + extrair texto — tudo no servidor, a senha nunca viaja ──
  let rawText;
  try {
    rawText = await extractFirstPageText(pdfBytes, funcionaria.senha);
  } catch (e) {
    console.error('[nadiya-recibo] Erro ao abrir pdf:', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Erro ao abrir o recibo (senha incorreta ou pdf inválido)' });
  }

  const dados = parseRecibo(rawText);
  const credito = dados.totalAReceber + dados.segurancaSocial;

  // ── 5. Resposta: apenas os valores calculados, nunca senha/pdf/texto cru ──
  return res.json({
    mes,
    encontrado: true,
    avisoMultiplasPaginas,
    totalAbonos: dados.totalAbonos,
    totalDescontos: dados.totalDescontos,
    totalAReceber: dados.totalAReceber,
    segurancaSocial: dados.segurancaSocial,
    credito,
    camposEmFalta: dados.camposEmFalta,
  });
}
