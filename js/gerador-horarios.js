// ══ GERADOR DE HORÁRIOS — Porto Santo ══
(function () {

  // ── KNOWLEDGE BASE — loaded dynamically from Supabase ──
  // No names or personal data hardcoded here. All data comes from the database.
  let STORES = [];
  let PEOPLE = [];

  // ── SUPABASE CONFIG ──
  const SUPA_URL = 'https://wmvucabpkixdzeanfrzx.supabase.co';
  const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdnVjYWJwa2l4ZHplYW5mcnp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2NzI2NzgsImV4cCI6MjA4OTI0ODY3OH0.6es0OAupDi1EUflFZ3DxYH2ippcESXIiLR-RZBGAVgM';

  let _supabaseClient = null;
  function getSupabase() {
    if (_supabaseClient) return _supabaseClient;
    if (window.supabase && window.supabase.createClient) {
      _supabaseClient = window.supabase.createClient(SUPA_URL, SUPA_KEY);
      return _supabaseClient;
    }
    return null;
  }

  async function supabaseFetch(table, filters = {}) {
    const sb = getSupabase();
    if (!sb) { console.warn('Supabase client not available'); return []; }
    try {
      let query = sb.from(table).select('*');
      Object.entries(filters).forEach(([col, val]) => { query = query.eq(col, val); });
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error(`Supabase fetch error (${table}):`, e);
      return [];
    }
  }

  async function supabaseInsert(table, data) {
    const sb = getSupabase();
    if (!sb) return null;
    try {
      const { data: result, error } = await sb.from(table).insert(data).select();
      if (error) throw error;
      return result;
    } catch (e) {
      console.error(`Supabase insert error (${table}):`, e);
      return null;
    }
  }

  async function supabaseUpdate(table, id, data) {
    const sb = getSupabase();
    if (!sb) return null;
    try {
      // Remove 'id' from data payload to avoid conflict with the filter
      const payload = { ...data };
      delete payload.id;
      const { data: result, error } = await sb.from(table).update(payload).eq('id', id).select();
      if (error) throw error;
      return result && result.length > 0 ? result : [payload];
    } catch (e) {
      console.error(`Supabase update error (${table}):`, e);
      return null;
    }
  }

  // Load STORES and PEOPLE from Supabase
  // Expected Supabase tables:
  //   gh_stores: id, name, short, priority, active
  //   gh_people: id, name, hrs, store_id, efetiva, start_date, end_date,
  //              can_alone, mobile, cover_pri, knows (array), hard_avoid (array),
  //              soft_avoid (array), active
  async function loadKnowledgeBase() {
    const [storesRaw, peopleRaw] = await Promise.all([
      supabaseFetch('gh_stores', { active: true }),
      supabaseFetch('gh_people', { active: true })
    ]);

    STORES = storesRaw.map(s => ({
      id: s.id, name: s.name, short: s.short, priority: s.priority
    }));

    PEOPLE = peopleRaw.map(p => {
      // Derivar autonomia: campo 'autonomia' na BD tem prioridade.
      // Fallback de compatibilidade para registos antigos (efetiva + can_alone).
      let autonomia = p.autonomia || null;
      if (!autonomia) {
        if (p.efetiva)          autonomia = 'efectiva';
        else if (p.can_alone)   autonomia = 'autonoma';
        else                    autonomia = 'nao_autonoma';
      }
      // Derivar flags operacionais a partir de autonomia
      const efetiva        = autonomia === 'efectiva';
      const canAlone       = autonomia === 'efectiva' || autonomia === 'autonoma';
      const canAloneInterval = autonomia !== 'nao_autonoma'; // efectiva, autonoma, autonoma_h
      // Peso: efectiva=2, autonoma/autonoma_h=1.5, nao_autonoma=1
      const pesoBase = efetiva ? 2 : (autonomia === 'nao_autonoma' ? 1 : 1.5);

      return {
        id: p.id,
        name: p.name,
        hrs: p.hrs || 40,
        store: p.store_id || null,
        autonomia,          // 'efectiva'|'autonoma'|'autonoma_h'|'nao_autonoma'
        efetiva,            // true só para efectivas
        canAlone,           // pode ficar sozinha o dia todo
        canAloneInterval,   // pode ficar sozinha só no intervalo
        pesoBase,           // peso para cálculos de almoço
        start: p.start_date,
        end: p.end_date || null,
        mobile: p.mobile || false,
        coverPri: p.cover_pri || 9,
        knows: p.knows || (p.store_id ? [p.store_id] : []),
        hardAvoid: p.hard_avoid || [],
        softAvoid: p.soft_avoid || []
      };
    });

    window.GERADOR_PEOPLE = PEOPLE;
  }

  const DAYS   = ['SEG','TER','QUA','QUI','SEX','SAB','DOM'];
  const DAY_PT = { SEG:'Segunda', TER:'Terça', QUA:'Quarta', QUI:'Quinta', SEX:'Sexta', SAB:'Sábado', DOM:'Domingo' };

  // ── 6 HORÁRIOS PERMITIDOS (Prompt §5) ──
  // A  10-13 / 14-19   (8h, intervalo 13h)
  // B  10-14 / 15-19   (8h, intervalo 14h)  ← default standard
  // C  10-15 / 16-19   (8h, intervalo 15h)
  // D  09-12 / 13-18   (8h, abertura 9h)
  // E  11-15 / 16-20   (8h, fecho 20h — pós-noite)
  // F  09-13 / 19-23   (8h, turno noite)
  const SH_A = '10:00-13:00|14:00-19:00';
  const SH_B = '10:00-14:00|15:00-19:00';
  const SH_C = '10:00-15:00|16:00-19:00';
  const SH_D = '09:00-12:00|13:00-18:00';
  const SH_E = '11:00-15:00|16:00-20:00';
  const SH_F = '09:00-13:00|19:00-23:00';

  // Aliases para compatibilidade com o código existente
  const SH_DEFAULT = SH_B;
  const SH_ALT     = SH_A;

  // ── ESCENARIOS — tabla estática generada desde LIBRO_5.xlsx ──
  // Clave: 'n_dom_l_opc'
  //   n   = total personas activas
  //   dom = personas que trabajan el domingo
  //   l   = número de tiendas abiertas
  //   opc = variante del modelo (1 o 2)
  //
  // Cada escenario define:
  //   combinacion → códigos de patrón a asignar (en orden, primero los que trabajan DOM)
  //   tiendas     → MIN/MAX de personas por tienda, en semana y en domingo
  //
  // La clave de tienda usa el campo 'short' de STORES en minúsculas.
  // Si no existe el escenario exacto → fallback al comportamiento anterior.
  const ESCENARIOS = {
    '4_0_3_1': { combinacion: '6,7,8,9', tiendas: { avenida: { min:1, max:2, minDom:0, maxDom:0 }, mercado: { min:1, max:1, minDom:0, maxDom:0 }, shana: { min:1, max:1, minDom:0, maxDom:0 } } },
    '5_0_3_1': { combinacion: '5,6,7,8,9', tiendas: { avenida: { min:2, max:2, minDom:0, maxDom:0 }, mercado: { min:1, max:2, minDom:0, maxDom:0 }, shana: { min:1, max:1, minDom:0, maxDom:0 } } },
    '6_0_3_1': { combinacion: '5,6,7,8,9,10', tiendas: { avenida: { min:2, max:2, minDom:0, maxDom:0 }, mercado: { min:2, max:2, minDom:0, maxDom:0 }, shana: { min:1, max:1, minDom:0, maxDom:0 } } },
    '6_1_3_1': { combinacion: '1,8,6,10,9,7', tiendas: { avenida: { min:2, max:2, minDom:1, maxDom:1 }, mercado: { min:1, max:2, minDom:0, maxDom:0 }, shana: { min:1, max:1, minDom:0, maxDom:0 } } },
    '7_0_3_1': { combinacion: '5,6,7,8,9,10,6', tiendas: { avenida: { min:2, max:3, minDom:0, maxDom:0 }, mercado: { min:2, max:2, minDom:0, maxDom:0 }, shana: { min:1, max:1, minDom:0, maxDom:0 } } },
    '7_0_4_1': { combinacion: '5,6,7,8,9,10,6', tiendas: { avenida: { min:2, max:2, minDom:0, maxDom:0 }, mercado: { min:1, max:2, minDom:0, maxDom:0 }, shana: { min:1, max:1, minDom:0, maxDom:0 }, maxx: { min:1, max:1, minDom:0, maxDom:0 } } },
    '7_1_3_1': { combinacion: '1,6,7,8,9,10,6', tiendas: { avenida: { min:2, max:3, minDom:1, maxDom:1 }, mercado: { min:2, max:2, minDom:0, maxDom:0 }, shana: { min:1, max:1, minDom:0, maxDom:0 } } },
    '7_1_4_1': { combinacion: '1,6,7,8,9,10,6', tiendas: { avenida: { min:2, max:3, minDom:1, maxDom:1 }, mercado: { min:1, max:2, minDom:0, maxDom:0 }, shana: { min:1, max:1, minDom:0, maxDom:0 }, maxx: { min:1, max:1, minDom:0, maxDom:0 } } },
    '7_2_3_1': { combinacion: '1,2,7,8,9,10,6', tiendas: { avenida: { min:2, max:3, minDom:1, maxDom:1 }, mercado: { min:2, max:2, minDom:1, maxDom:1 }, shana: { min:1, max:1, minDom:0, maxDom:0 } } },
    '7_2_4_1': { combinacion: '1,2,7,8,9,10,6', tiendas: { avenida: { min:2, max:2, minDom:1, maxDom:1 }, mercado: { min:1, max:2, minDom:1, maxDom:1 }, shana: { min:1, max:1, minDom:0, maxDom:0 }, maxx: { min:1, max:1, minDom:0, maxDom:0 } } },
    '7_3_3_1': { combinacion: '1,1,2,6,7,9,10', tiendas: { avenida: { min:2, max:3, minDom:1, maxDom:1 }, mercado: { min:1, max:3, minDom:1, maxDom:1 }, shana: { min:1, max:1, minDom:1, maxDom:1 } } },
    '7_3_4_1': { combinacion: '1,1,2,6,7,9,10', tiendas: { avenida: { min:2, max:2, minDom:1, maxDom:1 }, mercado: { min:1, max:2, minDom:1, maxDom:1 }, shana: { min:1, max:1, minDom:1, maxDom:1 }, maxx: { min:1, max:1, minDom:0, maxDom:0 } } },
    '8_0_3_1': { combinacion: '5,6,7,8,9,10,6,7', tiendas: { avenida: { min:3, max:3, minDom:0, maxDom:0 }, mercado: { min:2, max:3, minDom:0, maxDom:0 }, shana: { min:1, max:1, minDom:0, maxDom:0 } } },
    '8_0_4_1': { combinacion: '5,6,7,8,9,10,6,7', tiendas: { avenida: { min:2, max:3, minDom:0, maxDom:0 }, mercado: { min:2, max:2, minDom:0, maxDom:0 }, shana: { min:1, max:1, minDom:0, maxDom:0 }, maxx: { min:1, max:1, minDom:0, maxDom:0 } } },
    '8_1_3_1': { combinacion: '1,8,6,10,6,7,7,9', tiendas: { avenida: { min:3, max:3, minDom:1, maxDom:1 }, mercado: { min:2, max:3, minDom:0, maxDom:0 }, shana: { min:1, max:1, minDom:0, maxDom:0 } } },
    '8_1_4_1': { combinacion: '1,8,6,10,6,7,7,9', tiendas: { avenida: { min:2, max:3, minDom:1, maxDom:1 }, mercado: { min:2, max:2, minDom:0, maxDom:0 }, shana: { min:1, max:1, minDom:0, maxDom:0 }, maxx: { min:1, max:1, minDom:0, maxDom:0 } } },
    '8_2_3_1': { combinacion: '1,2,6,7,8,9,10,7', tiendas: { avenida: { min:3, max:3, minDom:1, maxDom:1 }, mercado: { min:2, max:3, minDom:1, maxDom:1 }, shana: { min:1, max:1, minDom:0, maxDom:0 } } },
    '8_2_4_1': { combinacion: '1,2,6,7,8,9,10,7', tiendas: { avenida: { min:2, max:3, minDom:1, maxDom:1 }, mercado: { min:2, max:2, minDom:1, maxDom:1 }, shana: { min:1, max:1, minDom:0, maxDom:0 }, maxx: { min:1, max:1, minDom:0, maxDom:0 } } },
    '8_3_3_1': { combinacion: '1,2,2,7,8,10,10,7', tiendas: { avenida: { min:3, max:4, minDom:1, maxDom:1 }, mercado: { min:2, max:3, minDom:1, maxDom:1 }, shana: { min:1, max:2, minDom:1, maxDom:1 } } },
    '8_3_4_1': { combinacion: '1,2,2,7,8,10,10,7', tiendas: { avenida: { min:2, max:3, minDom:1, maxDom:1 }, mercado: { min:2, max:2, minDom:1, maxDom:1 }, shana: { min:1, max:2, minDom:1, maxDom:1 }, maxx: { min:1, max:1, minDom:0, maxDom:0 } } },
    '8_4_3_1': { combinacion: '1,1,2,2,7,7,10,10', tiendas: { avenida: { min:3, max:3, minDom:2, maxDom:2 }, mercado: { min:2, max:2, minDom:1, maxDom:1 }, shana: { min:1, max:1, minDom:1, maxDom:1 } } },
    '8_4_4_1': { combinacion: '1,1,2,2,7,7,10,10', tiendas: { avenida: { min:2, max:2, minDom:2, maxDom:2 }, mercado: { min:2, max:2, minDom:1, maxDom:1 }, shana: { min:1, max:1, minDom:1, maxDom:1 }, maxx: { min:1, max:1, minDom:0, maxDom:0 } } },
    '8_4_4_2': { combinacion: '1,1,2,2,7,7,10,10', tiendas: { avenida: { min:2, max:2, minDom:1, maxDom:1 }, mercado: { min:2, max:2, minDom:1, maxDom:1 }, shana: { min:1, max:1, minDom:1, maxDom:1 }, maxx: { min:1, max:1, minDom:1, maxDom:1 } } },
    '8_5_3_1': { combinacion: '1,1,2,2,2,7,7,10', tiendas: { avenida: { min:2, max:3, minDom:2, maxDom:2 }, mercado: { min:2, max:3, minDom:2, maxDom:2 }, shana: { min:1, max:1, minDom:1, maxDom:1 } } },
    '8_5_4_1': { combinacion: '1,1,2,2,2,7,7,10', tiendas: { avenida: { min:2, max:3, minDom:2, maxDom:2 }, mercado: { min:1, max:2, minDom:1, maxDom:1 }, shana: { min:1, max:1, minDom:1, maxDom:1 }, maxx: { min:1, max:1, minDom:1, maxDom:1 } } },
    '9_2_3_1': { combinacion: '1,8,2,10,6,7,7,9,10', tiendas: { avenida: { min:3, max:4, minDom:1, maxDom:1 }, mercado: { min:3, max:3, minDom:1, maxDom:1 }, shana: { min:1, max:1, minDom:0, maxDom:0 } } },
    '9_2_4_1': { combinacion: '1,8,2,10,6,7,7,9,10', tiendas: { avenida: { min:3, max:3, minDom:1, maxDom:1 }, mercado: { min:2, max:3, minDom:1, maxDom:1 }, shana: { min:1, max:1, minDom:0, maxDom:0 }, maxx: { min:1, max:1, minDom:0, maxDom:0 } } },
    '9_3_3_1': { combinacion: '1,1,2,10,6,7,7,9,10', tiendas: { avenida: { min:3, max:3, minDom:1, maxDom:1 }, mercado: { min:3, max:3, minDom:1, maxDom:1 }, shana: { min:1, max:1, minDom:1, maxDom:1 } } },
    '9_3_4_1': { combinacion: '1,1,2,10,6,7,7,9,10', tiendas: { avenida: { min:3, max:3, minDom:1, maxDom:1 }, mercado: { min:2, max:2, minDom:1, maxDom:1 }, shana: { min:1, max:1, minDom:1, maxDom:1 }, maxx: { min:1, max:1, minDom:0, maxDom:0 } } },
    '9_4_3_1': { combinacion: '1,1,2,2,6,7,7,10,10', tiendas: { avenida: { min:3, max:3, minDom:2, maxDom:2 }, mercado: { min:2, max:3, minDom:1, maxDom:1 }, shana: { min:1, max:1, minDom:1, maxDom:1 } } },
    '9_4_4_1': { combinacion: '1,1,2,2,6,7,7,10,10', tiendas: { avenida: { min:2, max:3, minDom:2, maxDom:2 }, mercado: { min:2, max:2, minDom:1, maxDom:1 }, shana: { min:1, max:1, minDom:1, maxDom:1 }, maxx: { min:1, max:1, minDom:0, maxDom:0 } } },
    '9_4_4_2': { combinacion: '1,1,2,2,6,7,7,10,10', tiendas: { avenida: { min:2, max:3, minDom:1, maxDom:1 }, mercado: { min:2, max:2, minDom:1, maxDom:1 }, shana: { min:1, max:1, minDom:1, maxDom:1 }, maxx: { min:1, max:1, minDom:1, maxDom:1 } } },
    '9_5_4_1': { combinacion: '1,1,2,2,7,7,10,10,2', tiendas: { avenida: { min:2, max:3, minDom:2, maxDom:2 }, mercado: { min:2, max:2, minDom:1, maxDom:1 }, shana: { min:1, max:1, minDom:1, maxDom:1 }, maxx: { min:1, max:1, minDom:1, maxDom:1 } } },
    '9_5_3_1': { combinacion: '1,1,2,2,7,7,10,10,2', tiendas: { avenida: { min:3, max:3, minDom:2, maxDom:2 }, mercado: { min:2, max:3, minDom:2, maxDom:2 }, shana: { min:1, max:1, minDom:1, maxDom:1 } } },
    '10_3_4_1': { combinacion: '1,1,2,10,6,7,8,9,10,7', tiendas: { avenida: { min:3, max:3, minDom:1, maxDom:1 }, mercado: { min:2, max:3, minDom:1, maxDom:1 }, shana: { min:1, max:1, minDom:1, maxDom:1 }, maxx: { min:1, max:1, minDom:0, maxDom:0 } } },
    '10_4_4_1': { combinacion: '1,1,2,2,7,7,10,10,6,7', tiendas: { avenida: { min:3, max:3, minDom:2, maxDom:2 }, mercado: { min:2, max:3, minDom:1, maxDom:1 }, shana: { min:1, max:1, minDom:1, maxDom:1 }, maxx: { min:1, max:1, minDom:0, maxDom:0 } } },
    '10_4_4_2': { combinacion: '1,1,2,2,7,7,10,10,6,7', tiendas: { avenida: { min:3, max:3, minDom:1, maxDom:1 }, mercado: { min:2, max:3, minDom:1, maxDom:1 }, shana: { min:1, max:1, minDom:1, maxDom:1 }, maxx: { min:1, max:1, minDom:1, maxDom:1 } } },
    '10_5_3_1': { combinacion: '1,1,2,2,7,7,10,10,6,1', tiendas: { avenida: { min:3, max:4, minDom:2, maxDom:2 }, mercado: { min:2, max:3, minDom:2, maxDom:2 }, shana: { min:1, max:1, minDom:1, maxDom:1 } } },
    '10_5_4_1': { combinacion: '1,1,2,2,7,7,10,10,6,1', tiendas: { avenida: { min:3, max:3, minDom:2, maxDom:2 }, mercado: { min:2, max:3, minDom:1, maxDom:1 }, shana: { min:1, max:1, minDom:1, maxDom:1 }, maxx: { min:1, max:1, minDom:1, maxDom:1 } } },
    '11_4_4_1': { combinacion: '1,1,1,2,6,7,6,7,10,10,9', tiendas: { avenida: { min:3, max:4, minDom:2, maxDom:2 }, mercado: { min:3, max:3, minDom:1, maxDom:1 }, shana: { min:1, max:1, minDom:1, maxDom:1 }, maxx: { min:1, max:1, minDom:0, maxDom:0 } } },
    '11_4_4_2': { combinacion: '1,1,1,2,6,7,6,7,10,10,9', tiendas: { avenida: { min:3, max:4, minDom:1, maxDom:1 }, mercado: { min:3, max:3, minDom:1, maxDom:1 }, shana: { min:1, max:1, minDom:1, maxDom:1 }, maxx: { min:1, max:1, minDom:1, maxDom:1 } } },
    '11_5_4_1': { combinacion: '1,1,2,2,7,7,10,10,6,1,7', tiendas: { avenida: { min:3, max:4, minDom:2, maxDom:2 }, mercado: { min:3, max:3, minDom:1, maxDom:1 }, shana: { min:1, max:1, minDom:1, maxDom:1 }, maxx: { min:1, max:1, minDom:1, maxDom:1 } } },
    '12_4_4_1': { combinacion: '1,1,2,2,6,7,7,7,8,10,10,10', tiendas: { avenida: { min:4, max:4, minDom:2, maxDom:2 }, mercado: { min:3, max:4, minDom:1, maxDom:1 }, shana: { min:1, max:1, minDom:1, maxDom:1 }, maxx: { min:1, max:2, minDom:0, maxDom:0 } } },
    '12_4_4_2': { combinacion: '1,1,2,2,6,7,7,7,8,10,10,10', tiendas: { avenida: { min:4, max:4, minDom:1, maxDom:1 }, mercado: { min:3, max:4, minDom:1, maxDom:1 }, shana: { min:1, max:1, minDom:1, maxDom:1 }, maxx: { min:1, max:2, minDom:1, maxDom:1 } } },
    '12_5_4_1': { combinacion: '1,1,1,2,2,6,7,7,7,10,10,10', tiendas: { avenida: { min:4, max:4, minDom:2, maxDom:2 }, mercado: { min:3, max:4, minDom:1, maxDom:1 }, shana: { min:1, max:1, minDom:1, maxDom:1 }, maxx: { min:1, max:1, minDom:1, maxDom:1 } } },
  };

  // Busca el escenario por (n, dom, l, opc).
  // — Primero intenta opc exacto
  // — Si no existe opc=2, cae a opc=1
  // — Si no existe l, intenta l-1 (tienda sin personal ese día)
  // — Si nada coincide → null (fallback al comportamiento anterior)
  // La clave de tienda se resuelve por el campo 'short' de STORES en minúsculas.
  function getEscenario(n, dom, l, opc) {
    opc = opc || 1;
    const tryKey = (n, dom, l, o) => ESCENARIOS[`${n}_${dom}_${l}_${o}`] || null;
    return tryKey(n,dom,l,opc)
        || tryKey(n,dom,l,1)
        || (l > 3 ? tryKey(n,dom,l-1,opc) || tryKey(n,dom,l-1,1) : null)
        || null;
  }

  // Resuelve la clave de tienda en ESCENARIOS a partir del store id.
  // Usa el campo 'short' de STORES en minúsculas como clave.
  function _escStoreKey(sid) {
    return (ST(sid)?.short || sid || '').toLowerCase().split(' ')[0];
  }

  // MIN semanal del escenario activo para una tienda. null → usar storeMin manual.
  function escenarioMin(esc, sid) {
    if (!esc) return null;
    const v = esc.tiendas[_escStoreKey(sid)];
    return v != null ? v.min : null;
  }

  // MAX semanal del escenario activo para una tienda. null → usar storeMax manual.
  function escenarioMax(esc, sid) {
    if (!esc) return null;
    const v = esc.tiendas[_escStoreKey(sid)];
    return v != null ? v.max : null;
  }

  // MIN dominical del escenario activo para una tienda. null → usar sundayMinFor manual.
  function escenarioMinDom(esc, sid) {
    if (!esc) return null;
    const v = esc.tiendas[_escStoreKey(sid)];
    return v != null ? v.minDom : null;
  }

  // Modos de abertura por loja (configurados no Passo 3)
  // 'standard'  → 10-19 (B/A)
  // 'early'     → 09-18/19 (D/B)  +2h manhã
  // 'extended'  → 10-20 (B/E)     +2h tarde (até 20h)
  // 'night'     → turno F ativo   (até 23h)
  // 'sunday'    → 10-19 standard ao domingo (B/A)
  const STORE_MODES = [
    { id: 'standard', label: '10:00-19:00',        desc: 'Horário padrão',            shifts: [SH_B, SH_A] },
    { id: 'early',    label: '09:00-19:00 (+1h)',   desc: 'Abertura às 9h',            shifts: [SH_D, SH_B] },
    { id: 'extended', label: '10:00-20:00 (+1h)',   desc: 'Fecho às 20h',              shifts: [SH_B, SH_E] },
    { id: 'full',     label: '09:00-20:00 (+2h)',   desc: 'Abertura 9h e fecho 20h',   shifts: [SH_D, SH_E] },
    { id: 'night',    label: '09:00-23:00 (noite)', desc: 'Turno noite até 23h',       shifts: [SH_D, SH_F] },
  ];

  // Devolve o par [shiftPrincipal, shiftAlternativo] para uma loja num dado modo
  function modeShifts(sid) {
    const mode = S.storeMode?.[sid] || 'standard';
    return STORE_MODES.find(m => m.id === mode)?.shifts || [SH_B, SH_A];
  }
  // Shift "base" da loja (o que fica quando apenas 1 pessoa)
  function storeBaseShift(sid) { return modeShifts(sid)[0]; }
  // Shift "alternativo" (quem sai ao intervalo mais cedo)
  function storeAltShift(sid)  { return modeShifts(sid)[1]; }

  // Calcula horas de um shift string ('HH:MM-HH:MM|HH:MM-HH:MM')
  function shiftHours(sh) {
    if (!sh) return 0;
    return sh.split('|').reduce((tot, seg) => {
      const [a, b] = seg.split('-').map(s => { const [h, m] = s.split(':').map(Number); return h + m/60; });
      return tot + (b - a);
    }, 0);
  }

  // Devolve true se o shift fecha às 23h
  function closesAt23(sh) { return sh && sh.includes('23:00'); }

  // Expor PEOPLE globalmente para que ferias.js possa cruzar nomes ↔ ids
  window.GERADOR_PEOPLE = PEOPLE;

  // ── MEMORY (sessionStorage) ──
  let MEM = (function () {
    try { const r = sessionStorage.getItem('mzk_gh8'); if (r) return JSON.parse(r); } catch (e) {}
    return { cycleWeek: 0, offsets: {}, sundays: {} };
  })();
  function saveMem() { try { sessionStorage.setItem('mzk_gh8', JSON.stringify(MEM)); } catch (e) {} }

  // ── STATE ──
  function blank() {
    return {
      weekStart: null, openStores: [], openDays: {}, storeMin: {}, storeMax: {},
      storeMode: {}, domPessoas: null,
      absences: [],
      sandraDay: {}, folgaDay: {}, sundayAssigned: {}, extraDayOff: {},
      schedule: {}, alerts: [], decisions: []
    };
  }
  let S = blank();

  // ── HELPERS ──
  function P(id)    { return PEOPLE.find(p => p.id === id); }
  function ST(id)   { return STORES.find(s => s.id === id); }
  function sname(id)  { return ST(id)?.name  || id || '—'; }
  function sshort(id) { return ST(id)?.short || id || '—'; }
  function wkDates() {
    return DAYS.map((_, i) => { const d = new Date(S.weekStart); d.setDate(d.getDate() + i); return d; });
  }
  function fmt(d) { if (!d) return ''; return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; }
  function nextMonday() {
    const t = new Date();
    const dow = t.getDay(); // 0=dom, 1=seg, ..., 6=sab
    // Días hasta el próximo lunes:
    // dom(0)→+1, seg(1)→+7, ter(2)→+6, qua(3)→+5, qui(4)→+4, sex(5)→+3, sab(6)→+2
    const daysUntilMonday = dow === 0 ? 1 : dow === 1 ? 7 : 8 - dow;
    t.setDate(t.getDate() + daysUntilMonday);
    return t.toISOString().split('T')[0];
  }
  function isoWeek(date) { const d = new Date(date); d.setHours(0,0,0,0); d.setDate(d.getDate()+3-(d.getDay()+6)%7); const w1 = new Date(d.getFullYear(),0,4); return 1+Math.round(((d-w1)/86400000-3+(w1.getDay()+6)%7)/7); }
  function weeksSince(s, ref) { return Math.floor((ref - new Date(s)) / (7*864e5)); }
  function absOf(pid)       { return S.absences.find(a => a.pid === pid) || null; }

  // Converte uma data ISO (YYYY-MM-DD) no dia-da-semana correspondente (ex: 'QUA').
  // Devolve null se a data cair fora da semana actual.
  function dayOfWeekKey(dateStr) {
    if (!dateStr || !S.weekStart) return null;
    const d    = new Date(dateStr + 'T00:00:00');
    const diff = Math.round((d - new Date(S.weekStart)) / 86400000);
    if (diff < 0 || diff > 6) return null; // fora desta semana
    return DAYS[diff];
  }

  // Pessoa está ausente num dia concreto?
  // Respeita 'from' (1.º dia de ausência) e 'to' (último dia de ausência).
  // Se 'to' não existir assume até ao final da semana (DOM).
  function isAbsent(pid, day) {
    const a = absOf(pid); if (!a) return false;
    const di    = DAYS.indexOf(day);
    const fromI = DAYS.indexOf(a.from);
    const toI   = a.to ? DAYS.indexOf(a.to) : 6;
    return di >= fromI && di <= toI;
  }

  // Pessoa ausente a semana toda?
  function fullyAbsent(pid) {
    const a = absOf(pid); if (!a) return false;
    const fromI = DAYS.indexOf(a.from);
    const toI   = a.to ? DAYS.indexOf(a.to) : 6;
    return fromI === 0 && toI === 6;
  }
  function storeOpen(sid, day) { return S.openStores.includes(sid) && S.openDays[sid]?.includes(day); }
  function storeMin(sid) {
    // Prioridad: escenario activo → manual → 1
    const fromEsc = escenarioMin(S._escenarioActivo, sid);
    if (fromEsc != null) return fromEsc;
    return S.storeMin?.[sid] > 0 ? S.storeMin[sid] : 1;
  }
  function storeMax(sid) {
    // Prioridad: escenario activo → manual → prioridad de tienda → Infinity
    const fromEsc = escenarioMax(S._escenarioActivo, sid);
    if (fromEsc != null) return fromEsc;
    // Shana y Maxx (priority >= 3) tienen máximo estructural de 1 persona — inamovible.
    const storePriority = STORES.find(s => s.id === sid)?.priority ?? 9;
    if (storePriority >= 3) return 1;
    // Para Avenida y Mercado: respetar el máximo configurado manualmente, o sin límite.
    const m = S.storeMax?.[sid];
    return (m && m > 0) ? m : Infinity;
  }

  // ── WIZARD STATE ──
  let wStep = 0;
  function getContainer() { return document.getElementById('gh-container'); }

  function fixPanelLayout() {
    const panel = document.getElementById('tab-gerador');
    if (panel) {
      // Only set colours — overflow and layout are controlled by HTML CSS
      panel.style.background = '#fff';
      panel.style.color = '#111';
    }
  }

  function cleanupGeradorLayout() {
    // Called when leaving the gerador tab — reset only the inline styles we added.
    // NEVER touch display — the tab system's CSS controls visibility exclusively.
    const panel = document.getElementById('tab-gerador');
    if (panel) {
      panel.style.background = '';
      panel.style.color = '';
    }
    const modal = document.getElementById('gh-modal');
    if (modal) {
      modal.classList.remove('open');
      modal.style.display = 'none';
    }
    editCtx = null;
  }

  function renderWiz() {
    const c = getContainer(); if (!c) return;
    fixPanelLayout();
    c.style.animation = 'none'; c.offsetWidth; c.style.animation = '';
    [wiz_week, wiz_absences, wiz_stores][wStep]();
  }

  // ── WIZARD: PASSO 1 ──
  function wiz_week() {
    const c = getContainer(); if (!c) return;
    c.innerHTML = `
      <div class="gh-wiz-box">
        <div class="gh-wiz-label">Passo 1 de 3</div>
        <div class="gh-wiz-title">Qual semana vamos planear?</div>
        <div class="gh-wiz-sub">Indique a segunda-feira da semana.</div>
        <input type="date" class="gh-field" id="gh-inp-week" value="${nextMonday()}">
        <div class="gh-wiz-nav">
          <button class="gh-btn gh-btn-solid" id="gh-sub-week">Continuar →</button>
        </div>
      </div>`;
    document.getElementById('gh-sub-week').addEventListener('click', sub_week);
  }

  function sub_week() {
    const v = document.getElementById('gh-inp-week').value; if (!v) return;
    const d = new Date(v + 'T00:00:00'), dow = d.getDay();
    d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
    S.weekStart = d; wStep = 1; renderWiz();
  }

  // ── WIZARD: PASSO 2 — GESTÃO DE PESSOAL ──
  // Mostra o pessoal activo carregado do Supabase.
  // Permite adicionar novas pessoas, editar condição efectiva/nova,
  // gerir tiendas onde podem trabalhar, e ver férias automáticas da semana.
  // NÃO há opção de adicionar ausências manuais — só férias automáticas.

  async function wiz_absences() {
    const c = getContainer(); if (!c) return;

    // Férias automáticas da semana
    let feriasAuto = [];
    if (typeof window.getFeriasParaSemana === 'function' && S.weekStart) {
      feriasAuto = window.getFeriasParaSemana(S.weekStart).filter(f => (f.loja||'').toLowerCase().includes('porto santo'));
    }

    // Recolher apenas férias para S.absences — sem ausências manuais
    const feriasAutoPids = new Set(feriasAuto.map(f => f.pid));

    const storeOptions = STORES.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

    c.innerHTML = `
      <div class="gh-step2-wrap">

        <!-- HEADER: título + contador + nav + adicionar -->
        <div class="gh-step2-header">
          <div class="gh-step2-header-top">
            <div>
              <div class="gh-wiz-label">Passo 2 de 3</div>
              <div class="gh-step2-title-row">
                <div class="gh-wiz-title" style="margin-bottom:0">Pessoal Activo</div>
                <div class="gh-step2-badge">
                  ${(PEOPLE.length - feriasAuto.length)} activa${(PEOPLE.length - feriasAuto.length) !== 1 ? 's' : ''} · ${feriasAuto.length} férias
                </div>
              </div>
              <div class="gh-wiz-sub">Gere o pessoal de Porto Santo.</div>
            </div>
          </div>

          <!-- FÉRIAS BANNER -->
          ${feriasAuto.length ? `<div class="gh-ferias-banner" style="margin-top:6px;margin-bottom:6px">
            <span class="gh-ferias-banner-icon">🏖</span>
            <span>Férias esta semana: <strong>${feriasAuto.map(f => {
              const nomeLower = (f.nome || '').toLowerCase();
              const p = PEOPLE.find(x =>
                x.id === f.pid ||
                x.name === f.nome ||
                nomeLower.split(' ').every(w => x.name.toLowerCase().includes(w))
              );
              return p ? p.name.split(' ')[0] : (f.nome || f.pid || '?');
            }).join(', ')}</strong></span>
          </div>` : ''}

          <!-- NAV + ADICIONAR -->
          <div class="gh-step2-actions">
            <button class="gh-btn gh-btn-ghost gh-wiz-back" id="gh-back-1">← Voltar</button>
            <button class="gh-add-btn" id="gh-add-person" style="margin:0">+ Adicionar pessoa</button>
            <button class="gh-btn gh-btn-solid" id="gh-sub-abs">Continuar →</button>
          </div>
        </div>

        <!-- FORM ADICIONAR/EDITAR -->
        <div id="gh-person-form" style="display:none" class="gh-person-form">
          <div class="gh-pf-title" id="gh-pf-title">Nova pessoa</div>
          <div class="gh-pf-grid">
            <div class="gh-pf-field">
              <label>Nome completo</label>
              <input type="text" id="gh-pf-name" class="gh-field-sm" placeholder="Nome Apelido">
            </div>
            <div class="gh-pf-field">
              <label>Horas contrato</label>
              <input type="number" id="gh-pf-hrs" class="gh-field-sm" value="40" min="1" max="40">
            </div>
            <div class="gh-pf-field" id="gh-pf-start-field">
              <label id="gh-pf-start-label">Data de entrada</label>
              <input type="date" id="gh-pf-start" class="gh-field-sm">
            </div>
            <div class="gh-pf-field">
              <label>Último dia de trabalho (opcional)</label>
              <input type="date" id="gh-pf-end" class="gh-field-sm">
            </div>
            <div class="gh-pf-field">
              <label>Tienda fixa</label>
              <select id="gh-pf-store" class="gh-field-sm">
                <option value="">— Sem loja fixa —</option>
                ${storeOptions}
              </select>
            </div>
            <div class="gh-pf-field" style="grid-column:1/-1">
              <label>Autonomia</label>
              <select id="gh-pf-autonomia" class="gh-field-sm">
                <option value="efectiva">Efectiva — vínculo permanente, pode ficar sozinha todo o dia (peso 2)</option>
                <option value="autonoma">Autónoma — pode ficar sozinha todo o dia (peso 1.5)</option>
                <option value="autonoma_h">Autónoma-H — pode fazer intervalo sozinha, não fica sozinha o dia todo (peso 1.5)</option>
                <option value="nao_autonoma">Não autónoma — precisa sempre de supervisão (peso 1)</option>
              </select>
            </div>
            <div class="gh-pf-field">
              <label>Móvel (pode ser deslocada)</label>
              <select id="gh-pf-mobile" class="gh-field-sm">
                <option value="false">Não</option>
                <option value="true">Sim</option>
              </select>
            </div>
          </div>
          <div class="gh-pf-field" style="margin-top:10px">
            <label>Tiendas onde pode trabalhar</label>
            <div class="gh-pf-stores" id="gh-pf-knows">
              ${STORES.map(s => `<label class="gh-pf-check"><input type="checkbox" value="${s.id}"> ${s.name}</label>`).join('')}
            </div>
          </div>
          <div class="gh-pf-field" style="margin-top:10px">
            <label>Evitar coincidência de folga/turno com (softAvoid)</label>
            <div class="gh-pf-stores" id="gh-pf-softavoid">
              <!-- preenchido dinamicamente por renderSoftAvoidOptions() -->
            </div>
          </div>
          <div class="gh-pf-actions">
            <button class="gh-btn gh-btn-ghost gh-btn-sm" id="gh-pf-cancel">Cancelar</button>
            <button class="gh-btn gh-btn-solid gh-btn-sm" id="gh-pf-save">Guardar</button>
          </div>
        </div>

        <!-- LISTA DE PESSOAL — scroll natural de página, sem contenedor interno -->
        <div class="gh-staff-list" id="gh-staff-list"></div>

      </div>`;

    await loadIncidencias();
    renderStaffList(feriasAutoPids, feriasAuto);
    bindPersonForm(storeOptions);

    document.getElementById('gh-back-1').addEventListener('click', () => { wStep = 0; renderWiz(); });
    document.getElementById('gh-sub-abs').addEventListener('click', sub_abs);
  }


  // Converter dd/mm/aa ou dd/mm/aaaa para ISO YYYY-MM-DD
  function parseDateInput(val) {
    if (!val) return null;
    if (val.includes('-')) return val; // already ISO
    const parts = val.split('/');
    if (parts.length < 3) return null;
    let [d, m, y] = parts;
    if (y.length === 2) y = '20' + y;
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }

  // Primeiro nome + último apelido
  function shortName(fullName) {
    const parts = (fullName || '').trim().split(/\s+/);
    if (parts.length <= 1) return fullName;
    return parts[0] + ' ' + parts[parts.length - 1];
  }
  function renderStaffList(feriasAutoPids, feriasAuto = []) {
    const list = document.getElementById('gh-staff-list');
    if (!list) return;
    list.innerHTML = '';

    // Build a set of pids that are on ferias, matching by pid or partial name
    const feriasMatchedPids = new Set();
    feriasAuto.forEach(f => {
      const nomeLower = (f.nome || '').toLowerCase();
      const matched = PEOPLE.find(x =>
        x.id === f.pid ||
        x.name === f.nome ||
        nomeLower.split(' ').every(w => x.name.toLowerCase().includes(w))
      );
      if (matched) feriasMatchedPids.add(matched.id);
    });

    const DIAS_PT = {SEG:'S',TER:'T',QUA:'Q',QUI:'Q',SEX:'S',SAB:'S',DOM:'D'};
    const DIAS_FULL = {SEG:'Segunda',TER:'Terça',QUA:'Quarta',QUI:'Quinta',SEX:'Sexta',SAB:'Sábado',DOM:'Domingo'};
    const DIAS = ['SEG','TER','QUA','QUI','SEX','SAB','DOM'];

    const sortedPeople = [...PEOPLE].sort((a,b) => a.name.localeCompare(b.name));
    // Pre-calculate max name width for uniform column
    const maxNameLen = sortedPeople.reduce((max, p) => Math.max(max, shortName(p.name).length), 0);
    const nameColW = Math.min(Math.max(maxNameLen * 7 + 20, 100), 160);
    sortedPeople.forEach(p => {
      const onFerias = feriasMatchedPids.has(p.id) || feriasAutoPids.has(p.id);
      const autoLabels = { efectiva: 'Efectiva', autonoma: 'Autónoma', autonoma_h: 'Autónoma-H', nao_autonoma: 'Não autónoma' };
      const condLabel = autoLabels[p.autonomia] || (p.efetiva ? 'Efectiva' : 'Nova');
      const storeName = p.store ? STORES.find(s=>s.id===p.store)?.name || p.store : 'Sem loja fixa';
      const folga   = S._folgas?.[p.id]   || {};
      const baixa   = S._baixas?.[p.id]   || {};
      const licenca = S._licencas?.[p.id] || {};
      const saldo   = S._banco?.[p.id]    || 0;
      // Dias dirigidos: fonte primária é _folgasDirigidas (estável entre regenerações)
      // Fallback para _folgas (carregado de Supabase) se não há dirigidas em memória
      const diasDirigidos = S._folgasDirigidas?.[p.id] || folga.dias || [];

      const dayBtns = DIAS.map(d => {
        const active = diasDirigidos.includes(d);
        return `<button class="gh-day-btn${active?' gh-day-btn-on':''}" data-pid="${p.id}" data-day="${d}" title="${DIAS_FULL[d]}">${d.charAt(0)}</button>`;
      }).join('');

      const row = document.createElement('div');
      row.className = `gh-sr${onFerias ? ' gh-sr-ferias' : ''}`;
      row.dataset.pid = p.id;
      const saldoTag = saldo !== 0 ? `<sup class="gh-saldo-sup ${saldo>0?'gh-saldo-sup-neg':'gh-saldo-sup-pos'}">${saldo>0?'+':''}${saldo}h</sup>` : '';

      row.innerHTML = `
        <!-- HEADER sempre visível -->
        <div class="gh-sr-header">
          <div class="gh-sr-header-left">
            <button class="gh-toggle-btn" data-pid="${p.id}">▶</button>
            <div class="gh-sr-nameblock">
              <span class="gh-sr-name">${shortName(p.name)}${saldoTag}</span>
              <span class="gh-sr-meta">${storeName} · <span class="gh-auto-badge gh-auto-${p.autonomia||'autonoma'}">${condLabel}</span>${onFerias?' · 🏖':''}</span>
            </div>
          </div>
          <div class="gh-sr-btns">
            <button class="gh-icon-btn gh-edit-person" data-pid="${p.id}" title="Editar">✏</button>
            <button class="gh-icon-btn gh-limpar-inc" data-pid="${p.id}" title="Limpar" style="color:#b8860b">↺</button>
            <button class="gh-icon-btn gh-del-person" data-pid="${p.id}" title="Eliminar" style="color:#c0392b">✕</button>
          </div>
        </div>

        <!-- CORPO colapsável -->
        <div class="gh-sr-body" id="gh-body-${p.id}" style="display:none">
          <div class="gh-sr-cols">
            <div class="gh-sr-col">
              <div class="gh-sr-col-title">📅 Folga</div>
              <div class="gh-day-btns">${dayBtns}</div>
              <div class="gh-sr-col-title" style="margin-top:8px">📋 Licença <input type="checkbox" class="gh-inc-usar" data-pid="${p.id}" data-col="lic_active" ${licenca.active?'checked':''}></div>
              <div class="gh-date-row">
                <input type="text" class="gh-field-sm gh-inc-inp gh-date-txt" data-pid="${p.id}" data-col="lic_from" value="${licenca.data_inicio?licenca.data_inicio.slice(5).split('-').reverse().join('/')+'/'+licenca.data_inicio.slice(2,4):''}" placeholder="dd/mm/aa">
                <input type="text" class="gh-field-sm gh-inc-inp gh-date-txt" data-pid="${p.id}" data-col="lic_to" value="${licenca.data_fim?licenca.data_fim.slice(5).split('-').reverse().join('/')+'/'+licenca.data_fim.slice(2,4):''}" placeholder="dd/mm/aa">
              </div>
              <div class="gh-date-row" style="margin-top:3px">
                <select class="gh-field-sm gh-inc-inp gh-sel-mini" data-pid="${p.id}" data-col="lic_tipo">
                  <option value="recuperavel" ${licenca.tipo==='recuperavel'||!licenca.tipo?'selected':''}>Rec.</option>
                  <option value="nao_recuperavel" ${licenca.tipo==='nao_recuperavel'?'selected':''}>N.Rec.</option>
                </select>
                <input type="number" class="gh-field-sm gh-inc-inp gh-num-mini" data-pid="${p.id}" data-col="lic_horas" value="${licenca.horas||''}" placeholder="h" step="0.5">
              </div>
            </div>
            <div class="gh-sr-col">
              <div class="gh-sr-col-title">🏥 Baixa <input type="checkbox" class="gh-inc-usar" data-pid="${p.id}" data-col="baixa_active" ${baixa.active?'checked':''}></div>
              <div class="gh-date-row">
                <input type="text" class="gh-field-sm gh-inc-inp gh-date-txt" data-pid="${p.id}" data-col="baixa_from" value="${baixa.data_inicio?baixa.data_inicio.slice(5).split('-').reverse().join('/')+'/'+baixa.data_inicio.slice(2,4):''}" placeholder="dd/mm/aa">
                <input type="text" class="gh-field-sm gh-inc-inp gh-date-txt" data-pid="${p.id}" data-col="baixa_to" value="${baixa.data_fim?baixa.data_fim.slice(5).split('-').reverse().join('/')+'/'+baixa.data_fim.slice(2,4):''}" placeholder="dd/mm/aa">
              </div>
              <div class="gh-sr-col-title" style="margin-top:8px">⏱ Banco <button class="gh-btn-guardar-inc gh-icon-btn" data-pid="${p.id}" title="Guardar baixa, licença e banco" style="margin-left:auto;font-size:.6rem;padding:1px 6px;width:auto;color:#1a5c1a;border-color:#b7ddb7;background:#f0fdf0;">💾</button></div>
              <div class="gh-inc-saldo ${saldo>0?'gh-inc-saldo-neg':saldo<0?'gh-inc-saldo-pos':''}" id="gh-saldo-${p.id}">${saldo>0?'+':''}${saldo}h</div>
              <div class="gh-banco-add-row">
                <input type="number" class="gh-field-sm gh-banco-h gh-num-mini" data-pid="${p.id}" placeholder="±h" step="0.5">
                <button class="gh-icon-btn gh-banco-lancar" data-pid="${p.id}" title="Lançar">＋</button>
                <button class="gh-icon-btn gh-banco-zero" data-pid="${p.id}" title="Zerar" style="color:#c0392b">✕</button>
              </div>
            </div>
          </div>
        </div>`;
      list.appendChild(row);
    });

    // Toggle collapse/expand
    list.querySelectorAll('.gh-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const pid = btn.dataset.pid;
        const body = document.getElementById('gh-body-' + pid);
        if (!body) return;
        const open = body.style.display !== 'none';
        body.style.display = open ? 'none' : 'block';
        btn.textContent = open ? '▶' : '▼';
        btn.style.transform = '';
      });
    });

    list.querySelectorAll('.gh-edit-person').forEach(btn => {
      btn.addEventListener('click', () => openEditPerson(btn.dataset.pid));
    });
    list.querySelectorAll('.gh-del-person').forEach(btn => {
      btn.addEventListener('click', () => deletePersonConfirm(btn.dataset.pid));
    });

    // Folga: botões de dia — guardam em S._folgasDirigidas (separado de S._folgas)
    // S._folgasDirigidas persiste durante toda a sessão e nunca é resetado por loadIncidencias
    list.querySelectorAll('.gh-day-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const pid = btn.dataset.pid;
        const day = btn.dataset.day;
        if (!S._folgasDirigidas) S._folgasDirigidas = {};
        if (!S._folgasDirigidas[pid]) S._folgasDirigidas[pid] = [];
        const dias = S._folgasDirigidas[pid];
        const idx = dias.indexOf(day);
        if (idx >= 0) dias.splice(idx, 1); else dias.push(day);
        btn.classList.toggle('gh-day-btn-on', dias.includes(day));
        // Também actualizar S._folgas para compatibilidade com confirmSchedule
        if (!S._folgas) S._folgas = {};
        if (!S._folgas[pid]) S._folgas[pid] = { dias: [] };
        S._folgas[pid].dias = [...dias];
      });
    });

    // Baixa: toggle e datas — SÓ actualizam memória local, NÃO gravam automaticamente
    list.querySelectorAll('.gh-inc-usar[data-col="baixa_active"]').forEach(el => {
      el.addEventListener('change', () => {
        const pid = el.dataset.pid;
        if (!S._baixas) S._baixas = {};
        if (!S._baixas[pid]) S._baixas[pid] = {};
        S._baixas[pid]._pendente = true;
        // Marcar botão guardar
        const btn = list.querySelector(`.gh-btn-guardar-inc[data-pid="${pid}"]`);
        if (btn) { btn.style.background = '#fff8e8'; btn.style.borderColor = '#f0d080'; btn.style.color = '#9a6f00'; }
      });
    });
    list.querySelectorAll('.gh-inc-inp[data-col^="baixa"]').forEach(el => {
      el.addEventListener('change', () => {
        const pid = el.dataset.pid;
        if (!S._baixas) S._baixas = {};
        if (!S._baixas[pid]) S._baixas[pid] = {};
        S._baixas[pid]._pendente = true;
        const btn = list.querySelector(`.gh-btn-guardar-inc[data-pid="${pid}"]`);
        if (btn) { btn.style.background = '#fff8e8'; btn.style.borderColor = '#f0d080'; btn.style.color = '#9a6f00'; }
      });
    });

    // Licença: toggle, datas e tipo — SÓ actualizam memória local
    list.querySelectorAll('.gh-inc-usar[data-col="lic_active"], .gh-inc-inp[data-col^="lic"]').forEach(el => {
      el.addEventListener('change', () => {
        const pid = el.dataset.pid;
        // Mostrar/ocultar campo observação (lógica visual mantida)
        if (el.dataset.col === 'lic_tipo') {
          const tipo = el.value;
          const obsEl = document.getElementById('gh-lic-obs-' + pid);
          if (obsEl) obsEl.style.display = tipo === 'nao_recuperavel' ? '' : 'none';
        }
        if (!S._licencas) S._licencas = {};
        if (!S._licencas[pid]) S._licencas[pid] = {};
        S._licencas[pid]._pendente = true;
        const btn = list.querySelector(`.gh-btn-guardar-inc[data-pid="${pid}"]`);
        if (btn) { btn.style.background = '#fff8e8'; btn.style.borderColor = '#f0d080'; btn.style.color = '#9a6f00'; }
      });
    });

    // Botão guardar incidências por pessoa (baixa + licença + banco pendente)
    list.querySelectorAll('.gh-btn-guardar-inc').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pid = btn.dataset.pid;
        btn.textContent = '⏳'; btn.style.opacity = '0.6';
        let saved = false;

        // Guardar baixa se pendente
        if (S._baixas?.[pid]?._pendente) {
          const active = document.querySelector(`[data-col="baixa_active"][data-pid="${pid}"]`)?.checked || false;
          const from   = parseDateInput(document.querySelector(`[data-col="baixa_from"][data-pid="${pid}"]`)?.value);
          const to     = parseDateInput(document.querySelector(`[data-col="baixa_to"][data-pid="${pid}"]`)?.value);
          await saveBaixa(pid, { active, data_inicio: from || new Date().toISOString().split('T')[0], data_fim: to || null, observacao: '' });
          if (S._baixas[pid]) delete S._baixas[pid]._pendente;
          saved = true;
        }

        // Guardar licença se pendente
        if (S._licencas?.[pid]?._pendente) {
          const active = document.querySelector(`[data-col="lic_active"][data-pid="${pid}"]`)?.checked || false;
          const from   = parseDateInput(document.querySelector(`[data-col="lic_from"][data-pid="${pid}"]`)?.value);
          const to     = parseDateInput(document.querySelector(`[data-col="lic_to"][data-pid="${pid}"]`)?.value);
          const tipo   = document.querySelector(`[data-col="lic_tipo"][data-pid="${pid}"]`)?.value || 'recuperavel';
          const horas  = parseFloat(document.querySelector(`[data-col="lic_horas"][data-pid="${pid}"]`)?.value || 0) || 0;
          const obs    = document.querySelector(`[data-col="lic_obs"][data-pid="${pid}"]`)?.value || '';
          const licData = { active, data_inicio: from || new Date().toISOString().split('T')[0], data_fim: to || null, tipo, horas, observacao: obs };
          await saveLicenca(pid, licData);
          // Se recuperável e activa → lançar horas no banco automaticamente
          if (active && tipo === 'recuperavel' && horas > 0 && !S._licencas[pid]?._addedToBanco) {
            const novoSaldo = await lancarBanco(pid, horas);
            if (S._licencas) S._licencas[pid] = { ...(S._licencas[pid]||{}), _addedToBanco: true };
            const saldoEl = document.getElementById('gh-saldo-' + pid);
            if (saldoEl && novoSaldo !== undefined) {
              saldoEl.textContent = `${novoSaldo > 0 ? '+' : ''}${novoSaldo}h`;
              saldoEl.className = 'gh-inc-saldo ' + (novoSaldo > 0 ? 'gh-inc-saldo-neg' : novoSaldo < 0 ? 'gh-inc-saldo-pos' : '');
            }
          }
          if (S._licencas[pid]) delete S._licencas[pid]._pendente;
          saved = true;
        }

        // Restaurar botão
        btn.textContent = saved ? '✓' : '💾';
        btn.style.opacity = '1';
        btn.style.background = saved ? '#f0fdf0' : '#f0fdf0';
        btn.style.borderColor = '#b7ddb7';
        btn.style.color = '#1a5c1a';
        if (saved) setTimeout(() => { btn.textContent = '💾'; }, 1500);
      });
    });

    // Banco de horas: lançar
    list.querySelectorAll('.gh-banco-lancar').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pid = btn.dataset.pid;
        const input = list.querySelector(`.gh-banco-h[data-pid="${pid}"]`);
        const h = parseFloat(input?.value || 0);
        if (!h) return;
        const novoSaldo = await lancarBanco(pid, h);
        input.value = '';
        const saldoEl = document.getElementById('gh-saldo-' + pid);
        if (saldoEl && novoSaldo !== undefined) {
          saldoEl.textContent = `Saldo: ${novoSaldo > 0 ? '+' : ''}${novoSaldo}h`;
          saldoEl.className = 'gh-inc-saldo ' + (novoSaldo > 0 ? 'gh-inc-saldo-neg' : novoSaldo < 0 ? 'gh-inc-saldo-pos' : '');
        }
      });
    });

    // Banco de horas: zerar saldo
    list.querySelectorAll('.gh-banco-zero').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pid = btn.dataset.pid;
        const p = PEOPLE.find(x => x.id === pid);
        if (!confirm(`Zerar banco de horas de ${shortName(p?.name||pid)}?`)) return;
        if (!S._banco) S._banco = {};
        S._banco[pid] = 0;
        const sb = getSupabase();
        if (sb) {
          try {
            await sb.from('gh_banco_horas').upsert(
              { pessoa_id: pid, saldo: 0, updated_at: new Date().toISOString() },
              { onConflict: 'pessoa_id' }
            );
          } catch(e) { console.error('Erro ao zerar banco:', e); }
        }
        const saldoEl = document.getElementById('gh-saldo-' + pid);
        if (saldoEl) { saldoEl.textContent = 'Saldo: 0h'; saldoEl.className = 'gh-inc-saldo'; }
        const input = list.querySelector(`.gh-banco-h[data-pid="${pid}"]`);
        if (input) input.value = '';
      });
    });

    // Limpar incidências
    list.querySelectorAll('.gh-limpar-inc').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pid = btn.dataset.pid;
        const p = PEOPLE.find(x => x.id === pid);
        if (!confirm(`Limpar todas as incidências de ${shortName(p?.name||pid)}?`)) return;
        await limparIncidencias(pid);
        // Reset day buttons
        list.querySelectorAll(`.gh-day-btn[data-pid="${pid}"]`).forEach(b => b.classList.remove('gh-day-btn-on'));
        // Reset checkboxes
        list.querySelectorAll(`.gh-inc-usar[data-pid="${pid}"]`).forEach(b => { b.checked = false; });
        // Reset inputs
        list.querySelectorAll(`.gh-inc-inp[data-pid="${pid}"]`).forEach(b => { b.value = ''; });
        // Reset saldo
        const saldoEl = document.getElementById('gh-saldo-' + pid);
        if (saldoEl) { saldoEl.textContent = 'Saldo: 0h'; saldoEl.className = 'gh-inc-saldo'; }
      });
    });
  }

  // ══ INCIDÊNCIAS — 4 tabelas separadas ══
  // gh_baixas: pessoa_id, data_inicio, data_fim, observacao, active
  // gh_licencas: pessoa_id, data_inicio, data_fim, tipo, horas, observacao, active
  // gh_folgas: pessoa_id, semana, dias[]  (por semana)
  // gh_banco_horas: pessoa_id, saldo  (acumulado, um registo por pessoa)

  // Carrega TUDO para a semana actual
  async function loadIncidencias() {
    if (!S.weekStart) return;
    const sb = getSupabase();
    if (!sb) return;
    const weekKey  = S.weekStart.toISOString().split('T')[0];
    const weekEnd  = new Date(S.weekStart); weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndKey = weekEnd.toISOString().split('T')[0];

    // Reset state
    S._baixas   = {};  // pid → {id, data_inicio, data_fim, observacao, active}
    S._licencas = {};  // pid → {id, data_inicio, data_fim, tipo, horas, observacao, active}
    S._folgas   = {};  // pid → {id, dias[]}
    S._banco    = {};  // pid → saldo

    try {
      // Baixas activas que se sobrepõem à semana
      const { data: baixas } = await sb.from('gh_baixas')
        .select('*').eq('active', true)
        .lte('data_inicio', weekEndKey);
      (baixas || []).forEach(b => {
        if (!b.data_fim || b.data_fim >= weekKey) S._baixas[b.pessoa_id] = b;
      });

      // Licenças activas que se sobrepõem à semana
      const { data: licencas } = await sb.from('gh_licencas')
        .select('*').eq('active', true)
        .lte('data_inicio', weekEndKey);
      (licencas || []).forEach(l => {
        if (!l.data_fim || l.data_fim >= weekKey) S._licencas[l.pessoa_id] = l;
      });

      // Folgas desta semana
      const { data: folgas } = await sb.from('gh_folgas')
        .select('*').eq('semana', weekKey);
      (folgas || []).forEach(f => { S._folgas[f.pessoa_id] = f; });

      // Banco de horas
      const { data: banco } = await sb.from('gh_banco_horas').select('*');
      (banco || []).forEach(b => { S._banco[b.pessoa_id] = b.saldo || 0; });

    } catch(e) { console.error('Erro ao carregar incidências:', e); }
  }

  // Guardar folga da semana
  async function saveFolga(pid, dias) {
    const sb = getSupabase(); if (!sb) return;
    const weekKey = S.weekStart?.toISOString().split('T')[0];
    if (!weekKey) return;
    if (!S._folgas) S._folgas = {};
    S._folgas[pid] = { ...(S._folgas[pid] || {}), pessoa_id: pid, semana: weekKey, dias };
    try {
      await sb.from('gh_folgas').upsert({ pessoa_id: pid, semana: weekKey, dias },
        { onConflict: 'pessoa_id,semana' });
    } catch(e) { console.error('Erro ao guardar folga:', e); }
  }

  // Guardar/actualizar baixa
  async function saveBaixa(pid, data) {
    const sb = getSupabase(); if (!sb) return;
    if (!S._baixas) S._baixas = {};
    try {
      if (S._baixas[pid]?.id) {
        await sb.from('gh_baixas').update(data).eq('id', S._baixas[pid].id);
        S._baixas[pid] = { ...S._baixas[pid], ...data };
      } else {
        const { data: res } = await sb.from('gh_baixas')
          .insert({ pessoa_id: pid, ...data }).select().single();
        if (res) S._baixas[pid] = res;
      }
    } catch(e) { console.error('Erro ao guardar baixa:', e); }
  }

  // Guardar/actualizar licença
  async function saveLicenca(pid, data) {
    const sb = getSupabase(); if (!sb) return;
    if (!S._licencas) S._licencas = {};
    try {
      if (S._licencas[pid]?.id) {
        await sb.from('gh_licencas').update(data).eq('id', S._licencas[pid].id);
        S._licencas[pid] = { ...S._licencas[pid], ...data };
      } else {
        const { data: res } = await sb.from('gh_licencas')
          .insert({ pessoa_id: pid, ...data }).select().single();
        if (res) S._licencas[pid] = res;
      }
    } catch(e) { console.error('Erro ao guardar licença:', e); }
  }

  // Lançar horas no banco
  async function lancarBanco(pid, horas) {
    const sb = getSupabase(); if (!sb) return;
    if (!S._banco) S._banco = {};
    const novoSaldo = Math.round(((S._banco[pid] || 0) + horas) * 10) / 10;
    S._banco[pid] = novoSaldo;
    try {
      await sb.from('gh_banco_horas').upsert(
        { pessoa_id: pid, saldo: novoSaldo, updated_at: new Date().toISOString() },
        { onConflict: 'pessoa_id' }
      );
    } catch(e) { console.error('Erro ao lançar banco de horas:', e); }
    return novoSaldo;
  }

  // Limpar incidências da semana para uma pessoa (folga + baixa + licença)
  async function limparIncidencias(pid) {
    const sb = getSupabase(); if (!sb) return;
    const weekKey = S.weekStart?.toISOString().split('T')[0];
    try {
      // Folga desta semana
      if (S._folgas?.[pid]?.id) {
        await sb.from('gh_folgas').delete().eq('id', S._folgas[pid].id);
        delete S._folgas[pid];
      } else if (weekKey) {
        await sb.from('gh_folgas').delete().eq('pessoa_id', pid).eq('semana', weekKey);
      }
      // Baixa activa
      if (S._baixas?.[pid]?.id) {
        await sb.from('gh_baixas').update({ active: false }).eq('id', S._baixas[pid].id);
        delete S._baixas[pid];
      }
      // Licença activa
      if (S._licencas?.[pid]?.id) {
        await sb.from('gh_licencas').update({ active: false }).eq('id', S._licencas[pid].id);
        delete S._licencas[pid];
      }
    } catch(e) { console.error('Erro ao limpar incidências:', e); }
  }

  async function deletePersonConfirm(pid) {
    const p = PEOPLE.find(x => x.id === pid);
    if (!p) return;
    if (!confirm(`Eliminar "${p.name}"? Esta acção não pode ser desfeita.`)) return;
    const sb = getSupabase();
    if (!sb) { alert('Supabase não disponível.'); return; }
    try {
      // Eliminar registos dependentes antes de apagar a pessoa (evita FK 23503)
      await sb.from('gh_licencas').delete().eq('pessoa_id', pid);
      await sb.from('gh_baixas').delete().eq('pessoa_id', pid);
      await sb.from('gh_folgas').delete().eq('pessoa_id', pid);
      await sb.from('gh_banco_horas').delete().eq('pessoa_id', pid);
      const { error } = await sb.from('gh_people').delete().eq('id', pid);
      if (error) throw error;
      if (S._licencas) delete S._licencas[pid];
      if (S._baixas)   delete S._baixas[pid];
      if (S._folgas)   delete S._folgas[pid];
      if (S._banco)    delete S._banco[pid];
      await loadKnowledgeBase();
      const feriasAuto = typeof window.getFeriasParaSemana === 'function' && S.weekStart
        ? window.getFeriasParaSemana(S.weekStart).filter(f => f.pid) : [];
      renderStaffList(new Set(feriasAuto.map(f => f.pid)), feriasAuto);
    } catch(e) {
      console.error('Delete error:', e);
      alert('Erro ao eliminar. Verifique a consola.');
    }
  }

  let _editingPid = null;

  function bindPersonForm(storeOptions) {
    document.getElementById('gh-add-person').addEventListener('click', () => {
      _editingPid = null;
      document.getElementById('gh-pf-title').textContent = 'Nova pessoa';
      document.getElementById('gh-pf-name').value = '';
      document.getElementById('gh-pf-hrs').value = '40';
      document.getElementById('gh-pf-start').value = '';
      document.getElementById('gh-pf-end').value = '';
      document.getElementById('gh-pf-store').value = '';
      document.getElementById('gh-pf-autonomia').value = 'autonoma';
      document.getElementById('gh-pf-mobile').value = 'false';
      document.querySelectorAll('#gh-pf-knows input').forEach(cb => { cb.checked = false; });
      renderSoftAvoidOptions(null, []);
      document.getElementById('gh-person-form').style.display = 'block';
    });

    document.getElementById('gh-pf-cancel').addEventListener('click', () => {
      document.getElementById('gh-person-form').style.display = 'none';
      _editingPid = null;
    });

    // Toggle start date label/required based on autonomia
    document.getElementById('gh-pf-autonomia').addEventListener('change', function() {
      const lbl = document.getElementById('gh-pf-start-label');
      if (lbl) lbl.textContent = this.value === 'efectiva' ? 'Data de entrada (opcional)' : 'Data de entrada';
    });

    document.getElementById('gh-pf-save').addEventListener('click', savePersonForm);
  }

  function openEditPerson(pid) {
    const p = PEOPLE.find(x => x.id === pid); if (!p) return;
    _editingPid = pid;
    document.getElementById('gh-pf-title').textContent = 'Editar — ' + p.name;
    document.getElementById('gh-pf-name').value = p.name;
    document.getElementById('gh-pf-hrs').value = p.hrs || 40;
    document.getElementById('gh-pf-start').value = p.start || '';
    const lbl = document.getElementById('gh-pf-start-label');
    if (lbl) lbl.textContent = p.autonomia === 'efectiva' ? 'Data de entrada (opcional)' : 'Data de entrada';
    document.getElementById('gh-pf-end').value = p.end || '';
    document.getElementById('gh-pf-store').value = p.store || '';
    document.getElementById('gh-pf-autonomia').value = p.autonomia || 'autonoma';
    document.getElementById('gh-pf-mobile').value = p.mobile ? 'true' : 'false';
    document.querySelectorAll('#gh-pf-knows input').forEach(cb => {
      cb.checked = (p.knows || []).includes(cb.value);
    });
    renderSoftAvoidOptions(p.id, p.softAvoid || []);
    document.getElementById('gh-person-form').style.display = 'block';
  }

  // Renderiza checkboxes de softAvoid (excluindo a própria pessoa)
  function renderSoftAvoidOptions(selfPid, currentSoftAvoid) {
    const container = document.getElementById('gh-pf-softavoid');
    if (!container) return;
    const others = PEOPLE.filter(p => p.id !== selfPid).sort((a,b) => a.name.localeCompare(b.name));
    if (!others.length) { container.innerHTML = '<span style="font-size:.72rem;color:#bbb">Sem outras pessoas na BD.</span>'; return; }
    container.innerHTML = others.map(p =>
      `<label class="gh-pf-check">
        <input type="checkbox" name="gh-pf-softavoid-cb" value="${p.id}" ${(currentSoftAvoid||[]).includes(p.id) ? 'checked' : ''}>
        ${p.name.split(' ')[0]}
      </label>`
    ).join('');
  }

  async function savePersonForm() {
    const name     = document.getElementById('gh-pf-name').value.trim();
    const hrs      = parseInt(document.getElementById('gh-pf-hrs').value) || 40;
    const start    = document.getElementById('gh-pf-start').value;
    const end      = document.getElementById('gh-pf-end').value || null;
    const store    = document.getElementById('gh-pf-store').value || null;
    const autonomia  = document.getElementById('gh-pf-autonomia').value || 'autonoma';
    const efetiva    = autonomia === 'efectiva';
    const canAlone   = autonomia === 'efectiva' || autonomia === 'autonoma';
    const mobile   = document.getElementById('gh-pf-mobile').value === 'true';
    const knows     = [...document.querySelectorAll('#gh-pf-knows input:checked')].map(cb => cb.value);
    const newSoftAvoid = [...document.querySelectorAll('[name="gh-pf-softavoid-cb"]:checked')].map(cb => cb.value);

    // Start date required only for new staff (efectivas may not have it)
    if (!name) { alert('Nome é obrigatório.'); return; }
    if (autonomia !== 'efectiva' && !start) { alert('Data de entrada é obrigatória para pessoal não-efectivo.'); return; }

    // soft_avoid vem do formulário (checkboxes); hard_avoid preservado da BD
    const existingP = _editingPid ? PEOPLE.find(x => x.id === _editingPid) : null;
    const softAvoid = newSoftAvoid; // lido dos checkboxes do formulário
    const hardAvoid = existingP?.hardAvoid || []; // preservado — sem UI por enquanto

    // cover_pri é sempre derivado de autonomia — nunca preservado de dados antigos.
    // efectiva=1 (maior prioridade de cobertura), autonoma=3, autonoma_h=5, nao_autonoma=9
    const autoPriMap = { efectiva: 1, autonoma: 3, autonoma_h: 5, nao_autonoma: 9 };
    const coverPri = autoPriMap[autonomia] ?? 9;

    const data = {
      name, hrs, store_id: store,
      autonomia,                          // novo campo principal
      efetiva,                            // derivado — mantido para compatibilidade
      can_alone: canAlone,                // derivado
      start_date: start || null,
      end_date: end || null,
      mobile, cover_pri: coverPri,
      knows, hard_avoid: hardAvoid, soft_avoid: softAvoid, active: true
    };

    let saved;
    if (_editingPid) {
      saved = await supabaseUpdate('gh_people', _editingPid, data);
    } else {
      // Generate a simple slug id from name
      data.id = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').substring(0, 20) + '_' + Date.now().toString(36);
      saved = await supabaseInsert('gh_people', data);
    }

    if (saved) {
      // Reload people from Supabase and re-render
      await loadKnowledgeBase();
      document.getElementById('gh-person-form').style.display = 'none';
      _editingPid = null;
      const feriasAuto = typeof window.getFeriasParaSemana === 'function' && S.weekStart
        ? window.getFeriasParaSemana(S.weekStart).filter(f => f.pid) : [];
      renderStaffList(new Set(feriasAuto.map(f => f.pid)), feriasAuto);
    } else {
      alert('Erro ao guardar. Verifique a ligação ao Supabase.');
    }
  }

  function sub_abs() {
    // Férias automáticas de Porto Santo
    let feriasAuto = [];
    if (typeof window.getFeriasParaSemana === 'function' && S.weekStart) {
      feriasAuto = window.getFeriasParaSemana(S.weekStart).filter(f => (f.loja||'').toLowerCase().includes('porto santo'));
    }

    // Build absences from férias
    S.absences = feriasAuto.map(f => {
      // Match person by pid or name
      const nomeLower = (f.nome || '').toLowerCase();
      const p = PEOPLE.find(x =>
        x.id === f.pid ||
        x.name === f.nome ||
        nomeLower.split(' ').every(w => x.name.toLowerCase().includes(w))
      );
      // 'to': último dia de férias nesta semana.
      // Se f.to existir usa-o directamente; se f.data_fim existir converte para dia da semana;
      // sem info assume ausente até ao fim da semana (DOM).
      const toDay = f.to || (f.data_fim ? dayOfWeekKey(f.data_fim) : null) || 'DOM';
      return { pid: p ? p.id : f.pid, type: 'ferias', from: f.from || 'SEG', to: toDay };
    }).filter(a => a.pid);

    // Adicionar baixas activas à lista de ausências
    if (S._baixas) {
      Object.entries(S._baixas).forEach(([pid, b]) => {
        if (!b.active) return;
        if (S.absences.find(a => a.pid === pid)) return;
        const toDay = b.data_fim ? dayOfWeekKey(b.data_fim) : null;
        S.absences.push({ pid, type: 'baixa', from: 'SEG', to: toDay || 'DOM' });
      });
    }

    // Adicionar licenças activas como ausência (independentemente do tipo)
    if (S._licencas) {
      Object.entries(S._licencas).forEach(([pid, l]) => {
        if (!l.active) return;
        if (S.absences.find(a => a.pid === pid)) return;
        const toDay = l.data_fim ? dayOfWeekKey(l.data_fim) : null;
        S.absences.push({ pid, type: l.tipo === 'nao_recuperavel' ? 'na' : 'licenca', from: 'SEG', to: toDay || 'DOM' });
      });
    }

    // Folgas direccionadas — o algoritmo usa estes dias como folga fixa
    S._folgaDirigida = {};
    if (S._folgas) {
      Object.entries(S._folgas).forEach(([pid, f]) => {
        if (f.dias?.length) S._folgaDirigida[pid] = f.dias;
      });
    }

    wStep = 2; renderWiz();
  }

  // ── WIZARD: PASSO 3 ──
  function wiz_stores() {
    const c = getContainer(); if (!c) return;
    const defD = ['SEG','TER','QUA','QUI','SEX','SAB'];

    // Detectar temporada para mostrar sugestão
    const month = S.weekStart ? S.weekStart.getMonth() + 1 : new Date().getMonth() + 1;
    function detectSeason(m) {
      if (m >= 1 && m <= 3)  return { id: 'baja1',  label: 'Baja 1 (Jan–Mar)', hint: 'Horário de guerra · 3 lojas · Seg–Sáb · 10-19h' };
      if (m >= 4 && m <= 5)  return { id: 'int1',   label: 'Intermedia 1 (Abr–Mai)', hint: 'Aumento progressivo · Domingos se houver pessoal' };
      if (m >= 6 && m <= 8)  return { id: 'alta',   label: 'Alta (Jun–Ago)', hint: 'Máxima optimização · L-S 9-23 em Avda/Mcdo · Domingos 10-19' };
      if (m >= 9 && m <= 10) return { id: 'int2',   label: 'Intermedia 2 (Set–Out)', hint: 'Redução gradual · Domingos opcionais' };
      return { id: 'baja2', label: 'Baja 2 (Nov–Dez)', hint: 'Só pessoal efectivo · Horário de guerra' };
    }
    const season = detectSeason(month);

    const modeOptionsHTML = STORE_MODES.map(m =>
      `<option value="${m.id}">${m.label} — ${m.desc}</option>`
    ).join('');

    const rows = STORES.map(st => {
      // Default: lojas com priority < 4 abrem por defeito; Maxx (priority=4) fechada por defeito
      const open    = S.openStores.length ? S.openStores.includes(st.id) : (STORES.find(s=>s.id===st.id)?.priority ?? 9) < 4;
      const days    = S.openDays[st.id]   || (open ? [...defD] : []);
      const savedMin  = S.storeMin?.[st.id]  || 1;
      const savedMax  = S.storeMax?.[st.id]  || '';
      const savedMode = S.storeMode?.[st.id] || 'standard';

      const togs = DAYS.map(d => {
        const isOn = days.includes(d);
        const isDom = d === 'DOM';
        return `<span class="gh-dtog ${isOn ? 'on' : ''} ${isDom ? 'gh-dtog-dom' : ''}" data-store="${st.id}" data-day="${d}">${d}</span>`;
      }).join('');

      // Shana y Maxx (priority >= 3): máximo estructural de 1, no configurable
      const isSmallStore = (STORES.find(s => s.id === st.id)?.priority ?? 9) >= 3;
      // Si hay escenario activo para esta tienda, los min/max son automáticos
      const nActivo = PEOPLE.filter(p => !fullyAbsent(p.id)).length;

      return `
      <div class="gh-sc-row ${!open ? 'closed' : ''}" id="gh-scr-${st.id}">
        <!-- LINHA 1: checkbox + nome + mín/máx -->
        <div class="gh-sc-top">
          <input type="checkbox" id="gh-chk-${st.id}" ${open ? 'checked' : ''} data-store="${st.id}">
          <label for="gh-chk-${st.id}" class="gh-sc-name">${st.name}</label>
          ${isSmallStore
            ? `<span class="gh-sc-fixed-cap">máx 1 pessoa</span>`
            : `<div class="gh-sc-minmax">
            <div class="gh-sc-mm-field">
              <span class="gh-sc-mm-label">mín</span>
              <input type="number" class="gh-sc-mm-inp" id="gh-min-${st.id}" data-store="${st.id}" min="1" max="10" placeholder="Auto" value="${savedMin > 1 ? savedMin : ''}">
            </div>
            <div class="gh-sc-mm-sep">·</div>
            <div class="gh-sc-mm-field">
              <span class="gh-sc-mm-label">máx</span>
              <input type="number" class="gh-sc-mm-inp" id="gh-max-${st.id}" data-store="${st.id}" min="1" max="20" placeholder="Auto" value="${savedMax}">
            </div>
          </div>`}
        </div>
        <!-- LINHA 2: dias da semana -->
        <div class="gh-sc-days" id="gh-scd-${st.id}">${togs}</div>
        <!-- LINHA 3: modo de horário -->
        <div class="gh-sc-mode-row" id="gh-scm-${st.id}">
          <span class="gh-sc-mode-label">Horário</span>
          <select class="gh-sc-mode-sel" id="gh-mode-${st.id}" data-store="${st.id}">
            ${modeOptionsHTML}
          </select>
          <span class="gh-sc-mode-hint" id="gh-mode-hint-${st.id}"></span>
        </div>
      </div>`;
    }).join('');

    c.innerHTML = `
      <div class="gh-wiz-box gh-wiz-box--wide">
        <div class="gh-wiz-label">Passo 3 de 3</div>
        <div class="gh-wiz-title">Lojas, dias e horários</div>

        <!-- BANNER TEMPORADA -->
        <div class="gh-season-banner">
          <span class="gh-season-icon">📅</span>
          <div>
            <div class="gh-season-name">${season.label}</div>
            <div class="gh-season-hint">${season.hint}</div>
          </div>
        </div>

        <div class="gh-store-cfg">${rows}</div>

        <!-- CAMPO: Pessoas no domingo -->
        <div id="gh-dom-pessoas-row" style="display:none;margin-bottom:20px;padding:12px 0;border-top:1px solid #f0f0f0;">
          <div style="font-size:.72rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#888;margin-bottom:8px;">Pessoas a trabalhar no domingo</div>
          <div style="display:flex;align-items:center;gap:10px;">
            <input type="number" id="gh-dom-pessoas" min="1" max="12" placeholder="Auto"
              style="width:70px;border:1px solid #ddd;border-radius:6px;padding:7px 10px;font-size:.9rem;font-family:inherit;color:#111;background:#fff;"
              value="${S.domPessoas || ''}">
            <span style="font-size:.75rem;color:#888;">Se vazio, o sistema calcula automaticamente pelo mínimo das lojas.</span>
          </div>
        </div>

        <div class="gh-wiz-nav">
          <button class="gh-btn gh-btn-ghost gh-wiz-back" id="gh-back-2">← Voltar</button>
          <button class="gh-btn gh-btn-solid" id="gh-sub-stores">Gerar horário →</button>
        </div>
      </div>`;

    // Inicializar valores dos selects de modo e hints
    STORES.forEach(st => {
      const modeEl = document.getElementById(`gh-mode-${st.id}`);
      if (modeEl) {
        const savedMode = S.storeMode?.[st.id] || 'standard';
        modeEl.value = savedMode;
        updateModeHint(st.id, savedMode);
        modeEl.addEventListener('change', () => updateModeHint(st.id, modeEl.value));
      }
    });

    function updateModeHint(sid, modeId) {
      const hint = document.getElementById(`gh-mode-hint-${sid}`);
      if (!hint) return;
      const m = STORE_MODES.find(x => x.id === modeId);
      if (!m) return;
      const [sh1, sh2] = m.shifts;
      const label1 = sh1.replace('|', ' / ');
      const label2 = sh2.replace('|', ' / ');
      hint.textContent = `Principal: ${label1}  ·  Alt: ${label2}`;
      // Highlight noite
      hint.style.color = modeId === 'night' ? '#b05000' : '#888';
    }

    // Eventos: checkbox loja
    c.querySelectorAll('input[type=checkbox][data-store]').forEach(el => {
      el.addEventListener('change', () => {
        const row = document.getElementById(`gh-scr-${el.dataset.store}`);
        row.classList.toggle('closed', !el.checked);
        if (el.checked) {
          row.querySelectorAll('.gh-dtog').forEach(tog => {
            if (['SEG','TER','QUA','QUI','SEX','SAB'].includes(tog.dataset.day)) tog.classList.add('on');
            else tog.classList.remove('on');
          });
        } else {
          row.querySelectorAll('.gh-dtog').forEach(tog => tog.classList.remove('on'));
        }
        updateDomPessoasVisibility();
      });
    });

    // Eventos: toggle dias
    c.querySelectorAll('.gh-dtog').forEach(el => {
      el.addEventListener('click', () => {
        el.classList.toggle('on');
        updateDomPessoasVisibility();
      });
    });

    function updateDomPessoasVisibility() {
      const hasDom = [...c.querySelectorAll('.gh-dtog.on')].some(el => el.dataset.day === 'DOM');
      const row = document.getElementById('gh-dom-pessoas-row');
      if (row) row.style.display = hasDom ? 'block' : 'none';
    }

    // Mostrar campo DOM se já há domingos activos
    updateDomPessoasVisibility();

    document.getElementById('gh-back-2').addEventListener('click', () => { wStep = 1; renderWiz(); });
    document.getElementById('gh-sub-stores').addEventListener('click', sub_stores);
  }

  function sub_stores() {
    S.openStores = []; S.openDays = {}; S.storeMin = {}; S.storeMax = {}; S.storeMode = {};
    STORES.forEach(st => {
      const chk = document.getElementById(`gh-chk-${st.id}`); if (!chk?.checked) return;
      const days = [...document.querySelectorAll(`[data-store="${st.id}"].gh-dtog.on`)].map(e => e.dataset.day);
      if (!days.length) return;
      S.openStores.push(st.id); S.openDays[st.id] = days;
      const minInp = document.getElementById(`gh-min-${st.id}`);
      const maxInp = document.getElementById(`gh-max-${st.id}`);
      const minVal = parseInt(minInp?.value) || 0;
      if (minVal > 0) S.storeMin[st.id] = minVal;
      const maxVal = parseInt(maxInp?.value) || 0;
      if (maxVal > 0) S.storeMax[st.id] = maxVal;
      // Ler modo de horário
      const modeEl = document.getElementById(`gh-mode-${st.id}`);
      if (modeEl?.value) S.storeMode[st.id] = modeEl.value;
    });
    if (!S.openStores.length) { alert('Selecione pelo menos uma loja.'); return; }

    // Ler número de pessoas no domingo (override manual)
    const domInp = document.getElementById('gh-dom-pessoas');
    const domVal = domInp ? parseInt(domInp.value) || 0 : 0;
    S.domPessoas = domVal > 0 ? domVal : null; // null = calcular automaticamente

    generate();
  }

  // ══ ENGINE ══

  // Coordenadora(s): pessoal com coverPri < 5 (campo na BD — sem nomes hardcoded).
  // Atribuição por prioridade de loja: loja própria se aberta → loja mais prioritária com défice → fallback.
  function computeCoordinatorPosition(active) {
    S.sandraDay = {};
    const coordinators = active.filter(p => (p.coverPri || 9) < 5).sort((a, b) => (a.coverPri||9) - (b.coverPri||9));
    if (!coordinators.length) return;

    // Cada coordenadora fica associada à sua posição via S.sandraDay[pid][day]
    // Para compatibilidade com buildCell (que ainda lê S.sandraDay[pid]),
    // generalizamos: S.sandraDay é agora { pid: { day: storeId } }
    coordinators.forEach(coord => {
      S.sandraDay[coord.id] = {};
      ['SEG','TER','QUA','QUI','SEX','SAB'].forEach(day => {
        if (isAbsent(coord.id, day)) { S.sandraDay[coord.id][day] = null; return; }

        // 1. Loja própria se aberta
        if (coord.store && storeOpen(coord.store, day)) {
          S.sandraDay[coord.id][day] = coord.store; return;
        }

        // 2. Loja aberta mais prioritária onde ela conhece E que está com défice
        const deficit = S.openStores
          .filter(id => storeOpen(id, day) && coord.knows.includes(id))
          .sort((a, b) => (STORES.find(s=>s.id===a)?.priority??9) - (STORES.find(s=>s.id===b)?.priority??9))
          .find(id => {
            const current = active.filter(p => p.id !== coord.id && p.store === id && !isAbsent(p.id, day)).length;
            return current < storeMin(id);
          });
        if (deficit) {
          S.sandraDay[coord.id][day] = deficit;
          S.decisions.push({ type: 'info', text: `${day}: ${coord.name.split(' ')[0]} → ${sname(deficit)} (cobertura coordenadora).` });
          return;
        }

        // 3. Fallback: primeira loja aberta que conhece
        const fb = S.openStores.find(id => S.openDays[id]?.includes(day) && coord.knows.includes(id));
        S.sandraDay[coord.id][day] = fb || null;
      });
    });
  }

  // Mínimo real para el domingo: puede ser menor que el mínimo semanal.
  // Avenida y Mercado: domingo puede operar con max(1, min_semanal - 1).
  // Resto: mínimo igual al semanal (o 1 si no configurado).
  // Returns workers who can realistically cover a store on Sunday.
  // Con escenario activo: acepta también personas móviles (mobile=true) aunque no sean canAlone,
  // ya que el escenario garantiza que irán acompañadas.
  // Sin escenario: comportamiento original (solo canAlone).
  function sundayCandidatesFor(sid, active) {
    return active.filter(p => {
      if (isAbsent(p.id, 'DOM')) return false;
      if (!p.knows.includes(sid)) return false;
      // Con escenario: personas móviles también son candidatas (van acompañadas)
      if (S._escenarioActivo) return p.canAlone || p.mobile;
      // Sin escenario: comportamiento original
      if (!p.canAlone) return false;
      return true;
    }).sort((a, b) => {
      const aFixed = (a.store && a.store !== sid) ? 1 : 0;
      const bFixed = (b.store && b.store !== sid) ? 1 : 0;
      return aFixed - bFixed;
    });
  }

  // Bloquear domingo solo si no hay candidatas físicamente disponibles.
  function sundayWouldBreakWeek(sundayStoreIds, active) {
    for (const sid of sundayStoreIds) {
      const needed = sundayMinFor(sid);
      const cands = sundayCandidatesFor(sid, active);
      if (cands.length < needed) {
        return {
          breaks: true,
          reason: `${sname(sid)} não tem pessoal disponível para abrir ao domingo (precisa ${needed}, disponível ${cands.length}).`
        };
      }
    }
    return { breaks: false };
  }

  // Lojas com priority <= 2 (as mais importantes: Avenida e Mercado) podem operar
  // ao domingo com 1 pessoa a menos do que o mínimo semanal — definido pelo campo priority da BD.
  function sundayMinFor(sid) {
    // Prioridad: minDom del escenario activo → cálculo por prioridad → 1
    const fromEsc = escenarioMinDom(S._escenarioActivo, sid);
    if (fromEsc != null) return fromEsc;
    const weekMin = storeMin(sid) || 1;
    const storePriority = STORES.find(s => s.id === sid)?.priority ?? 9;
    if (storePriority <= 2) return Math.max(1, weekMin - 1);
    return weekMin;
  }

  // ── PATRONES — tabla de referencia de códigos de folga ──
  // Cargados desde Supabase gh_patrones al iniciar. Fallback hardcoded si falla.
  let PATRONES = {
    1:  { folga: ['SEG','QUI'], dom: true  },
    2:  { folga: ['TER','SEX'], dom: true  },
    5:  { folga: ['SEG','DOM'], dom: false },
    6:  { folga: ['TER','DOM'], dom: false },
    7:  { folga: ['QUA','DOM'], dom: false },
    8:  { folga: ['QUI','DOM'], dom: false },
    9:  { folga: ['SEX','DOM'], dom: false },
    10: { folga: ['SAB','DOM'], dom: false },
  };

  async function loadPatrones() {
    const sb = getSupabase(); if (!sb) return;
    try {
      const { data } = await sb.from('gh_patrones').select('*');
      if (!data?.length) return;
      PATRONES = {};
      data.forEach(r => {
        const folga = ['seg','ter','qua','qui','sex','sab','dom']
          .filter(d => r[d] === 'FOLGA')
          .map(d => d.toUpperCase());
        PATRONES[r.codigo] = { folga, dom: !folga.includes('DOM') };
      });
    } catch(e) { console.warn('Erro ao carregar patrones, usando fallback:', e); }
  }

  // ── HISTORIAL — acumulado de folgas por persona ──
  async function loadHistorial() {
    const sb = getSupabase(); if (!sb) return {};
    try {
      const { data } = await sb.from('gh_folgas').select('pessoa_id, dias');
      const hist = {}; // { pid: { SEG:0, TER:0, QUA:0, QUI:0, SEX:0, SAB:0, DOM:0 } }
      (data || []).forEach(r => {
        if (!hist[r.pessoa_id]) hist[r.pessoa_id] = { SEG:0,TER:0,QUA:0,QUI:0,SEX:0,SAB:0,DOM:0 };
        (r.dias || []).forEach(d => {
          if (hist[r.pessoa_id][d] !== undefined) hist[r.pessoa_id][d]++;
        });
      });
      return hist;
    } catch(e) { console.warn('Erro ao carregar historial:', e); return {}; }
  }

  // ── COMBINACIONES — busca la combinación para n+dom+l ──
  // Prioridad: ESCENARIOS (estático) → Supabase gh_combinaciones (fallback)
  async function loadCombinacion(n, dom, l, opc) {
    // 1. Buscar en ESCENARIOS estático (más completo: incluye l y opc)
    const esc = getEscenario(n, dom, l, opc);
    if (esc?.combinacion) return esc.combinacion;
    // 2. Fallback: Supabase gh_combinaciones (solo n+dom, sin l)
    const sb = getSupabase(); if (!sb) return null;
    try {
      const { data } = await sb.from('gh_combinaciones')
        .select('combinacion')
        .eq('n', n)
        .eq('dom', dom)
        .limit(1)
        .single();
      return data?.combinacion || null;
    } catch(e) { console.warn('Erro ao carregar combinacion:', e); return null; }
  }

  // ── APRENDIZAGEM — carregar padrões aprendidos ──
  // ── APRENDIZAGEM — sistema simples de correções por pessoa+dia ──
  // Estrutura: gh_aprendizaje_v2 { pessoa_id, tienda_id, dia, shift, semana }
  // Ao aprender: guarda cada pessoa+dia+tienda+shift que difere do sistema
  // Ao gerar: aplica as correções conhecidas

  let _aprCorreccoes = {}; // { pessoa_id: { dia: { tienda_id, shift } } }

  async function loadCorreccoes() {
    const sb = getSupabase(); if (!sb) return;
    try {
      const { data } = await sb.from('gh_aprendizaje_v2').select('*');
      _aprCorreccoes = {};
      (data || []).forEach(r => {
        if (!_aprCorreccoes[r.pessoa_id]) _aprCorreccoes[r.pessoa_id] = {};
        // Usar a correção mais recente (por semana)
        const existing = _aprCorreccoes[r.pessoa_id][r.dia];
        if (!existing || r.semana > existing.semana) {
          _aprCorreccoes[r.pessoa_id][r.dia] = {
            tienda_id: r.tienda_id,
            shift:     r.shift,
            semana:    r.semana,
            count:     (existing?.count || 0) + 1
          };
        }
      });
    } catch(e) { console.warn('Erro ao carregar correções:', e); }
  }

  function getCorreccao(pessoaId, dia) {
    return _aprCorreccoes[pessoaId]?.[dia] || null;
  }

  // ── APRENDIZAGEM POR ESQUEMA — independente de pessoas ──
  let _aprEsquemas = {}; // { tienda_id|||dia|||n: shiftCombo }

  async function loadEsquemas() {
    const sb = getSupabase(); if (!sb) return;
    try {
      const { data } = await sb.from('gh_esquemas').select('*');
      _aprEsquemas = {};
      (data || []).forEach(r => {
        _aprEsquemas[`${r.tienda_id}|||${r.dia}|||${r.n_pessoas}`] = {
          shift_combo: r.shift_combo,
          votos: r.votos
        };
      });
    } catch(e) { console.warn('Erro ao carregar esquemas:', e); }
  }

  function getEsquema(sid, day, n) {
    return _aprEsquemas[`${sid}|||${day}|||${n}`] || null;
  }

  // ══ MOTOR NOVO — gh_horarios_base (Libro5.xlsx) ══
  let HORARIOS_BASE = [];

  async function loadHorariosBase() {
    const sb = getSupabase(); if (!sb) return;
    try {
      let all = [], from = 0, step = 1000;
      while (true) {
        const { data, error } = await sb.from('gh_horarios_base').select('*').range(from, from + step - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < step) break;
        from += step;
      }
      HORARIOS_BASE = all;
      console.log('gh_horarios_base:', HORARIOS_BASE.length, 'registos');
    } catch(e) { console.error('Erro loadHorariosBase:', e); }
  }

  function findBestScenario(n, n_dom, lojas, opc) {
    const has = (n2,d2,l2,o2) => HORARIOS_BASE.some(r => r.n===n2 && r.n_dom===d2 && r.lojas===l2 && r.opc===o2);
    if (has(n, n_dom, lojas, opc))            return { n, n_dom, lojas, opc };
    if (opc !== 1 && has(n, n_dom, lojas, 1)) return { n, n_dom, lojas, opc: 1 };
    if (lojas > 3) { const fb = findBestScenario(n, n_dom, lojas-1, opc); if (fb) return fb; }
    if (n_dom > 0) { const fb = findBestScenario(n, n_dom-1, lojas, opc); if (fb) return fb; }
    if (n > 4)     { const fb = findBestScenario(n-1, Math.min(n_dom, n-2), lojas, opc); if (fb) return fb; }
    return null;
  }

  function hasBothOpc(n, n_dom, lojas) {
    return HORARIOS_BASE.some(r => r.n===n && r.n_dom===n_dom && r.lojas===lojas && r.opc===1)
        && HORARIOS_BASE.some(r => r.n===n && r.n_dom===n_dom && r.lojas===lojas && r.opc===2);
  }

  function getRotacoes(scenario) {
    const { n, n_dom, lojas, opc } = scenario;
    const rows = HORARIOS_BASE.filter(r => r.n===n && r.n_dom===n_dom && r.lojas===lojas && r.opc===opc);
    const byRot = {};
    rows.forEach(r => { if (!byRot[r.rotacao]) byRot[r.rotacao] = []; byRot[r.rotacao].push(r); });
    return byRot;
  }

  function resolveStoreByShort(short) {
    if (!short || short === 'FOLGA') return null;
    return STORES.find(s => (s.short || '').toUpperCase() === short.toUpperCase())?.id || null;
  }

  function mapPeopleToSlots(active, rotacaoRows) {
    const slotNums = [...new Set(rotacaoRows.map(r => r.pessoa_slot))]
      .sort((a, b) => parseInt(a.replace('Pessoa ','')) - parseInt(b.replace('Pessoa ','')));

    const slotHome = {}, slotVisits = {};
    rotacaoRows.forEach(r => {
      slotHome[r.pessoa_slot] = r.home_loja;
      if (!slotVisits[r.pessoa_slot]) slotVisits[r.pessoa_slot] = new Set();
      ['seg','ter','qua','qui','sex','sab','dom'].forEach(d => {
        if (r[d] && r[d] !== 'FOLGA') slotVisits[r.pessoa_slot].add(r[d]);
      });
    });

    const LOJA_ORDER = ['AVENIDA','MERCADO','SHANA','MAXX'];
    const slotsByLoja = {};
    slotNums.forEach(slot => {
      const loja = slotHome[slot] || '';
      if (!slotsByLoja[loja]) slotsByLoja[loja] = [];
      slotsByLoja[loja].push(slot);
    });

    const mapping = {}, used = new Set();
    Object.keys(slotsByLoja)
      .sort((a, b) => (LOJA_ORDER.indexOf(a) < 0 ? 99 : LOJA_ORDER.indexOf(a)) - (LOJA_ORDER.indexOf(b) < 0 ? 99 : LOJA_ORDER.indexOf(b)))
      .forEach(lojaShort => {
        const homeSid = resolveStoreByShort(lojaShort);
        slotsByLoja[lojaShort].forEach(slot => {
          const visitSids = [...slotVisits[slot]].map(s => resolveStoreByShort(s)).filter(Boolean);
          const cands = active
            .filter(p => !used.has(p.id) && (!homeSid || p.knows.includes(homeSid)))
            .sort((a, b) => {
              const af = (a.store === homeSid && homeSid) ? 0 : 1;
              const bf = (b.store === homeSid && homeSid) ? 0 : 1;
              if (af !== bf) return af - bf;
              const ae = a.autonomia === 'efectiva' ? 0 : 1;
              const be = b.autonomia === 'efectiva' ? 0 : 1;
              if (ae !== be) return ae - be;
              const ak = visitSids.filter(sid => a.knows.includes(sid)).length;
              const bk = visitSids.filter(sid => b.knows.includes(sid)).length;
              if (ak !== bk) return bk - ak;
              return new Date(a.start || '2099') - new Date(b.start || '2099');
            });
          if (cands[0]) { mapping[slot] = cands[0]; used.add(cands[0].id); }
        });
      });

    slotNums.forEach(slot => {
      if (!mapping[slot]) {
        const free = active.find(p => !used.has(p.id));
        if (free) { mapping[slot] = free; used.add(free.id); }
      }
    });
    return mapping;
  }

  function scoreRotacao(rotacaoRows, mapping, hist, dirigidas, offset) {
    const COL = { SEG:'seg', TER:'ter', QUA:'qua', QUI:'qui', SEX:'sex', SAB:'sab', DOM:'dom' };
    let score = offset;
    rotacaoRows.forEach(row => {
      const p = mapping[row.pessoa_slot]; if (!p) return;
      const folgaDays = DAYS.filter(d => row[COL[d]] === 'FOLGA' && d !== 'DOM');
      const dir = dirigidas[p.id];
      if (dir) { score += folgaDays.includes(dir) ? -50 : 100; }
      folgaDays.forEach(d => { score += (hist[p.id]?.[d] || 0) * 10; });
    });
    return score;
  }

  function applyRotacao(rotacaoRows, mapping, active) {
    const COL = { SEG:'seg', TER:'ter', QUA:'qua', QUI:'qui', SEX:'sex', SAB:'sab', DOM:'dom' };
    active.forEach(p => {
      S.schedule[p.id] = {};
      DAYS.forEach(day => { S.schedule[p.id][day] = { type:'na', shift:null, store:null }; });
    });
    S.folgaDay = {}; S.extraDayOff = {}; S.sundayAssigned = {};
    S.openStores.filter(id => S.openDays[id]?.includes('DOM')).forEach(id => { S.sundayAssigned[id] = []; });

    const bySlot = {};
    rotacaoRows.forEach(r => { bySlot[r.pessoa_slot] = r; });

    Object.entries(mapping).forEach(([slot, person]) => {
      if (!person) return;
      const row = bySlot[slot]; if (!row) return;
      const abs = absOf(person.id);
      DAYS.forEach(day => {
        if (abs && isAbsent(person.id, day)) {
          S.schedule[person.id][day] = { type: abs.type === 'ferias' ? 'ferias' : 'folga', shift:null, store:null };
          return;
        }
        const val = row[COL[day]];
        if (val === 'FOLGA') {
          S.schedule[person.id][day] = { type:'folga', shift:null, store:null };
          if (day !== 'DOM') {
            if (S.folgaDay[person.id] === undefined) S.folgaDay[person.id] = day;
            else if (S.extraDayOff[person.id] === undefined) S.extraDayOff[person.id] = day;
          }
          return;
        }
        let store = resolveStoreByShort(val);
        if (store && (!person.knows.includes(store) || !storeOpen(store, day))) {
          store = (person.store && storeOpen(person.store, day)) ? person.store : null;
        }
        if (store) {
          S.schedule[person.id][day] = { type:'work', shift: storeBaseShift(store), store };
          if (day === 'DOM') {
            if (!S.sundayAssigned[store]) S.sundayAssigned[store] = [];
            S.sundayAssigned[store].push(person.id);
          }
        } else {
          S.schedule[person.id][day] = { type:'folga', shift:null, store:null };
        }
      });
    });

    active.forEach(p => {
      if (Object.values(mapping).some(m => m?.id === p.id)) return;
      const abs = absOf(p.id);
      DAYS.forEach(day => {
        if (S.schedule[p.id][day].type !== 'na') return;
        if (abs && isAbsent(p.id, day)) {
          S.schedule[p.id][day] = { type: abs.type === 'ferias' ? 'ferias' : 'folga', shift:null, store:null };
        } else {
          const sid = (p.store && storeOpen(p.store, day)) ? p.store : null;
          S.schedule[p.id][day] = sid
            ? { type:'work', shift: storeBaseShift(sid), store: sid }
            : { type:'folga', shift:null, store:null };
        }
      });
      S.alerts.push({ type:'amber', text: `${p.name.split(' ')[0]} sem slot na tabela — alocado na loja fixa.` });
    });
  }

  async function assignFromTable(active, opc) {
    const n = active.length;
    const domStores = S.openStores.filter(id => S.openDays[id]?.includes('DOM'));
    let n_dom = domStores.length;
    if (S.domPessoas && S.domPessoas > 0) n_dom = S.domPessoas;
    n_dom = Math.min(n_dom, active.filter(p => p.canAlone && !isAbsent(p.id,'DOM')).length);
    const lojas = S.openStores.length;
    const scenario = findBestScenario(n, n_dom, lojas, opc || 1);
    if (!scenario) {
      S.alerts.push({ type:'red', text: `Sem cenário para ${n} pessoas, ${n_dom} ao domingo, ${lojas} lojas.` });
      return false;
    }
    if (scenario.n !== n || scenario.n_dom !== n_dom || scenario.lojas !== lojas)
      S.alerts.push({ type:'amber', text: `Cenário ajustado → n=${scenario.n} dom=${scenario.n_dom} lojas=${scenario.lojas} opc=${scenario.opc}` });
    S.decisions.push({ type:'info', text: `Cenário: n=${scenario.n} dom=${scenario.n_dom} lojas=${scenario.lojas} opc=${scenario.opc}` });
    const rotacoes = getRotacoes(scenario);
    const rotNums = Object.keys(rotacoes).map(Number).sort((a,b) => a-b);
    if (!rotNums.length) { S.alerts.push({ type:'red', text:'Sem rotações disponíveis.' }); return false; }
    const hist = await loadHistorial();
    const dirigidas = {};
    if (S._folgasDirigidas) {
      Object.entries(S._folgasDirigidas).forEach(([pid, dias]) => {
        const v = (dias || []).filter(d => d !== 'DOM');
        if (v.length > 0 && active.find(p => p.id === pid)) dirigidas[pid] = v[0];
      });
    }
    const regenOffset = S._regenSeed || 0;
    let bestScore = Infinity, bestRot = rotNums[0], bestMapping = null;
    rotNums.forEach((rotNum, idx) => {
      const rows = rotacoes[rotNum];
      const mapping = mapPeopleToSlots(active, rows);
      const idxOffset = (idx - regenOffset % rotNums.length + rotNums.length) % rotNums.length;
      const score = scoreRotacao(rows, mapping, hist, dirigidas, idxOffset);
      if (score < bestScore) { bestScore = score; bestRot = rotNum; bestMapping = mapping; }
    });
    S.decisions.push({ type:'info', text: `Rotação ${bestRot} (score=${bestScore}, regen=${regenOffset}).` });
    S._rotacaoAtual = bestRot; S._scenarioAtual = scenario;
    applyRotacao(rotacoes[bestRot], bestMapping, active);
    DAYS.forEach(day => {
      const workers = active.filter(p => S.schedule[p.id]?.[day]?.type === 'work');
      if (workers.length) assignIntervalShiftsForDay(day, workers);
    });
    return true;
  }

  function showOpcSelector(onSelect) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:24px;max-width:360px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.18);">
        <div style="font-size:.72rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#888;margin-bottom:6px;">Opção de horário</div>
        <div style="font-size:1rem;font-weight:700;color:#111;margin-bottom:6px;">Maxx abre ao domingo?</div>
        <div style="font-size:.8rem;color:#666;margin-bottom:20px;">Existem duas variantes para esta configuração. Seleciona qual aplicar este domingo.</div>
        <div style="display:flex;gap:10px;">
          <button id="gh-opc1" style="flex:1;padding:12px;border:2px solid #e0e0e0;border-radius:8px;background:#fff;cursor:pointer;font-size:.85rem;font-weight:600;color:#333;">
            Não<br><span style="font-size:.72rem;font-weight:400;color:#888;">Maxx fechado</span>
          </button>
          <button id="gh-opc2" style="flex:1;padding:12px;border:2px solid #111;border-radius:8px;background:#111;cursor:pointer;font-size:.85rem;font-weight:600;color:#fff;">
            Sim<br><span style="font-size:.72rem;font-weight:400;color:#aaa;">Maxx aberto</span>
          </button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#gh-opc1').addEventListener('click', () => { document.body.removeChild(overlay); onSelect(1); });
    overlay.querySelector('#gh-opc2').addEventListener('click', () => { document.body.removeChild(overlay); onSelect(2); });
  }

  async function generate() {
    const active = PEOPLE.filter(p => !fullyAbsent(p.id));
    S.alerts = []; S.decisions = []; S.sandraDay = {};
    S.folgaDay = {}; S.extraDayOff = {}; S._storeBaseShift = {};
    S._scenarioAtual = null; S._rotacaoAtual = null;
    await loadCorreccoes();
    await loadEsquemas();
    S._openDaysSnapshot = JSON.parse(JSON.stringify(S.openDays));
    S._openStoresSnapshot = [...S.openStores];
    const n = active.length;
    let n_dom = S.openStores.filter(id => S.openDays[id]?.includes('DOM')).length;
    if (S.domPessoas && S.domPessoas > 0) n_dom = S.domPessoas;
    n_dom = Math.min(n_dom, active.filter(p => p.canAlone && !isAbsent(p.id,'DOM')).length);
    const lojas = S.openStores.length;
    const doGenerate = async (opc) => {
      const ok = await assignFromTable(active, opc);
      if (!ok) { showCoverageBlocker([], active); return; }
      applyNightShiftRule(active);
      saveMem();
      try {
        const snap = {};
        active.forEach(p => {
          snap[p.id] = {};
          DAYS.forEach(d => { const c = S.schedule[p.id]?.[d]; if (c) snap[p.id][d] = { type:c.type, shift:c.shift||null, store:c.store||null }; });
        });
        sessionStorage.setItem('gh_snap_sistema', JSON.stringify(snap));
      } catch(e) {}
      showSchedule(active);
    };
    if (hasBothOpc(n, n_dom, lojas)) showOpcSelector(opc => doGenerate(opc));
    else await doGenerate(1);
  }

  // ── REGRA §5: FECHO ÀS 23H ──
  // Quem fechar às 23:00 deve ter folga no dia seguinte OU entrar o mais tarde possível (SH_E).
  function applyNightShiftRule(active) {
    const workDays = ['SEG','TER','QUA','QUI','SEX','SAB'];
    workDays.forEach((day, idx) => {
      const nextDay = workDays[idx + 1] || null;
      if (!nextDay) return; // SAB não tem dia seguinte útil
      active.forEach(p => {
        const cell = S.schedule[p.id]?.[day];
        if (!cell || cell.type !== 'work') return;
        if (!closesAt23(cell.shift)) return;
        // Esta pessoa fecha às 23h — verificar dia seguinte
        const nextCell = S.schedule[p.id]?.[nextDay];
        if (!nextCell || nextCell.type !== 'work') return; // já tem folga — OK
        // Tem trabalho no dia seguinte — forçar SH_E (11:00-15:00|16:00-20:00)
        const prevShift = nextCell.shift;
        S.schedule[p.id][nextDay].shift = SH_E;
        S.decisions.push({
          type: 'warn',
          text: `${nextDay}: entrada tardia (11h) por fecho às 23h na ${DAY_PT[day]}.`
        });
        if (prevShift !== SH_E) {
          // Re-check interval consistency for that store on nextDay — just alert, do not block
          S.alerts.push({
            type: 'amber',
            text: `${nextDay}: ${p.name.split(' ')[0]} entra às 11h (regra 23h) — verificar cobertura de ${sname(nextCell.store)} de manhã.`
          });
        }
      });
    });
  }

  // ── MINIMUM COVERAGE VALIDATION ──
  // Checks that every open store has the minimum required staff on every open day (Mon-Sat).
  // Returns an array of violations. Empty array = all good.
  function validateMinCoverage(active) {
    const violations = [];
    const workDays = ['SEG','TER','QUA','QUI','SEX','SAB'];
    workDays.forEach(day => {
      S.openStores.forEach(sid => {
        if (!storeOpen(sid, day)) return;
        const min = storeMin(sid);
        if (!min || min <= 0) return; // sin mínimo configurado, no validar
        const have = active.filter(p => {
          const c = S.schedule[p.id]?.[day];
          return c?.type === 'work' && c?.store === sid;
        }).length;
        if (have < min) {
          // Verificar si es físicamente posible cubrir este mínimo
          // (hay trabajadoras disponibles ese día que conocen esta tienda)
          const available = active.filter(p => {
            const c = S.schedule[p.id]?.[day];
            if (!c || c.type !== 'work') return false;
            return p.knows.includes(sid);
          }).length;
          // Solo bloquear si ni siquiera hay personas disponibles que conozcan la tienda
          if (available >= min) {
            violations.push({ day, sid, have, min });
          }
        }
      });
    });
    return violations;
  }

  // ── BLOCKING COVERAGE ALERT ──
  function showCoverageBlocker(violations, active) {
    const c = getContainer(); if (!c) return;
    fixPanelLayout();

    const rows = violations.map(v =>
      `<div class="gh-cov-row">
        <span class="gh-cov-day">${v.day}</span>
        <span class="gh-cov-store">${sname(v.sid)}</span>
        <span class="gh-cov-count">${v.have}/${v.min} pessoa(s)</span>
      </div>`
    ).join('');

    c.innerHTML = `
      <div class="gh-wiz-box">
        <div class="gh-wiz-label">Cobertura insuficiente</div>
        <div class="gh-wiz-title">⚠ Horário não pode ser gerado</div>
        <div class="gh-wiz-sub">
          O horário resultante não garante a cobertura mínima indispensável de Segunda a Sábado.
          Ajuste as ausências, as lojas abertas ou os dias de funcionamento e tente novamente.
        </div>
        <div class="gh-cov-list">${rows}</div>
        <div class="gh-wiz-nav">
          <button class="gh-btn gh-btn-ghost" id="gh-cov-back-stores">← Lojas</button>
          <button class="gh-btn gh-btn-ghost" id="gh-cov-back-abs">← Ausências</button>
          <button class="gh-btn gh-btn-solid" id="gh-cov-regen">↺ Tentar redistribuição</button>
        </div>
      </div>`;

    document.getElementById('gh-cov-back-stores').addEventListener('click', () => { wStep = 2; renderWiz(); });
    document.getElementById('gh-cov-back-abs').addEventListener('click',   () => { wStep = 1; renderWiz(); });
    document.getElementById('gh-cov-regen').addEventListener('click', () => {
        generate();
    });
  }

  // ── RENDER HORÁRIO ──
  function shortNameInitial(fullName) {
    const parts = (fullName || '').trim().split(/\s+/);
    if (parts.length <= 1) return fullName;
    return parts[0] + ' ' + parts[parts.length - 1][0] + '.';
  }

  function showSchedule(active) {
    const c = getContainer(); if (!c) return;
    fixPanelLayout();
    const dates = wkDates();
    const today = new Date(); today.setHours(0,0,0,0);

    const alertsHTML = S.alerts.length
      ? `<div class="gh-alert-bar"><div class="gh-al-inner">${S.alerts.map(a => `<div class="gh-al-chip ${a.type}">${a.text}</div>`).join('')}</div></div>`
      : '';

    const combDisplay = S._combinacionActual
      ? `<div class="gh-comb-bar">
          <span class="gh-comb-label">Combinação</span>
          <span class="gh-comb-codes">${S._combinacionActual}</span>
          <span class="gh-comb-sep">·</span>
          ${active.filter(p => S._asignacionCodigos?.[p.id]).map(p =>
            `<span class="gh-comb-person">${shortNameInitial(p.name)}<span class="gh-comb-num">${S._asignacionCodigos[p.id]}</span></span>`
          ).join('')}
        </div>`
      : '';

    const topBar = `
      <div class="gh-sched-bar">
        <div>
          <div class="gh-sb-week">Porto Santo · Semana ${isoWeek(S.weekStart)}</div>
          <div class="gh-sb-dates">${fmt(dates[0])} — ${fmt(dates[6])} ${dates[6].getFullYear()}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="gh-btn gh-btn-ghost gh-btn-sm" id="gh-btn-regen">↺ Gerar Novamente</button>
          <button class="gh-btn gh-btn-ghost gh-btn-sm" id="gh-btn-nova">← Nova semana</button>
          <button class="gh-btn gh-btn-ghost gh-btn-sm" id="gh-btn-learn" style="color:#1a6c1a;border-color:#86efac;">⬆ Aprender</button>
          <button class="gh-btn gh-btn-solid gh-btn-sm" id="gh-btn-confirm">✓ Confirmar horário</button>
        </div>
      </div>
      ${combDisplay}
      ${alertsHTML}`;

    let bodyHTML = '';
    STORES.filter(st => S.openStores.includes(st.id)).sort((a, b) => a.priority - b.priority).forEach(st => {
      const inSection = PEOPLE.filter(p => {
        const sched = S.schedule[p.id] || {};
        if (!DAYS.some(d => sched[d]?.type !== 'na')) return false;
        if (p.store === st.id) return true;
        return DAYS.some(d => sched[d]?.type === 'work' && sched[d]?.store === st.id);
      });
      if (!inSection.length) return;

      const hdrs = DAYS.map((d, i) => {
        const date = dates[i];
        const isToday = date.toDateString() === today.toDateString();
        const open = S.openDays[st.id]?.includes(d);
        return `<th class="gh-th${!open?' gh-th-closed':''}${isToday?' gh-th-today':''}">${d}<span class="gh-th-date">${fmt(date)}</span></th>`;
      }).join('');

      const rows = inSection.map(p => {
        const sched = S.schedule[p.id] || {};
        const cells = DAYS.map((day, di) => {
          const c2 = sched[day] || { type: 'na' };
          const open = S.openDays[st.id]?.includes(day);
          if (!open) {
            if (c2.type === 'work' && c2.store && c2.store !== st.id) {
              const content = sshort(c2.store).split(' ').map(w => `<span class="gh-sh-loc">${w}</span>`).join('');
              return `<td class="gh-sh-td gh-no-click"><div class="gh-sh-inner c-elsewhere">${content}</div></td>`;
            }
            const lbl = c2.type === 'ferias' ? 'FÉRIAS' : c2.type === 'baixa' ? 'BAIXA' : 'FOLGA';
            const cls = (c2.type === 'ferias' || c2.type === 'baixa') ? 'c-ferias' : 'c-folga';
            return `<td class="gh-sh-td gh-no-click"><div class="gh-sh-inner ${cls}"><span class="gh-sh-line">${lbl}</span></div></td>`;
          }
          let cls = '', content = '';
          if (c2.type === 'folga') { cls = 'c-folga'; content = `<span class="gh-sh-line">FOLGA</span>`; }
          else if (c2.type === 'ferias') { cls = 'c-ferias'; content = `<span class="gh-sh-line">FÉRIAS</span>`; }
          else if (c2.type === 'baixa')  { cls = 'c-ferias'; content = `<span class="gh-sh-line">BAIXA</span>`; }
          else if (c2.type === 'na')     { cls = 'c-na';     content = `<span class="gh-sh-line">N/A</span>`; }
          else if (c2.type === 'work') {
            if (c2.store === st.id) {
              const soft = p.softAvoid?.some(oid => S.schedule[oid]?.[day]?.type === 'work' && S.schedule[oid]?.[day]?.store === st.id);
              cls = soft ? 'c-soft' : 'c-work';
              content = c2.shift ? c2.shift.split('|').map(l => `<span class="gh-sh-line">${l}</span>`).join('') : `<span class="gh-sh-line">—</span>`;
            } else {
              cls = 'c-elsewhere';
              content = sshort(c2.store).split(' ').map(w => `<span class="gh-sh-loc">${w}</span>`).join('');
            }
          }
          return `<td class="gh-sh-td" data-pid="${p.id}" data-day="${day}" data-store="${st.id}"><div class="gh-sh-inner ${cls}">${content}</div></td>`;
        }).join('');

        let aH = 0;
        DAYS.forEach(d => {
          const cl = S.schedule[p.id]?.[d];
          if (cl?.type === 'work' && cl.shift && cl.shift.includes(':')) {
            cl.shift.split('|').forEach(sg => {
              const parts = sg.split('-');
              if (parts.length < 2) return;
              const [h1, m1] = parts[0].split(':').map(Number);
              const [h2, m2] = parts[1].split(':').map(Number);
              if (isNaN(h1) || isNaN(h2)) return;
              aH += (h2 + m2/60) - (h1 + m1/60);
            });
          }
        });
        aH = Math.round(aH * 10) / 10;
        const hOk = Math.abs(aH - (p.hrs||40)) < 0.5;
        return `<tr>
          <td><div class="gh-p-cell">
            <div class="gh-p-name"><span class="gh-p-dot">●</span>${shortName(p.name)}</div>
            <div class="gh-p-hrs ${hOk?'ok':'bad'}">${aH}h${hOk?' ✓':' (!)'}</div>
          </div></td>${cells}</tr>`;
      }).join('');

      // Store name as button with +/- controls
      bodyHTML += `<div class="gh-store-block" id="gh-sb-${st.id}"><table class="gh-sched-tbl">
        <thead>
          <tr class="gh-tbl-store-hdr">
            <td>
              <button class="gh-store-name-btn" data-store="${st.id}">PORTO SANTO<br>${st.short.split(' ').join('<br>')}</button>
              <div class="gh-store-actions" id="gh-sa-${st.id}" style="display:none">
                <button class="gh-store-act-btn gh-store-add" data-store="${st.id}" title="Adicionar pessoa">＋</button>
              </div>
            </td>
            ${DAYS.map((d,i) => `<td>${d}<br><span class="gh-tbl-date">${fmt(dates[i])}</span></td>`).join('')}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table></div>`;
    });

    c.innerHTML = topBar + `<div class="gh-sched-body">${bodyHTML}</div>`;

    // Sincronizar ancho primera columna entre todas las tablas
    requestAnimationFrame(() => {
      const firstCells = c.querySelectorAll('.gh-sched-tbl td:first-child, .gh-sched-tbl th:first-child');
      firstCells.forEach(el => { el.style.width = ''; });
      let maxW = 0;
      firstCells.forEach(el => { maxW = Math.max(maxW, el.getBoundingClientRect().width); });
      if (maxW > 0) firstCells.forEach(el => { el.style.width = maxW + 'px'; });
    });

    document.getElementById('gh-btn-nova')?.addEventListener('click', startNew);
    document.getElementById('gh-btn-regen')?.addEventListener('click', regenSchedule);
    document.getElementById('gh-btn-learn')?.addEventListener('click', () => learnFromSchedule(active));
    document.getElementById('gh-btn-confirm')?.addEventListener('click', () => {
      const weekKey = S.weekStart?.toISOString().split('T')[0];
      const confirmed = confirm(`Confirmar e guardar o horário da semana de ${weekKey}?\n\nEsta acção gravará as folgas em Supabase e não poderá ser regenerada.`);
      if (!confirmed) return;
      const active = PEOPLE.filter(p => !fullyAbsent(p.id));
      confirmSchedule(active);
    });

    // Store name button — toggle +/- actions
    c.querySelectorAll('.gh-store-name-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const sid = btn.dataset.store;
        const panel = document.getElementById(`gh-sa-${sid}`);
        // Close all others
        c.querySelectorAll('.gh-store-actions').forEach(p => { if (p.id !== `gh-sa-${sid}`) p.style.display = 'none'; });
        panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
      });
    });

    // + Add person to store
    c.querySelectorAll('.gh-store-add').forEach(btn => {
      btn.addEventListener('click', () => {
        const sid = btn.dataset.store;
        openAddPersonToStore(sid);
      });
    });

    // Edit on click — intercept if add mode is active
    c.querySelectorAll('.gh-sh-td[data-pid]').forEach(td => {
      td.addEventListener('click', () => {
        if (_addCtx) {
          // Add mode: assign selected person to this day in the target store
          const { pid, sid } = _addCtx;
          const day = td.dataset.day;
          if (!S.openDays[sid]?.includes(day)) {
            alert(`${sname(sid)} não está aberta ao ${DAY_PT[day]}.`);
            return;
          }
          const p = P(pid);
          if (!p?.knows?.includes(sid)) {
            alert(`${shortName(p?.name)} não conhece ${sname(sid)}.`);
            return;
          }
          S.schedule[pid][day] = { type: 'work', shift: storeBaseShift(sid), store: sid };
          _addCtx = null;
          closeModal();
          const active = PEOPLE.filter(p => !fullyAbsent(p.id));
          showSchedule(active);
          return;
        }
        openEdit(td.dataset.pid, td.dataset.day, td.dataset.store);
      });
    });
  }

  function regenSchedule() {
    // Restaurar configuração original de lojas
    if (S._openDaysSnapshot) {
      S.openDays   = JSON.parse(JSON.stringify(S._openDaysSnapshot));
      S.openStores = S._openStoresSnapshot ? [...S._openStoresSnapshot] : Object.keys(S.openDays);
    }
    // Avançar seed para garantir rotação diferente
    S._regenSeed = (S._regenSeed || 0) + 1;
    generate();
  }

  // ── MODAL DE EDIÇÃO ──
  let editCtx = null;

  function openEdit(pid, day, ctxStore) {
    editCtx = { pid, day, ctxStore };
    const p = P(pid), c2 = S.schedule[pid]?.[day] || {};
    const modal = document.getElementById('gh-modal');
    if (!modal) return;
    modal.style.display = ''; // restore in case cleanup had hidden it
    document.getElementById('gh-me-ttl').textContent = `${p?.name} · ${DAY_PT[day]}`;
    const typeEl = document.getElementById('gh-me-type');
    typeEl.value = c2.type === 'work' ? 'work' : c2.type === 'ferias' ? 'ferias' : 'folga';
    const shEl = document.getElementById('gh-me-shift');
    if (c2.shift) { const f = [...shEl.options].find(o => o.value === c2.shift); shEl.value = f ? c2.shift : shEl.options[0].value; }
    const stEl = document.getElementById('gh-me-store');
    // Mostrar TODAS las tiendas — el usuario decide, advertencia si no conoce
    stEl.innerHTML = STORES.map(st => {
      const knows = P(pid)?.knows?.includes(st.id);
      return `<option value="${st.id}" ${c2.store===st.id?'selected':''}>${sname(st.id)}${!knows?' ⚠':''}</option>`;
    }).join('');
    document.getElementById('gh-me-conf').style.display = 'none';
    meTypeChange();
    modal.classList.add('open');
  }

  function meTypeChange() {
    const v = document.getElementById('gh-me-type').value;
    document.getElementById('gh-me-work').style.display = v === 'work' ? '' : 'none';
  }

  async function applyEdit() {
    const modal = document.getElementById('gh-modal');
    const mode = modal?.dataset.mode;

    // Handle add person mode
    if (mode === 'add') {
      if (!_addCtx) { alert('Seleccione uma pessoa primeiro.'); return; }
      const { pid, sid } = _addCtx;
      const days = [...document.querySelectorAll('.gh-add-day-chk:checked')].map(cb => cb.value);
      if (!days.length) { alert('Seleccione pelo menos um dia.'); return; }
      // Ensure store is in openStores and days are registered so renderer shows work correctly
      if (!S.openStores.includes(sid)) S.openStores.push(sid);
      if (!S.openDays[sid]) S.openDays[sid] = [];
      days.forEach(day => {
        if (!S.openDays[sid].includes(day)) S.openDays[sid].push(day);
        S.schedule[pid][day] = { type: 'work', shift: storeBaseShift(sid), store: sid };
      });
      cleanupModalExtras();
      closeModal();
      const active = PEOPLE.filter(p => !fullyAbsent(p.id));
      showSchedule(active);
      return;
    }

    if (!editCtx) return;
    const { pid, day } = editCtx;
    const type = document.getElementById('gh-me-type').value;
    if (type !== 'work') {
      S.schedule[pid][day] = { type: type === 'ferias' ? 'ferias' : 'folga', shift: null, store: null };
    } else {
      const shift = document.getElementById('gh-me-shift').value;
      const sid   = document.getElementById('gh-me-store').value;
      const p = P(pid), ce = document.getElementById('gh-me-conf');
      const hard = PEOPLE.find(o => o.id !== pid && p?.hardAvoid?.includes(o.id) && S.schedule[o.id]?.[day]?.type === 'work' && S.schedule[o.id]?.[day]?.store === sid);
      if (hard) { ce.textContent = `⚠ ${p?.name} e ${hard.name} não podem estar juntas.`; ce.className = 'gh-conf-note hard'; ce.style.display = ''; return; }
      const soft = PEOPLE.find(o => o.id !== pid && p?.softAvoid?.includes(o.id) && S.schedule[o.id]?.[day]?.type === 'work' && S.schedule[o.id]?.[day]?.store === sid);
      if (soft) { ce.textContent = `Atenção: ${p?.name} e ${soft.name} — preferido evitar.`; ce.className = 'gh-conf-note soft'; ce.style.display = ''; }
      else ce.style.display = 'none';
      S.schedule[pid][day] = { type: 'work', shift, store: sid };
    }
    closeModal();
    const active = PEOPLE.filter(p => !fullyAbsent(p.id));
    showSchedule(active);
  }

  // ── AÑADIR PERSONA A TIENDA ──
  // Muestra lista de todas las personas activas, el usuario elige,
  // luego clica en el día donde quiere asignarla
  let _addCtx = null;

  function openAddPersonToStore(sid) {
    const active = PEOPLE.filter(p => !fullyAbsent(p.id));
    const modal = document.getElementById('gh-modal');
    if (!modal) return;

    document.getElementById('gh-me-ttl').textContent = `Adicionar pessoa — ${sname(sid)}`;
    document.getElementById('gh-me-work').style.display = 'none';
    document.getElementById('gh-me-conf').style.display = 'none';
    document.getElementById('gh-me-type').style.display = 'none';

    const bdy = modal.querySelector('.gh-modal-bdy');
    let injected = bdy.querySelector('#gh-add-person-list');
    if (!injected) { injected = document.createElement('div'); injected.id = 'gh-add-person-list'; bdy.appendChild(injected); }

    injected.innerHTML = `
      <div style="font-size:.7rem;color:#888;margin-bottom:8px;">Escolha a pessoa:</div>
      <div style="display:flex;flex-direction:column;gap:4px;max-height:160px;overflow-y:auto;margin-bottom:12px;">
        ${active.map(p => `
          <button class="gh-add-person-pick" data-pid="${p.id}"
            style="text-align:left;padding:7px 10px;border:1px solid #e0e0e0;border-radius:6px;background:#fff;cursor:pointer;font-size:.8rem;font-family:inherit;">
            ${shortName(p.name)}
          </button>`).join('')}
      </div>
      <div style="font-size:.7rem;color:#888;margin-bottom:6px;">Dia(s) a atribuir:</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px;">
        ${DAYS.map(d =>
          `<label style="display:flex;align-items:center;gap:3px;font-size:.75rem;cursor:pointer;">
            <input type="checkbox" class="gh-add-day-chk" value="${d}"> ${d}
          </label>`
        ).join('')}
      </div>
      <div id="gh-add-warn" style="display:none;margin-top:8px;font-size:.7rem;color:#b05000;background:#fff8e8;border:1px solid #f0d080;border-radius:5px;padding:6px 8px;"></div>`;

    injected.querySelectorAll('.gh-add-person-pick').forEach(btn => {
      btn.addEventListener('click', () => {
        injected.querySelectorAll('.gh-add-person-pick').forEach(b => b.style.background = '#fff');
        btn.style.background = '#e8f0fe';
        _addCtx = { pid: btn.dataset.pid, sid };
        // Show warning if person doesn't know this store
        const p = P(btn.dataset.pid);
        const warn = injected.querySelector('#gh-add-warn');
        if (!p?.knows?.includes(sid)) {
          warn.textContent = `⚠ ${shortName(p?.name)} não tem ${sname(sid)} no seu perfil. Pode continuar, mas verifique se tem experiência.`;
          warn.style.display = 'block';
        } else {
          warn.style.display = 'none';
        }
      });
    });

    modal.dataset.mode = 'add';
    modal.classList.add('open');
  }

  // ── REMOVER PERSONA DE TIENDA — panel independiente ──

  function cleanupModalExtras() {
    const injected = document.querySelector('#gh-add-person-list');
    if (injected) injected.remove();
    const typeEl = document.getElementById('gh-me-type');
    if (typeEl) typeEl.style.display = '';
    const workEl = document.getElementById('gh-me-work');
    if (workEl) workEl.style.display = '';
    if (document.getElementById('gh-modal')) document.getElementById('gh-modal').dataset.mode = '';
    _addCtx = null;
  }

  function closeModal() {
    cleanupModalExtras();
    document.getElementById('gh-modal')?.classList.remove('open');
    editCtx = null;
  }

  async function learnFromSchedule(active) {
    const sb = getSupabase();
    if (!sb) { alert('Supabase não disponível.'); return; }
    const weekKey = S.weekStart?.toISOString().split('T')[0];
    if (!weekKey) { alert('Semana não definida.'); return; }

    // Load system snapshot
    let snapSistema = null;
    try { snapSistema = JSON.parse(sessionStorage.getItem('gh_snap_sistema') || 'null'); } catch(e) {}
    if (!snapSistema) { alert('Sem snapshot do sistema. Gere o horário primeiro.'); return; }

    const btn = document.getElementById('gh-btn-learn');
    if (btn) { btn.textContent = 'A guardar…'; btn.style.opacity = '0.6'; }

    try {
      let corrections = 0;
      let esquemas = 0;
      let total = 0;

      // 1. Correções por pessoa
      for (const p of active) {
        for (const day of DAYS) {
          const sistema = snapSistema[p.id]?.[day];
          const usuario = S.schedule[p.id]?.[day];
          if (!sistema || !usuario) continue;
          if (usuario.type !== 'work') continue;
          total++;

          const mudouTienda = sistema.store !== usuario.store;
          const mudouShift  = sistema.shift !== usuario.shift;

          if (mudouTienda || mudouShift) {
            corrections++;
            await sb.from('gh_aprendizaje_v2').upsert({
              pessoa_id:    p.id,
              tienda_id:    usuario.store,
              dia:          day,
              shift:        usuario.shift || null,
              semana:       weekKey,
              mudou_tienda: mudouTienda,
              mudou_shift:  mudouShift
            }, { onConflict: 'pessoa_id,dia,semana' });
          }
        }
      }

      // 2. Esquemas por configuração tienda+dia+n (independente de pessoas)
      for (const sid of S.openStores) {
        for (const day of DAYS) {
          if (!S.openDays[sid]?.includes(day)) continue;
          const staff = active.filter(p =>
            S.schedule[p.id]?.[day]?.type === 'work' &&
            S.schedule[p.id][day].store === sid
          );
          if (staff.length < 2) continue;

          // Ordenar por peso — mesma ordem que computeGroups
          const byWeight = [...staff].sort((a,b) => {
            const wa = a.pesoBase ?? 1.5;
            const wb = b.pesoBase ?? 1.5;
            return wb - wa || new Date(a.start||0) - new Date(b.start||0);
          });

          // Verificar se algum shift foi modificado face ao sistema
          const algumMudou = byWeight.some(p => {
            const sis = snapSistema[p.id]?.[day];
            const usr = S.schedule[p.id][day];
            return sis?.shift !== usr?.shift;
          });

          if (algumMudou) {
            // Guardar combo como A/B baseado no shift actual
            const combo = byWeight.map(p => {
              const sh = S.schedule[p.id][day].shift;
              const base = storeBaseShift(sid);
              const alt  = storeAltShift(sid);
              if (sh === base) return 'B';
              if (sh === alt)  return 'A';
              return sh; // shift custom
            }).join(',');

            // Upsert esquema — incrementar votos se já existe
            const existing = await sb.from('gh_esquemas')
              .select('id,votos')
              .eq('tienda_id', sid)
              .eq('dia', day)
              .eq('n_pessoas', staff.length)
              .single();

            if (existing?.data) {
              await sb.from('gh_esquemas')
                .update({ shift_combo: combo, votos: (existing.data.votos||1)+1, semana: weekKey, updated_at: new Date().toISOString() })
                .eq('id', existing.data.id);
            } else {
              await sb.from('gh_esquemas').insert({
                tienda_id: sid, dia: day, n_pessoas: staff.length,
                shift_combo: combo, votos: 1, semana: weekKey
              });
            }
            esquemas++;
          }
        }
      }

      const msg = (corrections + esquemas) > 0
        ? `✓ Aprendido — ${corrections} correção(ões) por pessoa, ${esquemas} esquema(s) guardado(s).`
        : `✓ Aprendido — sem diferenças face ao sistema (${total} células verificadas).`;

      if (btn) { btn.textContent = '✓ Aprendido'; btn.style.opacity = '1'; btn.style.background = '#e8f5e9'; }
      S.alerts = S.alerts.filter(a => !a.text.startsWith('✓ Aprendido'));
      S.alerts.push({ type: 'info', text: msg });
      showSchedule(active);

    } catch(e) {
      console.error('Erro ao aprender:', e);
      alert('Erro ao guardar. Verifique a consola.');
      if (btn) { btn.textContent = '⬆ Aprender'; btn.style.opacity = '1'; }
    }
  }

  function startNew() {
    S = blank(); wStep = 0; renderWiz();
  }

  // ── PUBLIC INIT ──
  window.initGeradorHorarios = function () {
    const panel = document.getElementById('tab-gerador');
    if (!panel) return;

    // Inject CSS only once
    if (!document.getElementById('gh-styles')) {
      const style = document.createElement('style');
      style.id = 'gh-styles';
      style.textContent = `
        /* ── LAYOUT — isolation from admin dark theme ── */
        #tab-gerador { background:#fff !important; color:#111 !important; }

        /* ── WIZARD ── */
        @keyframes gh-up { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        #tab-gerador .gh-wiz-box { width:100%; max-width:520px; margin:0 auto; padding:48px 24px; animation:gh-up .3s ease; box-sizing:border-box; }
        #tab-gerador .gh-wiz-label { font-size:.65rem; font-weight:600; letter-spacing:.2em; text-transform:uppercase; color:#bbb; margin-bottom:12px; }
        #tab-gerador .gh-wiz-title { font-size:1.6rem; font-weight:400; margin-bottom:8px; line-height:1.3; color:#111; }
        #tab-gerador .gh-wiz-sub   { font-size:.82rem; color:#888; margin-bottom:32px; line-height:1.6; }
        #tab-gerador .gh-field { width:100%; border:1px solid #ddd; border-radius:6px; padding:11px 13px; font-size:.9rem; font-family:inherit; font-weight:400; outline:none; transition:border-color .15s; background:#fff; margin-bottom:28px; color:#111; box-sizing:border-box; }
        #tab-gerador .gh-field:focus { border-color:#000; }
        #tab-gerador .gh-wiz-nav { display:flex; gap:12px; align-items:center; margin-top:4px; }

        /* ── BUTTONS ── */
        #tab-gerador .gh-btn { padding:9px 20px; font-size:.72rem; font-weight:600; letter-spacing:.08em; text-transform:uppercase; cursor:pointer; border-radius:6px; font-family:inherit; transition:all .15s; }
        #tab-gerador .gh-btn-solid { background:#111 !important; color:#fff !important; border:1px solid #111 !important; }
        #tab-gerador .gh-btn-solid:hover { background:#333 !important; border-color:#333 !important; }
        #tab-gerador .gh-btn-ghost { background:#fff !important; color:#111 !important; border:1px solid #999 !important; }
        #tab-gerador .gh-btn-ghost:hover { border-color:#111 !important; }
        #tab-gerador .gh-btn-sm { padding:6px 14px; font-size:.65rem; }
        #tab-gerador .gh-wiz-back { background:none !important; border:none !important; font-size:.68rem; color:#bbb !important; cursor:pointer; font-family:inherit; letter-spacing:.06em; text-transform:uppercase; padding:6px 4px; }
        #tab-gerador .gh-wiz-back:hover { color:#111 !important; }

        /* ── ABSENCES ── */
        #tab-gerador .gh-ab-list { margin-bottom:14px; }
        #tab-gerador .gh-ab-row { display:grid; grid-template-columns:1fr 110px 90px 28px; gap:8px; align-items:center; padding:8px 0; border-bottom:1px solid #f0f0f0; }
        #tab-gerador .gh-ab-sel { border:1px solid #ddd; border-radius:5px; padding:7px 9px; font-size:.78rem; font-family:inherit; font-weight:300; outline:none; background:#fff; width:100%; color:#111; }
        #tab-gerador .gh-ab-x { background:none; border:none; cursor:pointer; color:#ccc; font-size:1rem; line-height:1; }
        #tab-gerador .gh-ab-x:hover { color:#c00; }
        #tab-gerador .gh-add-btn { display:flex; align-items:center; gap:8px; font-size:.75rem; color:#aaa; cursor:pointer; border:1px dashed #ddd; border-radius:5px; padding:9px 14px; background:none; font-family:inherit; width:100%; margin-bottom:24px; }
        #tab-gerador .gh-add-btn:hover { border-color:#111; color:#111; }

        /* ── STORE CONFIG ── */
        #tab-gerador .gh-store-cfg { margin-bottom:28px; display:flex; flex-direction:column; gap:0; }
        #tab-gerador .gh-sc-row { padding:14px 0 10px; border-bottom:1px solid #f0f0f0; display:flex; flex-direction:column; gap:8px; }
        #tab-gerador .gh-sc-row:last-child { border-bottom:none; }
        #tab-gerador .gh-sc-top { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
        #tab-gerador .gh-sc-name { font-size:.88rem; cursor:pointer; color:#111; font-weight:600; flex:1; min-width:80px; }
        #tab-gerador .gh-sc-top input[type=checkbox] { width:16px; height:16px; cursor:pointer; accent-color:#000; flex-shrink:0; }
        #tab-gerador .gh-sc-minmax { display:flex; align-items:center; gap:4px; background:#f5f5f5; border:1px solid #e8e8e8; border-radius:6px; padding:3px 8px; margin-left:auto; }
        #tab-gerador .gh-sc-mm-field { display:flex; align-items:center; gap:3px; }
        #tab-gerador .gh-sc-mm-label { font-size:.58rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#aaa; }
        #tab-gerador .gh-sc-mm-inp { width:32px; font-size:.78rem; font-weight:700; text-align:center; border:1px solid #ddd; border-radius:3px; padding:2px 3px; color:#111; background:#fff; font-family:inherit; }
        #tab-gerador .gh-sc-mm-inp:focus { outline:none; border-color:#111; }
        #tab-gerador .gh-sc-mm-inp::placeholder { color:#ccc; font-weight:400; }
        #tab-gerador .gh-sc-mm-sep { font-size:.7rem; color:#ccc; padding:0 1px; }
        #tab-gerador .gh-sc-fixed-cap { font-size:.62rem; font-weight:700; color:#888; background:#f0f0f0; border:1px solid #e0e0e0; border-radius:5px; padding:3px 9px; margin-left:auto; white-space:nowrap; }
        #tab-gerador .gh-sc-days { display:flex; gap:5px; flex-wrap:wrap; padding-left:26px; }
        #tab-gerador .gh-sc-mode-row { display:flex; align-items:center; gap:8px; padding-left:26px; flex-wrap:wrap; }
        #tab-gerador .gh-sc-mode-label { font-size:.58rem; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:#aaa; white-space:nowrap; }
        #tab-gerador .gh-sc-mode-sel { font-size:.72rem; border:1px solid #ddd; border-radius:5px; padding:4px 8px; font-family:inherit; color:#111; background:#fff; cursor:pointer; flex:1; min-width:180px; max-width:340px; }
        #tab-gerador .gh-sc-mode-sel:focus { outline:none; border-color:#111; }
        #tab-gerador .gh-sc-mode-hint { font-size:.62rem; color:#888; white-space:nowrap; flex-shrink:0; }
        /* Disabled state */
        #tab-gerador .gh-sc-row.closed .gh-sc-minmax,
        #tab-gerador .gh-sc-row.closed .gh-sc-mode-row { opacity:.3; pointer-events:none; }
        #tab-gerador .gh-sc-row.closed .gh-sc-name { color:#bbb; }
        #tab-gerador .gh-sc-row.closed .gh-sc-days { opacity:.2; pointer-events:none; }
        /* Day toggles */
        #tab-gerador .gh-dtog { padding:5px 9px; border:1px solid #ddd; border-radius:4px; font-size:.65rem; font-weight:600; letter-spacing:.04em; cursor:pointer; user-select:none; color:#555; background:#fff; transition:all .12s; }
        #tab-gerador .gh-dtog:hover { border-color:#555; }
        #tab-gerador .gh-dtog.on { background:#111; color:#fff !important; border-color:#111; }
        #tab-gerador .gh-dtog-dom { border-style:dashed; }
        #tab-gerador .gh-dtog-dom.on { background:#1a5c9e; border-color:#1a5c9e; border-style:solid; }
        /* Season banner */
        #tab-gerador .gh-season-banner { display:flex; align-items:flex-start; gap:10px; background:#f5f8ff; border:1px solid #d0ddf5; border-radius:8px; padding:10px 14px; margin-bottom:18px; }
        #tab-gerador .gh-season-icon { font-size:1.1rem; flex-shrink:0; margin-top:1px; }
        #tab-gerador .gh-season-name { font-size:.78rem; font-weight:700; color:#1a3a6c; margin-bottom:2px; }
        #tab-gerador .gh-season-hint { font-size:.7rem; color:#4a6a9c; line-height:1.4; }

        /* ── COMBINAÇÃO BAR ── */
        #tab-gerador .gh-comb-bar { display:flex; align-items:center; flex-wrap:wrap; gap:6px; padding:6px 20px; background:#f9f9f7; border-bottom:1px solid #efefeb; font-size:.62rem; }
        #tab-gerador .gh-comb-label { font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#bbb; margin-right:2px; }
        #tab-gerador .gh-comb-codes { font-family:monospace; color:#888; font-size:.68rem; }
        #tab-gerador .gh-comb-sep { color:#ddd; }
        #tab-gerador .gh-comb-person { display:inline-flex; align-items:center; gap:3px; background:#f0f0eb; border-radius:4px; padding:1px 6px; color:#555; }
        #tab-gerador .gh-comb-num { font-weight:700; color:#1a3a6c; background:#e8f0fe; border-radius:3px; padding:0 4px; font-size:.65rem; margin-left:2px; }

        /* ── SCHEDULE BAR ── */
        #tab-gerador .gh-sched-bar { position:sticky; top:0; background:#fff; border-bottom:1px solid #e8e8e8; padding:12px 20px; display:flex; align-items:center; justify-content:space-between; z-index:10; box-sizing:border-box; }
        #tab-gerador .gh-sb-week  { font-size:.68rem; font-weight:600; letter-spacing:.15em; text-transform:uppercase; color:#888; }
        #tab-gerador .gh-sb-dates { font-size:.88rem; font-weight:500; margin-top:2px; color:#111; }
        #tab-gerador .gh-alert-bar { padding:8px 20px; background:#fafafa; border-bottom:1px solid #ebebeb; box-sizing:border-box; }
        #tab-gerador .gh-dec-bar   { padding:7px 20px; border-bottom:1px solid #f0f0f0; box-sizing:border-box; }
        #tab-gerador .gh-al-inner  { display:flex; flex-wrap:wrap; gap:6px; }
        #tab-gerador .gh-dec-inner { display:flex; flex-wrap:wrap; gap:5px; }
        #tab-gerador .gh-al-chip { font-size:.72rem; font-weight:600; padding:5px 13px; border-radius:20px; }
        #tab-gerador .gh-al-chip.red   { background:#fff0f0; color:#a93226; border:1px solid rgba(169,50,38,.25); }
        #tab-gerador .gh-al-chip.amber { background:#fff8e8; color:#9a6f00; border:1px solid rgba(154,111,0,.25); }
        #tab-gerador .gh-al-chip.info  { background:#edf3ff; color:#1a4a7a; border:1px solid rgba(26,74,122,.25); }
        #tab-gerador .gh-dec-chip { font-size:.68rem; font-weight:500; color:#555; padding:4px 10px; background:#efefef; border-radius:4px; }

        /* ── COVERAGE BLOCKER ── */
        #tab-gerador .gh-cov-list { margin:24px 0; display:flex; flex-direction:column; gap:8px; }
        #tab-gerador .gh-cov-row { display:grid; grid-template-columns:60px 1fr auto; gap:12px; align-items:center; padding:10px 14px; background:#fff5f5; border:1px solid rgba(169,50,38,.2); border-radius:7px; }
        #tab-gerador .gh-cov-day { font-size:.72rem; font-weight:700; letter-spacing:.1em; color:#a93226; }
        #tab-gerador .gh-cov-store { font-size:.82rem; font-weight:500; color:#111; }
        #tab-gerador .gh-cov-count { font-size:.72rem; font-weight:600; color:#a93226; white-space:nowrap; }

        /* ── TABLE LAYOUT ── */
        #tab-gerador .gh-sched-body { padding:20px 0 60px; width:100%; box-sizing:border-box; display:flex; flex-direction:column; align-items:stretch; }

        /* 1. CONTENEDOR: bloque desplazable */
        #tab-gerador .gh-store-block {
          overflow-x: auto !important;
          -webkit-overflow-scrolling: touch !important;
          width: 100% !important;
          display: block !important;
          margin-bottom: 48px;
          padding-bottom: 15px !important;
          box-sizing: border-box;
        }

        /* 2. TABLA: obligada a NO encogerse */
        #tab-gerador .gh-sched-tbl {
          width: auto !important;
          min-width: unset !important;
          border-collapse: collapse !important;
          table-layout: auto !important;
          margin: 0 auto !important;
        }

        /* 3. CELDAS: sin saltos de linea, fondo solido */
        #tab-gerador .gh-sched-tbl th,
        #tab-gerador .gh-sched-tbl td {
          white-space: nowrap !important;
          background-color: #ffffff !important;
        }

        #tab-gerador .gh-tbl-store-hdr { background:#efefef; }
        #tab-gerador .gh-tbl-store-hdr td { background-color:#efefef !important; padding:9px 8px; font-size:.75rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; border:1px solid #ddd; text-align:center; color:#111; white-space:nowrap; }
        #tab-gerador .gh-tbl-store-hdr td:first-child { text-align:center; white-space:nowrap; }
        #tab-gerador .gh-store-name-btn { background:none; border:none; cursor:pointer; font-size:.75rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#111; font-family:inherit; padding:4px 8px; border-radius:5px; transition:background .15s; line-height:1.4; }
        #tab-gerador .gh-store-name-btn:hover { background:#e0e0e0; }
        #tab-gerador .gh-store-actions { display:flex; gap:4px; justify-content:center; margin-top:4px; }
        #tab-gerador .gh-store-act-btn { width:26px; height:26px; border-radius:50%; border:1px solid #ccc; background:#fff; cursor:pointer; font-size:1rem; font-weight:700; display:flex; align-items:center; justify-content:center; transition:all .15s; line-height:1; }
        #tab-gerador .gh-store-add:hover { background:#e8f5e9; border-color:#4caf50; color:#2e7d32; }
        #tab-gerador .gh-tbl-date { font-weight:500; font-size:.72rem; color:#555; }
        #tab-gerador .gh-sched-tbl td { border:1px solid #e8e8e8; padding:0; vertical-align:middle; }
        #tab-gerador .gh-sched-tbl td:first-child { padding:0; white-space:nowrap; }
        #tab-gerador .gh-sh-td { white-space:nowrap; text-align:center; cursor:pointer; }
        #tab-gerador .gh-sh-td:hover { background:#f4f4f4 !important; }
        #tab-gerador .gh-no-click { cursor:default; }
        #tab-gerador .gh-no-click:hover { background:transparent !important; }

        /* ── PERSON CELL ── */
        #tab-gerador .gh-p-cell { padding:8px 12px; white-space:nowrap; }
        #tab-gerador .gh-p-name { font-size:.85rem; font-weight:600; display:flex; align-items:center; gap:5px; color:#111; }
        #tab-gerador .gh-p-dot  { color:#e74c3c; font-size:.7rem; flex-shrink:0; }
        #tab-gerador .gh-p-hrs-tag { font-weight:500; color:#999; font-size:.72rem; flex-shrink:0; }
        #tab-gerador .gh-p-hrs  { font-size:.68rem; padding-left:16px; margin-top:2px; font-weight:600; }
        #tab-gerador .gh-p-hrs.ok  { color:#2d6a4f; }
        #tab-gerador .gh-p-hrs.bad { color:#c0392b; }

        /* ── SHIFT CELLS ── */
        #tab-gerador .gh-sh-inner { padding:7px 4px; min-height:48px; display:flex; flex-direction:column; align-items:center; justify-content:center; }
        #tab-gerador .gh-sh-line { display:block; font-size:.82rem; font-weight:600; line-height:1.65; color:#111; white-space:nowrap; }
        #tab-gerador .gh-sh-loc  { display:block; font-size:.78rem; font-weight:700; letter-spacing:.03em; text-transform:uppercase; color:#111; line-height:1.4; }
        #tab-gerador .c-folga  { background:#f9f9f9; }
        #tab-gerador .c-folga .gh-sh-line  { color:#ccc; font-style:italic; }
        #tab-gerador .c-ferias { background:#f9f9f9; }
        #tab-gerador .c-ferias .gh-sh-line { color:#ccc; font-style:italic; }
        #tab-gerador .c-na .gh-sh-line     { color:#e0e0e0; }
        #tab-gerador .c-elsewhere { background:#f5f5f5; }
        #tab-gerador .c-soft { background:#fffbf0; }
        #tab-gerador .c-soft .gh-sh-line { color:#b8860b; }

        /* ── MODAL — position:fixed floats over whole page; always start hidden ── */
        #gh-modal { display:none; position:fixed; inset:0; background:rgba(0,0,0,.3); backdrop-filter:blur(3px); z-index:9000; align-items:center; justify-content:center; opacity:0; pointer-events:none; transition:opacity .2s; }
        #gh-modal.open { display:flex; opacity:1; pointer-events:all; }
        #gh-modal .gh-modal { background:#fff; border:1px solid #e0e0e0; border-radius:8px; width:340px; max-width:94vw; overflow:hidden; transform:translateY(8px); transition:transform .2s; box-shadow:0 8px 32px rgba(0,0,0,.12); color:#111; }
        #gh-modal.open .gh-modal { transform:translateY(0); }
        #gh-modal .gh-modal-hdr { padding:14px 18px; border-bottom:1px solid #f0f0f0; display:flex; justify-content:space-between; align-items:center; }
        #gh-modal .gh-modal-ttl { font-size:.72rem; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:#111; }
        #gh-modal .gh-modal-x   { background:none; border:none; cursor:pointer; color:#bbb; font-size:1rem; line-height:1; }
        #gh-modal .gh-modal-bdy { padding:18px; }
        #gh-modal .gh-modal-ftr { padding:12px 18px; border-top:1px solid #f0f0f0; display:flex; gap:10px; justify-content:flex-end; }
        #gh-modal .gh-form-grp  { margin-bottom:14px; }
        #gh-modal .gh-form-lbl  { display:block; font-size:.62rem; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:#999; margin-bottom:5px; }
        #gh-modal .gh-field-sm  { width:100%; border:1px solid #ddd; border-radius:5px; padding:7px 10px; font-size:.82rem; font-family:inherit; font-weight:300; outline:none; background:#fff; color:#111; box-sizing:border-box; }
        #gh-modal .gh-field-sm:focus { border-color:#111; }
        #gh-modal .gh-conf-note { padding:8px 10px; border-radius:5px; font-size:.72rem; margin-top:8px; line-height:1.5; }
        #gh-modal .gh-conf-note.hard { background:#fff5f5; border:1px solid rgba(192,57,43,.2); color:#c0392b; }
        #gh-modal .gh-conf-note.soft { background:#fffbf0; border:1px solid rgba(184,134,11,.2); color:#b8860b; }

        /* ── FERIAS BANNER (injected separately, also scope it) ── */
        #tab-gerador .gh-ferias-banner { display:flex; align-items:center; gap:9px; background:#f0f9f0; border:1px solid #b7ddb7; border-radius:7px; padding:9px 13px; font-size:.8rem; color:#1a5c1a; margin-bottom:12px; font-weight:500; line-height:1.4; }
        #tab-gerador .gh-ferias-banner-icon { font-size:1rem; flex-shrink:0; }
        #tab-gerador .gh-ab-row-ferias { display:flex; align-items:center; gap:8px; padding:6px 10px; background:#f6fdf6; border:1px solid #c8e6c8; border-radius:7px; margin-bottom:6px; font-size:.82rem; color:#1a5c1a; font-weight:600; }
        #tab-gerador .gh-ab-row-ferias .gh-ferias-tag { background:#e0f5e0; color:#1a5c1a; border-radius:4px; font-size:.68rem; padding:2px 8px; font-weight:700; letter-spacing:.04em; flex-shrink:0; }
        #tab-gerador .gh-ab-row-ferias .gh-ferias-from { font-size:.74rem; color:#4a8a4a; font-weight:500; margin-left:auto; }

        /* ── STAFF MANAGEMENT PANEL ── */
        /* ── STEP 2 LAYOUT ── */
        #tab-gerador .gh-step2-wrap { width:100%; max-width:780px; margin:0 auto; padding:12px 8px 40px; box-sizing:border-box; }
        #tab-gerador .gh-step2-header { margin-bottom:14px; }
        #tab-gerador .gh-step2-header-top { margin-bottom:10px; }
        #tab-gerador .gh-step2-title-row { display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:4px; }
        #tab-gerador .gh-step2-badge { background:#111 !important; color:#fff !important; -webkit-text-fill-color:#fff !important; border-radius:20px; padding:4px 14px; font-size:.75rem; font-weight:700; letter-spacing:.04em; white-space:nowrap; flex-shrink:0; }
        #tab-gerador .gh-step2-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:10px; }
        #tab-gerador .gh-wiz-box--wide { max-width:680px; }
        #tab-gerador .gh-staff-list { display:flex; flex-direction:column; gap:6px; margin-top:12px; }
        #tab-gerador .gh-staff-row { display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border:1px solid #e8e8e8; border-radius:7px; background:#fafafa; }
        #tab-gerador .gh-staff-row.gh-staff-ferias { background:#f0fdf0; border-color:#b7ddb7; }
        #tab-gerador .gh-staff-info { display:flex; flex-direction:column; gap:2px; }
        #tab-gerador .gh-staff-name-row { display:flex; align-items:center; gap:8px; }
        #tab-gerador .gh-staff-name { font-size:.85rem; font-weight:700; color:#111; }
        #tab-gerador .gh-staff-meta { font-size:.72rem; color:#777; }
        #tab-gerador .gh-staff-weight { font-size:.70rem; color:#555; font-weight:600; }
        #tab-gerador .gh-staff-knows { font-size:.68rem; color:#999; }
        #tab-gerador .gh-staff-actions { flex-shrink:0; margin-left:10px; }
        #tab-gerador .gh-btn-xs { font-size:.62rem; padding:2px 6px; }

        /* ── PERSON FORM ── */
        #tab-gerador .gh-person-form { border:1px solid #e0e0e0; border-radius:8px; padding:14px; margin-bottom:12px; background:#fff; }
        #tab-gerador .gh-pf-title { font-size:.78rem; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:#555; margin-bottom:12px; }
        #tab-gerador .gh-pf-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        #tab-gerador .gh-pf-field { display:flex; flex-direction:column; gap:4px; }
        #tab-gerador .gh-pf-field label { font-size:.65rem; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:#999; }
        #tab-gerador .gh-pf-stores { display:flex; flex-wrap:wrap; gap:8px; margin-top:4px; }
        #tab-gerador .gh-pf-check { display:flex; align-items:center; gap:5px; font-size:.78rem; color:#333; cursor:pointer; }
        #tab-gerador .gh-pf-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:12px; }

        /* ── STAFF ROW colapsável ── */
        #tab-gerador .gh-staff-list { display:flex; flex-direction:column; gap:5px; margin-top:12px; }
        #tab-gerador .gh-sr { border:1px solid #e8e8e8; border-radius:8px; background:#fff; box-sizing:border-box; width:100%; }
        #tab-gerador .gh-sr-ferias { background:#f0fdf0; border-color:#b7ddb7; }
        #tab-gerador .gh-sr-header { display:flex; align-items:center; justify-content:space-between; padding:8px 12px; gap:8px; }
        #tab-gerador .gh-sr-header-left { display:flex; align-items:center; gap:7px; flex:1; min-width:0; }
        #tab-gerador .gh-toggle-btn { background:none; border:none; cursor:pointer; font-size:.65rem; color:#bbb; padding:0; width:14px; flex-shrink:0; }
        #tab-gerador .gh-toggle-btn:hover { color:#555; }
        #tab-gerador .gh-sr-nameblock { display:flex; flex-direction:column; gap:1px; min-width:0; }
        #tab-gerador .gh-sr-name { font-size:.82rem; font-weight:700; color:#111; white-space:nowrap; display:flex; align-items:baseline; gap:3px; }
        #tab-gerador .gh-sr-meta { font-size:.62rem; color:#999; white-space:nowrap; }
        #tab-gerador .gh-auto-badge { font-size:.58rem; font-weight:700; padding:1px 5px; border-radius:3px; letter-spacing:.03em; }
        #tab-gerador .gh-auto-efectiva   { background:#e8f5e9; color:#2e7d32; }
        #tab-gerador .gh-auto-autonoma   { background:#e3f2fd; color:#1565c0; }
        #tab-gerador .gh-auto-autonoma_h { background:#fff3e0; color:#e65100; }
        #tab-gerador .gh-auto-nao_autonoma { background:#fce4ec; color:#c62828; }
        #tab-gerador .gh-sr-btns { display:flex; flex-direction:row; gap:4px; flex-shrink:0; }
        #tab-gerador .gh-icon-btn { width:24px; height:24px; border:1px solid #e0e0e0; border-radius:5px; background:#fafafa; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; color:#555; font-size:.78rem; font-weight:600; line-height:1; transition:background .15s; flex-shrink:0; }
        #tab-gerador .gh-icon-btn:hover { background:#efefef; border-color:#bbb; }
        #tab-gerador .gh-sr-body { border-top:1px solid #f0f0f0; }
        #tab-gerador .gh-sr-cols { display:flex; flex-direction:row; overflow-x:auto; -webkit-overflow-scrolling:touch; }
        #tab-gerador .gh-sr-col { padding:10px 12px; border-right:1px solid #f0f0f0; display:flex; flex-direction:column; gap:3px; min-width:160px; flex-shrink:0; }
        #tab-gerador .gh-sr-col:last-child { border-right:none; }
        #tab-gerador .gh-sr-col-title { font-size:.62rem; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:#888; display:flex; align-items:center; gap:4px; white-space:nowrap; margin-bottom:3px; }
        #tab-gerador .gh-saldo-sup { font-size:.58rem; font-weight:700; padding:1px 4px; border-radius:3px; vertical-align:super; margin-left:2px; }
        #tab-gerador .gh-saldo-sup-neg { background:#fff0f0; color:#c0392b !important; -webkit-text-fill-color:#c0392b !important; }
        #tab-gerador .gh-saldo-sup-pos { background:#f0fff0; color:#1a6c1a !important; -webkit-text-fill-color:#1a6c1a !important; }
        #tab-gerador .gh-day-btns { display:flex; flex-direction:row; gap:2px; flex-wrap:nowrap; }
        #tab-gerador .gh-day-btn { border:1px solid #ddd; background:#fff; color:#555; border-radius:3px; width:22px; height:22px; font-size:.62rem; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0; flex-shrink:0; }
        #tab-gerador .gh-day-btn-on { background:#111 !important; color:#fff !important; -webkit-text-fill-color:#fff !important; border-color:#111 !important; }
        #tab-gerador .gh-date-row { display:flex; flex-direction:row; gap:3px; }
        #tab-gerador .gh-date-txt { width:68px !important; font-size:.65rem !important; padding:2px 3px !important; }
        #tab-gerador .gh-sel-mini { width:auto !important; max-width:80px; font-size:.65rem !important; padding:2px 3px !important; }
        #tab-gerador .gh-num-mini { width:40px !important; font-size:.65rem !important; padding:2px 3px !important; }
        #tab-gerador .gh-inc-saldo { font-size:.74rem; font-weight:700; padding:2px 6px; border-radius:4px; display:inline-block; margin-bottom:3px; }
        #tab-gerador .gh-inc-saldo-neg { background:#fff0f0; color:#c0392b !important; -webkit-text-fill-color:#c0392b !important; }
        #tab-gerador .gh-inc-saldo-pos { background:#f0fff0; color:#1a6c1a !important; -webkit-text-fill-color:#1a6c1a !important; }
        #tab-gerador .gh-banco-add-row { display:flex; flex-direction:row; gap:3px; align-items:center; }
        #tab-gerador .gh-inc-tag { font-size:.6rem; font-weight:700; padding:1px 4px; border-radius:3px; }
      `;
      document.head.appendChild(style);
    }

    // Inject HTML into panel (only once) — only gh-container goes inside the panel
    if (!document.getElementById('gh-container')) {
      panel.innerHTML = `<div id="gh-container"></div>`;
    }

    // Modal lives in document.body — completely outside any tab panel so it never
    // bleeds into other modules regardless of how tabs show/hide their panels.
    if (!document.getElementById('gh-modal')) {
      const modalEl = document.createElement('div');
      modalEl.id = 'gh-modal';
      modalEl.innerHTML = `
        <div class="gh-modal">
          <div class="gh-modal-hdr">
            <div class="gh-modal-ttl" id="gh-me-ttl">Editar</div>
            <button class="gh-modal-x" id="gh-modal-x">✕</button>
          </div>
          <div class="gh-modal-bdy">
            <div class="gh-form-grp">
              <label class="gh-form-lbl">Tipo</label>
              <select class="gh-field-sm" id="gh-me-type" style="width:100%">
                <option value="work">Trabalho</option>
                <option value="folga">FOLGA</option>
                <option value="ferias">FÉRIAS</option>
              </select>
            </div>
            <div id="gh-me-work">
              <div class="gh-form-grp" style="margin-top:10px">
                <label class="gh-form-lbl">Horário</label>
                <select class="gh-field-sm" id="gh-me-shift" style="width:100%">
                  <option value="10:00-13:00|14:00-19:00">[A] 10:00-13:00 / 14:00-19:00 (intervalo 13h)</option>
                  <option value="10:00-14:00|15:00-19:00">[B] 10:00-14:00 / 15:00-19:00 (intervalo 14h)</option>
                  <option value="10:00-15:00|16:00-19:00">[C] 10:00-15:00 / 16:00-19:00 (intervalo 15h)</option>
                  <option value="09:00-12:00|13:00-18:00">[D] 09:00-12:00 / 13:00-18:00 (abertura 9h)</option>
                  <option value="11:00-15:00|16:00-20:00">[E] 11:00-15:00 / 16:00-20:00 (pós-noite)</option>
                  <option value="09:00-13:00|19:00-23:00">[F] 09:00-13:00 / 19:00-23:00 (noite 23h)</option>
                </select>
              </div>
              <div class="gh-form-grp" style="margin-top:10px">
                <label class="gh-form-lbl">Loja</label>
                <select class="gh-field-sm" id="gh-me-store" style="width:100%"></select>
              </div>
            </div>
            <div class="gh-conf-note" id="gh-me-conf" style="display:none"></div>
          </div>
          <div class="gh-modal-ftr">
            <button class="gh-btn gh-btn-ghost gh-btn-sm" id="gh-modal-cancel">Cancelar</button>
            <button class="gh-btn gh-btn-solid gh-btn-sm" id="gh-modal-save">Guardar</button>
          </div>
        </div></div></div>`;
      document.body.appendChild(modalEl);

      document.getElementById('gh-modal-x').addEventListener('click', closeModal);
      document.getElementById('gh-modal-cancel').addEventListener('click', closeModal);
      document.getElementById('gh-modal-save').addEventListener('click', () => applyEdit());
      document.getElementById('gh-me-type').addEventListener('change', meTypeChange);
      modalEl.addEventListener('click', e => {
        if (e.target === modalEl) closeModal();
      });
    }

    // Load knowledge base from Supabase before rendering
    loadKnowledgeBase().then(async () => {
      await loadHorariosBase();
      renderWiz();
    }).catch(err => {
      console.error('Failed to load knowledge base:', err);
      renderWiz();
    });
  };

  // ── TAB LISTENER ──
  // Listen for tab changes using the custom openModule flow AND direct tab-btn clicks.
  // IMPORTANT: only match clicks whose target is actually a tab button — NOT clicks on
  // dashboard cards (.adm-mod-card) which also reach the document in capture phase.
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('.tab-btn, .drawer-tab-btn');
    if (!btn) return;
    // Extra guard: ignore if the button is inside the dashboard card grid
    // (shouldn't happen normally, but prevents false positives)
    if (e.target.closest('.adm-mod-card')) return;
    if (btn.dataset.tab === 'gerador') {
      window.initGeradorHorarios?.();
    } else {
      cleanupGeradorLayout();
    }
  }, true); // capture phase: fires before the tab's own handler shows/hides panels

})();
