/* Acceso y licencias. Requiere config.js y supabase-js (window.supabase). */
(function () {
  'use strict';
  const C = window.APP_CONFIG || {};
  const DEMO = !C.SUPABASE_URL || !C.SUPABASE_ANON_KEY ||
    /TU-PROYECTO|TU_CLAVE/.test(C.SUPABASE_URL + C.SUPABASE_ANON_KEY);
  const GRACIA = (C.OFFLINE_GRACE_DAYS || 7) * 864e5;
  const REVALIDAR = (C.RECHECK_MINUTES || 15) * 6e4;
  const $ = (id) => document.getElementById(id);

  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  let sb = null, hooks = {}, modo = 'login', ocupado = false, timer = null;

  const MOTIVOS = {
    no_license: 'Tu cuenta todavía no tiene licencia. Pídela al administrador.',
    suspended: 'Tu licencia está suspendida. Contacta al administrador.',
    expired: 'Tu licencia venció. Pide la renovación al administrador.',
    device_revoked: 'El administrador bloqueó este dispositivo.',
    device_limit: 'Tu licencia ya está en el máximo de dispositivos. Libera uno para usar este.',
    reloj: 'La hora del dispositivo no coincide con la última validación. Conéctate a internet.',
    gracia: 'Pasaron más de 7 días sin validar la licencia. Conéctate a internet.',
    sin_cache: 'Necesitas internet para validar la licencia la primera vez en este dispositivo.',
    bad_device: 'No se pudo identificar este dispositivo. Recarga la página.',
    error: 'No se pudo validar la licencia. Intenta de nuevo.'
  };

  // ---------- Utilidades ----------
  function idDispositivo() {
    let d = localStorage.getItem('calc_device_id');
    if (!d) {
      d = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
        : Date.now().toString(16) + Math.random().toString(16).slice(2);
      localStorage.setItem('calc_device_id', d);
    }
    return d;
  }
  function nombreDispositivo() {
    const u = navigator.userAgent;
    const so = /Android/.test(u) ? 'Android' : /iPhone|iPad/.test(u) ? 'iOS' : /Windows/.test(u) ? 'Windows'
      : /Mac/.test(u) ? 'Mac' : /Linux/.test(u) ? 'Linux' : 'Dispositivo';
    const nav = /Edg\//.test(u) ? 'Edge' : /Chrome\//.test(u) ? 'Chrome' : /Firefox\//.test(u) ? 'Firefox'
      : /Safari\//.test(u) ? 'Safari' : '';
    return (so + ' ' + nav).trim();
  }
  const conTiempo = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms || 10000))]);
  const esRed = (e) => !navigator.onLine || /fetch|network|timeout|load failed/i.test(String((e && e.message) || e));
  const fecha = (x) => new Date(x).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  function relojOk() {
    const max = ls.get('calc_clock_max') || 0, now = Date.now();
    if (now < max - 10 * 6e4) return false;      // el reloj se movió hacia atrás
    if (now > max) ls.set('calc_clock_max', now);
    return true;
  }
  function traducir(err) {
    const m = String((err && err.message) || err || '');
    if (/Invalid login/i.test(m)) return 'Correo o contraseña incorrectos.';
    if (/not confirmed/i.test(m)) return 'Confirma tu correo antes de entrar. Revisa tu bandeja.';
    if (/already registered/i.test(m)) return 'Ese correo ya tiene cuenta. Inicia sesión.';
    if (/password/i.test(m) && /(least|short|weak)/i.test(m)) return 'La contraseña debe tener al menos 8 caracteres.';
    if (/rate limit|too many/i.test(m)) return 'Demasiados intentos. Espera unos minutos.';
    if (esRed(err)) return 'Sin conexión. Revisa tu internet.';
    return m || 'Ocurrió un error. Intenta de nuevo.';
  }

  // ---------- Validación ----------
  function sinConexion() {
    const c = ls.get('calc_lic');
    if (!c || !c.ok) return { estado: 'bloqueado', motivo: 'sin_cache' };
    if (!relojOk()) return { estado: 'bloqueado', motivo: 'reloj' };
    const now = Date.now();
    if (now < c.local - 5 * 6e4) return { estado: 'bloqueado', motivo: 'reloj' };
    if (now - c.local > GRACIA) return { estado: 'bloqueado', motivo: 'gracia' };
    if (c.expires_at && now > Date.parse(c.expires_at)) return { estado: 'bloqueado', motivo: 'expired' };
    return { estado: 'ok', info: { email: c.email, plan: c.plan, expires_at: c.expires_at, offline: true,
      dias: Math.floor((now - c.local) / 864e5) } };
  }

  async function verificar() {
    if (DEMO) return { estado: 'ok', info: { demo: true } };
    let sesion = null;
    try {
      const r = await conTiempo(sb.auth.getSession());
      sesion = r.data && r.data.session;
      if (!sesion && r.error && esRed(r.error)) return sinConexion();
    } catch (e) { return sinConexion(); }
    if (!sesion) {
      if (!navigator.onLine) { const o = sinConexion(); if (o.estado === 'ok') return o; }
      return { estado: 'sin_sesion' };
    }
    let res;
    try {
      res = await conTiempo(sb.rpc('check_license', { p_device_id: idDispositivo(), p_device_name: nombreDispositivo() }));
    } catch (e) { return sinConexion(); }
    if (res.error) {
      if (res.status === 401 || /JWT/i.test(res.error.message || '')) return { estado: 'sin_sesion' };
      if (esRed(res.error)) return sinConexion();
      return { estado: 'bloqueado', motivo: 'error' };
    }
    const d = res.data || {};
    if (d.ok) {
      relojOk();
      ls.set('calc_lic', { uid: sesion.user.id, email: sesion.user.email, ok: true, plan: d.plan,
        expires_at: d.expires_at, max_devices: d.max_devices, local: Date.now() });
      return { estado: 'ok', info: { email: sesion.user.email, plan: d.plan, expires_at: d.expires_at, offline: false } };
    }
    ls.del('calc_lic');
    return { estado: 'bloqueado', motivo: d.reason, datos: d };
  }

  async function arrancar() {
    if (ocupado) return;
    ocupado = true;
    try {
      const v = await verificar();
      if (v.estado === 'ok') { hooks.onOk && hooks.onOk(v.info); }
      else {
        hooks.onBlock && hooks.onBlock();
        if (v.estado === 'sin_sesion') mostrarGate('login');
        else mostrarBloqueo(v);
      }
    } finally { ocupado = false; }
  }

  // ---------- Pantalla de acceso ----------
  function msg(texto, tipo) {
    const e = $('gErr'); e.textContent = texto || ''; e.className = 'msg' + (tipo ? ' ' + tipo : '');
  }
  function setModo(m) {
    modo = m;
    const f = { login: ['Entrar', 'Crear cuenta', true, false, true, true], signup: ['Crear cuenta', 'Ya tengo cuenta', true, true, true, false],
      reset: ['Enviar enlace', 'Volver', false, false, true, false], newpass: ['Guardar contraseña', '', true, false, false, false] }[m];
    $('gGo').textContent = f[0];
    $('gAlt').textContent = f[1]; $('gAlt').hidden = !f[1];
    $('gPassL').hidden = !f[2]; $('gPass').required = f[2];
    $('gNomL').hidden = !f[3];
    $('gMailL').hidden = !f[4]; $('gMail').required = f[4];
    $('gForgot').hidden = !f[5];
    $('gPass').autocomplete = (m === 'login') ? 'current-password' : 'new-password';
    $('gPassT').textContent = (m === 'newpass') ? 'Nueva contraseña' : 'Contraseña';
    $('gForm').hidden = false; $('gBlock').hidden = true;
  }
  function mostrarGate(m, texto) {
    $('gate').hidden = false;
    setModo(m || 'login');
    $('gMsg').textContent = ({ login: 'Entra con tu cuenta para usar la calculadora.', signup: 'Crea tu cuenta. El administrador activará tu licencia.',
      reset: 'Te enviaremos un enlace para cambiar tu contraseña.', newpass: 'Escribe tu nueva contraseña.' })[modo];
    msg(texto || '');
  }
  function mostrarBloqueo(v) {
    $('gate').hidden = false;
    $('gForm').hidden = true; $('gBlock').hidden = false;
    $('gMsg').textContent = MOTIVOS[v.motivo] || MOTIVOS.error;
    msg('');
    const cont = $('gDev'); cont.textContent = '';
    if (v.motivo === 'device_limit' && v.datos && Array.isArray(v.datos.devices)) {
      v.datos.devices.forEach((d) => {
        const row = document.createElement('div'); row.className = 'devrow';
        const t = document.createElement('span');
        t.textContent = (d.nombre || 'Dispositivo') + ', visto ' + fecha(d.last_seen);
        const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Liberar';
        b.onclick = () => liberar(d.id, true);
        row.append(t, b); cont.append(row);
      });
    }
  }
  async function liberar(id, desdeGate) {
    const { data, error } = await sb.rpc('release_device', { p_id: id });
    if (error || !data || !data.ok) {
      const t = (data && data.reason === 'release_limit') ? 'Ya liberaste 3 dispositivos en 30 días. Contacta al administrador.'
        : 'No se pudo liberar el dispositivo.';
      if (desdeGate) msg(t, 'err'); return t;
    }
    if (desdeGate) { msg(''); await arrancar(); }
    return '';
  }

  async function enviar(e) {
    e.preventDefault();
    const email = $('gMail').value.trim(), pass = $('gPass').value, nombre = $('gNom').value.trim();
    $('gGo').disabled = true; msg('');
    try {
      if (modo === 'login') {
        const { error } = await sb.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
        await arrancar();
      } else if (modo === 'signup') {
        const { data, error } = await sb.auth.signUp({ email, password: pass, options: { data: { nombre } } });
        if (error) throw error;
        if (data.session) await arrancar();
        else { setModo('login'); msg('Cuenta creada. Confirma tu correo y luego inicia sesión.', 'ok'); }
      } else if (modo === 'reset') {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
        if (error) throw error;
        msg('Si el correo existe, te llegará un enlace.', 'ok');
      } else if (modo === 'newpass') {
        const { error } = await sb.auth.updateUser({ password: pass });
        if (error) throw error;
        history.replaceState(null, '', location.pathname);
        await arrancar();
      }
    } catch (err) { msg(traducir(err), 'err'); }
    finally { $('gGo').disabled = false; }
  }

  async function cerrarSesion() {
    try { await sb.auth.signOut(); } catch (e) {}
    ls.del('calc_lic');
    hooks.onBlock && hooks.onBlock();
    $('acct').close && $('acct').open && $('acct').close();
    $('gPass').value = '';
    mostrarGate('login');
  }

  // ---------- Cuenta ----------
  async function abrirCuenta() {
    const d = $('acct'), body = $('acctBody'); body.textContent = '';
    const p = (t) => { const x = document.createElement('p'); x.textContent = t; body.append(x); return x; };
    if (DEMO) { p('Modo prueba: configura config.js para activar cuentas y licencias.'); if (!d.open) d.showModal(); return; }
    const c = ls.get('calc_lic') || {};
    p(c.email || '');
    p('Plan ' + (c.plan || '-') + (c.expires_at ? ', vence el ' + fecha(c.expires_at) : ', sin vencimiento'));
    const lista = document.createElement('div'); body.append(lista);
    if (!d.open) d.showModal();
    try {
      const { data, error } = await conTiempo(sb.from('devices').select('id,device_id,nombre,last_seen').eq('revoked', false).order('last_seen', { ascending: false }));
      if (error) throw error;
      const h = document.createElement('h3'); h.textContent = 'Dispositivos'; lista.append(h);
      data.forEach((x) => {
        const row = document.createElement('div'); row.className = 'devrow';
        const t = document.createElement('span');
        const esteDisp = x.device_id === idDispositivo();
        t.textContent = (x.nombre || 'Dispositivo') + (esteDisp ? ' (este)' : '') + ', visto ' + fecha(x.last_seen);
        row.append(t);
        if (!esteDisp) {
          const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Quitar';
          b.onclick = async () => { b.disabled = true; const r = await liberar(x.id, false); if (r) p(r); else abrirCuenta.call(null); };
          row.append(b);
        }
        lista.append(row);
      });
    } catch (e) { const x = document.createElement('p'); x.className = 'hint'; x.textContent = 'Sin conexión: no se puede consultar la lista de dispositivos.'; lista.append(x); }
  }

  // ---------- Inicio ----------
  function iniciar(h) {
    hooks = h || {};
    if (DEMO) { hooks.onOk && hooks.onOk({ demo: true }); return; }
    if (!window.supabase) { hooks.onBlock && hooks.onBlock(); mostrarBloqueo({ motivo: 'sin_cache' }); return; }
    sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY,
      { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    $('gForm').addEventListener('submit', enviar);
    $('gAlt').onclick = () => mostrarGate(modo === 'login' ? 'signup' : 'login');
    $('gForgot').onclick = () => mostrarGate('reset');
    $('gRetry').onclick = () => { msg(''); arrancar(); };
    $('gOut').onclick = cerrarSesion;
    $('acctOut').onclick = cerrarSesion;
    $('acctClose').onclick = () => $('acct').close();
    sb.auth.onAuthStateChange((ev) => { if (ev === 'PASSWORD_RECOVERY') { hooks.onBlock && hooks.onBlock(); mostrarGate('newpass'); } });
    const recuperando = /type=recovery/.test(location.hash);
    if (recuperando) { hooks.onBlock && hooks.onBlock(); mostrarGate('newpass'); } else arrancar();
    const revisar = () => { if (modo !== 'newpass' && !document.hidden) arrancar(); };
    timer = setInterval(revisar, REVALIDAR);
    document.addEventListener('visibilitychange', revisar);
    window.addEventListener('online', revisar);
  }

  window.Licencia = { iniciar, abrirCuenta, demo: DEMO, fecha };
})();
