// ══════════════════════════════════════════════════════════════
//  SESSION LOCK — Generic mutex for module sessions
//  Prevents two tabs from working on the same session simultaneously.
//
//  Usage (in each module):
//    var lock = SessionLock.create('parfois', sbAdmin);
//    await lock.acquire(sessionName, onEvicted);   // when opening
//    await lock.release();                          // when closing
//
//  onEvicted: function called when another tab claims the same session.
//             Should save and close the module.
// ══════════════════════════════════════════════════════════════
(function (global) {
  'use strict';

  var SL_TABLE       = 'module_session_locks';
  var SL_HEARTBEAT   = 10000;   // 10 s — renew lock
  var SL_LOCK_TTL    = 25000;   // 25 s — lock considered stale if no heartbeat

  /* ── Generate a unique tab identifier (survives page JS reloads) ── */
  function slTabId() {
    var key = '__sl_tab_id__';
    try {
      var id = sessionStorage.getItem(key);
      if (!id) {
        id = 'tab_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
        sessionStorage.setItem(key, id);
      }
      return id;
    } catch (e) {
      return 'tab_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    }
  }

  /* ══════════════════════════════════════════════════════════════
     EVICTION TOAST
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
          'z-index:99999;' +
          'background:#111!important;' +
          'color:#fff!important;' +
          'font-family:\'MontserratLight\',sans-serif;' +
          'border:1.5px solid #333;' +
          'border-radius:14px;' +
          'box-shadow:0 8px 40px rgba(0,0,0,0.55);' +
          'padding:0;' +
          'min-width:320px;max-width:calc(100vw - 48px);' +
          'opacity:0;' +
          'transition:opacity 0.35s ease,transform 0.35s cubic-bezier(0.22,1,0.36,1);' +
          'pointer-events:none;' +
        '}' +
        '#sl-eviction-toast.sl-toast-visible{' +
          'opacity:1!important;' +
          'transform:translateX(-50%) translateY(0)!important;' +
          'pointer-events:auto!important;' +
        '}' +
        '#sl-toast-inner{display:flex;align-items:flex-start;gap:14px;padding:18px 20px;}' +
        '#sl-toast-icon{' +
          'flex-shrink:0;width:36px;height:36px;' +
          'background:#2a2a2a!important;border-radius:50%;' +
          'display:flex;align-items:center;justify-content:center;' +
          'font-size:1.1rem;margin-top:1px;' +
        '}' +
        '#sl-toast-body{flex:1;min-width:0;}' +
        '#sl-toast-title{' +
          'font-size:.82rem;font-weight:bold;' +
          'color:#fff!important;' +
          'letter-spacing:.04em;text-transform:lowercase;margin-bottom:5px;' +
        '}' +
        '#sl-toast-msg{font-size:.75rem;color:rgba(255,255,255,0.65)!important;line-height:1.5;}' +
        '#sl-toast-bar{height:3px;background:#444!important;border-radius:0 0 14px 14px;overflow:hidden;}' +
        '#sl-toast-progress{' +
          'height:100%;width:100%;background:#fff!important;' +
          'transform-origin:left;animation:sl-shrink 7s linear forwards;' +
        '}' +
        '@keyframes sl-shrink{from{transform:scaleX(1);}to{transform:scaleX(0);}}';
      document.head.appendChild(st);
    }

    var toast = document.createElement('div');
    toast.id = TOAST_ID;
    toast.innerHTML =
      '<div id="sl-toast-inner">' +
        '<div id="sl-toast-icon">\u26a0</div>' +
        '<div id="sl-toast-body">' +
          '<div id="sl-toast-title">sess\u00e3o encerrada por seguran\u00e7a</div>' +
          '<div id="sl-toast-msg">' +
            'Outro utilizador acedeu a esta sess\u00e3o. O seu trabalho foi guardado automaticamente e o m\u00f3dulo foi encerrado para evitar conflitos.' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div id="sl-toast-bar"><div id="sl-toast-progress"></div></div>';

    document.body.appendChild(toast);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        toast.classList.add('sl-toast-visible');
      });
    });

    setTimeout(function () {
      toast.classList.remove('sl-toast-visible');
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 400);
    }, 7500);
  }

  /* ══════════════════════════════════════════════════════════════
     LOCK INSTANCE
  ══════════════════════════════════════════════════════════════ */
  function SessionLockInstance(moduleName, sb) {
    this._module      = moduleName;
    this._sb          = sb;
    this._tabId       = slTabId();
    this._sessionName = null;
    this._channel     = null;
    this._heartbeat   = null;
    this._onEvicted   = null;
  }

  /* ── Acquire lock for a session ── */
  SessionLockInstance.prototype.acquire = async function (sessionName, onEvicted) {
    this._sessionName = sessionName;
    this._onEvicted   = onEvicted || function () {};

    var self = this;
    var sb   = this._sb;

    /* 1. Subscribe FIRST so we receive evictions from the moment we exist */
    this._subscribe();

    /* 2. Check for existing non-stale lock from a different tab */
    try {
      var existing = await sb
        .from(SL_TABLE)
        .select('tab_id, locked_at')
        .eq('module_name', this._module)
        .eq('session_name', sessionName)
        .limit(1);

      if (!existing.error && existing.data && existing.data.length) {
        var row     = existing.data[0];
        var age     = Date.now() - new Date(row.locked_at).getTime();
        var isOther = row.tab_id !== this._tabId;
        var isStale = age > SL_LOCK_TTL;

        if (isOther && !isStale) {
          await this._notifyEviction(sessionName);
        }
      }
    } catch (e) {
      console.warn('SessionLock: error checking existing lock', e);
    }

    /* 3. Upsert our lock */
    await this._upsertLock();

    /* 4. Start heartbeat */
    this._startHeartbeat();
  };

  /* ── Release lock ── */
  SessionLockInstance.prototype.release = async function () {
    this._stopHeartbeat();
    this._unsubscribe();

    if (!this._sessionName) return;
    try {
      await this._sb
        .from(SL_TABLE)
        .delete()
        .eq('module_name', this._module)
        .eq('session_name', this._sessionName)
        .eq('tab_id', this._tabId);
    } catch (e) {
      console.warn('SessionLock: error releasing lock', e);
    }
    this._sessionName = null;
  };

  /* ── Upsert our lock row ── */
  SessionLockInstance.prototype._upsertLock = async function () {
    if (!this._sessionName) return;
    try {
      await this._sb.from(SL_TABLE).upsert({
        module_name:  this._module,
        session_name: this._sessionName,
        tab_id:       this._tabId,
        locked_at:    new Date().toISOString()
      }, { onConflict: 'module_name,session_name' });
    } catch (e) {
      console.warn('SessionLock: error upserting lock', e);
    }
  };

  /* ── Notify existing tab via Realtime broadcast ── */
  SessionLockInstance.prototype._notifyEviction = async function (sessionName) {
    var self        = this;
    var channelName = 'sl_' + this._module + '_' + sessionName.replace(/\s/g, '_') + '_send';

    return new Promise(function (resolve) {
      var sendCh = self._sb.channel(channelName);
      var done   = false;
      var finish = function () {
        if (done) return;
        done = true;
        setTimeout(function () {
          try { self._sb.removeChannel(sendCh); } catch (e) {}
        }, 3000);
        resolve();
      };

      sendCh.subscribe(function (status) {
        if (status !== 'SUBSCRIBED') return;
        sendCh.send({
          type:    'broadcast',
          event:   'evict',
          payload: { from: self._tabId }
        }).then(finish).catch(finish);
      });

      setTimeout(function () {
        if (!done) { done = true; try { self._sb.removeChannel(sendCh); } catch(e){} resolve(); }
      }, 5000);
    });
  };

  /* ── Subscribe to eviction events ── */
  SessionLockInstance.prototype._subscribe = function () {
    if (!this._sessionName) return;
    var self        = this;
    var channelName = 'sl_' + this._module + '_' + this._sessionName.replace(/\s/g, '_') + '_send';

    this._channel = this._sb.channel(channelName);
    this._channel
      .on('broadcast', { event: 'evict' }, function (msg) {
        if (msg && msg.payload && msg.payload.from === self._tabId) return;
        self._handleEviction();
      })
      .subscribe(function (status) {
        console.log('SessionLock [' + self._module + '] status:', status);
      });
  };

  /* ── Unsubscribe ── */
  SessionLockInstance.prototype._unsubscribe = function () {
    if (this._channel) {
      try { this._sb.removeChannel(this._channel); } catch (e) {}
      this._channel = null;
    }
  };

  /* ── Handle incoming eviction ── */
  SessionLockInstance.prototype._handleEviction = function () {
    this._stopHeartbeat();
    this._unsubscribe();
    this._sessionName = null;

    slShowEvictionToast();

    var cb = this._onEvicted;
    this._onEvicted = null;

    setTimeout(function () {
      try { cb(); } catch (e) { console.warn('SessionLock eviction cb error', e); }
    }, 700);
  };

  /* ── Heartbeat ── */
  SessionLockInstance.prototype._startHeartbeat = function () {
    var self = this;
    this._stopHeartbeat();
    this._heartbeat = setInterval(function () {
      self._upsertLock();
    }, SL_HEARTBEAT);
  };

  SessionLockInstance.prototype._stopHeartbeat = function () {
    if (this._heartbeat) {
      clearInterval(this._heartbeat);
      this._heartbeat = null;
    }
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
