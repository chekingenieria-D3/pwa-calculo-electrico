/* Proyectos, tableros, circuitos y cuadro de cargas.
   Usa funciones de la calculadora: leer, calcular, render, fmt, sz, nm, SYS. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const hoy = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const KEY = (s) => 'calc_datos_v1_' + s;
  const PRESETS = ['220/127', '240/120', '208/120', '440/254', '480/277'];
  const n0 = (x) => Math.abs(x - Math.round(x)) < 0.05 ? fmt(x, 0) : fmt(x, 1);

  let scope = null, D = null, edit = null, numAuto = true, tabCuadro = '', toastT = null;
  const P = () => D.proyectos.find((p) => p.id === D.actual);
  const tabl = (id) => P().tableros.find((t) => t.id === id);
  const circ = (id) => P().circuitos.find((c) => c.id === id);

  // ---------- Datos ----------
  const KA = [10, 14, 18, 22, 25, 35, 65, 100, 200];   // capacidades interruptivas de la hoja ITM del Excel
  const kaStd = (k) => KA.find((x) => x >= k) || 200;
  const PLANO0 = () => ({ nombre: 'DIAGRAMA UNIFILAR', numero: '', escala: 'S/E', dibujo: '' });
  function normalizar(d) { d.proyectos.forEach((p) => { p.tableros.forEach((t) => { t.kA = kaStd(t.kA); }); p.transformadores = p.transformadores || []; p.plano = Object.assign(PLANO0(), p.plano || {}); }); }
  const trafo = (id) => P().transformadores.find((x) => x.id === id);
  function datosNuevos() {
    const id = uid();
    return { v: 1, actual: id, proyectos: [{ id, nombre: 'Proyecto 1', ubicacion: '', ing: '', fecha: hoy(), tableros: [], circuitos: [], transformadores: [], plano: PLANO0() }] };
  }
  function guardar() {
    if (!scope) return;
    try { localStorage.setItem(KEY(scope), JSON.stringify(D)); }
    catch (e) { aviso('No se pudo guardar: el almacenamiento del dispositivo está lleno.', true); }
  }
  function cargar(s) {
    if (s === scope && D) return;
    scope = s;
    try { D = JSON.parse(localStorage.getItem(KEY(s))); } catch (e) { D = null; }
    if (!D || !Array.isArray(D.proyectos) || !D.proyectos.length) D = datosNuevos();
    normalizar(D);
    if (!D.proyectos.some((p) => p.id === D.actual)) D.actual = D.proyectos[0].id;
    edit = null;
    refrescar();
  }
  function aviso(t, err) {
    const e = $('toast'); if (!e) return;
    e.textContent = t; e.className = 'toast' + (err ? ' err' : ''); e.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { e.hidden = true; }, 2800);
  }
  function numDe(c) { const m = String(c.num).match(/(\d+)\s*$/); return m ? parseInt(m[1], 10) : 1e9; }
  function ordenados(tid) {
    return P().circuitos.filter((c) => c.tab === tid).map((c, i) => ({ c, i }))
      .sort((a, b) => numDe(a.c) - numDe(b.c) || a.i - b.i).map((x) => x.c);
  }
  const hijos = (tid) => P().tableros.filter((h) => h.fuente && h.fuente.tipo === 'tablero' && h.fuente.ref === tid);
  const SIN_FUENTE = () => ({ tipo: '', ref: null, texto: '', num: '', fase: 'auto' });
  function siguienteNum(tid, excluir) {
    const ns = P().circuitos.filter((c) => c.tab === tid).map(numDe);
    hijos(tid).filter((h) => h.id !== excluir).forEach((h) => ns.push(numDe({ num: h.fuente.num })));
    const v = ns.filter((n) => n < 1e9);
    return 'C-' + ((v.length ? Math.max(...v) : 0) + 1);
  }
  function esDescendiente(id, ancestro) {
    let cur = tabl(id), n = 0;
    while (cur && cur.fuente && cur.fuente.tipo === 'tablero' && n++ < 50) {
      if (cur.fuente.ref === ancestro) return true;
      cur = tabl(cur.fuente.ref);
    }
    return false;
  }
  function validaFuente(h) {
    const f = h.fuente; if (!f || f.tipo !== 'tablero') return '';
    const s = tabl(f.ref);
    if (!s) return 'No se encuentra el tablero fuente.';
    if (s.id === h.id || esDescendiente(s.id, h.id)) return 'La fuente genera un ciclo entre tableros.';
    if (s.vff !== h.vff || s.vfn !== h.vfn) return 'La tensión (' + h.vff + '/' + h.vfn + ' V) no coincide con la del tablero fuente (' + s.vff + '/' + s.vfn + ' V). Usa un transformador como fuente.';
    if (h.sis === '3F-4H' && s.sis !== '3F-4H') return 'El tablero fuente solo tiene 2 fases.';
    return '';
  }
  function fuenteTxt(t) {
    const f = t.fuente; if (!f || !f.tipo) return '';
    if (f.tipo === 'tablero') { const s = tabl(f.ref); return s ? 'Tablero ' + s.nombre + ', circuito ' + f.num : 'Tablero fuente no encontrado'; }
    if (f.tipo === 'transformador') { const tr = trafo(f.ref); return 'Transformador' + (tr ? ' ' + tr.nombre + ', ' + tr.kva + ' kVA' : '') + (f.texto ? ': ' + f.texto : ''); }
    return { medidor: 'Medidor', otro: 'Otra fuente' }[f.tipo] + (f.texto ? ': ' + f.texto : '');
  }

  // ---------- Vistas ----------
  function ir(v) {
    document.body.dataset.vista = v;
    $('vCalc').hidden = v !== 'calc'; $('vTab').hidden = v !== 'tab'; $('vCuadro').hidden = v !== 'cuadro'; $('vUnif').hidden = v !== 'unif';
    document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === v ? 'true' : 'false'));
    if (v === 'tab') pintarTab();
    if (v === 'cuadro') pintarCuadro();
    if (v === 'unif' && window.Unifilar) Unifilar.pintar();
    window.scrollTo(0, 0);
  }
  function refrescar() { pintarSelTab(); pintarTab(); pintarCuadro(); aplicarTablero(); if (window.Unifilar && !$('vUnif').hidden) Unifilar.pintar(); if (window.render) render(); }

  // ---------- Selector de tablero en la calculadora ----------
  function pintarSelTab() {
    const sel = $('cTab'), v = sel.value, ts = P().tableros;
    sel.innerHTML = '<option value="">Sin tablero (solo calcular)</option>' +
      ts.map((t) => '<option value="' + t.id + '">' + esc(t.nombre) + ' (' + t.sis + ', ' + t.vff + '/' + t.vfn + ' V)</option>').join('') +
      '<option value="__nuevo">Nuevo tablero...</option>';
    sel.value = ts.some((t) => t.id === v) ? v : '';
  }
  function tableroActual() { const id = $('cTab').value; return (id && id !== '__nuevo') ? tabl(id) : null; }
  function aplicarTablero() {
    const t = tableroActual(), tens = $('tens'), sis = $('sis');
    if (!t) { tens.disabled = false; [...sis.options].forEach((o) => { o.disabled = false; }); return; }
    const val = t.vff + '/' + t.vfn;
    if (![...tens.options].some((o) => o.value === val)) tens.add(new Option(t.vff + ' / ' + t.vfn, val));
    tens.value = val; tens.disabled = true;
    const ok = t.sis === '1F-3H' ? ['1F-2H', '2F-2H', '1F-3H'] : ['1F-2H', '2F-2H', '1F-3H', '3F-3H', '3F-4H'];
    [...sis.options].forEach((o) => { o.disabled = !ok.includes(o.value); });
    if (!ok.includes(sis.value)) sis.value = ok[0];
  }
  function alCambiarTablero() {
    if ($('cTab').value === '__nuevo') { $('cTab').value = ''; abrirTablero(null, true); return; }
    aplicarTablero();
    if (!edit && numAuto) { const t = tableroActual(); $('cNum').value = t ? siguienteNum(t.id) : ''; }
    if (window.render) render();
  }

  // ---------- Guardar circuito desde la calculadora ----------
  function alRenderizar(p, r) {
    const out = $('out'); if (!out || !D || !r) return;
    const t = tableroActual();
    const box = document.createElement('div'); box.className = 'savebox';
    if (edit && circ(edit)) {
      box.innerHTML = '<p class="hint">Editando el circuito ' + esc(circ(edit).num) + '</p><div class="btns"><button type="button" class="main" id="cUpd">Actualizar</button>' +
        '<button type="button" id="cNew">Guardar como nuevo</button><button type="button" id="cCancel">Cancelar</button></div>';
    } else {
      box.innerHTML = '<div class="btns"><button type="button" class="main" id="cSave">' + (t ? 'Guardar en ' + esc(t.nombre) : 'Guardar circuito') + '</button></div>';
    }
    const ref = out.querySelector('.btns');
    out.insertBefore(box, ref);
    const on = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
    on('cSave', () => guardarCirc(false)); on('cUpd', () => guardarCirc(true));
    on('cNew', () => guardarCirc(false)); on('cCancel', () => { cancelarEdicion(); });
  }
  function guardarCirc(actualizar) {
    const t = tableroActual();
    if (!t) { aviso('Elige un tablero arriba, o crea uno nuevo.', true); $('cTab').focus(); return; }
    const p = leer(), r = calcular(p);
    if (r.error) { aviso(r.error, true); return; }
    const num = $('cNum').value.trim() || siguienteNum(t.id), nombre = $('cNom').value.trim();
    const repetido = P().circuitos.some((c) => c.tab === t.id && c.num === num && !(actualizar && c.id === edit)) || hijos(t.id).some((x) => x.fuente.num === num);
    if (repetido && !confirm('Ya existe el circuito ' + num + ' en ' + t.nombre + '. ¿Guardar de todos modos?')) return;
    if (actualizar && edit && circ(edit)) { Object.assign(circ(edit), { num, nombre, tab: t.id, p }); aviso('Circuito actualizado'); }
    else { P().circuitos.push({ id: uid(), num, nombre, tab: t.id, fase: 'auto', p }); aviso('Circuito guardado en ' + t.nombre); }
    guardar(); edit = null; numAuto = true;
    $('cNom').value = ''; $('cNum').value = siguienteNum(t.id);
    pintarTab(); pintarCuadro(); render();
  }
  function cancelarEdicion() { edit = null; numAuto = true; $('cNom').value = ''; const t = tableroActual(); $('cNum').value = t ? siguienteNum(t.id) : ''; render(); }
  function alReset() { edit = null; numAuto = true; pintarSelTab(); aplicarTablero(); if (window.render) render(); }

  function escribir(p) {
    const set = (id, v) => { if ($(id)) $(id).value = v; };
    if (!p.ui) p.ui = { pot: '', unit: 'VA' };
    const val = p.vff + '/' + p.vfn;
    if (![...$('tens').options].some((o) => o.value === val)) $('tens').add(new Option(p.vff + ' / ' + p.vfn, val));
    set('tipoCarga', p.tipoCarga || 'std');
    set('tens', val); set('sis', p.sis); set('modo', p.modo);
    set('pot', p.ui.pot == null ? '' : p.ui.pot); set('unit', p.ui.unit || 'VA'); set('fp', p.fp || 0.9);
    set('eff', p.ui.eff || p.eff || '0.90');
    set('iPlaca', p.ui.iPlaca || (p.iPlaca > 0 ? p.iPlaca : ''));
    set('vfdIn', p.ui.vfdIn || p.vfdIn || '3F');
    set('protVfd', p.ui.protVfd || String(p.protVfd || 1.25));
    set('lraMult', p.ui.lraMult || (p.lraCustom ? 'custom' : String(p.lraMult || 6)));
    set('lraA', p.ui.lraA || p.lraA || '300');
    set('protMotor', p.ui.protMotor || String(p.protMotor || 2.5));
    set('corr', p.corr == null ? '' : p.corr); $('cont').checked = !!p.cont;
    set('L', p.L); set('amb', p.amb); set('aisl', String(p.aisl)); set('term', p.term); set('rac', String(p.rac)); set('vd', String(p.vdMax));
    set('matF', p.matF); set('matT', p.matT); set('minSz', p.minSz); set('nPar', p.nPar === 0 ? 'auto' : String(p.nPar)); set('nCirc', p.nCirc);
    $('noLin').checked = !!p.noLin; $('bare').checked = !!p.bare;
    set('c90', p.c90 || 0); set('c45', p.c45 || 0); set('nReg', p.nReg || 0);
  }
  function editarCirc(id) {
    const c = circ(id); if (!c) return;
    edit = id; numAuto = false;
    $('cTab').value = c.tab; aplicarTablero();
    $('cNum').value = c.num; $('cNom').value = c.nombre || '';
    escribir(c.p);
    ir('calc'); render();
  }

  // ---------- Cálculo del tablero ----------
  function fasesDe(t) { return t.sis === '1F-3H' ? ['A', 'B'] : ['A', 'B', 'C']; }
  function calcularTablero(t, pila) {
    pila = pila || [];
    const fases = fasesDe(t); let lista = [];
    ordenados(t.id).forEach((c) => {
      const r = calcular(c.p), base = { c, mat: c.p.matF, matT: c.p.matT, L: c.p.L };
      if (r.error) lista.push(Object.assign(base, { r: null, error: r.error, W: 0, VA: 0, polos: 1 }));
      else { const W = r.VA * (c.p.fp || 0.9); lista.push(Object.assign(base, { r, W, VA: r.VA, polos: r.polos, fd: 100, demW: W, demVA: r.VA })); }
    });
    // Tableros alimentados desde este: su alimentador cuenta como un circuito más
    hijos(t.id).forEach((hj) => {
      const c = { id: 'tab:' + hj.id, num: hj.fuente.num, nombre: 'Tablero ' + hj.nombre, fase: hj.fuente.fase || 'auto', derivado: hj.id };
      const base = { c, mat: hj.mat, matT: hj.mat, L: hj.L, polos: SYS[hj.sis].polos, W: 0, VA: 0, r: null };
      const err = validaFuente(hj) || (pila.includes(hj.id) ? 'Ciclo entre tableros.' : '');
      if (err) { lista.push(Object.assign(base, { error: err })); return; }
      const Sh = calcularTablero(hj, pila.concat(t.id));
      if (!Sh.alim) { lista.push(Object.assign(base, { error: 'El tablero ' + hj.nombre + ' aún no tiene circuitos.' })); return; }
      if (Sh.alim.error) { lista.push(Object.assign(base, { error: Sh.alim.error })); return; }
      lista.push(Object.assign(base, { r: Sh.alim, W: Sh.totW, VA: Sh.totVA, fd: hj.fd, demW: Sh.demW, demVA: Sh.demVA }));
    });
    lista = lista.map((x, i) => ({ x, i })).sort((a, b) => numDe(a.x.c) - numDe(b.x.c) || a.i - b.i).map((o) => o.x);
    // Reparto en fases: primero las asignaciones manuales, luego las automáticas de mayor a menor carga
    const carga = {}; fases.forEach((f) => { carga[f] = 0; });
    const asig = new Map();
    const comb = (k) => k === 1 ? fases.map((f) => [f]) : k === 2 ? (fases.length === 2 ? [['A', 'B']] : [['A', 'B'], ['B', 'C'], ['A', 'C']]) : [fases.slice()];
    const poner = (x, ph) => { ph.forEach((f) => { carga[f] += x.W / ph.length; }); asig.set(x.c.id, ph); };
    const auto = [];
    lista.filter((x) => x.r).forEach((x) => {
      const m = x.c.fase && x.c.fase !== 'auto' ? x.c.fase.split('').filter((f) => fases.includes(f)) : null;
      if (m && m.length === x.polos) poner(x, m); else auto.push(x);
    });
    auto.sort((a, b) => b.W - a.W).forEach((x) => {
      let mejor = null, dif = Infinity;
      comb(x.polos).forEach((ph) => {
        const v = fases.map((f) => carga[f] + (ph.includes(f) ? x.W / ph.length : 0));
        const d = Math.max(...v) - Math.min(...v);
        if (d < dif - 1e-9) { dif = d; mejor = ph; }
      });
      poner(x, mejor);
    });
    const totW = lista.reduce((s, x) => s + x.W, 0), totVA = lista.reduce((s, x) => s + x.VA, 0);
    const demW = totW * t.fd / 100, demVA = totVA * t.fd / 100;   // el FD del tablero se aplica a la suma al 100 %
    const vals = fases.map((f) => carga[f]), mx = Math.max(...vals), mn = Math.min(...vals);
    const desb = mx > 0 ? (mx - mn) / mx * 100 : 0;
    let alim = null;
    if (totVA > 0) {
      alim = calcular({ sis: t.sis, vff: t.vff, vfn: t.vfn, modo: 'P', S: totVA * (t.fd / 100), corr: 0, cont: t.cont, L: t.L, amb: t.amb,
        aisl: t.aisl, term: 'auto', rac: t.rac, vdMax: t.vd, matF: t.mat, matN: t.mat, matT: t.mat, minSz: '12', nPar: 0, nCirc: 1, noLin: false, bare: false,
        c90: t.c90 || 0, c45: t.c45 || 0, nReg: t.nReg || 0, fp: 0.9 });
    }
    return { fases, lista, asig, carga, totW, totVA, demW, demVA, desb, alim };
  }
  const calN = (r, s) => (r.nPar > 1 ? r.nPar + '×' : '') + s;
  const calTxt = (r, s, mat) => (r.nPar > 1 ? r.nPar + '×' : '') + s + (mat === 'Al' ? ' Al' : '');

  // ---------- Vista: Tableros ----------
  function pintarTab() {
    const v = $('vTab'); if (!v || !D) return;
    const pr = P();
    let h = '<div class="card"><h2>Proyecto</h2><label><span>Proyecto activo</span><select id="pSel">' +
      D.proyectos.map((p) => '<option value="' + p.id + '"' + (p.id === pr.id ? ' selected' : '') + '>' + esc(p.nombre) + '</option>').join('') + '</select></label>' +
      '<div class="grid"><label class="full"><span>Nombre</span><input id="pNom" value="' + esc(pr.nombre) + '"></label>' +
      '<label class="full"><span>Ubicación</span><input id="pUbi" value="' + esc(pr.ubicacion) + '"></label>' +
      '<label><span>Proyectó</span><input id="pIng" value="' + esc(pr.ing) + '"></label>' +
      '<label><span>Fecha</span><input id="pFec" type="date" value="' + esc(pr.fecha) + '"></label></div>' +
      '<div class="btns"><button type="button" data-a="p-nuevo">Nuevo proyecto</button><button type="button" data-a="p-del" class="bad">Eliminar</button></div>' +
      '<div class="btns"><button type="button" data-a="bk-exp">Exportar respaldo</button><button type="button" data-a="bk-imp">Importar respaldo</button></div>' +
      '<input type="file" id="bkFile" accept=".json,application/json" hidden>' +
      '<p class="hint">Los datos se guardan en este dispositivo. Exporta un respaldo de vez en cuando.</p></div>';
    h += '<div class="top2"><h2>Transformadores</h2><button type="button" data-a="tr-nuevo">Nuevo transformador</button></div>';
    if (!pr.transformadores.length) h += '<p class="hint">Opcional. Sirven para dibujar el unifilar con sus datos de placa.</p>';
    pr.transformadores.forEach((tr) => {
      const n = pr.tableros.filter((b) => b.fuente && b.fuente.tipo === 'transformador' && b.fuente.ref === tr.id).length;
      h += '<div class="card" data-tr="' + tr.id + '"><div class="top"><div><b>' + esc(tr.nombre) + '</b><div class="meta">' + n0(tr.kva) + ' kVA, ' + tr.sis + ', ' + esc(tr.conexion) + ', ' + esc(tr.vmt) + '-' + esc(tr.vbt) + '</div></div>' +
        '<div class="meta" style="text-align:right">FD ' + n0(tr.fd) + ' %<br>' + n + ' tableros</div></div>' +
        '<div class="row"><button type="button" data-a="tr-edit">Editar</button><button type="button" data-a="tr-del" class="bad">Eliminar</button></div></div>';
    });
    h += '<div class="top2"><h2>Tableros</h2><button type="button" class="main" data-a="t-nuevo">Nuevo tablero</button></div>';
    if (!pr.tableros.length) h += '<p class="msg">Aún no hay tableros. Crea uno para empezar a guardar circuitos.</p>';
    pr.tableros.forEach((t) => {
      const S = calcularTablero(t), ft = fuenteTxt(t), fe = validaFuente(t);
      h += '<div class="card" data-t="' + t.id + '"><div class="top"><div><b>' + esc(t.nombre) + '</b><div class="meta">' + t.sis + ', ' + t.vff + '/' + t.vfn + ' V, ' + t.kA + ' kA</div>' +
        (ft ? '<div class="meta">Fuente: ' + esc(ft) + '</div>' : '<div class="meta">Fuente sin definir</div>') + (fe ? '<div class="meta bad">' + esc(fe) + '</div>' : '') + '</div>' +
        '<div class="meta" style="text-align:right">' + S.lista.length + ' circuitos<br>' + n0(S.totW) + ' W inst.<br>' + n0(S.demW) + ' W dem.</div></div>' +
        '<div class="row"><button type="button" class="main" data-a="t-cuadro">Cuadro de cargas</button><button type="button" data-a="t-add">Agregar circuito</button>' +
        '<button type="button" data-a="t-edit">Editar</button><button type="button" data-a="t-del" class="bad">Eliminar</button></div>';
      if (S.lista.length) {
        h += '<details><summary>Circuitos (' + S.lista.length + ')</summary>' + S.lista.map((x) => {
          const c = x.c, r = x.r, fs = S.fases;
          const ops = x.polos === 1 ? fs : x.polos === 2 ? (fs.length === 2 ? ['AB'] : ['AB', 'BC', 'AC']) : ['ABC'];
          const sel = (acc) => '<select data-a="' + acc + '" aria-label="Fase del circuito ' + esc(c.num) + '"><option value="auto">Fase auto</option>' +
            ops.map((o) => '<option value="' + o + '"' + (c.fase === o ? ' selected' : '') + '>' + o.split('').join('-') + '</option>').join('') + '</select>';
          const res = !r ? 'Revisar datos' : n0(x.W) + ' W, ' + r.polos + 'P ' + r.itm + ' A, ' + calTxt(r, r.sF, x.mat) + ' AWG';
          if (c.derivado) {
            return '<div class="crow" data-h="' + c.derivado + '"><div><b>' + esc(c.num) + '</b> ' + esc(c.nombre) + '<div class="meta">' + (x.error ? esc(x.error) : 'Alimentador, ' + n0(x.VA) + ' VA inst. × ' + n0(x.fd) + ' % = ' + n0(x.demVA) + ' VA dem., ' + r.polos + 'P ' + r.itm + ' A, ' + calTxt(r, r.sF, x.mat) + ' AWG') + '</div></div>' +
              '<div class="ctl">' + sel('fase-h') + '<button type="button" data-a="h-abrir">Ver cuadro</button></div></div>';
          }
          return '<div class="crow" data-c="' + c.id + '"><div><b>' + esc(c.num) + '</b> ' + esc(c.nombre) + '<div class="meta">' + res + '</div></div>' +
            '<div class="ctl">' + sel('fase') + '<button type="button" data-a="c-edit">Editar</button><button type="button" data-a="c-dup">Duplicar</button><button type="button" data-a="c-del" class="bad">Eliminar</button></div></div>';
        }).join('') + '</details>';
      }
      h += '</div>';
    });
    v.innerHTML = h;
  }

  // ---------- Diálogo de tablero ----------
  let tabEdit = null, tabDesdeCalc = false;
  function abrirTablero(id, desdeCalc) {
    tabEdit = id; tabDesdeCalc = !!desdeCalc;
    const t = id ? tabl(id) : { nombre: 'TAB-' + String.fromCharCode(65 + (P().tableros.length % 26)), sis: '3F-4H', vff: 220, vfn: 127, kA: 10, L: 20, amb: 35, aisl: 1, rac: 0, mat: 'Cu', vd: 3, fd: 100, cont: true };
    const fu = t.fuente || SIN_FUENTE();
    $('dtTit').textContent = id ? 'Editar tablero' : 'Nuevo tablero';
    $('tNom').value = t.nombre; $('tSis').value = t.sis; $('tTens').value = t.vff + '/' + t.vfn; $('tKa').value = String(kaStd(t.kA));
    $('tL').value = t.L; $('tAmb').value = t.amb; $('tAisl').value = String(t.aisl); $('tRac').value = String(t.rac); $('tMat').value = t.mat;
    $('tVd').value = String(t.vd); $('tFd').value = t.fd; $('tCont').checked = !!t.cont;
    $('tC90').value = t.c90 || 0; $('tC45').value = t.c45 || 0; $('tNReg').value = t.nReg || 0;
    $('tMed').checked = !!t.medicion; $('tTipoC').value = t.tipoCable || ''; $('tTipoA').value = t.tipoAlim || '';
    $('tSis').disabled = !!(id && (P().circuitos.some((c) => c.tab === id) || hijos(id).length));
    $('tFuente').value = fu.tipo; $('tFTxt').value = fu.texto || ''; numManual = !!fu.num;
    pintarFuente();
    if (fu.tipo === 'transformador') $('tFTr').value = fu.ref || '';
    if (fu.tipo === 'tablero' && [...$('tFRef').options].some((o) => o.value === fu.ref)) { $('tFRef').value = fu.ref; $('tFNum').value = fu.num || ''; }
    $('dTab').showModal();
  }
  let numManual = false;
  function candidatos() {
    const sis = $('tSis').value, [vff, vfn] = $('tTens').value.split('/').map(Number);
    return P().tableros.filter((s) => s.id !== tabEdit && !(tabEdit && esDescendiente(s.id, tabEdit)) && s.vff === vff && s.vfn === vfn && !(sis === '3F-4H' && s.sis !== '3F-4H'));
  }
  function sugerirNum() { if (numManual) return; const id = $('tFRef').value; $('tFNum').value = id ? siguienteNum(id, tabEdit) : ''; }
  function pintarFuente() {
    const tipo = $('tFuente').value;
    $('tFTxtL').hidden = !(tipo === 'transformador' || tipo === 'medidor' || tipo === 'otro');
    $('tFRefL').hidden = $('tFNumL').hidden = tipo !== 'tablero';
    $('tFTrL').hidden = tipo !== 'transformador';
    if (tipo === 'transformador') {
      const prev = $('tFTr').value;
      $('tFTr').innerHTML = '<option value="">Sin ficha (solo texto)</option>' + P().transformadores.map((x) => '<option value="' + x.id + '">' + esc(x.nombre) + ' (' + n0(x.kva) + ' kVA)</option>').join('');
      $('tFTr').value = P().transformadores.some((x) => x.id === prev) ? prev : '';
    }
    if (tipo === 'tablero') {
      const cs = candidatos(), prev = $('tFRef').value;
      $('tFRef').innerHTML = cs.length ? cs.map((s) => '<option value="' + s.id + '">' + esc(s.nombre) + ' (' + s.sis + ', ' + s.vff + '/' + s.vfn + ' V)</option>').join('') : '<option value="">No hay tableros compatibles</option>';
      if (cs.some((s) => s.id === prev)) $('tFRef').value = prev;
      sugerirNum();
      $('tFHint').textContent = cs.length ? 'Solo aparecen tableros con la misma tensión. El alimentador de este tablero ocupará un circuito en el tablero fuente.' :
        'No hay otro tablero con ' + $('tTens').value.replace('/', ' / ') + ' V. Crea uno o usa un transformador como fuente.';
    } else $('tFHint').textContent = '';
  }
  function guardarTablero(e) {
    e.preventDefault();
    const nombre = $('tNom').value.trim();
    if (!nombre) { aviso('Escribe el nombre del tablero.', true); return; }
    if (P().tableros.some((x) => x.nombre.toLowerCase() === nombre.toLowerCase() && x.id !== tabEdit)) { aviso('Ya existe un tablero con ese nombre.', true); return; }
    const [vff, vfn] = $('tTens').value.split('/').map(Number);
    const num = (id, d, lo, hi) => { const v = parseFloat($(id).value); return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
    const datos = { nombre, sis: $('tSis').value, vff, vfn, kA: num('tKa', 10, 1, 200), L: num('tL', 20, 0.1, 5000), amb: num('tAmb', 35, -10, 80),
      aisl: parseInt($('tAisl').value, 10), rac: parseInt($('tRac').value, 10), mat: $('tMat').value, vd: parseFloat($('tVd').value), fd: num('tFd', 100, 1, 100), cont: $('tCont').checked,
      c90: Math.round(num('tC90', 0, 0, 50)), c45: Math.round(num('tC45', 0, 0, 50)), nReg: Math.round(num('tNReg', 0, 0, 30)) };
    const tipo = $('tFuente').value; let fuente = SIN_FUENTE();
    if (tipo === 'tablero') {
      const ref = $('tFRef').value;
      if (!ref) { aviso('Elige el tablero fuente.', true); return; }
      const num = $('tFNum').value.trim() || siguienteNum(ref, tabEdit);
      const ocupado = P().circuitos.some((c) => c.tab === ref && c.num === num) || hijos(ref).some((x) => x.id !== tabEdit && x.fuente.num === num);
      if (ocupado && !confirm('El circuito ' + num + ' ya está ocupado en ' + tabl(ref).nombre + '. ¿Continuar?')) return;
      const prev = tabEdit && tabl(tabEdit).fuente;
      fuente = { tipo, ref, texto: '', num, fase: (prev && prev.ref === ref && prev.fase) || 'auto' };
    } else if (tipo) fuente = { tipo, ref: tipo === 'transformador' ? ($('tFTr').value || null) : null, texto: $('tFTxt').value.trim(), num: '', fase: 'auto' };
    datos.fuente = fuente;
    datos.medicion = $('tMed').checked; datos.tipoCable = $('tTipoC').value.trim(); datos.tipoAlim = $('tTipoA').value.trim();
    let t;
    if (tabEdit) { t = tabl(tabEdit); Object.assign(t, datos); }
    else { t = Object.assign({ id: uid() }, datos); P().tableros.push(t); }
    guardar(); $('dTab').close();
    pintarSelTab();
    if (tabDesdeCalc) { $('cTab').value = t.id; alCambiarTablero(); }
    else aplicarTablero();
    pintarTab(); pintarCuadro();
    aviso('Tablero guardado');
  }

  // ---------- Transformadores ----------
  let trEdit = null;
  function abrirTrafo(id) {
    trEdit = id;
    const t = id ? trafo(id) : { nombre: 'E-' + String(P().transformadores.length + 1).padStart(2, '0'), kva: 225, sis: '3F-4H', conexion: 'Y-Y', vmt: '13.2KV', vbt: '220/127V', fd: 100 };
    $('dtrTit').textContent = id ? 'Editar transformador' : 'Nuevo transformador';
    $('trNom').value = t.nombre; $('trKva').value = t.kva; $('trSis').value = t.sis; $('trCon').value = t.conexion; $('trVmt').value = t.vmt; $('trVbt').value = t.vbt; $('trFd').value = t.fd;
    $('dTr').showModal();
  }
  function guardarTrafo(e) {
    e.preventDefault();
    const nombre = $('trNom').value.trim();
    if (!nombre) { aviso('Escribe el nombre del transformador.', true); return; }
    if (P().transformadores.some((x) => x.nombre.toLowerCase() === nombre.toLowerCase() && x.id !== trEdit)) { aviso('Ya existe un transformador con ese nombre.', true); return; }
    const num = (id, d, lo, hi) => { const v = parseFloat($(id).value); return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
    const datos = { nombre, kva: num('trKva', 225, 1, 100000), sis: $('trSis').value, conexion: $('trCon').value.trim(), vmt: $('trVmt').value.trim(), vbt: $('trVbt').value.trim(), fd: num('trFd', 100, 1, 100) };
    if (trEdit) Object.assign(trafo(trEdit), datos); else P().transformadores.push(Object.assign({ id: uid() }, datos));
    guardar(); $('dTr').close(); pintarTab(); if (window.Unifilar && !$('vUnif').hidden) Unifilar.pintar(); aviso('Transformador guardado');
  }

  // ---------- Vista: Cuadro de cargas ----------
  function filasCuadro(t, S) {
    return S.lista.map((x) => {
      const base = { num: x.c.num, nom: x.c.nombre || '', derivado: !!x.c.derivado };
      if (!x.r) return Object.assign(base, { error: x.error });
      const r = x.r, ph = S.asig.get(x.c.id) || [];
      return Object.assign(base, {
        W: x.W, VA: x.VA, fd: x.fd, dem: x.demVA, I: r.I, fases: ph.join('-'), porFase: S.fases.map((f) => ph.includes(f) ? x.W / ph.length : 0),
        itm: r.polos + 'P-' + r.itm + 'A', tubo: (r.nPar > 1 ? r.nPar + '×' : '') + r.tubo[0],
        cf: calN(r, r.sF), cn: r.neu ? calN(r, r.neu.size) : '-', ct: r.gSize, mat: x.mat + (x.matT !== x.mat ? ' (tierra ' + x.matT + ')' : ''),
        L: x.L, e: r.fin.e, tOp: r.fin.tOp, angTramo: r.angTramo, derivado: !!x.c.derivado
      });
    });
  }
  function pintarCuadro() {
    const v = $('vCuadro'); if (!v || !D) return;
    const pr = P(); if (!pr.tableros.some((t) => t.id === tabCuadro)) tabCuadro = pr.tableros.length ? pr.tableros[0].id : '';
    if (!pr.tableros.length) { v.innerHTML = '<p class="msg">Crea un tablero y guarda circuitos para ver el cuadro de cargas.</p>'; return; }
    const t = tabl(tabCuadro), S = calcularTablero(t), filas = filasCuadro(t, S), nf = S.fases.length;
    const logo = (document.querySelector('.brand img') || {}).src || '';
    let h = '<label class="noprint"><span>Tablero</span><select id="qTab">' + pr.tableros.map((x) => '<option value="' + x.id + '"' + (x.id === t.id ? ' selected' : '') + '>' + esc(x.nombre) + '</option>').join('') + '</select></label>' +
      '<div class="btns noprint"><button type="button" class="main" data-a="q-print">Imprimir o guardar PDF</button><button type="button" data-a="q-csv">Descargar CSV</button></div>';
    h += '<div id="qArea" class="print-area"><div class="qhead">' + (logo ? '<img src="' + logo + '" alt="D3" height="40">' : '') + '<div><b>CUADRO DE CARGAS</b><br>Tablero ' + esc(t.nombre) + '</div></div>' +
      '<table class="kv"><tr><td>Proyecto</td><td>' + esc(pr.nombre) + '</td><td>Ubicación</td><td>' + esc(pr.ubicacion) + '</td></tr>' +
      '<tr><td>Proyectó</td><td>' + esc(pr.ing) + '</td><td>Fecha</td><td>' + esc(pr.fecha) + '</td></tr>' +
      '<tr><td>Sistema</td><td>' + t.sis + ', ' + t.vff + '/' + t.vfn + ' V</td><td>Cap. interruptiva</td><td>' + t.kA + ' kA</td></tr>' +
      (fuenteTxt(t) ? '<tr><td>Alimentado desde</td><td colspan="3">' + esc(fuenteTxt(t)) + '</td></tr>' : '') +
      (validaFuente(t) ? '<tr><td>Revisar</td><td colspan="3" class="bad">' + esc(validaFuente(t)) + '</td></tr>' : '') + '</table>';
    if (!filas.length) { h += '<p class="msg">Este tablero no tiene circuitos. Guárdalos desde la pestaña Calcular.</p></div>'; v.innerHTML = h; return; }
    h += '<div class="tw"><table class="cuadro"><thead><tr><th rowspan="2">No.</th><th rowspan="2">Servicio</th><th rowspan="2">W</th><th rowspan="2">VA</th><th rowspan="2">FD %</th><th rowspan="2">Dem. (VA)</th><th rowspan="2">I (A)</th><th rowspan="2">Fase</th>' +
      '<th colspan="' + nf + '">Balanceo (W)</th><th rowspan="2">ITM</th><th rowspan="2">Tubo (mm)</th><th rowspan="2">kA</th><th colspan="3">Calibre</th><th rowspan="2">Material</th><th rowspan="2">L (m)</th><th rowspan="2">e %</th><th rowspan="2">T. op (°C)</th></tr><tr>' +
      S.fases.map((f) => '<th>' + f + '</th>').join('') + '<th>Fase</th><th>Neutro</th><th>Tierra</th></tr></thead><tbody>';
    filas.forEach((f) => {
      if (f.error) { h += '<tr' + (f.derivado ? ' class="der"' : '') + '><td>' + esc(f.num) + '</td><td>' + esc(f.nom) + '</td><td colspan="' + (17 + nf) + '" class="bad">Revisar datos: ' + esc(f.error) + '</td></tr>'; return; }
      h += '<tr' + (f.derivado ? ' class="der"' : '') + '><td>' + esc(f.num) + '</td><td class="l">' + esc(f.nom) + '</td><td>' + n0(f.W) + '</td><td>' + n0(f.VA) + '</td><td>' + n0(f.fd) + '</td><td>' + n0(f.dem) + '</td><td>' + fmt(f.I, 1) + '</td><td>' + f.fases + '</td>' +
        f.porFase.map((x) => '<td>' + (x ? n0(x) : '') + '</td>').join('') + '<td>' + f.itm + '</td><td>' + f.tubo + '</td><td>' + t.kA + '</td><td>' + f.cf + '</td><td>' + f.cn + '</td><td>' + f.ct + '</td><td>' + f.mat + '</td><td>' + n0(f.L) + '</td><td>' + fmt(f.e, 2) + '</td><td>' + fmt(f.tOp, 1) + '</td></tr>';
    });
    h += '</tbody><tfoot><tr><td colspan="2">Total del tablero</td><td>' + n0(S.totW) + '</td><td>' + n0(S.totVA) + '</td><td>' + n0(t.fd) + '</td><td>' + n0(S.demVA) + '</td><td></td><td></td>' +
      S.fases.map((f) => '<td>' + n0(S.carga[f]) + '</td>').join('') + '<td colspan="10"></td></tr></tfoot></table></div>';
    h += '<p class="resumen2">W y VA son cargas instaladas al 100 %. El factor de demanda del tablero (' + n0(t.fd) + ' %) se aplica a la suma de las instaladas, incluida la de los subtableros; la columna Dem. de cada subtablero es su propia demanda. Desbalance entre fases: <b>' + fmt(S.desb, 1) + ' %</b>. Calibres en AWG o kcmil.</p>';
    h += alimHTML(t, S);
    h += '</div>';
    v.innerHTML = h;
  }
  function alimHTML(t, S) {
    let h = '<div class="alim"><h3>Alimentador del tablero</h3>';
    const a = S.alim;
    if (!a) return h + '<p class="msg">Sin circuitos.</p></div>';
    if (a.error) return h + '<p class="msg err">' + esc(a.error) + '</p></div>';
    const mat = t.mat;
    const nF = SYS[t.sis].fases * a.nPar;
    h += '<table class="kv"><tr><td>Carga instalada</td><td>' + n0(S.totW) + ' W, ' + n0(S.totVA) + ' VA</td><td>Factor de demanda</td><td>' + n0(t.fd) + ' %</td></tr>' +
      '<tr><td>Carga demandada</td><td>' + n0(S.demW) + ' W, ' + n0(S.demVA) + ' VA</td><td>Corriente de diseño</td><td>' + fmt(a.Idis, 1) + ' A</td></tr>' +
      '<tr><td>Longitud</td><td>' + n0(t.L) + ' m</td><td></td><td></td></tr>' +
      '<tr><td>Fases</td><td>' + nF + ' × ' + sz(a.sF) + ' ' + mat + '</td><td>Neutro</td><td>' + (a.neu ? (a.nPar) + ' × ' + sz(a.neu.size) + ' ' + mat : '-') + '</td></tr>' +
      '<tr><td>Tierra</td><td>' + a.nPar + ' × ' + sz(a.gSize) + ' ' + mat + '</td><td>Tubo</td><td>' + (a.nPar > 1 ? a.nPar + ' × ' : '') + a.tubo[0] + ' mm</td></tr>' +
      '<tr><td>Interruptor principal</td><td>' + a.polos + 'P ' + a.itm + ' A, ' + t.kA + ' kA</td><td>Caída de tensión</td><td>' + fmt(a.fin.e, 2) + ' % (máx. ' + t.vd + ' %)</td></tr>' +
      '<tr><td>Temp. op. / hotspot</td><td>' + fmt(a.fin.tOp, 1) + ' °C / ' + fmt(a.fin.tHotspot, 1) + ' °C</td><td>Dobleces / tramo</td><td>' + fmt(a.angTramo, 0) + '° (' + a.angTot + '° tot., ' + a.nReg + ' reg.)</td></tr></table>';
    if (a.warns && a.warns.length) h += '<ul class="alerts noprint">' + a.warns.map((w) => '<li>' + esc(w) + '</li>').join('') + '</ul>';
    return h + '</div>';
  }

  function csv() {
    const pr = P(), t = tabl(tabCuadro); if (!t) return;
    const S = calcularTablero(t), filas = filasCuadro(t, S);
    const q = (x) => { const s = String(x == null ? '' : x); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const rows = [['CUADRO DE CARGAS'], ['Proyecto', pr.nombre], ['Ubicación', pr.ubicacion], ['Proyectó', pr.ing], ['Fecha', pr.fecha],
      ['Tablero', t.nombre], ['Sistema', t.sis + ' ' + t.vff + '/' + t.vfn + ' V'], ['Alimentado desde', fuenteTxt(t)], ['Cap. interruptiva (kA)', t.kA], [],
      ['No.', 'Servicio', 'W', 'VA', 'FD %', 'Demandada (VA)', 'I (A)', 'Fase'].concat(S.fases.map((f) => 'W fase ' + f), ['ITM', 'Tubo (mm)', 'kA', 'Calibre fase', 'Calibre neutro', 'Calibre tierra', 'Material', 'L (m)', 'e %', 'T. op (°C)'])];
    filas.forEach((f) => {
      if (f.error) rows.push([f.num, f.nom, 'Revisar datos']);
      else rows.push([f.num, f.nom, +f.W.toFixed(2), +f.VA.toFixed(2), f.fd, +f.dem.toFixed(2), +f.I.toFixed(2), f.fases].concat(f.porFase.map((x) => x ? +x.toFixed(2) : ''), [f.itm, f.tubo, t.kA, f.cf, f.cn, f.ct, f.mat, f.L, +f.e.toFixed(3), +f.tOp.toFixed(1)]));
    });
    rows.push(['Total del tablero', '', +S.totW.toFixed(2), +S.totVA.toFixed(2), t.fd, +S.demVA.toFixed(2), '', ''].concat(S.fases.map((f) => +S.carga[f].toFixed(2))));
    rows.push(['Carga demandada (W)', +S.demW.toFixed(2)], ['Desbalance (%)', +S.desb.toFixed(2)]);
    const a = S.alim;
    if (a && !a.error) rows.push([], ['Alimentador'], ['Fases', (SYS[t.sis].fases * a.nPar) + ' x ' + sz(a.sF) + ' ' + t.mat], ['Neutro', a.neu ? a.nPar + ' x ' + sz(a.neu.size) + ' ' + t.mat : '-'],
      ['Tierra', a.nPar + ' x ' + sz(a.gSize) + ' ' + t.mat], ['Tubo (mm)', (a.nPar > 1 ? a.nPar + ' x ' : '') + a.tubo[0]], ['Interruptor principal', a.polos + 'P ' + a.itm + ' A, ' + t.kA + ' kA'], ['Caída de tensión (%)', +a.fin.e.toFixed(3)]);
    descargar('cuadro-' + t.nombre.replace(/[^\w-]+/g, '_') + '.csv', '\ufeff' + rows.map((r) => r.map(q).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
  }
  function descargar(nombre, texto, tipo) {
    const blob = texto instanceof Blob ? texto : new Blob([texto], { type: tipo });
    const esMovil = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (esMovil && navigator.share && navigator.canShare) {
      try {
        const mime = (tipo || blob.type || 'application/octet-stream').split(';')[0];
        const file = new File([blob], nombre, { type: mime });
        if (navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: nombre }).catch((err) => {
            if (err && err.name !== 'AbortError') descargaDirecta(nombre, blob);
          });
          return;
        }
      } catch (e) {}
    }
    descargaDirecta(nombre, blob);
  }
  function descargaDirecta(nombre, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nombre;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // ---------- Eventos ----------
  function eventos() {
    document.querySelectorAll('#tabs button').forEach((b) => { b.onclick = () => ir(b.dataset.v); });
    $('cTab').addEventListener('change', alCambiarTablero);
    $('cNum').addEventListener('input', () => { numAuto = false; });
    $('f').addEventListener('reset', () => setTimeout(alReset, 0));
    $('fTab').addEventListener('submit', guardarTablero);
    $('tCancel').onclick = () => $('dTab').close();
    $('fTr').addEventListener('submit', guardarTrafo);
    $('trCancel').onclick = () => $('dTr').close();
    $('tSis').addEventListener('change', () => { $('tTens').value = $('tSis').value === '1F-3H' ? '240/120' : '220/127'; pintarFuente(); });
    $('tTens').addEventListener('change', pintarFuente);
    $('tFuente').addEventListener('change', () => { numManual = false; pintarFuente(); });
    $('tFRef').addEventListener('change', () => { numManual = false; sugerirNum(); });
    $('tFNum').addEventListener('input', () => { numManual = true; });

    const vt = $('vTab');
    vt.addEventListener('input', (e) => {
      const pr = P(), id = e.target.id;
      if (id === 'pNom') { pr.nombre = e.target.value; const o = $('pSel').selectedOptions[0]; if (o) o.textContent = pr.nombre; }
      else if (id === 'pUbi') pr.ubicacion = e.target.value;
      else if (id === 'pIng') pr.ing = e.target.value;
      else if (id === 'pFec') pr.fecha = e.target.value;
      else return;
      guardar();
    });
    vt.addEventListener('change', (e) => {
      const el = e.target;
      if (el.id === 'pSel') { D.actual = el.value; edit = null; guardar(); refrescar(); }
      else if (el.id === 'bkFile') importar(el.files[0]);
      else if (el.dataset.a === 'fase-h') { const hj = tabl(el.closest('[data-h]').dataset.h); hj.fuente.fase = el.value; guardar(); pintarCuadro(); }
      else if (el.dataset.a === 'fase') { const c = circ(el.closest('[data-c]').dataset.c); c.fase = el.value; guardar(); pintarCuadro(); }
    });
    vt.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-a]'); if (!b) return;
      const a = b.dataset.a, tid = b.closest('[data-t]') && b.closest('[data-t]').dataset.t, cid = b.closest('[data-c]') && b.closest('[data-c]').dataset.c, hid = b.closest('[data-h]') && b.closest('[data-h]').dataset.h, trid = b.closest('[data-tr]') && b.closest('[data-tr]').dataset.tr;
      if (a === 'p-nuevo') {
        const n = prompt('Nombre del proyecto'); if (!n || !n.trim()) return;
        const id = uid(); D.proyectos.push({ id, nombre: n.trim(), ubicacion: '', ing: P().ing, fecha: hoy(), tableros: [], circuitos: [], transformadores: [], plano: PLANO0() });
        D.actual = id; guardar(); refrescar();
      } else if (a === 'p-del') {
        if (!confirm('¿Eliminar el proyecto "' + P().nombre + '" con todos sus tableros y circuitos?')) return;
        D.proyectos = D.proyectos.filter((p) => p.id !== D.actual);
        if (!D.proyectos.length) D.proyectos = datosNuevos().proyectos;
        D.actual = D.proyectos[0].id; edit = null; guardar(); refrescar();
      } else if (a === 'bk-exp') descargar('calculos-d3-' + hoy() + '.json', JSON.stringify(D, null, 1), 'application/json');
      else if (a === 'bk-imp') $('bkFile').click();
      else if (a === 'tr-nuevo') abrirTrafo(null);
      else if (a === 'tr-edit') abrirTrafo(trid);
      else if (a === 'tr-del') {
        const tr = trafo(trid), bs = P().tableros.filter((x) => x.fuente && x.fuente.tipo === 'transformador' && x.fuente.ref === trid);
        if (!confirm('¿Eliminar el transformador ' + tr.nombre + '?' + (bs.length ? ' Alimenta a ' + bs.map((x) => x.nombre).join(', ') + ', que quedarán sin ficha de transformador.' : ''))) return;
        bs.forEach((x) => { x.fuente.ref = null; });
        P().transformadores = P().transformadores.filter((x) => x.id !== trid); guardar(); pintarTab();
      }
      else if (a === 't-nuevo') abrirTablero(null, false);
      else if (a === 't-edit') abrirTablero(tid, false);
      else if (a === 't-del') {
        const t = tabl(tid);
        if (!confirm('¿Eliminar el tablero ' + t.nombre + ' y sus circuitos?')) return;
        const hs = hijos(tid);
        if (hs.length && !confirm(t.nombre + ' alimenta a ' + hs.map((x) => x.nombre).join(', ') + '. Esos tableros quedarán sin fuente. ¿Eliminar de todos modos?')) return;
        hs.forEach((x) => { x.fuente = SIN_FUENTE(); });
        P().tableros = P().tableros.filter((x) => x.id !== tid); P().circuitos = P().circuitos.filter((c) => c.tab !== tid);
        guardar(); refrescar();
      } else if (a === 't-add') { pintarSelTab(); $('cTab').value = tid; edit = null; numAuto = true; $('cNom').value = ''; aplicarTablero(); $('cNum').value = siguienteNum(tid); ir('calc'); render(); }
      else if (a === 't-cuadro') { tabCuadro = tid; ir('cuadro'); }
      else if (a === 'h-abrir') { tabCuadro = hid; ir('cuadro'); }
      else if (a === 'c-edit') editarCirc(cid);
      else if (a === 'c-dup') {
        const c = circ(cid), copia = JSON.parse(JSON.stringify(c)); copia.id = uid(); copia.num = siguienteNum(c.tab); copia.nombre = (c.nombre || '') + ' (copia)';
        P().circuitos.push(copia); guardar(); pintarTab(); pintarCuadro(); aviso('Duplicado como ' + copia.num);
      } else if (a === 'c-del') {
        if (!confirm('¿Eliminar el circuito ' + circ(cid).num + '?')) return;
        P().circuitos = P().circuitos.filter((c) => c.id !== cid); if (edit === cid) edit = null; guardar(); pintarTab(); pintarCuadro(); render();
      }
    });
    $('vCuadro').addEventListener('change', (e) => { if (e.target.id === 'qTab') { tabCuadro = e.target.value; pintarCuadro(); } });
    $('vCuadro').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-a]'); if (!b) return;
      if (b.dataset.a === 'q-print') window.print(); else if (b.dataset.a === 'q-csv') csv();
    });
  }
  function importar(f) {
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = JSON.parse(rd.result);
        if (!d || !Array.isArray(d.proyectos) || !d.proyectos.length) throw new Error('formato');
        if (!confirm('Esto reemplaza los datos actuales de este dispositivo por el respaldo. ¿Continuar?')) return;
        D = d; normalizar(D); if (!D.proyectos.some((p) => p.id === D.actual)) D.actual = D.proyectos[0].id;
        guardar(); edit = null; refrescar(); aviso('Respaldo importado');
      } catch (e) { aviso('El archivo no es un respaldo válido.', true); }
    };
    rd.readAsText(f);
  }

  eventos();
  window.Circuitos = { cargar, alRenderizar, alReset, ir, _datos: () => D, _tablero: calcularTablero,
    api: { P, tabl, calcularTablero, fuenteTxt, validaFuente, hijos, trafo, n0, aviso, guardar, descargar } };
})();
