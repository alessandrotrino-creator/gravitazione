/* Disegno della scena: vista 2D dall'alto e vista 3D prospettica (stesso motore, cambia solo la proiezione) */
(function () {
  'use strict';
  const { G, U, fmt } = Grav;
  const S = Grav.sim, K = Grav.corpi, TIPI = Grav.TIPI;

  const V = Grav.vista = {
    tipo: '2d', W: 800, H: 600, dpr: 1, ctx: null, tReale: 0,
    cam2: { cx: 0, cy: 0, s: 1e-9 },
    cam3: { tx: 0, ty: 0, tz: 0, dist: 1e12, yaw: -Math.PI / 2, pitch: 0.6, fov: 50 * Math.PI / 180 },
    opz: { scie: true, scia: 'media', etichette: true, dimensioniReali: false, effetti: true, lenti: true, telo: false,
      griglia: true, campo: false, orbita: true, baricentro: false, scieRelative: false },
    effetti: [], scossa: 0, selezionato: null, seguito: null, maniglia: null, mostraManiglia: true,
    lancio: null, fantasma: null, onde: [], margini: { s: 0, d: 0 }
  };
  const LUNGHEZZE = { corta: 150, media: 600, lunga: 3000 };

  /* ---------- Colori ---------- */
  function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mescola(hex, con, t, alfa = 1) {
    const a = rgb(hex), b = rgb(con);
    return `rgba(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)},${alfa})`;
  }
  const rgba = (hex, a) => mescola(hex, hex, 0, a);

  /* ---------- Proiezione ---------- */
  let base = null;            // base della telecamera 3D, ricalcolata a ogni fotogramma
  let telo = null;            // parametri del "telo elastico"
  function calcolaBase() {
    const c = V.cam3, cp = Math.cos(c.pitch), sp = Math.sin(c.pitch), cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
    const px = c.tx + c.dist * cp * cy, py = c.ty + c.dist * cp * sy, pz = c.tz + c.dist * sp;
    const fx = -cp * cy, fy = -cp * sy, fz = -sp;
    let rx = fy, ry = -fx; const rl = Math.hypot(rx, ry) || 1; rx /= rl; ry /= rl;
    const ux = ry * fz, uy = -rx * fz, uz = rx * fy - ry * fx;           // alto = destra × avanti
    base = { px, py, pz, fx, fy, fz, rx, ry, ux, uy, uz, foc: V.H / (2 * Math.tan(c.fov / 2)) };
  }
  V.proietta = function (x, y, z, o) {
    if (V.tipo === '2d') {
      const c = V.cam2;
      o.x = V.W / 2 + (x - c.cx) * c.s; o.y = V.H / 2 - (y - c.cy) * c.s; o.k = c.s; o.z = z;
      return true;
    }
    if (telo) z += altezzaTelo(x, y);
    const b = base, dx = x - b.px, dy = y - b.py, dz = z - b.pz;
    const zc = dx * b.fx + dy * b.fy + dz * b.fz;
    if (zc < V.cam3.dist * 1e-3) return false;
    const k = b.foc / zc;
    o.x = V.W / 2 + (dx * b.rx + dy * b.ry) * k;
    o.y = V.H / 2 - (dx * b.ux + dy * b.uy + dz * b.uz) * k;
    o.k = k; o.z = -zc;
    return true;
  };
  // Dal punto dello schermo al punto del mondo sul piano orizzontale z = zp
  V.daSchermo = function (sx, sy, zp = 0) {
    if (V.tipo === '2d') { const c = V.cam2; return { x: c.cx + (sx - V.W / 2) / c.s, y: c.cy - (sy - V.H / 2) / c.s, z: zp }; }
    if (!base) calcolaBase();
    const b = base, a = (sx - V.W / 2) / b.foc, e = (V.H / 2 - sy) / b.foc;
    const dx = b.fx + b.rx * a + b.ux * e, dy = b.fy + b.ry * a + b.uy * e, dz = b.fz + b.uz * e;
    if (Math.abs(dz) < 1e-6) return null;
    const t = (zp - b.pz) / dz;
    if (t <= 0) return null;
    return { x: b.px + dx * t, y: b.py + dy * t, z: zp };
  };
  V.metriPerPixel = () => V.tipo === '2d' ? 1 / V.cam2.s : V.cam3.dist / (base ? base.foc : V.H);
  V.centro = () => V.tipo === '2d' ? { x: V.cam2.cx, y: V.cam2.cy, z: 0 } : { x: V.cam3.tx, y: V.cam3.ty, z: V.cam3.tz };
  V.inquadra = function (ampiezza, cx = 0, cy = 0, cz = 0) {
    V.cam2.cx = cx; V.cam2.cy = cy; V.cam2.s = V.W / ampiezza;
    const c = V.cam3; c.tx = cx; c.ty = cy; c.tz = cz;
    c.dist = ampiezza * V.H / (V.W * 2 * Math.tan(c.fov / 2)) * 1.1;
  };
  V.cambiaTipo = function (tipo) {
    if (tipo === V.tipo) return;
    const amp = V.W * V.metriPerPixel(), c = V.centro();
    V.tipo = tipo;
    calcolaBase();
    V.inquadra(amp, c.x, c.y, tipo === '3d' ? 0 : c.z);
  };
  V.zoom = function (f, sx, sy) {
    if (V.tipo === '2d') {
      const p = V.daSchermo(sx, sy), c = V.cam2;
      c.s = Math.min(1e3, Math.max(1e-24, c.s * f));
      if (!V.seguito) { c.cx = p.x - (sx - V.W / 2) / c.s; c.cy = p.y + (sy - V.H / 2) / c.s; }
    } else V.cam3.dist = Math.min(1e24, Math.max(1, V.cam3.dist / f));
  };
  V.sposta = function (dx, dy) {          // trascinamento della vista in pixel
    V.seguito = null;
    if (V.tipo === '2d') { V.cam2.cx -= dx / V.cam2.s; V.cam2.cy += dy / V.cam2.s; return; }
    const m = V.cam3.dist / base.foc, b = base;
    V.cam3.tx -= (b.rx * dx - b.ux * dy) * m; V.cam3.ty -= (b.ry * dx - b.uy * dy) * m; V.cam3.tz += b.uz * dy * m;
  };
  V.ruota = function (dx, dy) {
    const c = V.cam3;
    c.yaw -= dx * 0.006;
    c.pitch = Math.max(-1.5, Math.min(1.5, c.pitch + dy * 0.006));
  };

  /* ---------- Telo elastico (pozzo gravitazionale) ---------- */
  function preparaTelo() {
    if (V.tipo !== '3d' || !V.opz.telo || !S.corpi.length) { telo = null; return; }
    const ext = 2.2 * V.cam3.dist * Math.tan(V.cam3.fov / 2) * V.W / V.H;
    const passo = ext / 36;
    const L = S.corpi.map(b => ({ x: b.x, y: b.y, gm: G * b.m, s2: Math.max(b.r, passo * 0.5) ** 2 }));
    let max = 0;
    for (const b of L) { const p = b.gm / Math.sqrt(b.s2); if (p > max) max = p; }
    telo = { L, max, prof: ext * 0.16, ext, passo, zero: 0 };
    telo.zero = profondita(V.cam3.tx, V.cam3.ty);       // il centro della vista resta all'altezza del piano
  }
  function profondita(x, y) {
    let p = 0;
    for (const b of telo.L) { const dx = x - b.x, dy = y - b.y; p += b.gm / Math.sqrt(dx * dx + dy * dy + b.s2); }
    return -telo.prof * Math.pow(Math.min(1, p / telo.max), 0.5);
  }
  const altezzaTelo = (x, y) => profondita(x, y) - telo.zero * 0.6;

  /* ---------- Cielo stellato ---------- */
  const STELLE = [];
  for (let i = 0; i < 700; i++) {
    const z = Math.random() * 2 - 1, a = Math.random() * 2 * Math.PI, s = Math.sqrt(1 - z * z), l = Math.pow(Math.random(), 3);
    STELLE.push({ u: Math.random(), v: Math.random(), dx: Math.cos(a) * s, dy: Math.sin(a) * s, dz: z, l: 0.25 + 0.75 * l,
      c: ['#ffffff', '#cfe0ff', '#ffe9c9', '#ffd6d6'][i % 4] });
  }
  function disegnaStelle(ctx, lenti) {
    const W = V.W, H = V.H;
    for (const s of STELLE) {
      let x, y;
      if (V.tipo === '2d') { x = s.u * W; y = s.v * H; }
      else {
        const b = base, zc = s.dx * b.fx + s.dy * b.fy + s.dz * b.fz;
        if (zc <= 0.05) continue;
        x = W / 2 + (s.dx * b.rx + s.dy * b.ry) / zc * b.foc;
        y = H / 2 - (s.dx * b.ux + s.dy * b.uy + s.dz * b.uz) / zc * b.foc;
        if (x < -5 || y < -5 || x > W + 5 || y > H + 5) continue;
      }
      let alfa = s.l, nascosta = false, sec = null;
      for (const l of lenti) {                   // lente gravitazionale: le stelle dietro al buco nero si spostano
        const dx = x - l.x, dy = y - l.y, beta = Math.hypot(dx, dy);
        if (beta > l.te * 10) continue;
        const q = Math.sqrt(beta * beta + 4 * l.te * l.te), tp = (beta + q) / 2, tm = (q - beta) / 2, ux = dx / (beta || 1), uy = dy / (beta || 1);
        if (tm > l.ombra) sec = { x: l.x - ux * tm, y: l.y - uy * tm, a: alfa * tm / tp };
        x = l.x + ux * tp; y = l.y + uy * tp;
        alfa = Math.min(1, alfa * (1 + l.te / (beta + 1)));
        if (tp < l.ombra) nascosta = true;
      }
      if (nascosta) continue;
      ctx.fillStyle = rgba(s.c, alfa);
      const d = s.l > 0.8 ? 1.6 : 1.1;
      ctx.fillRect(x, y, d, d);
      if (sec) { ctx.fillStyle = rgba(s.c, sec.a); ctx.fillRect(sec.x, sec.y, d, d); }
    }
  }

  /* ---------- Scie ---------- */
  V.aggiornaScie = function () {
    const max = LUNGHEZZE[V.opz.scia] * 3, rel = V.opz.scieRelative, mpp = V.metriPerPixel();
    for (const b of S.corpi) {
      const d = b._dom;
      const rif = rel ? d : null, idRif = rif ? rif.id : 0;
      if (b.sciaRif !== idRif) { b.scia = []; b.sciaRif = idRif; }
      const x = b.x - (rif ? rif.x : 0), y = b.y - (rif ? rif.y : 0), z = b.z - (rif ? rif.z : 0);
      const sc = b.scia, n = sc.length;
      const passo = d ? 0.012 * Math.hypot(b.x - d.x, b.y - d.y, b.z - d.z) : 2 * mpp;
      if (n && Math.hypot(x - sc[n - 3], y - sc[n - 2], z - sc[n - 1]) < passo) continue;
      sc.push(x, y, z);
      if (sc.length > max * 1.1) sc.splice(0, sc.length - max);
    }
  };
  V.cancellaScie = () => S.corpi.forEach(b => { b.scia = []; });

  const P = { x: 0, y: 0, k: 0, z: 0 }, Q = { x: 0, y: 0, k: 0, z: 0 };

  function disegnaScia(ctx, b) {
    const sc = b.scia, n = sc.length / 3;
    if (n < 2) return;
    const rif = V.opz.scieRelative && b.sciaRif ? S.trova(b.sciaRif) : null;
    const ox = rif ? rif.x : 0, oy = rif ? rif.y : 0, oz = rif ? rif.z : 0;
    const col = b.tipo === 'buco' ? '#b58cff' : b.colore, pezzi = 8;
    ctx.lineWidth = 1.3;
    for (let p = 0; p < pezzi; p++) {
      const i0 = Math.floor(p * (n - 1) / pezzi), i1 = Math.floor((p + 1) * (n - 1) / pezzi);
      ctx.strokeStyle = rgba(col, 0.08 + 0.6 * (p + 1) / pezzi);
      ctx.beginPath();
      let su = false;
      for (let i = i0; i <= i1; i++) {
        if (!V.proietta(sc[3 * i] + ox, sc[3 * i + 1] + oy, sc[3 * i + 2] + oz, P)) { su = false; continue; }
        if (su) ctx.lineTo(P.x, P.y); else { ctx.moveTo(P.x, P.y); su = true; }
      }
      if (p === pezzi - 1 && V.proietta(b.x, b.y, b.z, P) && su) ctx.lineTo(P.x, P.y);
      ctx.stroke();
    }
  }

  /* ---------- Griglia, campo ---------- */
  function passoBello(x) { const e = Math.pow(10, Math.floor(Math.log10(x))), m = x / e; return (m < 2 ? 1 : m < 5 ? 2 : 5) * e; }

  function disegnaGriglia2D(ctx) {
    const mpp = 1 / V.cam2.s, passo = passoBello(mpp * 90);
    const x0 = V.daSchermo(0, 0), x1 = V.daSchermo(V.W, V.H);
    ctx.strokeStyle = 'rgba(120,150,220,0.07)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.ceil(x0.x / passo) * passo; x < x1.x; x += passo) { V.proietta(x, 0, 0, P); ctx.moveTo(P.x, 0); ctx.lineTo(P.x, V.H); }
    for (let y = Math.ceil(x1.y / passo) * passo; y < x0.y; y += passo) { V.proietta(0, y, 0, P); ctx.moveTo(0, P.y); ctx.lineTo(V.W, P.y); }
    ctx.stroke();
  }

  function disegnaPiano3D(ctx) {
    const c = V.cam3, n = 36;
    const ext = telo ? telo.ext : 2.2 * c.dist * Math.tan(c.fov / 2) * V.W / V.H;
    const passo = passoBello(ext / n), m = Math.ceil(ext / passo / 2);
    const x0 = Math.round(c.tx / passo) * passo, y0 = Math.round(c.ty / passo) * passo;
    const fini = telo ? 4 : 1;                       // con il telo servono più punti per curvare le linee
    for (let dir = 0; dir < 2; dir++) {
      for (let i = -m; i <= m; i++) {
        const al = 0.22 * (1 - Math.abs(i) / (m + 1));
        ctx.strokeStyle = telo ? `rgba(120,170,255,${al * 1.6})` : `rgba(120,150,220,${al * 0.7})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        let su = false;
        for (let j = -m * fini; j <= m * fini; j++) {
          const a = i * passo, bb = j * passo / fini;
          const x = x0 + (dir ? a : bb), y = y0 + (dir ? bb : a);
          if (!V.proietta(x, y, 0, P)) { su = false; continue; }
          if (su) ctx.lineTo(P.x, P.y); else { ctx.moveTo(P.x, P.y); su = true; }
        }
        ctx.stroke();
      }
    }
  }

  function disegnaCampo(ctx) {
    const passo = 46, L = S.corpi;
    if (!L.length) return;
    const val = [];
    let lmin = Infinity, lmax = -Infinity;
    for (let sy = passo / 2; sy < V.H; sy += passo) for (let sx = passo / 2; sx < V.W; sx += passo) {
      const p = V.daSchermo(sx, sy); let gx = 0, gy = 0;
      for (const b of L) {
        const dx = b.x - p.x, dy = b.y - p.y, r2 = dx * dx + dy * dy + b.r * b.r, k = G * b.m / (r2 * Math.sqrt(r2));
        gx += k * dx; gy += k * dy;
      }
      const g = Math.hypot(gx, gy), lg = Math.log10(g + 1e-300);
      val.push([sx, sy, gx / g, gy / g, lg]);
      if (lg < lmin) lmin = lg; if (lg > lmax) lmax = lg;
    }
    ctx.lineWidth = 1.2;
    for (const [sx, sy, ux, uy, lg] of val) {
      const f = lmax > lmin ? (lg - lmin) / (lmax - lmin) : 0.5, l = 6 + 16 * f;
      ctx.strokeStyle = `rgba(140,200,255,${0.15 + 0.5 * f})`;
      const ex = sx + ux * l, ey = sy - uy * l;
      ctx.beginPath(); ctx.moveTo(sx - ux * l * 0.3, sy + uy * l * 0.3); ctx.lineTo(ex, ey);
      ctx.lineTo(ex - ux * 4 + uy * 3, ey + uy * 4 + ux * 3); ctx.moveTo(ex, ey); ctx.lineTo(ex - ux * 4 - uy * 3, ey + uy * 4 - ux * 3);
      ctx.stroke();
    }
  }

  /* ---------- Corpi ---------- */
  V.raggioVisivo = function (b, k) {
    const T = TIPI[b.tipo];
    let r = b.r * k;
    if (b.tipo === 'buco' && S.rel()) r *= 2.6;            // l'ombra del buco nero è più grande dell'orizzonte
    return V.opz.dimensioniReali ? Math.max(r, 1.2) : Math.max(r, T.minPx);
  };

  // Direzione (sullo schermo) della sorgente di luce più intensa, per l'ombreggiatura dei pianeti
  function luceSu(b) {
    let best = null, lmax = 0;
    for (const o of S.corpi) {
      if (o === b || !K.luce(o)) continue;
      const d2 = (o.x - b.x) ** 2 + (o.y - b.y) ** 2 + (o.z - b.z) ** 2, l = Math.pow(o.m, 3.5) / d2;
      if (l > lmax) { lmax = l; best = o; }
    }
    return best;
  }

  function disegnaCorpo(ctx, b) {
    if (!V.proietta(b.x, b.y, b.z, P)) { b._vis = false; return; }
    const x = P.x, y = P.y, k = P.k, rv = V.raggioVisivo(b, k), T = TIPI[b.tipo];
    b._sx = x; b._sy = y; b._rv = rv; b._vis = isFinite(x + y + rv);
    if (!b._vis) return;
    if (x < -rv * 4 - 50 || y < -rv * 4 - 50 || x > V.W + rv * 4 + 50 || y > V.H + rv * 4 + 50) return;
    const rc = Math.min(rv, 4 * Math.max(V.W, V.H));

    // Nel 3D: linea verticale fino al piano, aiuta a capire l'altezza
    if (V.tipo === '3d' && V.proietta(b.x, b.y, 0, Q) && Math.abs(b.z) * k > 3) {
      ctx.strokeStyle = 'rgba(160,190,255,0.25)'; ctx.setLineDash([2, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(Q.x, Q.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(160,190,255,0.3)'; ctx.beginPath(); ctx.ellipse(Q.x, Q.y, 3, 1.5, 0, 0, 7); ctx.fill();
    }

    if (b.tipo === 'buco') return disegnaBuco(ctx, b, x, y, rc, k);

    const lum = K.luce(b);
    if (lum) {
      const alone = rc * (b.tipo === 'gigante' ? 1.6 : b.tipo === 'galassia' ? 3 : 2.6) + (b.tipo === 'galassia' ? 20 : 10);
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x, y, rc * 0.5, x, y, alone);
      g.addColorStop(0, rgba(b.colore, 0.55)); g.addColorStop(0.35, rgba(b.colore, 0.16)); g.addColorStop(1, rgba(b.colore, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, alone, 0, 7); ctx.fill();
      if (b.tipo === 'neutroni' && V.opz.effetti) {       // fasci della pulsar
        const a = V.tReale * 4 + b.id, l = 40 + rc * 6;
        for (const s of [0, Math.PI]) {
          const ca = Math.cos(a + s), sa = Math.sin(a + s), gr = ctx.createLinearGradient(x, y, x + ca * l, y + sa * l);
          gr.addColorStop(0, 'rgba(190,240,255,0.55)'); gr.addColorStop(1, 'rgba(190,240,255,0)');
          ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(x, y);
          ctx.lineTo(x + Math.cos(a + s - 0.09) * l, y + Math.sin(a + s - 0.09) * l); ctx.lineTo(x + Math.cos(a + s + 0.09) * l, y + Math.sin(a + s + 0.09) * l);
          ctx.fill();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      const g2 = ctx.createRadialGradient(x, y, 0, x, y, rc);
      g2.addColorStop(0, '#ffffff'); g2.addColorStop(0.5, mescola(b.colore, '#ffffff', 0.5)); g2.addColorStop(1, b.colore);
      ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(x, y, rc, 0, 7); ctx.fill();
      return;
    }

    if (b.tipo === 'cometa') disegnaCoda(ctx, b, x, y, rc);
    if (b.anelli) disegnaAnelli(ctx, b, x, y, rc, k, 'dietro');

    const sorg = luceSu(b);
    let lx = 0, ly = 0;
    if (sorg && V.proietta(sorg.x, sorg.y, sorg.z, Q)) { const dx = Q.x - x, dy = Q.y - y, l = Math.hypot(dx, dy) || 1; lx = dx / l; ly = dy / l; }
    if (b.tipo === 'satellite') {
      ctx.fillStyle = '#9cc7ff'; ctx.fillRect(x - rc * 2.6, y - rc * 0.5, rc * 1.6, rc); ctx.fillRect(x + rc, y - rc * 0.5, rc * 1.6, rc);
      ctx.fillStyle = '#f2f2f2'; ctx.fillRect(x - rc * 0.8, y - rc * 0.8, rc * 1.6, rc * 1.6);
      return;
    }
    const g = ctx.createRadialGradient(x + lx * rc * 0.45, y + ly * rc * 0.45, rc * 0.05, x, y, rc * 1.15);
    g.addColorStop(0, mescola(b.colore, '#ffffff', 0.35)); g.addColorStop(0.55, b.colore); g.addColorStop(1, mescola(b.colore, '#000000', sorg ? 0.8 : 0.4));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rc, 0, 7); ctx.fill();
    if (b.tipo === 'pallone') disegnaCuciture(ctx, b, x, y, rc);
    if (b.anelli) disegnaAnelli(ctx, b, x, y, rc, k, 'davanti');
  }

  // Le linee nere del pallone da basket: due diametri a croce e due archi laterali
  function disegnaCuciture(ctx, b, x, y, rc) {
    if (rc < 4) return;
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, rc, 0, 7); ctx.clip();
    ctx.translate(x, y); ctx.rotate(b.id * 0.7);
    ctx.strokeStyle = 'rgba(25,12,5,0.85)'; ctx.lineWidth = Math.max(1, rc * 0.06);
    ctx.beginPath();
    ctx.moveTo(-rc, 0); ctx.lineTo(rc, 0); ctx.moveTo(0, -rc); ctx.lineTo(0, rc);
    for (const s of [-1, 1]) {
      const cx = 1.3 * rc * s, R = 1.05 * rc, a0 = s < 0 ? -1.2 : Math.PI + 1.2;
      ctx.moveTo(cx + R * Math.cos(a0), R * Math.sin(a0));
      ctx.arc(cx, 0, R, a0, s < 0 ? 1.2 : Math.PI - 1.2, s > 0);
    }
    ctx.stroke();
    ctx.restore();
  }

  function disegnaBuco(ctx, b, x, y, rc, k) {
    const rel = S.rel(), bag = b.bagliore || 0;
    if (bag > 0.02 && V.opz.effetti) {
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x, y, rc, x, y, rc * 4);
      g.addColorStop(0, `rgba(255,170,90,${0.7 * bag})`); g.addColorStop(0.4, `rgba(255,110,60,${0.3 * bag})`); g.addColorStop(1, 'rgba(255,90,40,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rc * 4, 0, 7); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    const g = ctx.createRadialGradient(x, y, rc, x, y, rc * 2.2);
    g.addColorStop(0, rel ? 'rgba(255,200,140,0.35)' : 'rgba(150,130,230,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rc * 2.2, 0, 7); ctx.fill();
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(x, y, rc, 0, 7); ctx.fill();
    ctx.strokeStyle = rel ? 'rgba(255,214,160,0.9)' : 'rgba(170,150,255,0.8)'; ctx.lineWidth = rel ? 1.6 : 1.2;
    ctx.beginPath(); ctx.arc(x, y, rc, 0, 7); ctx.stroke();
  }

  function disegnaCoda(ctx, b, x, y, rc) {
    const s = luceSu(b);
    if (!s || !V.proietta(s.x, s.y, s.z, Q)) return;
    const d = Math.hypot(s.x - b.x, s.y - b.y, s.z - b.z);
    if (d > 6 * U.UA) return;
    const l = Math.min(140, 18 + 50 * U.UA / d), dx = x - Q.x, dy = y - Q.y, n = Math.hypot(dx, dy) || 1, ux = dx / n, uy = dy / n;
    const g = ctx.createLinearGradient(x, y, x + ux * l, y + uy * l);
    g.addColorStop(0, 'rgba(200,240,255,0.7)'); g.addColorStop(1, 'rgba(200,240,255,0)');
    ctx.fillStyle = g; ctx.beginPath();
    ctx.moveTo(x - uy * rc, y + ux * rc); ctx.lineTo(x + ux * l - uy * l * 0.18, y + uy * l + ux * l * 0.18); ctx.lineTo(x + ux * l + uy * l * 0.18, y + uy * l - ux * l * 0.18); ctx.lineTo(x + uy * rc, y - ux * rc);
    ctx.fill();
  }

  function disegnaAnelli(ctx, b, x, y, rc, k, parte) {
    const R1 = rc * 1.35 / k, R2 = rc * 2.3 / k, n = 48, pts = [];
    for (let i = 0; i <= n; i++) {
      const a = i / n * 2 * Math.PI, c = Math.cos(a), s = Math.sin(a);
      if (!V.proietta(b.x + c * R1, b.y + s * R1, b.z, P) || !V.proietta(b.x + c * R2, b.y + s * R2, b.z, Q)) return;
      pts.push([P.x, P.y, Q.x, Q.y, P.z]);
    }
    const zc = V.tipo === '3d' ? (V.proietta(b.x, b.y, b.z, P), P.z) : 0;
    ctx.fillStyle = 'rgba(230,210,160,0.55)';
    for (let i = 0; i < n; i++) {
      const a = pts[i], c = pts[i + 1];
      const davanti = V.tipo === '2d' ? true : a[4] > zc;
      if ((parte === 'davanti') !== davanti) continue;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(c[2], c[3]); ctx.lineTo(a[2], a[3]); ctx.fill();
    }
  }

  /* ---------- Particelle ---------- */
  function disegnaParticelle(ctx) {
    ctx.globalCompositeOperation = 'lighter';
    for (const p of S.particelle) {
      if (!V.proietta(p.x, p.y, p.z, P)) continue;
      if (P.x < -4 || P.y < -4 || P.x > V.W + 4 || P.y > V.H + 4) continue;
      const a = p.vita === Infinity ? 0.75 : Math.max(0, Math.min(1, p.vita / p.vitaMax * 1.4));
      ctx.fillStyle = rgba(p.colore, a);
      const d = p.dim;
      ctx.fillRect(P.x - d / 2, P.y - d / 2, d, d);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------- Orbita osculante del corpo selezionato ---------- */
  function disegnaOrbita(ctx, b) {
    const d = b._dom;
    if (!d) return;
    const el = S.elementi(b, d);
    if (!isFinite(el.e) || el.h === 0) return;
    let px, py, pz;
    if (el.e > 1e-6) { px = el.ex / el.e; py = el.ey / el.e; pz = el.ez / el.e; }
    else { px = (b.x - d.x) / el.r; py = (b.y - d.y) / el.r; pz = (b.z - d.z) / el.r; }
    const hx = el.hx / el.h, hy = el.hy / el.h, hz = el.hz / el.h;
    const qx = hy * pz - hz * py, qy = hz * px - hx * pz, qz = hx * py - hy * px;
    const lim = el.e < 1 ? Math.PI : Math.acos(-1 / el.e) - 0.02, n = 160;
    ctx.strokeStyle = rgba(b.tipo === 'buco' ? '#b58cff' : b.colore, 0.55); ctx.setLineDash([5, 5]); ctx.lineWidth = 1;
    ctx.beginPath();
    let su = false;
    for (let i = 0; i <= n; i++) {
      const th = -lim + 2 * lim * i / n, r = el.p / (1 + el.e * Math.cos(th));
      if (r <= 0 || r > 1e4 * el.p) { su = false; continue; }
      const c = Math.cos(th) * r, s = Math.sin(th) * r;
      if (!V.proietta(d.x + px * c + qx * s, d.y + py * c + qy * s, d.z + pz * c + qz * s, P)) { su = false; continue; }
      if (su) ctx.lineTo(P.x, P.y); else { ctx.moveTo(P.x, P.y); su = true; }
    }
    ctx.stroke(); ctx.setLineDash([]);
    if (el.e > 0.01 && V.proietta(d.x + px * el.rp, d.y + py * el.rp, d.z + pz * el.rp, P)) {
      ctx.fillStyle = rgba(b.colore, 0.9); ctx.beginPath(); ctx.arc(P.x, P.y, 3, 0, 7); ctx.fill();
      ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = 'rgba(220,230,255,0.7)';
      ctx.fillText(d.tipo === 'stella' ? 'perielio' : 'pericentro', P.x + 5, P.y - 5);
    }
  }

  /* ---------- Freccia della velocità del selezionato ---------- */
  V.scalaVelocita = function (x, y, z, escludi) {
    const d = escludi ? S.dominante(escludi) : S.dominanteInPunto(x, y, z);
    if (!d) return { scala: 100, dom: null };
    const r = Math.max(Math.hypot(d.x - x, d.y - y, d.z - z), d.r);
    return { scala: Math.sqrt(G * d.m / r) / 110, dom: d };
  };
  function disegnaManiglia(ctx, b) {
    V.maniglia = null;
    if (!V.mostraManiglia || b.fisso || !b._vis) return;
    const { scala, dom } = V.scalaVelocita(b.x, b.y, b.z, b);
    const vx = b.vx - (dom ? dom.vx : 0), vy = b.vy - (dom ? dom.vy : 0), vz = b.vz - (dom ? dom.vz : 0);
    const v = Math.hypot(vx, vy, vz), lpx = v / scala;
    let ex, ey;
    if (v < 1e-9) { ex = b._sx + 1; ey = b._sy; }
    else {
      const lm = lpx / V.proiettaK(b);
      if (!V.proietta(b.x + vx / v * lm, b.y + vy / v * lm, b.z + vz / v * lm, Q)) return;
      ex = Q.x; ey = Q.y;
    }
    ctx.strokeStyle = 'rgba(120,255,170,0.85)'; ctx.fillStyle = 'rgba(120,255,170,0.95)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(b._sx, b._sy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.beginPath(); ctx.arc(ex, ey, 6, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.stroke();
    V.maniglia = { x: ex, y: ey, scala, dom };
  }
  V.proiettaK = b => (V.proietta(b.x, b.y, b.z, Q), Q.k);

  /* ---------- Indicatori ai bordi per i corpi fuori dallo schermo ---------- */
  function disegnaIndicatori(ctx) {
    const m = 22;
    let n = 0;
    for (const b of S.corpi) {
      if (!(K.luce(b) || b.id === V.selezionato) || n > 8) continue;
      if (!V.proietta(b.x, b.y, b.z, P)) continue;
      if (P.x >= 0 && P.y >= 0 && P.x <= V.W && P.y <= V.H) continue;
      n++;
      // rettangolo libero dai pannelli laterali
      const sx0 = V.margini.s + m, sx1 = V.W - V.margini.d - m, cx = (sx0 + sx1) / 2, cy = V.H / 2, dx = P.x - cx, dy = P.y - cy;
      const t = Math.min((sx1 - sx0) / 2 / Math.abs(dx || 1e-9), (cy - m) / Math.abs(dy || 1e-9));
      const x = cx + dx * t, y = cy + dy * t, a = Math.atan2(dy, dx);
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.fillStyle = K.luce(b) ? 'rgba(255,220,120,0.9)' : 'rgba(160,220,255,0.9)';
      ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-5, -6); ctx.lineTo(-5, 6); ctx.fill();
      ctx.restore();
      ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = 'rgba(230,236,255,0.85)';
      const w = ctx.measureText(b.nome).width;
      ctx.fillText(b.nome, Math.min(V.W - w - 6, Math.max(6, x - w / 2)), y + (y > V.H / 2 ? -12 : 20));
    }
  }

  /* ---------- Effetti ---------- */
  V.aggiungiEffetti = function (ev) {
    const lista = V.opz.effetti ? ev.effetti || [] : (ev.effetti || []).slice(0, 1);
    for (const e of lista) V.effetti.push(Object.assign({ x: ev.x, y: ev.y, z: ev.z, t: 0 }, e));
    if (V.opz.effetti && ev.scossa) V.scossa = Math.max(V.scossa, ev.scossa);
  };
  function disegnaEffetti(ctx, dt) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = V.effetti.length - 1; i >= 0; i--) {
      const e = V.effetti[i];
      e.t += dt;
      const f = e.t / e.durata;
      if (f >= 1) { V.effetti.splice(i, 1); continue; }
      if (!V.proietta(e.x, e.y, e.z, P)) continue;
      const x = P.x, y = P.y;
      if (e.tipo === 'lampo') {
        const r = e.raggio * (0.25 + 0.75 * Math.sqrt(f)), a = (1 - f) * (1 - f);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.25, rgba(e.colore, a * 0.8)); g.addColorStop(1, rgba(e.colore, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      } else if (e.tipo === 'anello') {
        ctx.strokeStyle = rgba(e.colore, 0.8 * (1 - f)); ctx.lineWidth = 3 * (1 - f) + 1;
        ctx.beginPath(); ctx.arc(x, y, e.raggio * f, 0, 7); ctx.stroke();
      } else if (e.tipo === 'onde') {
        for (let j = 0; j < e.n; j++) {
          const fj = f * 1.6 - j * 0.12;
          if (fj <= 0 || fj >= 1) continue;
          disegnaOnda(ctx, x, y, e.raggio * fj, 0.7 * (1 - fj), V.tReale * 3 + j);
        }
      }
    }
    for (let i = V.onde.length - 1; i >= 0; i--) {            // increspature continue dei sistemi binari compatti
      const o = V.onde[i];
      o.t += dt;
      if (o.t > 2.2) { V.onde.splice(i, 1); continue; }
      if (!V.proietta(o.x, o.y, o.z, P)) continue;
      disegnaOnda(ctx, P.x, P.y, 20 + o.t * 170, o.a * (1 - o.t / 2.2), o.fase);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  function disegnaOnda(ctx, x, y, r, a, fase) {
    ctx.strokeStyle = `rgba(185,164,255,${a})`; ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let i = 0; i <= 64; i++) {
      const th = i / 64 * 2 * Math.PI, rr = r * (1 + 0.06 * Math.cos(2 * (th - fase)));
      const px = x + Math.cos(th) * rr, py = y + Math.sin(th) * rr;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.stroke();
  }

  /* ---------- Lancio e anteprima ---------- */
  function disegnaLancio(ctx) {
    const l = V.lancio;
    if (!l) return;
    if (l.anteprima) {
      const pt = l.anteprima.punti, n = pt.length / 3;
      ctx.strokeStyle = l.anteprima.urto ? 'rgba(255,120,110,0.85)' : l.anteprima.chiusa ? 'rgba(120,255,170,0.8)' : 'rgba(255,200,110,0.85)';
      ctx.setLineDash([6, 5]); ctx.lineWidth = 1.5; ctx.beginPath();
      let su = false, ux = 0, uy = 0;
      for (let i = 0; i < n; i++) {
        if (!V.proietta(pt[3 * i], pt[3 * i + 1], pt[3 * i + 2], P)) { su = false; continue; }
        if (su) ctx.lineTo(P.x, P.y); else { ctx.moveTo(P.x, P.y); su = true; }
        ux = P.x; uy = P.y;
      }
      ctx.stroke(); ctx.setLineDash([]);
      if (l.anteprima.urto) {
        ctx.strokeStyle = '#ff7a6e'; ctx.lineWidth = 2.5; ctx.beginPath();
        ctx.moveTo(ux - 6, uy - 6); ctx.lineTo(ux + 6, uy + 6); ctx.moveTo(ux + 6, uy - 6); ctx.lineTo(ux - 6, uy + 6); ctx.stroke();
      }
    }
    if (V.proietta(l.x, l.y, l.z, P)) {
      const T = TIPI[l.tipo];
      ctx.fillStyle = rgba(l.tipo === 'buco' ? '#9b87ff' : T.colore, 0.75);
      ctx.beginPath(); ctx.arc(P.x, P.y, Math.max(T.minPx, 4), 0, 7); ctx.fill();
      if (l.ex != null) {
        ctx.strokeStyle = 'rgba(120,255,170,0.95)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(P.x, P.y); ctx.lineTo(l.ex, l.ey); ctx.stroke();
        const a = Math.atan2(l.ey - P.y, l.ex - P.x);
        ctx.beginPath(); ctx.moveTo(l.ex, l.ey); ctx.lineTo(l.ex - 10 * Math.cos(a - 0.4), l.ey - 10 * Math.sin(a - 0.4));
        ctx.moveTo(l.ex, l.ey); ctx.lineTo(l.ex - 10 * Math.cos(a + 0.4), l.ey - 10 * Math.sin(a + 0.4)); ctx.stroke();
      }
      if (l.testo) {
        ctx.font = '12px system-ui, sans-serif';
        const righe = l.testo.split('\n'), w = Math.max(...righe.map(r => ctx.measureText(r).width)) + 14;
        let tx = (l.ex != null ? l.ex : P.x) + 16, ty = (l.ey != null ? l.ey : P.y) + 12;
        if (tx + w > V.W - 8) tx = V.W - 8 - w; if (ty + righe.length * 16 + 8 > V.H - 8) ty = V.H - 8 - righe.length * 16 - 8;
        ctx.fillStyle = 'rgba(10,14,30,0.85)'; ctx.fillRect(tx, ty, w, righe.length * 16 + 8);
        ctx.fillStyle = '#e8eeff';
        righe.forEach((r, i) => ctx.fillText(r, tx + 7, ty + 17 + i * 16));
      }
    }
  }

  /* ---------- Righello e assi ---------- */
  function disegnaRighello(ctx) {
    const mpp = V.metriPerPixel(), d = mpp * 120;
    const u = d < 1e3 ? 1 : d < 0.01 * U.UA ? 1e3 : d < 0.1 * U.AL ? U.UA : U.AL;   // numero tondo nell'unità mostrata
    const lung = passoBello(d / u) * u, px = lung / mpp, x = V.W - px - 24, y = V.H - 22;
    ctx.strokeStyle = 'rgba(220,230,255,0.8)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x, y); ctx.lineTo(x + px, y); ctx.lineTo(x + px, y - 5); ctx.stroke();
    ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = 'rgba(220,230,255,0.9)';
    ctx.textAlign = 'right';
    ctx.fillText(fmt.lunghezza(lung) + (V.tipo === '3d' ? ' (al centro della vista)' : ''), x + px, y - 9);
    ctx.textAlign = 'left';
    if (V.tipo === '3d') {
      const o = { x: V.W - 50, y: V.H - 80 }, b = base;
      [['x', 1, 0, 0, '#ff8080'], ['y', 0, 1, 0, '#80ff9a'], ['z', 0, 0, 1, '#80b4ff']].forEach(([n, ax, ay, az, c]) => {
        const sx = (ax * b.rx + ay * b.ry) * 22, sy = -(ax * b.ux + ay * b.uy + az * b.uz) * 22;
        ctx.strokeStyle = c; ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x + sx, o.y + sy); ctx.stroke();
        ctx.fillStyle = c; ctx.fillText(n, o.x + sx * 1.2 - 3, o.y + sy * 1.2 + 4);
      });
    }
  }

  function disegnaBaricentro(ctx) {
    let M = 0, x = 0, y = 0, z = 0;
    for (const b of S.corpi) { M += b.m; x += b.m * b.x; y += b.m * b.y; z += b.m * b.z; }
    if (!M || !V.proietta(x / M, y / M, z / M, P)) return;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(P.x - 7, P.y); ctx.lineTo(P.x + 7, P.y); ctx.moveTo(P.x, P.y - 7); ctx.lineTo(P.x, P.y + 7); ctx.stroke();
    ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillText('baricentro', P.x + 8, P.y + 12);
  }

  /* ---------- Fase lunare (usata dal pannello) ---------- */
  // lam: angolo Luna-Sole visto dalla Terra (0 = nuova, π = piena); da 0 a π la Luna è crescente
  V.disegnaFase = function (ctx, cx, cy, R, lam, colore) {
    ctx.fillStyle = '#1a1d26'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
    const cresc = (lam % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) < Math.PI, k = Math.cos(lam);
    ctx.fillStyle = colore;
    ctx.beginPath();
    // metà illuminata: a destra se crescente (emisfero nord)
    ctx.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2, !cresc);
    ctx.ellipse(cx, cy, R * Math.abs(k), R, 0, Math.PI / 2, -Math.PI / 2, (k > 0) === cresc);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
  };

  /* ---------- Fotogramma ---------- */
  V.disegna = function (dtReale) {
    const ctx = V.ctx;
    V.tReale += dtReale;
    ctx.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
    // centro della vista sul corpo seguito
    const seg = V.seguito && S.trova(V.seguito);
    if (V.seguito && !seg) V.seguito = null;
    if (seg) { V.cam2.cx = seg.x; V.cam2.cy = seg.y; V.cam3.tx = seg.x; V.cam3.ty = seg.y; V.cam3.tz = seg.z; }
    calcolaBase();
    preparaTelo();

    const g = ctx.createLinearGradient(0, 0, 0, V.H);
    g.addColorStop(0, '#04060f'); g.addColorStop(1, '#0a0f22');
    ctx.fillStyle = g; ctx.fillRect(0, 0, V.W, V.H);

    if (V.scossa > 0.01) {
      const s = V.scossa * 9;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
      V.scossa *= Math.exp(-dtReale * 2.5);
    }

    // lenti gravitazionali (solo in modalità relativistica)
    const lenti = [];
    if (S.rel() && V.opz.lenti) for (const b of S.corpi) if (b.tipo === 'buco' && V.proietta(b.x, b.y, b.z, P)) {
      const ombra = V.raggioVisivo(b, P.k);
      lenti.push({ x: P.x, y: P.y, ombra, te: ombra * 1.7 });
    }
    disegnaStelle(ctx, lenti);

    if (V.tipo === '2d') { if (V.opz.griglia) disegnaGriglia2D(ctx); if (V.opz.campo) disegnaCampo(ctx); }
    else if (V.opz.griglia || telo) disegnaPiano3D(ctx);

    if (V.opz.scie) for (const b of S.corpi) disegnaScia(ctx, b);
    disegnaParticelle(ctx);

    const sel = V.selezionato && S.trova(V.selezionato);
    if (sel && V.opz.orbita) disegnaOrbita(ctx, sel);

    // corpi, dal più lontano al più vicino
    const ord = S.corpi.slice();
    if (V.tipo === '3d') {
      for (const b of ord) b._z = V.proietta(b.x, b.y, b.z, P) ? P.z : -Infinity;
      ord.sort((a, b) => a._z - b._z);
    }
    for (const b of ord) disegnaCorpo(ctx, b);

    if (V.opz.etichette) {
      ctx.font = '11px system-ui, sans-serif';
      for (const b of ord) {
        if (!b._vis || b.tipo === 'frammento' || b.tipo === 'asteroide' && b.id !== V.selezionato) continue;
        ctx.fillStyle = b.id === V.selezionato ? '#ffffff' : 'rgba(210,222,255,0.75)';
        ctx.fillText(b.nome, b._sx + b._rv + 5, b._sy - b._rv * 0.4 - 3);
      }
    }
    if (V.opz.baricentro) disegnaBaricentro(ctx);

    if (sel && sel._vis) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.2; ctx.setLineDash([4, 4]);
      ctx.lineDashOffset = -V.tReale * 12;
      ctx.beginPath(); ctx.arc(sel._sx, sel._sy, sel._rv + 6, 0, 7); ctx.stroke();
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
      disegnaManiglia(ctx, sel);
    } else V.maniglia = null;

    disegnaEffetti(ctx, dtReale);
    ctx.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
    disegnaIndicatori(ctx);
    disegnaLancio(ctx);

    if (V.fantasma && V.proietta(V.fantasma.x, V.fantasma.y, V.fantasma.z, P)) {
      const T = TIPI[V.fantasma.tipo];
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(P.x, P.y, Math.max(T.minPx, 4) + 3, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    }
    disegnaRighello(ctx);
  };

  V.corpoInPunto = function (sx, sy) {
    let best = null, dmin = Infinity;
    for (const b of S.corpi) {
      if (!b._vis) continue;
      const d = Math.hypot(b._sx - sx, b._sy - sy), lim = Math.max(b._rv, 7) + 5;
      if (d < lim && d < dmin) { dmin = d; best = b; }
    }
    return best;
  };

  V.ridimensiona = function (canvas) {
    const r = canvas.getBoundingClientRect();
    V.ctx = canvas.getContext('2d');
    if (r.width < 2 || r.height < 2) return;          // finestra nascosta: si riprova al prossimo ridimensionamento
    V.dpr = window.devicePixelRatio || 1;
    const amp = V.W * V.metriPerPixel();
    V.W = r.width; V.H = r.height;
    canvas.width = Math.round(r.width * V.dpr); canvas.height = Math.round(r.height * V.dpr);
    V.ctx = canvas.getContext('2d');
    if (V.tipo === '2d') V.cam2.s = V.W / amp;
    calcolaBase();
  };
})();
