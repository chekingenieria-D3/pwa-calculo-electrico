/* Diagrama unifilar generado desde transformadores, tableros y circuitos.
   Se arma una lista de primitivas (líneas, textos, círculos) y se exporta a SVG, PNG o DXF. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const api = () => window.Circuitos && window.Circuitos.api;
  const ROW = 7, TH = 2.4;
  let sel = '', zoom = window.innerWidth < 700 ? 2.5 : 1, ultimo = null;

  // ---------- Datos ----------
  function origenes() {
    const pr = api().P();
    if (!pr.tableros.length) return [];
    return [{ v: 'all', txt: 'Todo el proyecto (cadena completa)' }].concat(pr.transformadores.map((t) => ({ v: 't:' + t.id, txt: 'Transformador ' + t.nombre })))
      .concat(pr.tableros.map((t) => ({ v: 'b:' + t.id, txt: 'Tablero ' + t.nombre })));
  }
  const tipoDef = (aisl, mat) => ['TW 60', 'THW-LS 75', 'THHW-LS 90'][aisl] + (mat === 'Al' ? ' Al' : '');
  function cableTxt(r, sis) {
    const p = [SYS[sis].fases + '-#' + r.sF];
    if (r.neu) p.push('1-#' + r.neu.size);
    p.push('1-#' + r.gSize);
    const s = p.join(', ');
    return r.nPar > 1 ? r.nPar + '×(' + s + ')' : s;
  }
  function wrap(t, n) {
    const out = []; let cur = '';
    String(t).split(/\s+/).forEach((w) => { if ((cur + ' ' + w).trim().length > n && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); });
    if (cur) out.push(cur);
    return out;
  }
  function filasDe(b, S) {
    const a = api(), fm = (x, d) => fmt(x, d);
    return S.lista.map((x) => {
      const base = { carga: x.c.num, serv: x.c.nombre || '' };
      if (!x.r) return Object.assign(base, { error: x.error || 'Revisar datos' });
      const r = x.r, sis = x.c.derivado ? a.tabl(x.c.derivado).sis : x.c.p.sis;
      const aisl = x.c.derivado ? a.tabl(x.c.derivado).aisl : x.c.p.aisl;
      return Object.assign(base, {
        itm: r.polos + 'X' + r.itm + ' A', cable: cableTxt(r, sis), tipo: b.tipoCable || tipoDef(aisl, x.mat),
        I: fm(r.I, 2) + ' A', e: fm(r.fin.e, 2) + '%', L: fm(x.L, 2) + ' m', kw: fm(x.W / 1000, 2) + ' kW', kwN: x.W / 1000
      });
    });
  }

  // ---------- Primitivas ----------
  function lienzo() {
    const p = [];
    return {
      p,
      L: (x1, y1, x2, y2, o) => p.push(Object.assign({ t: 'l', x1, y1, x2, y2 }, o || {})),
      R: (x, y, w, h, o) => p.push(Object.assign({ t: 'r', x, y, w, h }, o || {})),
      T: (x, y, s, o) => p.push(Object.assign({ t: 't', x, y, s: String(s), h: TH, a: 'l' }, o || {})),
      C: (x, y, r, o) => p.push(Object.assign({ t: 'c', x, y, r }, o || {})),
      I: (x, y, w, h, href) => p.push({ t: 'i', x, y, w, h, href })
    };
  }
  function tierra(c, x, y) {
    c.L(x, y, x, y + 3.5, { ly: 'SIMBOLOS' });
    [[6, 0], [4, 1.4], [2, 2.8]].forEach((q) => c.L(x - q[0] / 2, y + 3.5 + q[1], x + q[0] / 2, y + 3.5 + q[1], { ly: 'SIMBOLOS' }));
  }
  function logoURI() {
    const im = document.querySelector('.brand img');
    if (!im) return '';
    if (/^data:/.test(im.src)) return im.src;
    try { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0); return c.toDataURL('image/png'); }
    catch (e) { return im.src; }
  }

  // ---------- Dibujo ----------
  let incl = true;
  function nodoDe(b, lvl, vis) {
    const a = api(), S = a.calcularTablero(b), filas = filasDe(b, S), hijos = [];
    if (incl) S.lista.forEach((x, i) => {
      if (!x.c.derivado || !x.r) return;
      const hb = a.tabl(x.c.derivado);
      if (hb && !vis.has(hb.id)) { vis.add(hb.id); hijos.push({ row: i, nodo: nodoDe(hb, lvl + 1, vis) }); }
    });
    return { b, S, filas, hijos, h: 22 + filas.length * ROW + 12 };
  }
  function gruposDe() {
    const a = api(), pr = a.P(), [tipo, id] = String(sel).split(':'), out = [];
    const mk = (kind, obj, boards) => { const vis = new Set(boards.map((b) => b.id)); return { kind, obj, nodos: boards.map((b) => nodoDe(b, 1, vis)) }; };
    const deTr = (tr) => pr.tableros.filter((b) => b.fuente && b.fuente.tipo === 'transformador' && b.fuente.ref === tr.id);
    if (sel === 'all') {
      pr.transformadores.forEach((tr) => { const bs = deTr(tr); if (bs.length) out.push(mk('t', tr, bs)); });
      pr.tableros.filter((b) => !(b.fuente && b.fuente.tipo === 'tablero' && a.validaFuente(b) === ''))
        .filter((b) => !(b.fuente && b.fuente.tipo === 'transformador' && pr.transformadores.some((t) => t.id === b.fuente.ref)))
        .forEach((b) => out.push(mk('b', b, [b])));
      if (!out.length) return { error: 'Crea al menos un tablero para dibujar el unifilar.' };
    } else if (tipo === 't') {
      const tr = pr.transformadores.find((x) => x.id === id);
      if (!tr) return { error: 'Elige qué dibujar.' };
      const bs = deTr(tr);
      if (!bs.length) return { error: 'Este transformador todavía no alimenta ningún tablero. Asígnalo en Editar tablero, sección Fuente de alimentación.' };
      out.push(mk('t', tr, bs));
    } else if (tipo === 'b') {
      const b = a.tabl(id); if (!b) return { error: 'Elige qué dibujar.' };
      out.push(mk('b', b, [b]));
    } else return { error: 'Elige qué dibujar.' };
    return { grupos: out };
  }

  // Reparte los tableros en columnas de altura limitada (hcol). Los niveles se mantienen ordenados de izquierda a derecha.
  function disponer(grupos, GW, GAP, GX1, TBH, hcol) {
    let yS = 15, nCols = 1;
    grupos.forEach((g) => {
      // orden: cada tablero seguido de sus subtableros; se llenan columnas de arriba abajo
      const orden = [], dfs = (nd) => { orden.push(nd); nd.hijos.forEach((hj) => dfs(hj.nodo)); };
      g.nodos.forEach(dfs);
      const cols = []; let cc = null;
      orden.forEach((nd) => {
        if (!cc || (cc.nodos.length && cc.h + nd.h > hcol)) { cc = { nodos: [], h: 0 }; cols.push(cc); }
        nd.col = cols.length; nd.g = g; cc.nodos.push(nd); cc.h += nd.h + 14;
      });
      let nCh = 0;
      const cuenta = (nd) => { nd.hijos.forEach((hj) => { if (hj.nodo.col > nd.col + 1) nCh++; cuenta(hj.nodo); }); };
      g.nodos.forEach((nd) => { if (nd.col > 1) nCh++; cuenta(nd); });
      g.nCh = nCh; g.yS = yS; g.yt = yS + 50; g.yB = yS + 12 + 3.5 * nCh; g.lane = { 0: g.nodos.length }; g.m = 0;
      let bot = g.yt + 95;
      cols.forEach((cc) => { let y = g.yB; cc.nodos.forEach((nd) => { nd.gy = y; nd.gx = GX1 + (nd.col - 1) * (GW + GAP); y += nd.h + 14; }); bot = Math.max(bot, y); });
      g.bottom = bot; yS = bot + 10; nCols = Math.max(nCols, cols.length);
    });
    return { W: Math.max(841, GX1 + nCols * GW + (nCols - 1) * GAP + 15), H: Math.max(594, yS + 10 + TBH + 10), nCols };
  }
  function dibujar() {
    const a = api(), pr = a.P(), pl = pr.plano, avisos = [];
    const G = gruposDe(); if (G.error) return { error: G.error };
    const grupos = G.grupos, todos = [];
    const walk = (nd) => { todos.push(nd); nd.hijos.forEach((h) => walk(h.nodo)); };
    grupos.forEach((g) => g.nodos.forEach(walk));
    const hasServ = todos.some((nd) => nd.filas.some((f) => f.serv));
    const GW = 276 + (hasServ ? 55 : 0), GAP = 70, GX1 = 400;
    const col = { itm: 47, cable: 88, tipo: 135, I: 163, e: 183, L: 207, kw: 233, carga: 258, serv: 272 };

    // acomodo: se prueba con varias alturas de columna y se elige la que mejor aprovecha la hoja
    const TBW = 170, TBH = 46;
    let mejor = null;
    [160, 220, 280, 340, 420, 520, 660, 820, 1000, 1500].forEach((hc) => {
      const r = disponer(grupos, GW, GAP, GX1, TBH, hc), need = Math.max(r.W / 841, r.H / 594);
      if (!mejor || need < mejor.need - 0.001) mejor = { hc, need };
    });
    const dim = disponer(grupos, GW, GAP, GX1, TBH, mejor.hc), W = dim.W, H = dim.H;
    if (W > 841 || H > 594) avisos.push('La hoja mide ' + Math.round(W) + ' × ' + Math.round(H) + ' mm, más que una A1 (841 × 594). Al imprimir se ajusta al papel; el DXF conserva las medidas.');
    const entryY = (nd) => nd.gy + 22 + (Math.max(nd.filas.length - 1, 0) * ROW) / 2;
    const gutIzq = (cn) => (cn === 0 ? 340 : GX1 + (cn - 1) * (GW + GAP) + GW + 4);
    const laneX = (g, cn) => { const n = g.lane[cn] = (g.lane[cn] || 0) + 1; return gutIzq(cn) + 4 + 5 * ((n - 1) % (cn === 0 ? 10 : 12)); };
    const chanY = (g) => { g.m += 1; return g.yB - 6 - 3.5 * (g.m - 1); };
    const poli = (cv, pts) => { for (let q = 0; q < pts.length - 1; q++) cv.L(pts[q][0], pts[q][1], pts[q + 1][0], pts[q + 1][1], { c: 'b', ly: 'CONDUCTORES' }); };
    // conexión desde (x,y) de una fuente o tablero en la columna pc hacia el tablero hijo; xe = carril de salida
    const conectar = (cv, g, x, y, pc, xe, ch) => {
      const ey = entryY(ch);
      if (ch.col === pc + 1) poli(cv, [[x, y], [xe, y], [xe, ey], [ch.gx, ey]]);
      else if (ch.col === pc) { const xn = laneX(g, pc - 1), yg = ch.gy - 4; poli(cv, [[x, y], [xe, y], [xe, yg], [xn, yg], [xn, ey], [ch.gx, ey]]); }
      else { const xn = laneX(g, ch.col - 1), yc = chanY(g); poli(cv, [[x, y], [xe, y], [xe, yc], [xn, yc], [xn, ey], [ch.gx, ey]]); }
    };
    const c = lienzo();

    // marco y cuadro de datos
    c.R(5, 5, W - 10, H - 10, { lw: 0.9, ly: 'MARCO' });
    const tx = W - 5 - TBW, ty = H - 5 - TBH;
    c.R(tx, ty, TBW, TBH, { lw: 0.4, ly: 'MARCO' });
    c.L(tx, ty + 18, tx + TBW, ty + 18, { ly: 'MARCO' }); c.L(tx, ty + 27, tx + TBW, ty + 27, { ly: 'MARCO' }); c.L(tx, ty + 36.5, tx + TBW, ty + 36.5, { ly: 'MARCO' });
    c.L(tx + 40, ty, tx + 40, ty + 18, { ly: 'MARCO' }); c.L(tx + 85, ty + 27, tx + 85, ty + 36.5, { ly: 'MARCO' }); c.L(tx + 120, ty + 27, tx + 120, ty + 36.5, { ly: 'MARCO' }); c.L(tx + 85, ty + 36.5, tx + 85, ty + TBH, { ly: 'MARCO' });
    const logo = logoURI(); if (logo) c.I(tx + 2, ty + 2, 36, 14, logo);
    c.T(tx + 43, ty + 7, pr.nombre, { h: 3.2, b: 1 }); c.T(tx + 43, ty + 14, pr.ubicacion || '', { h: 2.4 });
    c.T(tx + 3, ty + 24, 'PLANO: ' + (pl.nombre || ''), { b: 1 });
    c.T(tx + 3, ty + 33.5, 'No.: ' + (pl.numero || '')); c.T(tx + 87, ty + 33.5, 'ESCALA: ' + (pl.escala || 'S/E')); c.T(tx + 122, ty + 33.5, 'FECHA: ' + (pr.fecha || ''));
    c.T(tx + 3, ty + 43, 'PROYECTÓ: ' + (pr.ing || '')); c.T(tx + 87, ty + 43, 'DIBUJÓ: ' + (pl.dibujo || ''));

    // cada grupo: fuente, tablas de carga demandada y alimentadores
    grupos.forEach((g) => {
      const yt = g.yt, nb = g.nodos.length, sx = 45;
      const nomO = g.kind === 't' ? g.obj.nombre : g.obj.nombre;
      let tr = null, fu = {}, instVA, fdO, demVA;
      if (g.kind === 't') { tr = g.obj; instVA = g.nodos.reduce((s, n) => s + n.S.totVA, 0); fdO = tr.fd; demVA = instVA * fdO / 100; fu = { tipo: 'transformador' }; }
      else { const b = g.obj, S = g.nodos[0].S; fu = b.fuente || {}; tr = (fu.tipo === 'transformador' && fu.ref) ? a.trafo(fu.ref) : null; instVA = S.totVA; fdO = b.fd; demVA = S.demVA; }
      if (tr || fu.tipo === 'transformador') {
        c.C(sx - 4.5, yt, 6, { ly: 'SIMBOLOS' }); c.C(sx + 4.5, yt, 6, { ly: 'SIMBOLOS' });
        const lin = tr ? [tr.nombre, n0v(tr.kva) + 'KVA', tr.sis, tr.conexion, tr.vmt + '-' + tr.vbt] : wrap(fu.texto || 'TRANSFORMADOR', 18);
        lin.forEach((s, i) => c.T(sx, yt + 17 + i * 4.2, s, { a: 'c', b: i === 0, h: i === 0 ? 3.2 : 2.6 }));
        tierra(c, sx + 22, yt + 6);
      } else if (fu.tipo === 'medidor') {
        c.R(sx - 6, yt - 6, 12, 12, { c: 'r', lw: 0.4, ly: 'SIMBOLOS' }); c.T(sx, yt + 1, 'M', { a: 'c', c: 'r', h: 4 });
        wrap(a.fuenteTxt(g.obj), 22).forEach((s, i) => c.T(sx, yt + 14 + i * 4.2, s, { a: 'c' }));
      } else {
        c.R(sx - 14, yt - 7, 28, 14, { lw: 0.4, ly: 'SIMBOLOS' });
        c.T(sx, yt + 1, fu.tipo === 'tablero' ? 'TABLERO' : 'FUENTE', { a: 'c', b: 1 });
        wrap(a.fuenteTxt(g.obj) || 'Fuente sin definir', 24).forEach((s, i) => c.T(sx, yt + 14 + i * 4.2, s, { a: 'c' }));
      }
      const dy = yt + 48;
      c.R(20, dy, 150, 31, { lw: 0.3, ly: 'TABLAS' });
      c.L(20, dy + 7, 170, dy + 7, { ly: 'TABLAS' }); c.L(20, dy + 17, 170, dy + 17, { ly: 'TABLAS' });
      [44, 84, 108].forEach((x) => c.L(20 + x, dy + 7, 20 + x, dy + 31, { ly: 'TABLAS' }));
      c.T(95, dy + 5, 'CARGA DEMANDADA ' + nomO, { a: 'c', b: 1 });
      c.T(42, dy + 13, 'TRANSFORMADOR', { a: 'c', h: 2.1 });
      [['CARGA', 'INSTALADA', 84], ['F.D.', '', 116], ['CAPACIDAD', 'DEMANDADA', 149]].forEach((q) => { c.T(q[2], dy + 11.5, q[0], { a: 'c', h: 2.1 }); if (q[1]) c.T(q[2], dy + 15, q[1], { a: 'c', h: 2.1 }); });
      c.T(42, dy + 25, nomO, { a: 'c' }); c.T(84, dy + 25, fmt(instVA / 1000, 2) + ' kVA', { a: 'c' });
      c.T(116, dy + 25, fmt(fdO, 2) + '%', { a: 'c' }); c.T(149, dy + 25, fmt(demVA / 1000, 2) + ' kVA', { a: 'c' });
      if (g.kind === 't' && demVA > tr.kva * 1000) avisos.push('La carga demandada de ' + tr.nombre + ' (' + fmt(demVA / 1000, 2) + ' kVA) excede su capacidad (' + n0v(tr.kva) + ' kVA).');

      // alimentadores
      const x0 = 95, xc = 58, fc = { cable: 40, tipo: 92, I: 122, e: 142, L: 168, kw: 194, carga: 222 };
      c.T(x0 + 120, yt - ROW - 6, 'DU ' + nomO, { a: 'c', b: 1, h: 2.8 });
      [['cable', 'Tamaño de cable'], ['tipo', 'Tipo de cable'], ['I', 'I (A)'], ['e', '%e'], ['L', 'Longitud'], ['kw', 'kW'], ['carga', 'CARGA']].forEach((q) => c.T(x0 + fc[q[0]], yt - ROW + 1, q[1], { a: 'c', h: 2.1 }));
      c.L(xc - 5, yt, xc, yt, { ly: 'CONDUCTORES' });
      if (nb > 1) c.L(xc, yt, xc, yt + (nb - 1) * ROW, { ly: 'CONDUCTORES' });
      let totKwF = 0;
      g.nodos.forEach((nd, k) => {
        const yk = yt + k * ROW, xv = gutIzq(0) + 4 + 5 * ((nb - 1 - k) % 10), a2 = nd.S.alim, b = nd.b;
        conectar(c, g, xc, yk, 0, xv, nd);
        totKwF += nd.S.totW / 1000;
        if (!a2 || a2.error) { c.T(x0 + fc.cable, yk - 1.6, a2 ? a2.error : 'Sin circuitos', { a: 'c', c: 'r' }); avisos.push('Alimentador de ' + b.nombre + ': ' + (a2 ? a2.error : 'el tablero no tiene circuitos') + '.'); return; }
        [['cable', cableTxt(a2, b.sis)], ['tipo', b.tipoAlim || tipoDef(b.aisl, b.mat)], ['I', fmt(a2.I, 2) + ' A'], ['e', fmt(a2.fin.e, 2) + '%'], ['L', fmt(b.L, 2) + ' m'], ['kw', fmt(nd.S.totW / 1000, 2) + ' kW'], ['carga', b.nombre]]
          .forEach((q) => c.T(x0 + fc[q[0]], yk - 1.6, q[1], { a: 'c' }));
      });
      c.T(x0 + 20, yt + nb * ROW - 1.6, 'Total general: ' + nb); c.T(x0 + fc.kw, yt + nb * ROW - 1.6, fmt(totKwF, 2) + ' kW', { a: 'c' });
    });

    // bloques de tableros y conexiones hacia sus subtableros
    todos.forEach((nd) => {
      const { gx, gy: y0, h, b, filas } = nd, n = filas.length, bx = gx + 14;
      c.R(gx, y0, GW, h, { d: 1, lw: 0.4, ly: 'TABLAS' });
      c.T(gx + 150, y0 + 6, 'DU ' + b.nombre, { a: 'c', b: 1, h: 2.8 });
      [['itm', 'ITM'], ['cable', 'Tamaño de cable'], ['tipo', 'Tipo de cable'], ['I', 'I (A)'], ['e', '%e'], ['L', 'Longitud'], ['kw', 'kW'], ['carga', 'CARGA']].forEach((q) => c.T(gx + col[q[0]], y0 + 14, q[1], { a: 'c', h: 2.1 }));
      if (hasServ) c.T(gx + col.serv, y0 + 14, 'SERVICIO', { h: 2.1 });
      c.L(gx + 38, y0 + 16.5, gx + GW - 6, y0 + 16.5, { lw: 0.2, ly: 'TABLAS' });
      const ys = (i) => y0 + 22 + i * ROW;
      if (n) { c.L(bx, ys(0), bx, ys(n - 1), { ly: 'CONDUCTORES' }); c.L(gx, entryY(nd), bx, entryY(nd), { ly: 'CONDUCTORES' }); }
      let totK = 0;
      filas.forEach((f, i) => {
        const y = ys(i); let xs = bx;
        if (b.medicion) { c.L(bx, y, bx + 3, y, { ly: 'CONDUCTORES' }); c.R(bx + 3, y - 2.6, 5.2, 5.2, { c: 'r', lw: 0.3, ly: 'SIMBOLOS' }); c.T(bx + 5.6, y + 1.1, 'M', { a: 'c', c: 'r', h: 2.8, ly: 'SIMBOLOS' }); xs = bx + 8.2; }
        c.L(xs, y, gx + 24, y, { ly: 'CONDUCTORES' });
        c.C(gx + 25.3, y, 0.8, { ly: 'SIMBOLOS' }); c.L(gx + 26, y, gx + 30.5, y - 2.4, { ly: 'SIMBOLOS' }); c.L(gx + 31.5, y, gx + 36, y, { ly: 'CONDUCTORES' });
        c.L(gx + 38, y + 2.9, gx + GW - 6, y + 2.9, { lw: 0.2, ly: 'TABLAS' });   // línea debajo del texto de cada circuito
        if (f.error) { c.T(gx + col.cable, y + 0.9, f.error, { c: 'r' }); c.T(gx + col.carga, y + 0.9, f.carga, { a: 'c' }); avisos.push(b.nombre + ', ' + f.carga + ': ' + f.error); return; }
        totK += f.kwN;
        ['itm', 'cable', 'tipo', 'I', 'e', 'L', 'kw'].forEach((q) => c.T(gx + col[q], y + 0.9, f[q], { a: 'c' }));
        c.T(gx + col.carga, y + 0.9, f.carga, { a: 'c' }); if (hasServ) c.T(gx + col.serv, y + 0.9, f.serv);
      });
      const yT = ys(n - 1) + ROW + 1;
      c.T(gx + col.itm, yT, 'Total general: ' + n, { a: 'c' }); c.T(gx + col.kw, yT, fmt(totK, 2) + ' kW', { a: 'c' });
      tierra(c, bx, y0 + h);
      // enlaces a los subtableros
      nd.hijos.forEach((hj) => {
        const xr = gx + GW, yr = ys(hj.row);
        c.C(xr, yr, 0.9, { c: 'b', ly: 'SIMBOLOS' });
        conectar(c, nd.g, xr, yr, nd.col, laneX(nd.g, nd.col), hj.nodo);
      });
    });
    return { prims: c.p, W, H, avisos };
  }
  const n0v = (x) => (Math.abs(x - Math.round(x)) < 0.005 ? String(Math.round(x)) : String(+Number(x).toFixed(2)));

  // ---------- Exportar ----------
  const COL = { k: '#000000', r: '#d00000', g: '#7a7a7a', b: '#0b57d0' };
  function aSVG(d, o) {
    o = o || {}; const f = (n) => +n.toFixed(2);
    let s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + d.W + ' ' + d.H + '"' + (o.pantalla ? ' style="display:block;width:100%;height:auto"' : ' width="' + d.W + 'mm" height="' + d.H + 'mm"') + ' font-family="Arial, Helvetica, sans-serif">';
    s += '<rect width="' + d.W + '" height="' + d.H + '" fill="#fff"/>';
    d.prims.forEach((p) => {
      const c = COL[p.c || 'k'], w = p.lw || 0.35, da = p.d ? ' stroke-dasharray="3 1.6"' : '';
      if (p.t === 'l') s += '<line x1="' + f(p.x1) + '" y1="' + f(p.y1) + '" x2="' + f(p.x2) + '" y2="' + f(p.y2) + '" stroke="' + c + '" stroke-width="' + w + '"' + da + '/>';
      else if (p.t === 'r') s += '<rect x="' + f(p.x) + '" y="' + f(p.y) + '" width="' + f(p.w) + '" height="' + f(p.h) + '" fill="none" stroke="' + c + '" stroke-width="' + w + '"' + da + '/>';
      else if (p.t === 'c') s += '<circle cx="' + f(p.x) + '" cy="' + f(p.y) + '" r="' + f(p.r) + '" fill="none" stroke="' + c + '" stroke-width="' + w + '"/>';
      else if (p.t === 't') s += '<text x="' + f(p.x) + '" y="' + f(p.y) + '" font-size="' + p.h + '" text-anchor="' + ({ l: 'start', c: 'middle', r: 'end' }[p.a]) + '"' + (p.b ? ' font-weight="bold"' : '') + ' fill="' + c + '">' + esc(p.s) + '</text>';
      else if (p.t === 'i') s += '<image href="' + p.href + '" x="' + f(p.x) + '" y="' + f(p.y) + '" width="' + f(p.w) + '" height="' + f(p.h) + '" preserveAspectRatio="xMidYMid meet"/>';
    });
    return s + '</svg>';
  }
  function aDXF(d) {
    const out = [], g = (c, v) => { out.push(String(c)); out.push(String(v)); };
    const num = (n) => (+n.toFixed(3)).toString(), Y = (y) => d.H - y;
    const ACI = { k: 7, r: 1, g: 8, b: 5 }, LAY = { MARCO: 7, CONDUCTORES: 7, SIMBOLOS: 7, TABLAS: 7, TEXTO: 7 };
    const txt = (s) => String(s).replace(/[^\x20-\x7e]/g, (ch) => '\\U+' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'));
    g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1009'); g(9, '$INSUNITS'); g(70, 4); g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'TABLES');
    g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 2);
    g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, 0); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, 0.0);
    g(0, 'LTYPE'); g(2, 'DASHED'); g(70, 0); g(3, 'Dashed'); g(72, 65); g(73, 2); g(40, 6.0); g(49, 4.0); g(49, -2.0);
    g(0, 'ENDTAB');
    g(0, 'TABLE'); g(2, 'LAYER'); g(70, Object.keys(LAY).length);
    Object.keys(LAY).forEach((n) => { g(0, 'LAYER'); g(2, n); g(70, 0); g(62, LAY[n]); g(6, 'CONTINUOUS'); });
    g(0, 'ENDTAB');
    g(0, 'TABLE'); g(2, 'STYLE'); g(70, 1); g(0, 'STYLE'); g(2, 'STANDARD'); g(70, 0); g(40, 0.0); g(41, 1.0); g(50, 0.0); g(71, 0); g(42, 2.5); g(3, 'txt'); g(4, ''); g(0, 'ENDTAB');
    g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'ENTITIES');
    const base = (p, ly) => { g(8, p.ly || ly); g(62, ACI[p.c || 'k']); if (p.d) g(6, 'DASHED'); };
    const line = (p, x1, y1, x2, y2) => { g(0, 'LINE'); base(p, 'CONDUCTORES'); g(10, num(x1)); g(20, num(Y(y1))); g(30, 0); g(11, num(x2)); g(21, num(Y(y2))); g(31, 0); };
    d.prims.forEach((p) => {
      if (p.t === 'l') line(p, p.x1, p.y1, p.x2, p.y2);
      else if (p.t === 'r') { line(p, p.x, p.y, p.x + p.w, p.y); line(p, p.x + p.w, p.y, p.x + p.w, p.y + p.h); line(p, p.x + p.w, p.y + p.h, p.x, p.y + p.h); line(p, p.x, p.y + p.h, p.x, p.y); }
      else if (p.t === 'c') { g(0, 'CIRCLE'); base(p, 'SIMBOLOS'); g(10, num(p.x)); g(20, num(Y(p.y))); g(30, 0); g(40, num(p.r)); }
      else if (p.t === 't' && p.s) {
        g(0, 'TEXT'); base(p, 'TEXTO'); g(10, num(p.x)); g(20, num(Y(p.y))); g(30, 0); g(40, num(p.h)); g(1, txt(p.s));
        if (p.a !== 'l') { g(72, p.a === 'c' ? 1 : 2); g(11, num(p.x)); g(21, num(Y(p.y))); g(31, 0); }
      }
    });
    g(0, 'ENDSEC'); g(0, 'EOF');
    return out.join('\r\n') + '\r\n';
  }
  function aPNG(d, nombre) {
    const url = URL.createObjectURL(new Blob([aSVG(d)], { type: 'image/svg+xml;charset=utf-8' })), img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = 3600; c.height = Math.round(3600 * d.H / d.W);
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => { api().descargar(nombre + '.png', b, 'image/png'); URL.revokeObjectURL(url); }, 'image/png');
    };
    img.onerror = () => api().aviso('No se pudo generar la imagen.', true);
    img.src = url;
  }

  // ---------- Vista ----------
  function pintar() {
    const v = $('vUnif'), a = api(); if (!v || !a) return;
    const pr = a.P(), op = origenes();
    if (!op.some((o) => o.v === sel)) sel = op.length ? op[0].v : '';
    if (!op.length) { v.innerHTML = '<p class="msg">Crea un tablero (pestaña Tableros) para generar su diagrama unifilar.</p>'; return; }
    const pl = pr.plano;
    v.innerHTML = '<label class="noprint"><span>Dibujar</span><select id="uSel">' + op.map((o) => '<option value="' + o.v + '"' + (o.v === sel ? ' selected' : '') + '>' + esc(o.txt) + '</option>').join('') + '</select></label>' +
      '<label class="chk noprint"><input type="checkbox" id="uCad"' + (incl ? ' checked' : '') + '><span style="margin:0;color:var(--tx)">Incluir subtableros (cadena completa)</span></label>' +
      '<div class="grid noprint"><label class="full"><span>Nombre del plano</span><input id="uNom" value="' + esc(pl.nombre) + '"></label>' +
      '<label><span>Número de plano</span><input id="uNum" value="' + esc(pl.numero) + '"></label><label><span>Escala</span><input id="uEsc" value="' + esc(pl.escala) + '"></label>' +
      '<label class="full"><span>Dibujó</span><input id="uDib" value="' + esc(pl.dibujo) + '"></label></div>' +
      '<div class="btns noprint"><button type="button" class="main" data-a="u-svg">SVG</button><button type="button" data-a="u-png">PNG</button><button type="button" data-a="u-dxf">DXF</button><button type="button" data-a="u-print">Imprimir</button></div>' +
      '<div class="btns noprint"><button type="button" data-a="u-menos">Alejar</button><button type="button" data-a="u-mas">Acercar</button><button type="button" data-a="u-fit">Ajustar</button></div>' +
      '<div class="uf-wrap"><div id="uArea" class="print-area"></div></div><ul id="uAv" class="alerts noprint"></ul>';
    redibujar();
  }
  function redibujar() {
    const area = $('uArea'); if (!area) return;
    const d = dibujar(); ultimo = d.error ? null : d;
    area.style.width = (zoom * 100) + '%';
    area.innerHTML = d.error ? '<p class="msg" style="color:#000">' + esc(d.error) + '</p>' : aSVG(d, { pantalla: true });
    $('uAv').innerHTML = d.error ? '' : d.avisos.map((w) => '<li>' + esc(w) + '</li>').join('');
  }
  const nombreArchivo = () => 'unifilar-' + (api().P().nombre || 'proyecto').replace(/[^\w-]+/g, '_') + '-' + String(sel).replace(/^[tb]:/, '').slice(0, 6);
  function iniciar() {
    const v = $('vUnif');
    let pinchDist0 = 0, zoom0 = zoom;
    v.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2 && e.target.closest('.uf-wrap')) {
        pinchDist0 = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        zoom0 = zoom;
      }
    }, { passive: true });
    v.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && pinchDist0 > 0) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        zoom = Math.min(8, Math.max(1, zoom0 * (dist / pinchDist0)));
        const area = $('uArea');
        if (area) area.style.width = (zoom * 100) + '%';
      }
    }, { passive: true });
    v.addEventListener('touchend', () => { pinchDist0 = 0; }, { passive: true });
    v.addEventListener('change', (e) => { if (e.target.id === 'uSel') { sel = e.target.value; redibujar(); } else if (e.target.id === 'uCad') { incl = e.target.checked; redibujar(); } });
    v.addEventListener('input', (e) => {
      const pl = api().P().plano, m = { uNom: 'nombre', uNum: 'numero', uEsc: 'escala', uDib: 'dibujo' }[e.target.id];
      if (!m) return; pl[m] = e.target.value; api().guardar(); redibujar();
    });
    v.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-a]'); if (!b) return;
      const x = b.dataset.a;
      if (x === 'u-mas') { zoom = Math.min(8, zoom * 1.5); redibujar(); } else if (x === 'u-menos') { zoom = Math.max(1, zoom / 1.5); redibujar(); }
      else if (x === 'u-fit') { zoom = 1; redibujar(); }
      else if (!ultimo) api().aviso('No hay dibujo que exportar.', true);
      else if (x === 'u-svg') api().descargar(nombreArchivo() + '.svg', aSVG(ultimo), 'image/svg+xml');
      else if (x === 'u-dxf') api().descargar(nombreArchivo() + '.dxf', aDXF(ultimo), 'application/dxf');
      else if (x === 'u-png') aPNG(ultimo, nombreArchivo());
      else if (x === 'u-print') window.print();
    });
  }
  if ($('vUnif')) iniciar();
  window.Unifilar = { pintar, _dibujar: dibujar, _svg: aSVG, _dxf: aDXF, _sel: (s) => { sel = s; } };
})();
