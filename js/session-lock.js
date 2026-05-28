// ══════════════════════════════════════════════════════════════
//  SESSION LOCK v4 — Postgres Changes (no Realtime broadcast)
//  Detects session takeover via direct DB row change listener.
//  Instant, reliable, works across all browsers/tabs.
// ══════════════════════════════════════════════════════════════
(function (global) {
  'use strict';

  var SL_TABLE     = 'module_session_locks';
  var SL_HEARTBEAT = 10000;  // 10s heartbeat
  var SL_TTL       = 25000;  // 25s stale threshold

  /* ── Unique tab ID per browser context ── */
  var TAB_ID = (function () {
    try {
      var k = '__sl_tab__';
      var v = sessionStorage.getItem(k);
      if (!v) {
        v = 'T' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        sessionStorage.setItem(k, v);
      }
      return v;
    } catch (e) {
      return 'T' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    }
  })();

  /* ══════════════════════════════════════════════════════════════
     TOAST
  ══════════════════════════════════════════════════════════════ */
  function slShowEvictionToast() {
    var TOAST_ID = 'sl-eviction-toast';
    if (document.getElementById(TOAST_ID)) return;

    if (!document.getElementById('sl-toast-styles')) {
      var st = document.createElement('style');
      st.id = 'sl-toast-styles';
      st.textContent =
        '#sl-eviction-toast{' +
          'position:fixed;top:24px;left:50%;transform:translateX(-50%) translateY(-20px);' +
          'z-index:99999;background:#111!important;color:#fff!important;' +
          "font-family:'MontserratLight',sans-serif;" +
          'border:1.5px solid #333;border-radius:14px;' +
          'box-shadow:0 8px 40px rgba(0,0,0,0.55);padding:0;' +
          'min-width:320px;max-width:calc(100vw - 48px);opacity:0;' +
          'transition:opacity 0.35s ease,transform 0.35s cubic-bezier(0.22,1,0.36,1);' +
          'pointer-events:none;}' +
        '#sl-eviction-toast.sl-on{' +
          'opacity:1!important;transform:translateX(-50%) translateY(0)!important;' +
          'pointer-events:auto!important;}' +
        '#sl-ti{display:flex;align-items:flex-start;gap:14px;padding:18px 20px;}' +
        '#sl-tic{flex-shrink:0;width:36px;height:36px;background:#2a2a2a!important;' +
          'border-radius:50%;display:flex;align-items:center;justify-content:center;' +
          'font-size:1.1rem;margin-top:1px;}' +
        '#sl-tb{flex:1;min-width:0;}' +
        '#sl-tt{font-size:.82rem;font-weight:bold;color:#fff!important;' +
          'letter-spacing:.04em;text-transform:lowercase;margin-bottom:5px;}' +
        '#sl-tm{font-size:.75rem;color:rgba(255,255,255,0.65)!important;line-height:1.5;}' +
        '#sl-tbar{height:3px;background:#444!important;border-radius:0 0 14px 14px;overflow:hidden;}' +
        '#sl-tp{height:100%;width:100%;background:#fff!important;' +
          'transform-origin:left;animation:sl-sh 7s linear forwards;}' +
        '@keyframes sl-sh{from{transform:scaleX(1);}to{transform:scaleX(0);}}';
      document.head.appendChild(st);
    }

    var toast = document.createElement('div');
    toast.id = TOAST_ID;
    toast.innerHTML =
      '<div id="sl-ti"><div id="sl-tic">\u26a0</div>' +
      '<div id="sl-tb">' +
        '<div id="sl-tt">sess\u00e3o encerrada por seguran\u00e7a</div>' +
        '<div id="sl-tm">Outro utilizador acedeu a esta sess\u00e3o. ' +
        'O seu trabalho foi guardado automaticamente e o m\u00f3dulo foi encerrado para evitar conflitos.</div>' +
      '</div></div>' +
      '<div id="sl-tbar"><div id="sl-tp"></div></div>';

    document.body.appendChild(toast);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { toast.classList.add('sl-on'); });
    });
    setTimeout(function () {
      toast.classList.remove('sl-on');
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 400);
    }, 7500);
  }

  /* ══════════════════════════════════════════════════════════════
     LOCK INSTANCE
  ══════════════════════════════════════════════════════════════ */
  function SessionLockInstance(moduleName, sb) {
    this._module    = moduleName;
    this._sb        = sb;
    this._session   = null;
    this._channel   = null;
    this._heartbeat = null;
    this._onEvicted = null;
    this._evicted   = false;
  }

  /* ── acquire ── */
  SessionLockInstance.prototype.acquire = async function (sessionName, onEvicted) {
    this._session   = sessionName;
    this._onEvicted = onEvicted || function () {};
    this._evicted   = false;

    var self = this;

    /* 1. Upsert our lock — take ownership immediately */
    await this._upsertLock();

    /* 2. Listen for changes on this row via Postgres Changes */
    this._subscribe();

    /* 3. Heartbeat to keep lock fresh */
    this._startHeartbeat();

    /* 4. Clean up on tab close */
    this._registerUnload();
  };

  /* ── release ── */
  SessionLockInstance.prototype.release = async function () {
    this._evicted = true;
    this._stopHeartbeat();
    this._unsubscribe();
    if (!this._session) return;
    try {
      await this._sb.from(SL_TABLE).delete()
        .eq('module_name', this._module)
        .eq('session_name', this._session)
        .eq('tab_id', TAB_ID);
    } catch (e) {}
    this._session = null;
  };

  /* ── upsert lock row ── */
  SessionLockInstance.prototype._upsertLock = async function () {
    if (!this._session) return;
    try {
      await this._sb.from(SL_TABLE).upsert({
        module_name:  this._module,
        session_name: this._session,
        tab_id:       TAB_ID,
        locked_at:    new Date().toISOString()
      }, { onConflict: 'module_name,session_name' });
    } catch (e) {
      console.warn('SessionLock: upsert error', e);
    }
  };

  /* ── subscribe to Postgres Changes on this specific row ── */
  SessionLockInstance.prototype._subscribe = function () {
    if (!this._session) return;
    var self = this;

    this._channel = this._sb
      .channel('sl_lock_' + this._module + '_' + this._session.replace(/\W/g, '_'))
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  SL_TABLE,
          filter: 'module_name=eq.' + this._module + '&session_name=eq.' + this._session
        },
        function (payload) {
          if (self._evicted) return;
          var newRow = payload.new;
          /* If the row was updated and tab_id is now different — we were evicted */
          if (payload.eventType === 'UPDATE' && newRow && newRow.tab_id !== TAB_ID) {
            self._handleEviction();
          }
          /* If the row was deleted by someone else — also evicted */
          if (payload.eventType === 'DELETE' && !self._evicted) {
            self._handleEviction();
          }
        }
      )
      .subscribe(function (status) {
        console.log('SessionLock [' + self._module + ']:', status);
      });
  };

  /* ── unsubscribe ── */
  SessionLockInstance.prototype._unsubscribe = function () {
    if (this._channel) {
      try { this._sb.removeChannel(this._channel); } catch (e) {}
      this._channel = null;
    }
  };

  /* ── handle eviction ── */
  SessionLockInstance.prototype._handleEviction = function () {
    if (this._evicted) return;
    this._evicted = true;
    this._stopHeartbeat();
    this._unsubscribe();
    this._session = null;

    slShowEvictionToast();

    var cb = this._onEvicted;
    this._onEvicted = null;
    setTimeout(function () {
      try { cb(); } catch (e) { console.warn('SessionLock: eviction cb error', e); }
    }, 700);
  };

  /* ── heartbeat ── */
  SessionLockInstance.prototype._startHeartbeat = function () {
    var self = this;
    this._stopHeartbeat();
    this._heartbeat = setInterval(function () {
      if (!self._evicted) self._upsertLock();
    }, SL_HEARTBEAT);
  };

  SessionLockInstance.prototype._stopHeartbeat = function () {
    if (this._heartbeat) { clearInterval(this._heartbeat); this._heartbeat = null; }
  };

  /* ── delete lock on tab close (fetch keepalive) ── */
  SessionLockInstance.prototype._registerUnload = function () {
    var self = this;
    var handler = function () {
      if (self._evicted || !self._session) return;
      try {
        var url = self._sb.supabaseUrl + '/rest/v1/' + SL_TABLE +
          '?module_name=eq.' + encodeURIComponent(self._module) +
          '&session_name=eq.' + encodeURIComponent(self._session) +
          '&tab_id=eq.' + encodeURIComponent(TAB_ID);
        fetch(url, {
          method:    'DELETE',
          headers:   { 'apikey': self._sb.supabaseKey, 'Authorization': 'Bearer ' + self._sb.supabaseKey },
          keepalive: true
        }).catch(function () {});
      } catch (e) {}
    };
    window.addEventListener('beforeunload', handler);
    window.addEventListener('pagehide',     handler);
  };

  /* ══════════════════════════════════════════════════════════════
     PUBLIC API
  ══════════════════════════════════════════════════════════════ */
  global.SessionLock = {
    create: function (moduleName, sbClient) {
      return new SessionLockInstance(moduleName, sbClient);
    }
  };

}(typeof window !== 'undefined' ? window : this));
