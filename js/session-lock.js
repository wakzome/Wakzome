// ══════════════════════════════════════════════════════════════
//  SESSION LOCK — Generic mutex for module sessions
//
//  API A (Parfois — instance-based):
//    var lock = SessionLock.create('parfois', sbAdmin);
//    await lock.acquire(sessionName, onEvicted);
//    await lock.release();
//
//  API B (TAM — static):
//    SessionLock.acquire('tam', sessionName, sbAdmin, onEvicted);
//    SessionLock.release();
// ══════════════════════════════════════════════════════════════
(function (global) {
  'use strict';

  var SL_TABLE     = 'module_session_locks';
  var SL_HEARTBEAT = 10000;
  var SL_TTL       = 25000;

  /* ── Unique tab ID ── */
  var TAB_ID = (function () {
    try {
      var k = '__sl_tab__';
      var v = sessionStorage.getItem(k);
      if (!v) { v = 'T' + Date.now() + Math.random().toString(36).slice(2, 7); sessionStorage.setItem(k, v); }
      return v;
    } catch (e) { return 'T' + Date.now() + Math.random().toString(36).slice(2, 7); }
  })();

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
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { t.classList.add('sl-on'); });
    });
    setTimeout(function () {
      t.classList.remove('sl-on');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 400);
    }, 7500);
  }

  /* ══════════════════════════════════════════════════════════════
     SHARED CORE LOGIC
  ══════════════════════════════════════════════════════════════ */
  function chName(moduleName, sessionName) {
    return 'sl__' + moduleName + '__' + sessionName.replace(/\W/g, '_');
  }

  function doUpsert(sb, moduleName, sessionName) {
    sb.from(SL_TABLE).upsert({
      module_name:  moduleName,
      session_name: sessionName,
      tab_id:       TAB_ID,
      locked_at:    new Date().toISOString()
    }, { onConflict: 'module_name,session_name' })
    .then(function(){}).catch(function(e){ console.warn('SessionLock upsert', e); });
  }

  function doDelete(sb, moduleName, sessionName) {
    if (!sb || !sessionName) return;
    sb.from(SL_TABLE).delete()
      .eq('module_name', moduleName)
      .eq('session_name', sessionName)
      .eq('tab_id', TAB_ID)
      .then(function(){}).catch(function(){});
  }

  function doSubscribe(sb, moduleName, sessionName, onEvict) {
    var ch = sb.channel(chName(moduleName, sessionName));
    ch.on('broadcast', { event: 'evict' }, function (msg) {
      if (msg && msg.payload && msg.payload.from === TAB_ID) return;
      onEvict();
    }).subscribe(function (status) {
      console.log('SessionLock [' + moduleName + '] channel:', status);
    });
    return ch;
  }

  function doSendEviction(sb, moduleName, sessionName, onDone) {
    var ch = sb.channel(chName(moduleName, sessionName));
    var fired = false;
    var finish = function () {
      if (fired) return; fired = true;
      setTimeout(function () {
        try { sb.removeChannel(ch); } catch (e) {}
        if (onDone) onDone();
      }, 3000);
    };
    ch.subscribe(function (status) {
      if (status !== 'SUBSCRIBED') return;
      ch.send({ type: 'broadcast', event: 'evict', payload: { from: TAB_ID } })
        .then(finish).catch(finish);
    });
    setTimeout(function () { if (!fired) { fired = true; try { sb.removeChannel(ch); } catch(e){} if (onDone) onDone(); } }, 5000);
  }

  function doAcquire(sb, moduleName, sessionName, onEvicted, onChannelReady) {
    /* 1. Subscribe first */
    var channel   = doSubscribe(sb, moduleName, sessionName, function () {
      showToast();
      setTimeout(function () {
        try { if (onEvicted) onEvicted(); } catch (e) { console.warn('SessionLock eviction cb', e); }
      }, 700);
    });

    /* 2. Check existing lock */
    sb.from(SL_TABLE)
      .select('tab_id, locked_at')
      .eq('module_name', moduleName)
      .eq('session_name', sessionName)
      .limit(1)
      .then(function (res) {
        var proceed = function () {
          doUpsert(sb, moduleName, sessionName);
          if (onChannelReady) onChannelReady(channel);
        };
        if (!res.error && res.data && res.data.length) {
          var row     = res.data[0];
          var age     = Date.now() - new Date(row.locked_at).getTime();
          var isOther = row.tab_id !== TAB_ID;
          var isStale = age > SL_TTL;
          if (isOther && !isStale) {
            console.log('SessionLock: evicting', row.tab_id);
            doSendEviction(sb, moduleName, sessionName, proceed);
            return;
          }
        }
        proceed();
      })
      .catch(function (e) {
        console.warn('SessionLock check error', e);
        doUpsert(sb, moduleName, sessionName);
        if (onChannelReady) onChannelReady(channel);
      });
  }

  /* ══════════════════════════════════════════════════════════════
     API A — Instance-based (used by Parfois)
  ══════════════════════════════════════════════════════════════ */
  function Instance(moduleName, sb) {
    this._mod  = moduleName;
    this._sb   = sb;
    this._ses  = null;
    this._ch   = null;
    this._hb   = null;
  }

  Instance.prototype.acquire = async function (sessionName, onEvicted) {
    var self = this;
    self._ses = sessionName;

    doAcquire(self._sb, self._mod, sessionName, onEvicted, function (ch) {
      self._ch = ch;
      /* Heartbeat */
      if (self._hb) clearInterval(self._hb);
      self._hb = setInterval(function () {
        doUpsert(self._sb, self._mod, self._ses);
      }, SL_HEARTBEAT);
    });
  };

  Instance.prototype.release = async function () {
    if (this._hb) { clearInterval(this._hb); this._hb = null; }
    if (this._ch && this._sb) { try { this._sb.removeChannel(this._ch); } catch(e){} this._ch = null; }
    doDelete(this._sb, this._mod, this._ses);
    this._ses = null;
  };

  /* ══════════════════════════════════════════════════════════════
     API B — Static (used by TAM)
  ══════════════════════════════════════════════════════════════ */
  var _static = { sb: null, mod: null, ses: null, ch: null, hb: null };

  /* ══════════════════════════════════════════════════════════════
     PUBLIC
  ══════════════════════════════════════════════════════════════ */
  global.SessionLock = {

    /* API A */
    create: function (moduleName, sbClient) {
      return new Instance(moduleName, sbClient);
    },

    /* API B */
    acquire: function (moduleName, sessionName, sbClient, onEvicted) {
      /* Release any previous static lock */
      if (_static.hb) { clearInterval(_static.hb); _static.hb = null; }
      if (_static.ch && _static.sb) { try { _static.sb.removeChannel(_static.ch); } catch(e){} _static.ch = null; }

      _static.sb  = sbClient;
      _static.mod = moduleName;
      _static.ses = sessionName;

      doAcquire(sbClient, moduleName, sessionName, onEvicted, function (ch) {
        _static.ch = ch;
        if (_static.hb) clearInterval(_static.hb);
        _static.hb = setInterval(function () {
          doUpsert(_static.sb, _static.mod, _static.ses);
        }, SL_HEARTBEAT);
      });
    },

    release: function () {
      if (_static.hb) { clearInterval(_static.hb); _static.hb = null; }
      if (_static.ch && _static.sb) { try { _static.sb.removeChannel(_static.ch); } catch(e){} _static.ch = null; }
      doDelete(_static.sb, _static.mod, _static.ses);
      _static.ses = null;
    }
  };

}(typeof window !== 'undefined' ? window : this));
