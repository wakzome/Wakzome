// ═══════════════════════════════════════════════════════════════════
// PATCH 1 — getSupabase() síncrono (elimina el polling asíncrono)
// Mantiene sbAdmin (sin credenciales hardcodeadas) pero lo lee de
// forma síncrona igual que el antiguo leía window.supabase.
// ═══════════════════════════════════════════════════════════════════

// SUSTITUIR este bloque completo (líneas ~18-30 del nuevo archivo):
//
//   async function getSupabase() {
//     if (typeof sbAdmin !== 'undefined' && sbAdmin) return sbAdmin;
//     for (let i = 0; i < 50; i++) {
//       await new Promise(r => setTimeout(r, 100));
//       if (typeof sbAdmin !== 'undefined' && sbAdmin) return sbAdmin;
//     }
//     return null;
//   }
//
// POR ESTO:

function getSupabase() {
  if (typeof sbAdmin !== 'undefined' && sbAdmin) return sbAdmin;
  return null;
}

// IMPORTANTE: como ahora getSupabase() es síncrona, todas las
// funciones que la llaman con "await getSupabase()" siguen
// funcionando — await sobre un valor no-Promise simplemente lo
// devuelve tal cual. No hay que cambiar nada más por esto.


// ═══════════════════════════════════════════════════════════════════
// PATCH 2 — loadIncidencias() y lancarBanco(): eliminar await
//           innecesario en getSupabase() (ahora síncrona)
//
// En la práctica "const sb = await getSupabase()" sigue funcionando
// aunque la función ya no sea async, pero para consistencia y para
// evitar confusión futura, en las funciones clave basta con:
//   const sb = getSupabase();
//
// No es obligatorio cambiar todos los sitios — JavaScript lo
// maneja correctamente en ambos casos. Solo hay que asegurarse
// de que la función exportada initGeradorHorarios llame
// loadKnowledgeBase() correctamente (ver Patch 3).
// ═══════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════
// PATCH 3 — confirmSchedule(): corregir cálculo banco de horas
//           para personas con férias/baixa/licença parciales.
//
// El bug: diffSemana = realHrs - 40 se aplica a TODAS las personas
// con horario, incluyendo a quien solo trabajó 3 días porque estaba
// de férias el resto. Eso genera deuda falsa.
//
// Solución: si la persona tiene ausencia (férias, baixa, licença)
// esta semana, NO tocar su banco de horas — sus horas ya están
// justificadas por la ausencia. Solo calcular banco para personas
// que trabajaron la semana completa sin ausencias.
// ═══════════════════════════════════════════════════════════════════

// SUSTITUIR el bloque de "Actualizar banco de horas" dentro de
// confirmSchedule() — el try/catch que empieza con:
//   "// Actualizar banco de horas — lógica correcta con historial por semana"
//
// POR ESTO:

      // Actualizar banco de horas
      S._isEditing = false;
      try {
        const sb = getSupabase();
        if (sb) {
          const { data: bancoDB } = await sb.from('gh_banco_horas').select('*');
          const bancoMap = {};
          (bancoDB || []).forEach(b => { bancoMap[b.pessoa_id] = b; });

          const bancoUpdates = [];
          PEOPLE.forEach(p => {
            if (!S.schedule[p.id]) return;

            // ── NUEVO: si la persona tiene férias/baixa/licença esta semana,
            // no tocar su banco — sus ausencias justifican las horas no trabajadas.
            const temAusencia = S.absences?.some(a => a.pid === p.id)
              || Object.values(S.schedule[p.id] || {}).some(c =>
                  ['ferias','baixa','licenca','na'].includes(c.type));
            if (temAusencia) return;

            // Calcular horas reales trabajadas esta semana
            let realHrs = 0;
            let tieneHorario = false;
            DAYS.forEach(d => {
              const cl = S.schedule[p.id]?.[d];
              if (cl?.type === 'work' && cl.shift) {
                tieneHorario = true;
                cl.shift.split('|').forEach(sg => {
                  const pts = sg.split('-');
                  if (pts.length < 2) return;
                  const [h1,m1] = pts[0].split(':').map(Number);
                  const [h2,m2] = pts[1].split(':').map(Number);
                  if (!isNaN(h1) && !isNaN(h2)) realHrs += (h2+m2/60)-(h1+m1/60);
                });
              }
              const apoio = S._apoioShifts?.[p.id]?.[d];
              if (apoio?.shift) {
                tieneHorario = true;
                const pts = apoio.shift.split('-');
                if (pts.length >= 2) {
                  const [h1,m1] = pts[0].split(':').map(Number);
                  const [h2,m2] = pts[1].split(':').map(Number);
                  if (!isNaN(h1) && !isNaN(h2)) realHrs += (h2+m2/60)-(h1+m1/60);
                }
              }
            });

            // Si no tiene ningún turno asignado, no tocar el banco
            if (!tieneHorario) return;

            realHrs = Math.round(realHrs * 10) / 10;
            const diffSemana = Math.round((realHrs - 40) * 10) / 10;

            const registro = bancoMap[p.id] || { saldo: 0, saldo_semana: 0, ultima_semana: null };
            let saldoBase = registro.saldo || 0;

            // Si ya calculamos esta semana antes, restar el aporte anterior
            if (registro.ultima_semana === weekKey) {
              saldoBase = Math.round((saldoBase - (registro.saldo_semana || 0)) * 10) / 10;
            }

            const novoSaldo = Math.round((saldoBase + diffSemana) * 10) / 10;
            S._banco[p.id] = novoSaldo;

            bancoUpdates.push(
              sb.from('gh_banco_horas').upsert(
                {
                  pessoa_id: p.id,
                  saldo: novoSaldo,
                  saldo_semana: diffSemana,
                  ultima_semana: weekKey,
                  updated_at: new Date().toISOString()
                },
                { onConflict: 'pessoa_id' }
              )
            );
          });
          await Promise.all(bancoUpdates);
        }
      } catch(e) { console.warn('Erro ao actualizar banco de horas:', e); }


// ═══════════════════════════════════════════════════════════════════
// RESUMEN DE CAMBIOS
// ═══════════════════════════════════════════════════════════════════
//
// 1. getSupabase() → síncrona. Elimina el polling de 50×100ms que
//    causaba el lag y el comportamiento cíclico con las férias.
//    Seguridad intacta: sigue usando sbAdmin del servidor, sin
//    credenciales hardcodeadas.
//
// 2. Banco de horas → personas con férias/baixa/licença esta semana
//    quedan EXCLUIDAS del cálculo. Sus horas no trabajadas están
//    justificadas por la ausencia y no deben generar deuda.
//    Esto corrige el bug de Edna Melim (+16h falsas).
//
// 3. Edna específicamente: para corregir su saldo actual (18h de
//    deuda en lugar de 2h), ir al paso 2 del wizard → expandir su
//    perfil → sección "Banco" → introducir -16 y pulsar ＋.
//    Esto deja su saldo en 2h como corresponde.
// ═══════════════════════════════════════════════════════════════════
