// ══ SAFT REMINDER ══
function initSaftReminder() {
  const reminder = document.getElementById('saft-reminder');
  if (!reminder) return;

  function updateSaft() {
    const now = new Date();
    const day = now.getDate();
    const month = now.getMonth();
    const year = now.getFullYear();

    // Next end-of-month: find the last day of current month, or next month if already past it
    function nextEndOfMonthFrom(d) {
      let y = d.getFullYear(), m = d.getMonth();
      // Last day of current month: day 0 of next month
      const endThisMonth = new Date(y, m + 1, 0);
      endThisMonth.setHours(0, 0, 0, 0);
      if (endThisMonth >= d) return endThisMonth;
      // Otherwise, last day of next month
      return new Date(y, m + 2, 0);
    }

    const today = new Date(year, month, day);
    const next31 = nextEndOfMonthFrom(today);
    if (!next31) return;

    const msPerDay = 86400000;
    const diffDays = Math.round((next31 - today) / msPerDay);

    const countEl = document.getElementById('saft-countdown');
    const labelEl = document.getElementById('saft-countdown-label');
    const titleEl = document.getElementById('saft-title');

    if (diffDays === 0) {
      countEl.textContent = 'hoje';
      labelEl.textContent = 'fim do mês';
      titleEl.innerHTML = 'solicitar criação<br>de SAFT';
      reminder.classList.add('urgent');
    } else if (diffDays <= 5) {
      countEl.textContent = diffDays;
      labelEl.textContent = diffDays === 1 ? 'dia para o fim do mês' : 'dias para o fim do mês';
      titleEl.innerHTML = 'solicitar criação<br>de SAFT';
      reminder.classList.add('urgent');
    } else {
      countEl.textContent = diffDays;
      labelEl.textContent = 'dias para o fim do mês';
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
