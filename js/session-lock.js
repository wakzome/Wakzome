// ══════════════════════════════════════════════════════════════
//  SESSION LOCK — Strict single-owner mutex for module sessions
//  Guarantees that one session (module_name + session_name) is held
//  by AT MOST ONE client (tab / device) at any time.
//
//  Usage (unchanged — public API is identical):
//    var lock = SessionLock.create('parfois', sbAdmin);
//    await lock.acquire(sessionName, onEvicted);   // when opening
//    await lock.release();                          // when closing
//
//  onEvicted: called when another client claims the same session.
//             Should save and close the module.
//
//  ── DESIGN (why this is rigorous) ──────────────────────────────
//  The correctness guarantee does NOT depend on Realtime. Realtime
//  can be down, throttled, or broken by a duplicated GoTrue client;
//  eviction still happens. Detection runs in three layers, fastest
//  to most authoritative:
//
//    1. Broadcast (Realtime)      — instant nudge when the socket is up.
//    2. Postgres Changes (Realtime) — reliable push on the lock row;
//       unlike broadcast it does not require sender/receiver to be
//       subscribed at the same instant.
//    3. Heartbeat over plain HTTP (PostgREST) — the AUTHORITATIVE
//       mechanism. Immune to Realtime/GoTrue. Runs every 3 s and is
//       also forced on visibilitychange / focus / online, so the very
//       moment the stale tab is looked at, it reconciles and closes.
//
//  Deterministic exclusion rule: on every reconciliation, if the lock
//  row carries a tab_id different from ours, we ARE evicted — no
//  timestamp comparison, no reclaim. There is exactly one tab_id in
//  the row; whoever does not match it self-closes. This eliminates
//  clock-skew ping-pong between devices.
//
//  Detection bound: ≤ 3 s with Realtime down (heartbeat), or instant
//  on focusing the stale tab; < 1 s with Realtime up.
//
//  The lock row is removed on normal close (release) and on
//  browser/tab close (pagehide / beforeunload via keepalive fetch).
//
//  Schema expected:
//    module_session_locks(module_name text, session_name text,
//                          tab_id text, locked_at timestamptz)
//    UNIQUE (module_name, session_name)
//
//  Optional (lowers latency, NOT required for correctness):
//    add `module_session_locks` to the `supabase_realtime` publication
//    so Postgres Changes fire. Without it, the heartbeat still enforces
//    exclusion within its interval.
// ══════════════════════════════════════════════════════════════
(function (global) {
  'use strict';

  var SL_TABLE     = 'module_session_locks';
  var SL_HEARTBEAT = 3000;    // 3 s — renew + authoritative reconcile
  var SL_LOCK_TTL  = 15000;   // 15 s — a lock is considered dead (for takeover) past this

  /* ── Unique client identifier, generated ONCE per page load, in memory ──
     Deliberately NOT persisted in sessionStorage: that storage is copied on
     "duplicate tab" and can be restored across contexts, producing identical
     ids on what should be independent clients — which silently disables the
     mutex. An in-memory id guarantees every page context (any tab, any
     device, incognito or not) is treated as a distinct client.
     A page reload generates a new id and the tab simply re-claims its own
     lock; that transition is harmless (no self-eviction toast).            */
  var SL_TAB_ID = null;
  function slTabId() {
    if (SL_TAB_ID) return SL_TAB_ID;
    var id = null;
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        id = 'tab_' + crypto.randomUUID();
      }
    } catch (e) {}
    if (!id) {
      id = 'tab_' + Date.now() +
           '_' + Math.random().toString(36).slice(2, 11) +
           '_' + Math.random().toString(36).slice(2, 11);
    }
    SL_TAB_ID = id;
    return id;
  }

  /* ── Resolve the PostgREST endpoint + auth headers ──
     Used for the keepalive DELETE on browser close, where a normal
     supabase-js async call would be cancelled mid-flight.
     Primary source: the globals published by supabase-config.js
     (SUPABASE_URL / SUPABASE_KEY / ADMIN_TOKEN). Fallback: client
     internals, whose shape varies between supabase-js versions.       */
  function slRestEndpoint(sb) {
    /* 1. App globals (authoritative, version-independent). */
    try {
      if (typeof window !== 'undefined' && window.SUPABASE_URL && window.SUPABASE_KEY) {
        var headers = {
          apikey:        window.SUPABASE_KEY,
          Authorization: 'Bearer ' + window.SUPABASE_KEY,
          'Content-Type': 'application/json'
        };
        if (window.ADMIN_TOKEN) headers['x-admin-token'] = window.ADMIN_TOKEN;
        return {
          url: String(window.SUPABASE_URL).replace(/\/+$/, '') + '/rest/v1',
          headers: headers
        };
      }
    } catch (e) {}
    /* 2. Fallback: supabase-js v2 client internals. */
    try {
      if (sb && sb.rest && sb.rest.url && sb.rest.headers) {
        return { url: String(sb.rest.url).replace(/\/+$/, ''), headers: sb.rest.headers };
      }
    } catch (e) {}
    try {
      if (sb && sb.supabaseUrl && sb.supabaseKey) {
        return {
          url: String(sb.supabaseUrl).replace(/\/+$/, '') + '/rest/v1',
          headers: { apikey: sb.supabaseKey, Authorization: 'Bearer ' + sb.supabaseKey }
        };
      }
    } catch (e) {}
    return null;
  }

  /* ══════════════════════════════════════════════════════════════
     EVICTION TOAST — shown to the user who gets kicked out
  ══════════════════════════════════════════════════════════════ */
  function slShowEvictionToast() {
    var TOAST_ID = 'sl-eviction-toast';
    if (document.getElementById(TOAST_ID)) return;

    /* Inject styles once */
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
        '#sl-toast-inner{' +
          'display:flex;align-items:flex-start;gap:14px;padding:18px 20px;' +
        '}' +
        '#sl-toast-icon{' +
          'flex-shrink:0;' +
          'width:36px;height:36px;' +
          'background:#2a2a2a!important;' +
          'border-radius:50%;' +
          'display:flex;align-items:center;justify-content:center;' +
          'font-size:1.1rem;' +
          'margin-top:1px;' +
        '}' +
        '#sl-toast-body{flex:1;min-width:0;}' +
        '#sl-toast-title{' +
          'font-size:.82rem;font-weight:bold;' +
          'color:#fff!important;' +
          'letter-spacing:.04em;text-transform:lowercase;' +
          'margin-bottom:5px;' +
        '}' +
        '#sl-toast-msg{' +
          'font-size:.75rem;' +
          'color:rgba(255,255,255,0.65)!important;' +
          'line-height:1.5;' +
        '}' +
        '#sl-toast-bar{' +
          'height:3px;' +
          'background:#444!important;' +
          'border-radius:0 0 14px 14px;' +
          'overflow:hidden;' +
        '}' +
        '#sl-toast-progress{' +
          'height:100%;width:100%;' +
          'background:#fff!important;' +
          'transform-origin:left;' +
          'animation:sl-shrink 7s linear forwards;' +
        '}' +
        '@keyframes sl-shrink{from{transform:scaleX(1);}to{transform:scaleX(0);}}';
      document.head.appendChild(st);
    }

    var toast = document.createElement('div');
    toast.id = TOAST_ID;
    toast.innerHTML =
      '<div id="sl-toast-inner">' +
        '<div id="sl-toast-icon">⚠</div>' +
        '<div id="sl-toast-body">' +
          '<div id="sl-toast-title">sessão encerrada por segurança</div>' +
          '<div id="sl-toast-msg">' +
            'Outro utilizador acedeu a esta sessão. O seu trabalho foi guardado automaticamente e o módulo foi encerrado para evitar conflitos.' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div id="sl-toast-bar"><div id="sl-toast-progress"></div></div>';

    document.body.appendChild(toast);

    /* Animate in */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        toast.classList.add('sl-toast-visible');
      });
    });

    /* Auto-remove after 7.5 s */
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
    this._module        = moduleName;
    this._sb            = sb;
    this._tabId         = slTabId();
    this._sessionName   = null;
    this._channel       = null;   // broadcast channel
    this._pgChannel     = null;   // postgres_changes channel
    this._heartbeat     = null;
    this._onEvicted     = null;
    this._evicting      = false;
    this._unloadBound   = false;
    this._unloadHandler = null;
    this._reconcileBound = false;
    this._visHandler    = null;
    this._focusHandler  = null;
    this._onlineHandler = null;
    this._ticking       = false;  // re-entrancy guard for _tick
  }

  /* ── Acquire lock for a session ── */
  SessionLockInstance.prototype.acquire = async function (sessionName, onEvicted) {
    var cb = onEvicted || function () {};

    /* Idempotent: re-acquiring the SAME live session must not spawn
       duplicate channels/heartbeats. Just refresh the callback + renew. */
    if (this._sessionName === sessionName && !this._evicting && this._heartbeat) {
      this._onEvicted = cb;
      await this._upsertLock();
      return;
    }

    /* Switching sessions on the same instance: fully release the old one. */
    if (this._sessionName && this._sessionName !== sessionName) {
      try { await this.release(); } catch (e) {}
    }

    this._sessionName = sessionName;
    this._onEvicted   = cb;
    this._evicting    = false;

    var sb = this._sb;
    console.info('SessionLock: acquire', { module: this._module, session: sessionName, tab: this._tabId });

    /* 1. If another live tab holds this session, nudge it via broadcast
          (fast path). Takeover happens unconditionally at step 2. */
    try {
      var existing = await sb
        .from(SL_TABLE)
        .select('tab_id, locked_at')
        .eq('module_name', this._module)
        .eq('session_name', sessionName)
        .limit(1);

      if (!existing.error && existing.data && existing.data.length) {
        var row = existing.data[0];
        if (row.tab_id !== this._tabId) {
          console.info('SessionLock: taking over from', row.tab_id, '→ broadcasting evict');
          await this._notifyEviction(sessionName);
        }
      }
    } catch (e) {
      console.warn('SessionLock: error checking existing lock', e);
    }

    /* 2. Claim the lock (upsert — last write wins). */
    await this._upsertLock();

    /* 3. Fast-path subscriptions (best-effort; correctness comes from step 5). */
    this._subscribeBroadcast();
    this._subscribePgChanges();

    /* 4. Ensure the row is removed if the browser/tab closes, and force a
          reconcile whenever this tab regains focus / connectivity. */
    this._bindUnload();
    this._bindReconcileEvents();

    /* 5. Authoritative heartbeat (renew + reconcile). */
    this._startHeartbeat();
  };

  /* ── Release lock (call on module close → dashboard) ── */
  SessionLockInstance.prototype.release = async function () {
    this._stopHeartbeat();
    this._unsubscribeBroadcast();
    this._unsubscribePgChanges();
    this._unbindUnload();
    this._unbindReconcileEvents();

    var name = this._sessionName;
    this._sessionName = null;
    if (!name) return;

    try {
      await this._sb
        .from(SL_TABLE)
        .delete()
        .eq('module_name', this._module)
        .eq('session_name', name)
        .eq('tab_id', this._tabId);
    } catch (e) {
      console.warn('SessionLock: error releasing lock', e);
    }
  };

  /* ── Claim/reclaim our lock row (last-write-wins) ── */
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

  /* ── Notify existing tab via Realtime broadcast (best-effort) ── */
  SessionLockInstance.prototype._notifyEviction = async function (sessionName) {
    var channelName = 'sl_' + this._module + '_' + sessionName.replace(/\s/g, '_');
    var ch = this._sb.channel(channelName);
    var sb = this._sb;
    try {
      await new Promise(function (resolve) {
        ch.subscribe(function (status) {
          if (status === 'SUBSCRIBED') {
            ch.send({ type: 'broadcast', event: 'evict', payload: { by: 'acquire' } })
              .then(resolve)
              .catch(resolve);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            resolve();
          }
        });
        /* Safety timeout — never block acquisition on Realtime. */
        setTimeout(resolve, 3000);
      });
    } catch (e) {
      console.warn('SessionLock: error sending eviction broadcast', e);
    } finally {
      try { sb.removeChannel(ch); } catch (e2) {}
    }
  };

  /* ── Subscribe to eviction broadcasts for our session (fast path) ── */
  SessionLockInstance.prototype._subscribeBroadcast = function () {
    if (!this._sessionName) return;
    this._unsubscribeBroadcast();
    var self        = this;
    var channelName = 'sl_' + this._module + '_' + this._sessionName.replace(/\s/g, '_');

    this._channel = this._sb.channel(channelName);
    this._channel
      .on('broadcast', { event: 'evict' }, function () {
        self._handleEviction();
      })
      .subscribe(function (status) {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          /* Realtime unavailable — heartbeat reconciliation covers it. */
          console.warn('SessionLock: broadcast subscribe status', status);
        }
      });
  };

  SessionLockInstance.prototype._unsubscribeBroadcast = function () {
    if (this._channel) {
      try { this._sb.removeChannel(this._channel); } catch (e) {}
      this._channel = null;
    }
  };

  /* ── Subscribe to Postgres Changes on the lock row (reliable push) ──
     Not filtered server-side (composite key + arbitrary session names make
     server filters brittle); we filter in the handler. Volume is trivial. */
  SessionLockInstance.prototype._subscribePgChanges = function () {
    if (!this._sessionName) return;
    this._unsubscribePgChanges();
    var self = this;
    var channelName = 'slpg_' + this._module + '_' + this._sessionName.replace(/\s/g, '_') + '_' + this._tabId;

    try {
      this._pgChannel = this._sb.channel(channelName);
      this._pgChannel
        .on('postgres_changes',
            { event: '*', schema: 'public', table: SL_TABLE },
            function (payload) { self._onLockChange(payload); })
        .subscribe(function (status) {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            /* Table not in publication or Realtime down — heartbeat covers it. */
            console.warn('SessionLock: postgres_changes subscribe status', status);
          }
        });
    } catch (e) {
      console.warn('SessionLock: error subscribing postgres_changes', e);
      this._pgChannel = null;
    }
  };

  SessionLockInstance.prototype._unsubscribePgChanges = function () {
    if (this._pgChannel) {
      try { this._sb.removeChannel(this._pgChannel); } catch (e) {}
      this._pgChannel = null;
    }
  };

  /* ── Handle a pushed change on the lock row. Deterministic rule:
        a different tab_id now owns OUR session → we are evicted. ── */
  SessionLockInstance.prototype._onLockChange = function (payload) {
    if (this._evicting || !this._sessionName) return;
    var rec = (payload && (payload.new || payload.old)) || null;
    if (!rec) return;
    if (rec.module_name !== this._module) return;
    if (rec.session_name !== this._sessionName) return;

    var evt = payload.eventType || payload.event;

    if (evt === 'DELETE') {
      /* Our row was deleted. If it was us (normal release path), ignore.
         Otherwise let the next heartbeat reclaim it if we still own logically. */
      return;
    }

    /* INSERT / UPDATE: a row for our session exists. */
    var newRec = payload.new || rec;
    if (newRec && newRec.tab_id && newRec.tab_id !== this._tabId) {
      this._handleEviction();
    }
  };

  /* ── Browser/tab close → remove our lock row reliably ── */
  SessionLockInstance.prototype._bindUnload = function () {
    if (this._unloadBound) return;
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    var self = this;
    this._unloadHandler = function () { self._beaconRelease(); };
    window.addEventListener('pagehide', this._unloadHandler);
    window.addEventListener('beforeunload', this._unloadHandler);
    this._unloadBound = true;
  };

  SessionLockInstance.prototype._unbindUnload = function () {
    if (!this._unloadBound) return;
    try {
      window.removeEventListener('pagehide', this._unloadHandler);
      window.removeEventListener('beforeunload', this._unloadHandler);
    } catch (e) {}
    this._unloadHandler = null;
    this._unloadBound   = false;
  };

  /* ── Force an authoritative reconcile when the tab wakes up ──
     Covers background-throttled timers and dropped sockets: the instant the
     stale tab is focused / becomes visible / regains network, it checks the
     DB and self-evicts if it lost ownership. This is what makes "never two
     visible at once" hold even when Realtime never delivered anything.    */
  SessionLockInstance.prototype._bindReconcileEvents = function () {
    if (this._reconcileBound) return;
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    var self = this;

    this._visHandler = function () {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        self._tick();
      }
    };
    this._focusHandler  = function () { self._tick(); };
    this._onlineHandler = function () { self._tick(); };

    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', this._visHandler);
    }
    window.addEventListener('focus',  this._focusHandler);
    window.addEventListener('online', this._onlineHandler);
    this._reconcileBound = true;
  };

  SessionLockInstance.prototype._unbindReconcileEvents = function () {
    if (!this._reconcileBound) return;
    try {
      if (typeof document !== 'undefined' && document.removeEventListener) {
        document.removeEventListener('visibilitychange', this._visHandler);
      }
      window.removeEventListener('focus',  this._focusHandler);
      window.removeEventListener('online', this._onlineHandler);
    } catch (e) {}
    this._visHandler = this._focusHandler = this._onlineHandler = null;
    this._reconcileBound = false;
  };

  /* ── Best-effort, survives page unload (keepalive). Deletes ONLY our row. ── */
  SessionLockInstance.prototype._beaconRelease = function () {
    if (!this._sessionName) return;
    if (typeof fetch !== 'function') return;
    var ep = slRestEndpoint(this._sb);
    if (!ep) return;

    var q = '/' + SL_TABLE +
      '?module_name=eq.'  + encodeURIComponent(this._module) +
      '&session_name=eq.' + encodeURIComponent(this._sessionName) +
      '&tab_id=eq.'       + encodeURIComponent(this._tabId);

    try {
      fetch(ep.url + q, {
        method:    'DELETE',
        headers:   ep.headers,
        keepalive: true,
        cache:     'no-store'
      }).catch(function () {});
    } catch (e) {}
  };

  /* ── Handle incoming eviction (broadcast, pg-change or heartbeat). Idempotent. ── */
  SessionLockInstance.prototype._handleEviction = function () {
    if (this._evicting || !this._sessionName) return;
    this._evicting = true;
    console.info('SessionLock: evicted — another client took session', this._sessionName);

    this._stopHeartbeat();
    this._unsubscribeBroadcast();
    this._unsubscribePgChanges();
    this._unbindUnload();          /* the new owner holds the row now — do not delete it */
    this._unbindReconcileEvents();
    this._sessionName = null;

    slShowEvictionToast();

    var cb = this._onEvicted;
    this._onEvicted = null;

    /* Small delay so the toast renders before the UI closes. */
    setTimeout(function () {
      try { if (cb) cb(); } catch (e) {}
    }, 600);
  };

  /* ── Heartbeat: renew ownership (race-safe) and reconcile against DB.
        Authoritative, plain HTTP — immune to Realtime/GoTrue problems. ── */
  SessionLockInstance.prototype._tick = async function () {
    if (!this._sessionName || this._evicting) return;
    if (this._ticking) return;          /* avoid overlapping ticks (focus + timer) */
    this._ticking = true;

    var sb   = this._sb;
    var name = this._sessionName;

    try {
      /* Conditional renew: only touches the row if WE still own it.
         A concurrent take-over (different tab_id) makes this match 0 rows. */
      var upd = await sb
        .from(SL_TABLE)
        .update({ locked_at: new Date().toISOString() })
        .eq('module_name', this._module)
        .eq('session_name', name)
        .eq('tab_id', this._tabId)
        .select('tab_id');

      /* Network/DB error → skip this tick; never evict on uncertainty. */
      if (upd.error) return;

      /* Still ours → done. */
      if (upd.data && upd.data.length) return;

      /* Session changed underneath us while awaiting → abort. */
      if (this._sessionName !== name || this._evicting) return;

      /* 0 rows updated → we no longer own the row. Find out why. */
      var cur = await sb
        .from(SL_TABLE)
        .select('tab_id')
        .eq('module_name', this._module)
        .eq('session_name', name)
        .limit(1);

      if (cur.error) return;                                 /* skip on error */
      if (this._sessionName !== name || this._evicting) return;

      if (!cur.data || !cur.data.length) {
        /* Row was deleted by someone — reclaim it for ourselves. */
        await this._upsertLock();
        return;
      }

      /* Deterministic exclusion: a different tab_id owns our session → we are
         evicted. No timestamp comparison (skew-proof): the conditional update
         above already proved someone overwrote our row after us.            */
      if (cur.data[0].tab_id !== this._tabId) {
        this._handleEviction();
        return;
      }

      /* Row says it's ours but the conditional update missed it (rare race) →
         re-assert ownership. */
      await this._upsertLock();
    } catch (e) {
      /* Swallow: a transient failure must never evict the active user. */
    } finally {
      this._ticking = false;
    }
  };

  SessionLockInstance.prototype._startHeartbeat = function () {
    var self = this;
    this._stopHeartbeat();
    this._heartbeat = setInterval(function () {
      self._tick();
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
