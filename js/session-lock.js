// ══════════════════════════════════════════════════════════════
//  SESSION LOCK — Generic mutex for module sessions
//
//  Each module calls window.SessionLock.acquire(sessionName, sbClient, onEvicted)
//  when a session is opened, and window.SessionLock.release() when closed.
//  onEvicted() is called when another tab opens the same session.
// ══════════════════════════════════════════════════════════════
(function (global) {
  'use strict';

  var SL_TABLE     = 'module_session_locks';
  var SL_HEARTBEAT = 10000;  // 10s heartbeat
  var SL_TTL       = 25000;  // 25s stale threshold

  /* ── Unique tab ID stored in sessionStorage ── */
  var TAB_ID = (function () {
    try {
      var k = '__sl_tab__';
      var v = sessionStorage.getItem(k);
      if (!v) { v = 'T' + Date.now() + Math.random().toString(36).slice(2, 7); sessionStorage.setItem(k, v); }
      return v;
    } catch (e) { return 'T' + Date.now() + Math.random().toString(36).slice(2, 7); }
  })();

  /* ── Internal state ── */
  var _sb          = null;
  var _module      = null;
  var _session     = null;
  var _channel     = null;
  var _heartbeat   = null;
  var _onEvicted   = null;

  /* ══════════════════════════════════════════════════════════════
     TOAST
  ══════════════════════════════════════════════════════════════ */
  function showToast() {
    if (document.getElementById('sl-toast')) return;
    if (!document.getElementById('sl-toast-css')) {
      var s = document.createElement('style');
      s.id = 'sl-toast-css';
      s.textContent =
        '#sl-toast{position:fixed;top:24px;left:50%;transform:translateX(-50%) translateY(-16px);' +
        'z-index:99999;background:#111!important;color:#fff!important;' +
        "font-family:'MontserratLight',sans-serif;border:1.5px solid #333;" +
        'border-radius:14px;box-shadow:0 8px 40px rgba(0,0,0,.55);' +
        'min-width:320px;max-width:calc(100vw - 48px);opacity:0;' +
        'transition:opacity .35s ease,transform .35s cubic-bezier(.22,1,.36,1);}' +
        '#sl-toast.sl-on{opacity:1!important;transform:translateX(-50%) translateY(0)!important;}' +
        '#sl-ti{display:flex;align-items:flex-start;gap:14px;padding:18px 20px;}' +
        '#sl-tic{flex-shrink:0;width:36px;height:36px;background:#2a2a2a!important;border-radius:50%;' +
        'display:flex;align-items:center;justify-content:center;font-size:1.1rem;}' +
        '#sl-tit{font-size:.82rem;font-weight:bold;color:#fff!important;letter-spacing:.04em;' +
        'text-transform:lowercase;margin-bottom:5px;}' +
        '#sl-tmsg{font-size:.75rem;color:rgba(255,255,255,.65)!important;line-height:1.5;}' +
        '#sl-tbar{height:3px;background:#444!important;border-radius:0 0 14px 14px;overflow:hidden;}' +
        '#sl-tprog{height:100%;width:100%;background:#fff!important;transform-origin:left;' +
        'animation:sl-sh 7s linear forwards;}' +
        '@keyframes sl-sh{from{transform:scaleX(1)}to{transform:scaleX(0)}}';
      document.head.appendChild(s);
    }
    var t = document.createElement('div');
    t.id = 'sl-toast';
    t.innerHTML =
      '<div id="sl-ti"><div id="sl-tic">\u26a0</div><div>' +
      '<div id="sl-tit">sess\u00e3o encerrada por seguran\u00e7a</div>' +
      '<div id="sl-tmsg">Outro utilizador acedeu a esta sess\u00e3o. ' +
      'O seu trabalho foi guardado automaticamente e o m\u00f3dulo foi encerrado para evitar conflitos.</div>' +
      '</div></div><div id="sl-tbar"><div id="sl-tprog"></div></div>';
    document.body.appendChild(t);
    requestAnimationFrame(function () { requestAnimationFrame(function () { t.classList.add('sl-on'); }); });
    setTimeout(function () {
      t.classList.remove('sl-on');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 400);
    }, 7500);
  }

  /* ══════════════════════════════════════════════════════════════
     CORE
  ══════════════════════════════════════════════════════════════ */
  function channelName() {
    return 'sl__' + _module + '__' + _session.replace(/\W/g, '_');
  }

  function upsertLock() {
    if (!_sb || !_session) return;
    _sb.from(SL_TABLE).upsert({
      module_name:  _module,
      session_name: _session,
      tab_id:       TAB_ID,
      locked_at:    new Date().toISOString()
    }, { onConflict: 'module_name,session_name' }).then(function(){}).catch(function(e){
      console.warn('SessionLock upsert error', e);
    });
  }

  function startHeartbeat() {
    stopHeartbeat();
    _heartbeat = setInterval(upsertLock, SL_HEARTBEAT);
  }

  function stopHeartbeat() {
    if (_heartbeat) { clearInterval(_heartbeat); _heartbeat = null; }
  }

  function unsubscribe() {
    if (_channel && _sb) {
      try { _sb.removeChannel(_channel); } catch (e) {}
      _channel = null;
    }
  }

  function handleEviction() {
    stopHeartbeat();
    unsubscribe();
    _session = null;
    showToast();
    var cb = _onEvicted;
    _onEvicted = null;
    setTimeout(function () {
      try { if (cb) cb(); } catch (e) { console.warn('SessionLock eviction cb error', e); }
    }, 700);
  }

  function subscribe() {
    unsubscribe();
    _channel = _sb.channel(channelName());
    _channel
      .on('broadcast', { event: 'evict' }, function (msg) {
        /* Ignore messages we sent ourselves */
        if (msg && msg.payload && msg.payload.from === TAB_ID) return;
        handleEviction();
      })
      .subscribe(function (status) {
        console.log('SessionLock channel status:', status);
      });
  }

  function sendEviction(onDone) {
    /* Send on the same channel name — all subscribers including pestaña 1 will receive it */
    var ch = _sb.channel(channelName());
    ch.subscribe(function (status) {
      if (status !== 'SUBSCRIBED') return;
      ch.send({ type: 'broadcast', event: 'evict', payload: { from: TAB_ID } })
        .then(function () {
          console.log('SessionLock: eviction broadcast sent');
          /* Keep channel alive 3s so Supabase delivers the message, then clean up */
          setTimeout(function () {
            try { _sb.removeChannel(ch); } catch (e) {}
            if (onDone) onDone();
          }, 3000);
        })
        .catch(function (e) {
          console.warn('SessionLock: send error', e);
          try { _sb.removeChannel(ch); } catch (e2) {}
          if (onDone) onDone();
        });
    });
    /* Safety: if subscribe never fires, proceed after 5s */
    setTimeout(function () { if (onDone) { onDone = null; if (onDone) onDone(); } }, 5000);
  }

  /* ══════════════════════════════════════════════════════════════
     PUBLIC API  — called from each module
  ══════════════════════════════════════════════════════════════ */
  global.SessionLock = {

    /**
     * acquire(moduleName, sessionName, sbClient, onEvicted)
     * Call when a session is opened.
     */
    acquire: function (moduleName, sessionName, sbClient, onEvicted) {
      _module    = moduleName;
      _session   = sessionName;
      _sb        = sbClient;
      _onEvicted = onEvicted || function () {};

      /* Subscribe first so we receive any future evictions */
      subscribe();

      /* Check if another tab holds a fresh lock */
      _sb.from(SL_TABLE)
        .select('tab_id, locked_at')
        .eq('module_name', _module)
        .eq('session_name', _session)
        .limit(1)
        .then(function (res) {
          var proceed = function () {
            upsertLock();
            startHeartbeat();
          };

          if (!res.error && res.data && res.data.length) {
            var row     = res.data[0];
            var age     = Date.now() - new Date(row.locked_at).getTime();
            var isOther = row.tab_id !== TAB_ID;
            var isStale = age > SL_TTL;

            if (isOther && !isStale) {
              /* Evict the other tab, then take the lock */
              console.log('SessionLock: evicting tab', row.tab_id);
              sendEviction(proceed);
              return;
            }
          }
          proceed();
        })
        .catch(function (e) {
          console.warn('SessionLock: check error', e);
          upsertLock();
          startHeartbeat();
        });
    },

    /**
     * release()
     * Call when a session is closed normally.
     */
    release: function () {
      stopHeartbeat();
      unsubscribe();
      if (!_sb || !_session) return;
      _sb.from(SL_TABLE)
        .delete()
        .eq('module_name', _module)
        .eq('session_name', _session)
        .eq('tab_id', TAB_ID)
        .then(function(){}).catch(function(){});
      _session = null;
    }
  };

}(typeof window !== 'undefined' ? window : this));
