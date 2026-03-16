// ══ SAFT REMINDER ══
function initSaftReminder() {
  const reminder = document.getElementById('saft-reminder');
  if (!reminder) return;

  function updateSaft() {
    const now = new Date();
    const day = now.getDate();
    const month = now.getMonth();
    const year = now.getFullYear();

    // Next 31st: find next occurrence of day 31
    function next31From(d) {
      let y = d.getFullYear(), m = d.getMonth();
      // Try current month's 31st
      for (let i = 0; i < 13; i++) {
        const candidate = new Date(y, m + i, 31);
        // new Date handles overflow: if month has no 31, day rolls over — check it stays on 31
        if (candidate.getDate() === 31 && candidate >= d) return candidate;
      }
      return null;
    }

    const today = new Date(year, month, day);
    const next31 = next31From(today);
    if (!next31) return;

    const msPerDay = 86400000;
    const diffDays = Math.round((next31 - today) / msPerDay);

    const countEl = document.getElementById('saft-countdown');
    const labelEl = document.getElementById('saft-countdown-label');
    const titleEl = document.getElementById('saft-title');

    if (diffDays === 0) {
      countEl.textContent = 'hoje';
      labelEl.textContent = 'dia 31';
      titleEl.innerHTML = 'solicitar criação<br>de SAFT';
      reminder.classList.add('urgent');
    } else if (diffDays <= 5) {
      countEl.textContent = diffDays;
      labelEl.textContent = diffDays === 1 ? 'dia para o dia 31' : 'dias para o dia 31';
      titleEl.innerHTML = 'solicitar criação<br>de SAFT';
      reminder.classList.add('urgent');
    } else {
      countEl.textContent = diffDays;
      labelEl.textContent = 'dias para o dia 31';
      titleEl.innerHTML = 'solicitar criação<br>de SAFT';
      reminder.classList.remove('urgent');
    }
  }

  updateSaft();
  setInterval(updateSaft, 60000);

  // Populate last loaded month
  function updateRecibosMonth() {
    const MESES_PT = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
    const mes   = localStorage.getItem('gh_mes') || '';
    const mesEl = document.getElementById('saft-recibos-mes');
    if (!mesEl) return;
    if (!mes) { mesEl.textContent = '—'; return; }
    const parts  = mes.split('-');
    const mNum   = parseInt(parts[0], 10);
    const ano    = parts[1] || '';
    const nome   = (mNum >= 1 && mNum <= 12) ? MESES_PT[mNum - 1] : mes;
    mesEl.textContent = nome + (ano ? ' ' + ano : '');
  }
  updateRecibosMonth();

  // Re-update when config is saved
  const saveBtn = document.getElementById('r-save-config');
  if (saveBtn) saveBtn.addEventListener('click', function() {
    setTimeout(updateRecibosMonth, 100);
  });

  reminder.classList.add('show');
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      reminder.classList.add('visible');
    });
  });
}
</script>
