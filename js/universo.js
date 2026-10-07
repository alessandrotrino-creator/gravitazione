/* Universo dal Big Bang: espansione secondo le equazioni di Friedmann, crescita delle strutture
   con l'approssimazione di Zel'dovich. Tutto è funzione del tempo: si può andare avanti e indietro. */
(function () {
  'use strict';
  const { fmt, el, memoria } = Grav;
  const ANNO = Grav.U.ANNO, GA = 1e9 * ANNO, MPC = 3.0857e22;
  const OR = 9.1e-5;                                  // densità di radiazione (fotoni + neutrini)
  const T0K = 2.7255;                                 // temperatura della radiazione di fondo oggi

  const PRESET = {
    lcdm: { nome: 'Il nostro universo (ΛCDM)', H0: 67.7, Om: 0.31, OL: 0.69, w: -1 },
    eds: { nome: 'Solo materia, niente energia oscura', H0: 67.7, Om: 1, OL: 0, w: -1 },
    crunch: { nome: 'Universo chiuso: Big Crunch', H0: 67.7, Om: 3, OL: 0, w: -1 },
    rip: { nome: 'Energia oscura "fantasma": Big Rip', H0: 67.7, Om: 0.31, OL: 0.69, w: -1.6 },
    vuoto: { nome: 'Universo quasi vuoto', H0: 67.7, Om: 0.02, OL: 0, w: -1 }
  };

  const Uni = Grav.universo = { attivo: false, u: 0, gioca: false, verso: 1, ritmo: 1, comovente: false, hubble: false };
  let P = Object.assign({}, PRESET.lcdm), tab = null, campo = null, canvas, ctx, W = 800, H = 600, dpr = 1;
  let nodi = {};

  /* ---------- Cosmologia ---------- */
  const H0s = () => P.H0 * 1000 / MPC;
  const Ok = () => 1 - P.Om - P.OL - OR;
  const E2 = a => OR / (a * a * a * a) + P.Om / (a * a * a) + Ok() / (a * a) + P.OL * Math.pow(a, -3 * (1 + P.w));

  function calcola() {
    const h0 = H0s(), lnA = [], T = [], passo = 0.004;
    let la = Math.log(1e-12), a = 1e-12, t = a * a / (2 * h0 * Math.sqrt(OR)), inv = 1 / (h0 * Math.sqrt(E2(a)));
    lnA.push(la); T.push(t);
    let svolta = null, fine = 'eterna';
    while (true) {
      const la2 = la + passo, a2 = Math.exp(la2), e2 = E2(a2);
      if (e2 <= 0) {                                    // l'espansione si ferma: punto di svolta
        let lo = a, hi = a2;
        for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (E2(m) > 0) lo = m; else hi = m; }
        const at = lo, kk = -(E2(at) - E2(at * 0.999)) / (at * 0.001);
        t += 2 * Math.sqrt(Math.max(0, at - a)) / (at * h0 * Math.sqrt(Math.max(kk, 1e-30)));
        lnA.push(Math.log(at)); T.push(t);
        svolta = { a: at, t };
        fine = 'crunch';
        break;
      }
      const inv2 = 1 / (h0 * Math.sqrt(e2));
      t += passo * (inv + inv2) / 2;
      la = la2; a = a2; inv = inv2;
      lnA.push(la); T.push(t);
      if (a > 1e6 || t > 500 * GA) { if (P.w < -1 && t < 500 * GA) fine = 'rip'; break; }
    }
    const tFine = fine === 'crunch' ? 2 * svolta.t : fine === 'rip' ? t : Math.min(t, 60 * GA);
    tab = { lnA, T, svolta, fine, tFine, tInizio: T[0] };
    tab.t0 = Math.exp(lnA[lnA.length - 1]) >= 1 ? tDaA(1) : null;
    // fattore di crescita delle strutture, normalizzato al nostro universo
    const g = a => {
      const e = E2(a), om = P.Om / (a * a * a) / e, ol = P.OL * Math.pow(a, -3 * (1 + P.w)) / e;
      return om <= 0 ? 0 : a * 2.5 * om / (Math.pow(om, 4 / 7) - ol + (1 + om / 2) * (1 + ol / 70));
    };
    tab.g = g;
    tab.Dref = RIF_D;
    tab.Dsvolta = svolta ? g(svolta.a) : 0;
    calcolaNodi();
  }
  // D(a=1) del modello ΛCDM, calcolato una volta per tutte
  const RIF_D = (() => { const om = 0.31, ol = 0.69; return 2.5 * om / (Math.pow(om, 4 / 7) - ol + (1 + om / 2) * (1 + ol / 70)); })();

  function tDaA(a) {                                   // ramo di espansione
    const la = Math.log(a), L = tab.lnA;
    if (la <= L[0]) return a * a / (2 * H0s() * Math.sqrt(OR));
    let lo = 0, hi = L.length - 1;
    if (la >= L[hi]) return tab.T[hi];
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L[m] < la) lo = m; else hi = m; }
    const f = (la - L[lo]) / (L[hi] - L[lo]);
    return tab.T[lo] + f * (tab.T[hi] - tab.T[lo]);
  }
  function aDaT(t) {
    if (tab.svolta && t > tab.svolta.t) t = Math.max(1e-40, 2 * tab.svolta.t - t);
    const T = tab.T;
    if (t <= T[0]) {
      const aR = Math.sqrt(2 * H0s() * Math.sqrt(OR) * Math.max(t, 1e-32));
      return t >= 1e-32 ? aR : aR * Math.exp(-60 * (Math.log10(1e-32) - Math.log10(t)) / 4);   // inflazione
    }
    let lo = 0, hi = T.length - 1;
    if (t >= T[hi]) return Math.exp(tab.lnA[hi]);
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] < t) lo = m; else hi = m; }
    const f = (t - T[lo]) / (T[hi] - T[lo]);
    return Math.exp(tab.lnA[lo] + f * (tab.lnA[hi] - tab.lnA[lo]));
  }
  function crescita(t) {
    if (tab.svolta && t > tab.svolta.t) return tab.Dsvolta / RIF_D * (1 + 2 * (t - tab.svolta.t) / tab.svolta.t);
    return tab.g(aDaT(t)) / RIF_D;
  }
  const hubble = t => {                                // H(t) in km/s/Mpc, negativo in contrazione
    const a = aDaT(t), h = P.H0 * Math.sqrt(Math.max(0, E2(a)));
    return tab.svolta && t > tab.svolta.t ? -h : h;
  };

  /* ---------- Scala del tempo: logaritmica all'inizio, lineare dopo 100 milioni di anni ---------- */
  const U_LOG = 0.45, T_MIN = 1e-36, T_DIV = 1e8 * ANNO;
  function tDaU(u) {
    if (tab.tFine <= T_DIV * 2) return Math.pow(10, Math.log10(T_MIN) + u * (Math.log10(tab.tFine) - Math.log10(T_MIN)));
    if (u <= U_LOG) return Math.pow(10, Math.log10(T_MIN) + u / U_LOG * (Math.log10(T_DIV) - Math.log10(T_MIN)));
    return T_DIV + (u - U_LOG) / (1 - U_LOG) * (tab.tFine - T_DIV);
  }
  function uDaT(t) {
    t = Math.max(T_MIN, Math.min(tab.tFine, t));
    if (tab.tFine <= T_DIV * 2) return (Math.log10(t) - Math.log10(T_MIN)) / (Math.log10(tab.tFine) - Math.log10(T_MIN));
    if (t <= T_DIV) return U_LOG * (Math.log10(t) - Math.log10(T_MIN)) / (Math.log10(T_DIV) - Math.log10(T_MIN));
    return U_LOG + (1 - U_LOG) * (t - T_DIV) / (tab.tFine - T_DIV);
  }

  function tempoCosmico(t) {
    const a = Math.abs(t);
    if (a < 1e-3) return fmt.numero(t, 2) + ' s';
    if (a < 60) return fmt.numero(t, 3) + ' s';
    if (a < 3600) return fmt.numero(t / 60, 3) + ' minuti';
    if (a < 86400 * 2) return fmt.numero(t / 3600, 3) + ' ore';
    if (a < ANNO) return fmt.numero(t / 86400, 3) + ' giorni';
    const y = t / ANNO;
    if (y < 1e6) return Math.round(y).toLocaleString('it-IT') + ' anni';
    if (y < 1e9) return fmt.numero(y / 1e6, 3) + ' milioni di anni';
    return fmt.numero(y / 1e9, 3) + ' miliardi di anni';
  }

  /* ---------- Ragnatela cosmica (approssimazione di Zel'dovich) ---------- */
  const NL = 72, N = NL * NL;
  function creaCampo() {
    let s = 20240607;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
    const modi = [];
    for (let kx = 0; kx <= 14; kx++) for (let ky = -14; ky <= 14; ky++) {
      if (kx === 0 && ky <= 0) continue;
      const k = Math.hypot(kx, ky);
      if (k > 14) continue;
      const d = gauss() * Math.sqrt(k) * Math.exp(-k * k / (2 * 7 * 7));
      modi.push({ kx, ky, f: d / (4 * Math.PI * Math.PI * k * k), th: rnd() * 2 * Math.PI });
    }
    const c = { qx: new Float32Array(N), qy: new Float32Array(N), px: new Float32Array(N), py: new Float32Array(N),
      m1: new Float32Array(N), m2: new Float32Array(N), dc: new Float32Array(N), d0: new Float32Array(N), sem: new Float32Array(N) };
    const P2 = 2 * Math.PI, P4 = P2 * P2;
    for (let i = 0; i < N; i++) {
      const qx = ((i % NL) + 0.5 + (rnd() - 0.5) * 0.3) / NL, qy = (Math.floor(i / NL) + 0.5 + (rnd() - 0.5) * 0.3) / NL;
      let px = 0, py = 0, a = 0, b = 0, cc = 0;
      for (const m of modi) {
        const f = m.th + P2 * (m.kx * qx + m.ky * qy), sn = Math.sin(f), cs = Math.cos(f);
        px += m.f * P2 * m.kx * sn; py += m.f * P2 * m.ky * sn;
        a += m.f * P4 * m.kx * m.kx * cs; b += m.f * P4 * m.kx * m.ky * cs; cc += m.f * P4 * m.ky * m.ky * cs;
      }
      const med = (a + cc) / 2, dd = Math.sqrt(((a - cc) / 2) ** 2 + b * b);
      c.qx[i] = qx; c.qy[i] = qy; c.px[i] = px; c.py[i] = py; c.m1[i] = med - dd; c.m2[i] = med + dd; c.sem[i] = rnd();
    }
    // normalizzazione: con la crescita di oggi (D = 1) circa un quarto della materia è già in filamenti e nodi
    const ord = Array.from(c.m1).sort((x, y) => x - y), k = -1 / ord[Math.floor(N * 0.27)];
    let vl = 0, dmin = Infinity;
    for (let i = 0; i < N; i++) {
      c.px[i] *= k; c.py[i] *= k; c.m1[i] *= k; c.m2[i] *= k;
      c.dc[i] = c.m1[i] < 0 ? -1 / c.m1[i] : Infinity;
      c.d0[i] = -(c.m1[i] + c.m2[i]);
      const dx = c.qx[i] - 0.5, dy = c.qy[i] - 0.5;
      if (dx * dx + dy * dy < 0.02 && c.dc[i] < dmin) { dmin = c.dc[i]; vl = i; }
    }
    c.viaLattea = vl;
    return c;
  }

  /* ---------- Epoche ---------- */
  function calcolaNodi() {
    const t = a => tDaA(a);
    nodi = {
      quark: t(T0K / 1e12), nucleo: t(T0K / 1e9), finenucleo: t(T0K / 3e8), luce: t(1 / 1100),
      stelle: t(1 / 21), galassie: t(1 / 7), picco: t(1 / 3)
    };
    nodi.solare = tab.t0 ? tab.t0 - 4.6 * GA : null;
    const pt = tab.fine === 'crunch' ? tab.svolta.t : null;
    // quando l'espansione inizia ad accelerare (ä > 0): ΩΛ(1+3w)/2 supera Ωm/2
    let acc = null;
    if (P.OL > 0) for (let la = -5; la < 5; la += 0.01) {
      const a = Math.exp(la);
      if (P.Om / (a * a * a) + (1 + 3 * P.w) * P.OL * Math.pow(a, -3 * (1 + P.w)) < 0) { acc = t(a); break; }
    }
    nodi.accelera = acc; nodi.svolta = pt;
  }
  function epoca(t) {
    const a = aDaT(t), T = T0K / a, contrazione = tab.svolta && t > tab.svolta.t;
    const n = nodi;
    if (contrazione) {
      if (T > 3000) return { titolo: 'Big Crunch', testo: 'L\'universo ricollassa in uno stato caldissimo e densissimo, come un Big Bang al contrario. Gli atomi si spezzano, la luce torna intrappolata nel plasma. Che cosa succeda dopo, nessuno lo sa.' };
      return { titolo: 'La grande contrazione', testo: 'La gravità della materia ha vinto: l\'espansione si è fermata e l\'universo si contrae. Le galassie si avvicinano e si scontrano, la radiazione di fondo si riscalda sempre di più.' };
    }
    if (t < 1e-32) return { titolo: 'Inflazione cosmica', testo: 'In una frazione di secondo inimmaginabile lo spazio si gonfia di almeno 10²⁶ volte. Minuscole fluttuazioni quantistiche vengono "stirate" fino a diventare i semi delle future galassie. È la teoria più accreditata, ma non ancora dimostrata del tutto.' };
    if (T > 1e12) return { titolo: 'Plasma di quark e gluoni', testo: 'Fa troppo caldo perché esistano protoni e neutroni: c\'è una "zuppa" di quark, gluoni, elettroni, neutrini e luce. Una piccolissima prevalenza della materia sull\'antimateria sopravvive: è la materia di cui siamo fatti.' };
    if (T > 1e9) return { titolo: 'Nascono protoni e neutroni', testo: 'I quark si uniscono a gruppi di tre formando protoni e neutroni. Materia e antimateria si annichilano quasi del tutto, trasformandosi in luce.' };
    if (T > 3e8) return { titolo: 'Nucleosintesi primordiale', testo: 'Per qualche minuto l\'universo è come il centro di una stella: protoni e neutroni si fondono in nuclei di elio. Poi fa troppo "freddo" e tutto si ferma: circa 75% idrogeno e 25% elio, con tracce di litio. Lo misuriamo ancora oggi, ed è una delle prove del Big Bang.' };
    if (T > 3400) return { titolo: 'Un mare di plasma opaco', testo: 'Nuclei ed elettroni sono separati: la luce rimbalza continuamente sugli elettroni liberi e non riesce a viaggiare. L\'universo è una nebbia incandescente. Le zone appena più dense (le macchie più chiare) attirano la materia.' };
    if (T > 2000) return { titolo: 'La prima luce', testo: 'Circa 380 000 anni dopo il Big Bang gli elettroni si legano ai nuclei: nascono i primi atomi e lo spazio diventa trasparente. Quella luce viaggia ancora: la riceviamo oggi, raffreddata a 2,7 gradi sopra lo zero assoluto, come radiazione cosmica di fondo a microonde.' };
    if (t < n.stelle) return { titolo: 'L\'età oscura', testo: 'Non ci sono ancora stelle: solo idrogeno, elio e materia oscura. La gravità fa crescere lentamente le differenze di densità: le zone più dense diventano sempre più dense, quelle vuote sempre più vuote.' };
    if (t < n.galassie) return { titolo: 'Le prime stelle', testo: 'Nei nodi più densi della "ragnatela cosmica" si accendono le prime stelle, enormi e di vita brevissima, e poi le prime galassie. La loro luce ultravioletta torna a ionizzare il gas tra le galassie (reionizzazione).' };
    if (n.solare && t >= n.solare && t < n.solare + 0.6 * GA) return { titolo: 'Nasce il Sistema solare', testo: 'Circa 4,6 miliardi di anni fa, in un braccio della Via Lattea, una nube di gas collassa: nascono il Sole e i pianeti. Il ferro, il carbonio e l\'ossigeno di cui siamo fatti erano stati prodotti da stelle esplose prima.' };
    if (tab.t0 && Math.abs(t - tab.t0) < 0.4 * GA) return { titolo: 'Oggi', testo: `L'universo ha ${tempoCosmico(tab.t0)}. Le galassie si allontanano le une dalle altre: più sono lontane, più in fretta si allontanano (legge di Hubble-Lemaître). La luce più antica che vediamo, la radiazione di fondo, ci arriva da una regione che oggi dista circa 46 miliardi di anni luce.` };
    if (tab.t0 && t > tab.t0) {
      if (tab.fine === 'rip' && t > tab.tFine - 3 * GA) return { titolo: 'Big Rip', testo: 'L\'energia oscura "fantasma" cresce senza limite: l\'espansione strappa prima gli ammassi di galassie, poi le galassie, i sistemi solari, i pianeti e infine gli atomi stessi.' };
      if (n.svolta && t > n.svolta - 3 * GA) return { titolo: 'L\'espansione si ferma', testo: 'La gravità di tutta la materia frena l\'espansione fino a fermarla. Da qui in poi l\'universo comincerà a contrarsi.' };
      if (n.accelera) return { titolo: 'Il futuro lontano', testo: 'L\'espansione accelera: le galassie lontane si allontanano sempre più in fretta e spariscono oltre l\'orizzonte. Fra circa 5 miliardi di anni la Via Lattea e Andromeda si fonderanno. Fra migliaia di miliardi di anni le ultime stelle si spegneranno: un universo freddo e buio.' };
      return { titolo: 'Il futuro lontano', testo: 'Senza energia oscura l\'espansione continua, ma rallenta sempre di più. Le stelle consumano il loro combustibile e una dopo l\'altra si spengono.' };
    }
    if (n.accelera && t > n.accelera) return { titolo: 'L\'espansione accelera', testo: 'Da qualche miliardo di anni l\'energia oscura conta più della materia e l\'espansione, invece di rallentare, accelera. Che cosa sia l\'energia oscura è uno dei grandi misteri della fisica di oggi.' };
    return { titolo: 'L\'epoca delle galassie', testo: 'Le galassie crescono, si scontrano e si fondono lungo i filamenti della ragnatela cosmica. Circa 10 miliardi di anni fa nascevano più stelle che in qualunque altra epoca.' };
  }

  /* ---------- Disegno ---------- */
  function coloreTemp(T) {
    const t = Math.max(1000, Math.min(40000, T)) / 100;
    let r, g, b;
    if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04; }
    else { r = 329.7 * Math.pow(t - 60, -0.1332); g = 288.12 * Math.pow(t - 60, -0.0755); b = 255; }
    return [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))));
  }

  function disegna() {
    const t = tDaU(Uni.u), a = aDaT(t), T = T0K / a, D = crescita(t), cx = W / 2, cy = H / 2 - 30;
    const z = 1 / a - 1, contrazione = tab.svolta && t > tab.svolta.t;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);

    // bagliore della radiazione di fondo dopo che l'universo è diventato trasparente
    if (T < 3400 && T > 15) {
      const [r, g, b] = coloreTemp(Math.max(T, 1000)), al = Math.min(0.35, 0.35 * Math.log10(T / 15) / Math.log10(3400 / 15));
      ctx.fillStyle = `rgba(${r},${g * 0.7},${b * 0.5},${al * 0.5})`; ctx.fillRect(0, 0, W, H);
    }

    // la ragnatela cosmica
    const lato = Math.min(W, H) * 0.82, sv = Uni.comovente ? 1 : Math.max(0.02, Math.cbrt(a)), Lp = lato * sv;
    if (T < 6000) {
      const nx = Math.ceil((W / 2) / Lp + 0.5), ny = Math.ceil((H / 2) / Lp + 0.5), piastre = (2 * nx + 1) * (2 * ny + 1);
      const salto = Math.max(1, Math.ceil(piastre * N / 45000));
      const sf = z > 25 ? 0 : z > 10 ? (25 - z) / 15 : 1;                       // formazione stellare
      const anni = t / ANNO, spegn = anni > 6e10 ? Math.exp(-(anni - 6e10) / 1.5e11) : 1;
      const giallo = Math.max(0, Math.min(1, (anni - 3e9) / 9e9)), rosso = anni > 6e10 ? Math.min(1, (anni - 6e10) / 1e11) : 0;
      const nebbia = T > 3400 ? 0 : T > 2000 ? (3400 - T) / 1400 : 1;
      const c = campo;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < N; i += salto) {
        const De = Math.min(D, 0.985 * c.dc[i]);
        let rho = 1 / Math.max(0.02, (1 + De * c.m1[i]) * (1 + De * c.m2[i]));
        if (D > c.dc[i]) rho = Math.min(60, 10 + 25 * (D / c.dc[i] - 1));
        let x = c.qx[i] + De * c.px[i], y = c.qy[i] + De * c.py[i];
        x -= Math.floor(x); y -= Math.floor(y);
        const gal = sf * Math.max(0, Math.min(1, (rho - 4) / 10)) * spegn;
        const gas = Math.min(0.5, 0.06 + 0.05 * rho) * nebbia;
        let col, al, d;
        if (gal > 0.05) {
          const s = c.sem[i];
          const r = 255, g = 225 + 25 * (1 - giallo) - 60 * rosso - s * 20, b = 200 + 55 * (1 - giallo) * (1 - s) - 150 * rosso;
          col = `${r},${Math.round(g)},${Math.round(Math.max(40, b))}`; al = Math.min(1, 0.25 + gal); d = 1.4 + gal * 1.4;
        } else { col = '130,150,230'; al = gas; d = 1.3; }
        if (al < 0.02) continue;
        ctx.fillStyle = `rgba(${col},${al})`;
        for (let ix = -nx; ix <= nx; ix++) for (let iy = -ny; iy <= ny; iy++) {
          const sx = cx + (ix + x - 0.5) * Lp, sy = cy + (iy + y - 0.5) * Lp;
          if (sx < -3 || sy < -3 || sx > W + 3 || sy > H + 3) continue;
          ctx.fillRect(sx - d / 2, sy - d / 2, d, d);
        }
      }
      ctx.globalCompositeOperation = 'source-over';

      // la futura Via Lattea
      if (t > 1.5 * GA && !contrazione && (!tab.t0 || t < tab.t0 + 60 * GA)) {
        const i = c.viaLattea, De = Math.min(D, 0.985 * c.dc[i]);
        let x = c.qx[i] + De * c.px[i], y = c.qy[i] + De * c.py[i]; x -= Math.floor(x); y -= Math.floor(y);
        const sx = cx + (x - 0.5) * Lp, sy = cy + (y - 0.5) * Lp;
        ctx.strokeStyle = 'rgba(255,230,150,0.8)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(sx, sy, 9, 0, 7); ctx.stroke();
        ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,235,170,0.95)';
        ctx.fillText(t < (nodi.solare || Infinity) ? 'qui nascerà la Via Lattea' : 'Via Lattea', sx + 12, sy + 4);
      }
      // frecce della legge di Hubble
      if (Uni.hubble && T < 3400) {
        const h = hubble(t) / P.H0;
        ctx.strokeStyle = h >= 0 ? 'rgba(120,255,170,0.85)' : 'rgba(255,140,120,0.9)'; ctx.lineWidth = 1.5;
        for (let k = 0; k < 24; k++) {
          const ang = k / 24 * 2 * Math.PI, rr = (0.12 + 0.3 * ((k * 7) % 5) / 4) * Math.min(W, H);
          const sx = cx + Math.cos(ang) * rr, sy = cy + Math.sin(ang) * rr, l = Math.max(-60, Math.min(60, rr * 0.25 * h));
          const ex = sx + Math.cos(ang) * l, ey = sy + Math.sin(ang) * l;
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
          const s = Math.sign(l) || 1;
          ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - s * 6 * Math.cos(ang - 0.4), ey - s * 6 * Math.sin(ang - 0.4));
          ctx.moveTo(ex, ey); ctx.lineTo(ex - s * 6 * Math.cos(ang + 0.4), ey - s * 6 * Math.sin(ang + 0.4)); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(200,255,220,0.9)'; ctx.font = '12px system-ui, sans-serif';
        ctx.fillText('Le frecce più lontane dal centro sono più lunghe: velocità proporzionale alla distanza', 16, 24);
      }
    }

    // plasma opaco (prima della ricombinazione o verso il Big Crunch)
    if (T > 2000) {
      const op = T > 3400 ? 1 : (T - 2000) / 1400;
      const [r, g, b] = coloreTemp(T);
      ctx.globalAlpha = op;
      const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.75);
      gr.addColorStop(0, `rgb(${Math.min(255, r + 30)},${Math.min(255, g + 30)},${Math.min(255, b + 30)})`); gr.addColorStop(1, `rgb(${r * 0.75 | 0},${g * 0.7 | 0},${b * 0.7 | 0})`);
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
      // macchie della radiazione di fondo: le stesse fluttuazioni che diventeranno galassie
      if (T < 1e9 && !contrazione) {
        const c = campo, pas = lato / NL * 1.5, nx = Math.ceil(W / 2 / lato + 0.5), ny = Math.ceil(H / 2 / lato + 0.5);
        for (let i = 0; i < N; i++) {
          const v = c.d0[i];
          ctx.fillStyle = v > 0 ? `rgba(255,255,255,${Math.min(0.25, v * 0.12)})` : `rgba(80,20,0,${Math.min(0.25, -v * 0.12)})`;
          for (let ix = -nx; ix <= nx; ix++) for (let iy = -ny; iy <= ny; iy++) {
            const sx = cx + (ix + c.qx[i] - 0.5) * lato, sy = cy + (iy + c.qy[i] - 0.5) * lato;
            if (sx > -pas && sy > -pas && sx < W + pas && sy < H + pas) ctx.fillRect(sx - pas / 2, sy - pas / 2, pas, pas);
          }
        }
      } else {
        // agitazione delle particelle nel plasma primordiale
        for (let k = 0; k < 500; k++) {
          const x = Math.random() * W, y = Math.random() * H;
          ctx.fillStyle = T > 1e12 ? ['rgba(255,80,80,0.6)', 'rgba(80,255,120,0.6)', 'rgba(90,140,255,0.6)'][k % 3] : 'rgba(255,255,255,0.5)';
          ctx.fillRect(x, y, 2, 2);
        }
      }
      ctx.globalAlpha = 1;
    }
    // inflazione e primissimi istanti: il punto che si gonfia
    if (t < 1e-30) {
      const f = Math.max(0, (Math.log10(t) + 36) / 6), r = 4 + f * Math.max(W, H);
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.6, 'rgba(255,250,235,0.95)'); gr.addColorStop(1, 'rgba(255,240,220,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
    }

    // dimensione della regione mostrata
    ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = T > 2000 ? 'rgba(40,20,0,0.85)' : 'rgba(220,230,255,0.85)';
    if (T < 6000 && !Uni.comovente) {
      const lato0 = 1.3e9 * a;
      ctx.fillText(`Il quadrato centrale misura ${lato0 >= 1e9 ? fmt.numero(lato0 / 1e9, 2) + ' miliardi' : fmt.numero(lato0 / 1e6, 2) + ' milioni'} di anni luce`, 16, H - 150);
    }
    return { t, a, T, z, D };
  }

  function disegnaScala(t) {
    const cv = Uni.cScala, c = cv.getContext('2d'), w = cv.width, h = cv.height;
    c.clearRect(0, 0, w, h); c.fillStyle = '#070a18'; c.fillRect(0, 0, w, h);
    const tf = tab.fine === 'eterna' && tab.t0 ? Math.min(tab.tFine, 3 * tab.t0) : tab.tFine, n = 160;
    let amax = 0;
    const pts = [];
    for (let i = 0; i <= n; i++) { const tt = tf * i / n, a = aDaT(Math.max(tt, 1)); pts.push(a); if (a > amax) amax = a; }
    amax = Math.min(amax, 12);
    c.strokeStyle = 'rgba(150,170,255,0.25)'; c.beginPath();
    if (amax >= 1) { const y1 = h - 14 - (1 / amax) * (h - 24); c.moveTo(30, y1); c.lineTo(w, y1); }
    c.stroke();
    c.strokeStyle = '#7b9bff'; c.lineWidth = 2; c.beginPath();
    pts.forEach((a, i) => { const x = 30 + i / n * (w - 34), y = h - 14 - Math.min(a, amax) / amax * (h - 24); if (i) c.lineTo(x, y); else c.moveTo(x, y); });
    c.stroke();
    const xt = 30 + Math.min(1, t / tf) * (w - 34);
    c.strokeStyle = '#ffd27a'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(xt, 4); c.lineTo(xt, h - 14); c.stroke();
    c.fillStyle = '#c9d3ff'; c.font = '10px system-ui, sans-serif';
    c.fillText('dimensione', 2, 10); c.fillText('0', 24, h - 3); c.fillText(fmt.numero(tf / GA, 3) + ' mld anni', w - 70, h - 3);
    if (tab.t0) { const x0 = 30 + tab.t0 / tf * (w - 34); c.fillStyle = '#9fffc0'; c.fillRect(x0 - 2, h - 14 - Math.min(1, amax) / amax * (h - 24) - 2, 4, 4); c.fillText('oggi', x0 - 10, h - 3 - 10); }
  }

  /* ---------- Interfaccia ---------- */
  let dom = {};
  function sincronizzaParametri() {
    dom.vH0.textContent = P.H0.toFixed(1).replace('.', ','); dom.vOm.textContent = P.Om.toFixed(2).replace('.', ',');
    dom.vOL.textContent = P.OL.toFixed(2).replace('.', ','); dom.vW.textContent = P.w.toFixed(2).replace('.', ',');
    dom.rH0.value = P.H0; dom.rOm.value = P.Om; dom.rOL.value = P.OL; dom.rW.value = P.w;
    const k = Ok();
    const forma = Math.abs(k) < 0.01 ? 'piatto (geometria euclidea)' : k < 0 ? 'chiuso (come la superficie di una sfera)' : 'aperto (come una sella)';
    const destino = tab.fine === 'crunch' ? `si fermerà e ricollasserà: Big Crunch dopo ${tempoCosmico(tab.tFine)}`
      : tab.fine === 'rip' ? `sarà fatto a pezzi: Big Rip dopo ${tempoCosmico(tab.tFine)}`
        : nodi.accelera ? 'si espanderà per sempre, sempre più in fretta' : 'si espanderà per sempre, sempre più lentamente';
    dom.destino.replaceChildren(el('div', {}, 'Spazio ', el('b', { testo: forma })), el('div', {}, 'Destino: ', el('b', { testo: destino })),
      el('div', {}, 'Età oggi: ', el('b', { testo: tab.t0 ? tempoCosmico(tab.t0) : '—' })));
  }
  function cambiaParametri() {
    const t = tDaU(Uni.u);
    calcola();
    Uni.u = uDaT(t);
    sincronizzaParametri();
    costruisciTacche();
  }
  function costruisciTacche() {
    const n = nodi, tc = [['Big Bang', 1e-36], ['Inflazione', 1e-33], ['Quark', 1e-9], ['Protoni', n.quark * 3], ['Nuclei di elio', 200],
      ['Prima luce', n.luce], ['Prime stelle', n.stelle], ['Galassie', n.picco]];
    if (n.solare) tc.push(['Sistema solare', n.solare + 0.1 * GA]);
    if (tab.t0) tc.push(['Oggi', tab.t0]);
    if (n.svolta) tc.push(['Svolta', n.svolta]);
    tc.push([tab.fine === 'crunch' ? 'Big Crunch' : tab.fine === 'rip' ? 'Big Rip' : 'Futuro', tab.tFine * 0.995]);
    dom.tacche.replaceChildren(...tc.map(([nome, t], i) => {
      const b = el('button', { testo: nome, onclick: () => { Uni.u = uDaT(t); Uni.gioca = false; aggiornaGioca(); } });
      const u = uDaT(t);
      b.style.left = (u * 100) + '%';
      b.style.top = (i % 3) * 12 + 'px';
      b.style.transform = u < 0.03 ? 'none' : u > 0.97 ? 'translateX(-100%)' : 'translateX(-50%)';
      return b;
    }));
  }
  function aggiornaGioca() { dom.bGioca.textContent = Uni.gioca ? '❚❚' : '▶'; }

  Uni.installa = function () {
    const box = document.getElementById('universo');
    canvas = el('canvas', { 'aria-label': 'Evoluzione dell\'universo' });
    const cursore = (nome, min, max, passo, chiave) => {
      const r = el('input', { type: 'range', min, max, step: passo, oninput: () => { P[chiave] = +r.value; dom.preset.value = ''; cambiaParametri(); } });
      const v = el('output');
      dom['r' + nome] = r; dom['v' + nome] = v;
      return el('label.cursore', {}, el('span', {}, nome === 'H0' ? 'H₀ (costante di Hubble, km/s/Mpc) ' : nome === 'Om' ? 'Ωm (materia) ' : nome === 'OL' ? 'ΩΛ (energia oscura) ' : 'w (tipo di energia oscura) ', v), r);
    };
    dom.preset = el('select', { onchange: () => { if (PRESET[dom.preset.value]) { P = Object.assign({}, PRESET[dom.preset.value]); cambiaParametri(); } } },
      el('option', { value: '', testo: 'Personalizzato' }), Object.keys(PRESET).map(k => el('option', { value: k, testo: PRESET[k].nome })));
    dom.preset.value = 'lcdm';
    dom.destino = el('div.nota');
    Uni.cScala = el('canvas', { id: 'cScala', width: 276, height: 110 });
    const spunta = (testo, chiave) => el('label.spunta', {}, el('input', { type: 'checkbox', checked: Uni[chiave], onchange: e => { Uni[chiave] = e.target.checked; } }), testo);
    const pannello = el('aside.pannello.uni-pannello', {},
      el('div.testa', {}, el('h2', { testo: 'Ingredienti dell\'universo' }), el('button.chiudi-pannello', { testo: '–', onclick: e => { pannello.classList.toggle('ridotto'); e.target.textContent = pannello.classList.contains('ridotto') ? '+' : '–'; } })),
      el('div.corpo', {}, dom.preset,
        cursore('H0', 50, 90, 0.1, 'H0'), cursore('Om', 0, 3, 0.01, 'Om'), cursore('OL', 0, 1.5, 0.01, 'OL'), cursore('W', -2, -0.4, 0.01, 'w'),
        dom.destino, el('p.nota', { testo: 'Crescita delle dimensioni dell\'universo nel tempo:' }), Uni.cScala,
        spunta('Lo zoom segue l\'espansione (coordinate comoventi)', 'comovente'),
        spunta('Frecce della legge di Hubble', 'hubble')));
    dom.titolo = el('h3'); dom.testo = el('p'); dom.dati = el('div.uni-dati');
    const epocaP = el('aside.pannello.uni-epoca', {}, el('div.corpo', { style: 'padding-top:10px' }, dom.titolo, dom.testo, dom.dati));
    dom.bGioca = el('button.primario', { title: 'Avvia / pausa', onclick: () => { if (Uni.u >= 0.999 && Uni.verso > 0) Uni.u = 0; Uni.gioca = !Uni.gioca; aggiornaGioca(); } });
    dom.verso = el('div.interruttore', {}, el('button', { 'data-v': '-1', testo: '◀ indietro' }), el('button.attivo', { 'data-v': '1', testo: 'avanti ▶' }));
    dom.verso.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      Uni.verso = +b.dataset.v; for (const x of dom.verso.children) x.classList.toggle('attivo', x === b);
      Uni.gioca = true; aggiornaGioca();
    });
    dom.ritmo = el('select', { 'aria-label': 'Velocità', onchange: () => { Uni.ritmo = +dom.ritmo.value; } }, [0.25, 0.5, 1, 2, 4].map(v => el('option', { value: v, testo: '× ' + String(v).replace('.', ',') })));
    dom.ritmo.value = '1';
    dom.tempo = el('span.tempo');
    dom.cursore = el('input', { type: 'range', min: 0, max: 10000, step: 1, 'aria-label': 'Tempo', oninput: () => { Uni.u = dom.cursore.value / 10000; Uni.gioca = false; aggiornaGioca(); } });
    dom.tacche = el('div.uni-tacche');
    const linea = el('div.uni-linea', {},
      el('div.uni-comandi', {}, dom.bGioca, dom.verso, dom.ritmo, el('span', { testo: 'Tempo dal Big Bang:' }), dom.tempo,
        el('span.nota', { testo: 'Trascina il cursore o clicca un\'epoca. All\'inizio la scala è logaritmica: ogni tratto è 10 volte più lungo del precedente.' })),
      el('div.uni-cursore', {}, dom.cursore, dom.tacche));
    box.append(canvas, pannello, epocaP, linea);
    if (window.ResizeObserver) new ResizeObserver(() => Uni.ridimensiona()).observe(canvas);
    campo = creaCampo();
    calcola();
    sincronizzaParametri();
    costruisciTacche();
    Uni.u = memoria.leggi('universo:u', uDaT(tab.t0 || 1e9 * ANNO));
    aggiornaGioca();
    document.addEventListener('keydown', e => {
      if (!Uni.attivo || e.target.closest('input, select, textarea') || document.querySelector('dialog[open]')) return;
      if (e.key === ' ') { e.preventDefault(); Uni.gioca = !Uni.gioca; aggiornaGioca(); }
      if (e.key === 'ArrowRight') Uni.u = Math.min(1, Uni.u + 0.005);
      if (e.key === 'ArrowLeft') Uni.u = Math.max(0, Uni.u - 0.005);
    });
  };

  Uni.ridimensiona = function () {
    if (!Uni.attivo) return;
    const r = canvas.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    dpr = window.devicePixelRatio || 1; W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx = canvas.getContext('2d');
  };
  Uni.attiva = function (si) {
    Uni.attivo = si;
    if (si) { Uni.ridimensiona(); }
    else memoria.scrivi('universo:u', Uni.u);
  };
  Uni.aiuto = function () {
    Grav.ui.avviso('Universo dal Big Bang', 'Muovi il cursore del tempo o premi ▶ (anche all\'indietro). A sinistra cambi gli "ingredienti": più materia porta al Big Crunch, un\'energia oscura con w < −1 al Big Rip. Ogni puntino è una regione grande come un ammasso di galassie; le più dense si accendono quando nascono le stelle. È un modello semplificato, ma i tempi e le temperature sono quelli calcolati con le equazioni della cosmologia.', 25);
  };

  let attesaTesto = 0;
  Uni.frame = function (dt) {
    if (!ctx) { Uni.ridimensiona(); if (!ctx) return; }
    if (Uni.gioca) {
      Uni.u += Uni.verso * dt * 0.018 * Uni.ritmo;
      if (Uni.u >= 1) { Uni.u = 1; Uni.gioca = false; aggiornaGioca(); }
      if (Uni.u <= 0) { Uni.u = 0; Uni.gioca = false; aggiornaGioca(); }
    }
    const s = disegna();
    if (document.activeElement !== dom.cursore) dom.cursore.value = Math.round(Uni.u * 10000);
    dom.tempo.textContent = tempoCosmico(s.t);
    if ((attesaTesto -= dt) <= 0) {
      attesaTesto = 0.15;
      const e = epoca(s.t);
      if (dom.titolo.textContent !== e.titolo) { dom.titolo.textContent = e.titolo; dom.testo.textContent = e.testo; }
      const hh = hubble(s.t);
      const voci = [
        ['Età', tempoCosmico(s.t)],
        ['Temperatura', fmt.numero(s.T, 3) + ' K' + (s.T < 400 && s.T > 1 ? ` (${fmt.numero(s.T - 273.15, 3)} °C)` : '')],
        ['Dimensioni rispetto a oggi', Math.abs(s.a - 1) < 0.005 ? 'come oggi' : s.a >= 0.01 ? '× ' + fmt.numero(s.a, 3) : '1/' + fmt.numero(1 / s.a, 3)],
        ['Spostamento verso il rosso z', s.a <= 1 ? fmt.numero(s.z < 1e-3 ? 0 : s.z, 3) : '— (futuro)'],
        ['Ritmo di espansione H', fmt.numero(hh, 3) + ' km/s/Mpc']
      ];
      dom.dati.replaceChildren(...voci.flatMap(([k, v]) => [el('span', { testo: k }), el('span', { testo: v })]));
      disegnaScala(s.t);
    }
  };
})();
