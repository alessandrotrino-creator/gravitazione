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
    costruisciScala();
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

  /* ---------- Scala del tempo: a tratti, con più spazio alle epoche in cui succede qualcosa ----------
     Logaritmica fino a 100 milioni di anni, lineare dopo. Ogni tratto: [fine, quota del cursore]. */
  const T_MIN = 1e-36, T_LIN = 1e8 * ANNO;
  const TRATTI = [[1e-32, 3], [1e-12, 3], [1e-5, 6], [1e-3, 5], [1, 5], [10, 4], [100, 3], [1500, 6], [1e12, 4], [4e12, 2], [3e13, 8],
    [T_LIN, 4], [1e9 * ANNO, 10], [14e9 * ANNO, 20], [60e9 * ANNO, 17]];
  let scala = [];
  const misura = (t0, t1, t) => t1 <= T_LIN ? Math.log(t / t0) / Math.log(t1 / t0) : (t - t0) / (t1 - t0);
  function costruisciScala() {
    scala = [{ t: T_MIN, u: 0 }];
    let u = 0, prec = T_MIN;
    for (let k = 0; k < TRATTI.length; k++) {
      let [t, w] = TRATTI[k];
      if (k === TRATTI.length - 1) t = Math.max(t, tab.tFine);
      if (t >= tab.tFine) { u += w * misura(prec, t, tab.tFine); scala.push({ t: tab.tFine, u }); break; }
      u += w; scala.push({ t, u }); prec = t;
    }
    for (const n of scala) n.u /= u;
  }
  function tDaU(u) {
    u = Math.max(0, Math.min(1, u));
    let k = 1; while (k < scala.length - 1 && scala[k].u < u) k++;
    const a = scala[k - 1], b = scala[k], f = (u - a.u) / (b.u - a.u || 1);
    return b.t <= T_LIN ? a.t * Math.pow(b.t / a.t, f) : a.t + f * (b.t - a.t);
  }
  function uDaT(t) {
    t = Math.max(T_MIN, Math.min(tab.tFine, t));
    let k = 1; while (k < scala.length - 1 && scala[k].t < t) k++;
    const a = scala[k - 1], b = scala[k];
    return a.u + (b.u - a.u) * misura(a.t, b.t, t);
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
    // i picchi di densità (collassano per primi): qui nascono le prime stelle, i primi buchi neri e i quasar
    c.picchi = [];
    for (const i of Array.from({ length: N }, (_, i) => i).sort((x, y) => c.m1[x] - c.m1[y])) {
      if (c.picchi.length >= 160) break;
      if (c.picchi.every(j => { let dx = c.qx[i] - c.qx[j], dy = c.qy[i] - c.qy[j]; dx -= Math.round(dx); dy -= Math.round(dy); return dx * dx + dy * dy > 0.0016; })) c.picchi.push(i);
    }
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
    // prime stelle (da z = 20 a z = 9) e bolle di reionizzazione (da z = 18 a z = 7), nei picchi di densità
    const pk = campo.picchi;
    nodi.pop = pk.slice(0, 40).map((i, r) => ({ i, r, t: t(1 / (21 - 11 * Math.pow(r / 39, 0.7))) }));
    nodi.bolle = pk.map((i, r) => ({ i, t: t(1 / (19 - 11 * Math.pow(r / (pk.length - 1), 0.8))), R: 0.075 + 0.06 * campo.sem[i] }));
    nodi.z6 = t(1 / 7); nodi.reion = t(1 / 11);
  }
  function epoca(t) {
    const a = aDaT(t), T = T0K / a, contrazione = tab.svolta && t > tab.svolta.t;
    const n = nodi;
    if (contrazione) {
      if (T > 3000) return { titolo: 'Big Crunch', testo: 'L\'universo ricollassa in uno stato caldissimo e densissimo, come un Big Bang al contrario. Gli atomi si spezzano, la luce torna intrappolata nel plasma. Che cosa succeda dopo, nessuno lo sa.' };
      return { titolo: 'La grande contrazione', testo: 'La gravità della materia ha vinto: l\'espansione si è fermata e l\'universo si contrae. Le galassie si avvicinano e si scontrano, la radiazione di fondo si riscalda sempre di più.' };
    }
    const z = 1 / a - 1;
    if (t < 1e-32) return { titolo: 'Inflazione cosmica', testo: 'In una frazione di secondo inimmaginabile lo spazio si gonfia di almeno 10²⁶ volte. Minuscole fluttuazioni quantistiche vengono "stirate" fino a diventare i semi delle future galassie. È la teoria più accreditata, ma non ancora dimostrata del tutto.' };
    if (T > 2e12) return { titolo: 'Plasma di quark e gluoni', testo: 'Fa troppo caldo perché esistano protoni e neutroni: c\'è una "zuppa" di quark (i puntini colorati) legati e slegati di continuo dai gluoni (i trattini gialli), con elettroni, neutrini e luce. Dalla luce nascono senza sosta coppie di particelle e antiparticelle (i cerchietti vuoti), che si annichilano subito in un lampo. La materia supera l\'antimateria di circa una particella su un miliardo: è quella che sopravviverà, ed è ciò di cui siamo fatti.' };
    if (T > 3e10) return { titolo: 'Nascono protoni e neutroni', testo: 'A circa un milionesimo di secondo i quark si chiudono a gruppi di tre: due quark "su" e uno "giù" formano un protone (rosso), uno "su" e due "giù" un neutrone (grigio). Da allora i quark non si trovano più isolati. Quark e antiquark si annichilano quasi tutti, trasformandosi in luce.' };
    if (T > 3e9) return { titolo: 'Neutrini liberi, elettroni contro positroni', testo: 'Intorno a un secondo i neutrini smettono di interagire: da allora viaggiano liberi e attraversano ancora oggi tutto l\'universo. I neutroni, un po\' più pesanti dei protoni, si trasformano in protoni e non vengono più ricreati: ne resta circa uno ogni sei protoni. Poi elettroni e positroni (cerchietti rosa) si annichilano: sopravvive solo il piccolo eccesso di elettroni, uno per ogni protone.' };
    if (T > 9e8) return { titolo: 'Il collo di bottiglia del deuterio', testo: 'Protoni e neutroni si uniscono di continuo in nuclei di deuterio, ma la luce è ancora così energetica che li spezza subito. Intanto una parte dei neutroni liberi decade in protoni: un neutrone isolato vive in media un quarto d\'ora.' };
    if (T > 3e8) return { titolo: 'Nucleosintesi primordiale', testo: 'Per qualche minuto l\'universo è come il centro di una stella: prima protone e neutrone formano il deuterio, poi due deuteri formano un nucleo di elio (2 protoni e 2 neutroni). Quasi tutti i neutroni finiscono nell\'elio. Poi fa troppo "freddo" e tutto si ferma: in massa circa 75% idrogeno e 25% elio, con tracce di deuterio e litio. Lo misuriamo ancora oggi, ed è una delle prove del Big Bang.' };
    if (T > 4200) return { titolo: 'Un mare di plasma opaco', testo: 'Nuclei ed elettroni sono separati. La luce urta di continuo gli elettroni liberi e cambia direzione a zig-zag (guarda le scie dei fotoni): non riesce a viaggiare e l\'universo è una nebbia incandescente. Per ogni protone ci sono circa un miliardo di fotoni. Sotto i 6000 gradi circa i nuclei di elio catturano per primi i loro due elettroni.' };
    if (T > 2700) return { titolo: 'Nascono i primi atomi', testo: 'Intorno ai 3000 gradi, circa 380 000 anni dopo il Big Bang, i protoni catturano gli elettroni e diventano atomi di idrogeno. Ogni elettrone che si lega è un ostacolo in meno per la luce: le scie dei fotoni diventano dritte. Gli astronomi chiamano questo momento "ricombinazione".' };
    if (T > 1700) return { titolo: 'La prima luce', testo: 'Lo spazio è diventato trasparente e la luce viaggia libera. È ancora qui: la riceviamo oggi, raffreddata a 2,7 gradi sopra lo zero assoluto, come radiazione cosmica di fondo a microonde. Le sue macchie appena più chiare o più scure sono le zone più o meno dense: i semi delle future galassie.' };
    if (t < n.pop[0].t) return { titolo: 'L\'età oscura', testo: 'Non ci sono ancora stelle: solo idrogeno, elio e materia oscura. La gravità fa crescere lentamente le differenze di densità: le zone più dense diventano sempre più dense, quelle vuote sempre più vuote. Nella lente, la luce della prima luce si allunga verso il rosso e diventa invisibile.' };
    if (z > 14) return { titolo: 'Le prime stelle e i primi buchi neri', testo: 'Fra 100 e 200 milioni di anni dopo il Big Bang, nei punti più densi della ragnatela si accendono le prime stelle: enormi (anche cento volte il Sole), azzurre e fatte solo di idrogeno ed elio. Vivono pochi milioni di anni (qui molto di più, per poterle vedere), poi esplodono come supernove spargendo i primi elementi pesanti. Le più grandi lasciano un buco nero.' };
    if (z > 6) return { titolo: 'Reionizzazione', testo: 'La luce ultravioletta delle prime stelle e galassie strappa di nuovo gli elettroni agli atomi del gas tra le galassie: attorno a ogni sorgente cresce una bolla di gas ionizzato (in viola). Le bolle si allargano e si uniscono finché, circa un miliardo di anni dopo il Big Bang, tutto il gas è ionizzato. Ormai però è così rarefatto che la luce passa lo stesso.' };
    if (z > 1.5) return { titolo: 'Quasar e galassie che si fondono', testo: 'Le galassie crescono inghiottendone di più piccole: nella lente si formano così la Via Lattea e Andromeda. Al centro delle galassie i buchi neri supermassicci divorano gas e si accendono come quasar, gli oggetti più luminosi dell\'universo, con getti di materia quasi alla velocità della luce. Circa 10 miliardi di anni fa nascevano più stelle che in qualunque altra epoca.' };
    if (n.solare && t >= n.solare && t < n.solare + 0.6 * GA) return { titolo: 'Nasce il Sistema solare', testo: 'Circa 4,6 miliardi di anni fa, in un braccio della Via Lattea, una nube di gas collassa: nascono il Sole e i pianeti. Il ferro, il carbonio e l\'ossigeno di cui siamo fatti erano stati prodotti da stelle esplose prima.' };
    if (tab.t0 && Math.abs(t - tab.t0) < 0.4 * GA) return { titolo: 'Oggi', testo: `L'universo ha ${tempoCosmico(tab.t0)}. Le galassie si allontanano le une dalle altre: più sono lontane, più in fretta si allontanano (legge di Hubble-Lemaître). Andromeda invece, legata a noi dalla gravità, si avvicina a circa 110 km/s. La luce più antica che vediamo, la radiazione di fondo, ci arriva da una regione che oggi dista circa 46 miliardi di anni luce.` };
    if (tab.t0 && t > tab.t0) {
      if (tab.fine === 'rip' && t > tab.tFine - 3 * GA) return { titolo: 'Big Rip', testo: 'L\'energia oscura "fantasma" cresce senza limite: l\'espansione strappa prima gli ammassi di galassie, poi le galassie, i sistemi solari, i pianeti e infine gli atomi stessi.' };
      if (n.svolta && t > n.svolta - 3 * GA) return { titolo: 'L\'espansione si ferma', testo: 'La gravità di tutta la materia frena l\'espansione fino a fermarla. Da qui in poi l\'universo comincerà a contrarsi.' };
      if (n.accelera && t < tab.t0 + 7 * GA) return { titolo: 'Via Lattea e Andromeda si fondono', testo: 'Fra circa 4,5 miliardi di anni la Via Lattea e Andromeda si scontrano e in un paio di miliardi di anni diventano un\'unica grande galassia ellittica. Le stelle sono così distanti tra loro che quasi non si urtano. Le galassie degli altri gruppi, invece, non sono legate a noi: l\'espansione le allontana sempre più in fretta.' };
      if (n.accelera) return { titolo: 'Il futuro lontano', testo: 'L\'espansione accelera: le galassie degli altri gruppi si allontanano sempre più in fretta e spariscono oltre l\'orizzonte, mentre il nostro gruppo, tenuto insieme dalla gravità, resta unito. Fra migliaia di miliardi di anni le ultime stelle si spegneranno: un universo freddo e buio.' };
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

  // vista grande: la ragnatela cosmica (o il plasma), con stelle, buchi neri, bolle ionizzate e quasar
  function disegnaGrande(t, a, T, D, z, contrazione, leg) {
    const cx = W / 2, cy = H / 2 - 30;

    // bagliore della radiazione di fondo dopo che l'universo è diventato trasparente
    if (T < 3400 && T > 15) {
      const [r, g, b] = coloreTemp(Math.max(T, 1000)), al = Math.min(0.35, 0.35 * Math.log10(T / 15) / Math.log10(3400 / 15));
      ctx.fillStyle = `rgba(${r},${g * 0.7},${b * 0.5},${al * 0.5})`; ctx.fillRect(0, 0, W, H);
    }

    // la ragnatela cosmica
    const lato = Math.min(W, H) * 0.82, sv = Uni.comovente ? 1 : Math.max(0.4, Math.cbrt(a)), Lp = lato * sv;
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
        const gas = Math.min(0.6, 0.12 + 0.07 * rho) * nebbia;
        let col, al, d;
        let forma = 0;
        if (gal > 0.05) {
          const s = c.sem[i];
          const r = 255, g = 225 + 25 * (1 - giallo) - 60 * rosso - s * 20, b = 200 + 55 * (1 - giallo) * (1 - s) - 150 * rosso;
          col = `${r},${Math.round(g)},${Math.round(Math.max(40, b))}`; al = Math.min(1, 0.25 + gal); d = 1.4 + gal * 1.4;
          if (gal > 0.45 && s < 0.3) forma = 1 + s * 30;          // le più dense si vedono come piccole galassie
        } else { col = '130,150,230'; al = gas; d = 1.3; }
        if (al < 0.02) continue;
        ctx.fillStyle = `rgba(${col},${al})`;
        for (let ix = -nx; ix <= nx; ix++) for (let iy = -ny; iy <= ny; iy++) {
          const sx = cx + (ix + x - 0.5) * Lp, sy = cy + (iy + y - 0.5) * Lp;
          if (sx < -3 || sy < -3 || sx > W + 3 || sy > H + 3) continue;
          if (forma) { ctx.beginPath(); ctx.ellipse(sx, sy, d * 1.5, d * 0.6, forma, 0, 7); ctx.fill(); }
          else ctx.fillRect(sx - d / 2, sy - d / 2, d, d);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      if (T < 2600) leg.push('web');
      if (sf > 0.05 && spegn > 0.1) leg.push('gal');

      // posizione attuale di un elemento della ragnatela, ripetuta sulle piastrelle visibili
      const tessere = (i, fn) => {
        const De = Math.min(D, 0.985 * c.dc[i]);
        let x = c.qx[i] + De * c.px[i], y = c.qy[i] + De * c.py[i]; x -= Math.floor(x); y -= Math.floor(y);
        for (let ix = -nx; ix <= nx; ix++) for (let iy = -ny; iy <= ny; iy++) {
          const sx = cx + (ix + x - 0.5) * Lp, sy = cy + (iy + y - 0.5) * Lp;
          if (sx < -40 || sy < -40 || sx > W + 40 || sy > H + 40) continue;
          const h = Math.sin(i * 12.9898 + ix * 78.233 + iy * 37.719) * 43758.5453;
          fn(sx, sy, !ix && !iy, h - Math.floor(h));        // h: per non ripetere uguale ogni oggetto su tutte le piastrelle
        }
      };
      if (!contrazione) disegnaPrimiOggetti(t, z, Lp, tessere, leg);
      if (T > 1700 && T < 2600) testo('Le macchie chiare e scure: la radiazione di fondo, i semi delle galassie', cx, 26, 'center');

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
    // dimensione della regione mostrata
    ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = T > 2000 ? 'rgba(40,20,0,0.85)' : 'rgba(220,230,255,0.85)';
    if (T < 6000 && !Uni.comovente) {
      const lato0 = 1.3e9 * a;
      ctx.fillText(`Il quadrato centrale misura ${lato0 >= 1e9 ? fmt.numero(lato0 / 1e9, 2) + ' miliardi' : fmt.numero(lato0 / 1e6, 2) + ' milioni'} di anni luce`, 16, H - 150);
    }
  }

  // testo leggibile su qualunque sfondo
  function testo(s, x, y, al, dim) {
    ctx.font = (dim || 12) + 'px system-ui, sans-serif'; ctx.textAlign = al || 'left';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(s, x, y);
    ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fillText(s, x, y);
    ctx.textAlign = 'left';
  }
  const bagliore = (x, y, r, col, al) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${al})`); g.addColorStop(0.25, `rgba(${col},${al * 0.8})`); g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  };

  /* ---------- Prime stelle, supernove, buchi neri, reionizzazione, quasar ---------- */
  let cBolle = null;
  function disegnaPrimiOggetti(t, z, Lp, tessere, leg) {
    // bolle di gas ionizzato: disegnate piene su un foglio a parte, così dove si sovrappongono si fondono
    const aB = 0.24 * (1 - lin(z, 6, 4));
    if (aB > 0.01 && t > nodi.bolle[0].t) {
      if (!cBolle || cBolle.width !== canvas.width || cBolle.height !== canvas.height) { cBolle = document.createElement('canvas'); cBolle.width = canvas.width; cBolle.height = canvas.height; }
      const b = cBolle.getContext('2d');
      b.setTransform(1, 0, 0, 1, 0, 0); b.clearRect(0, 0, cBolle.width, cBolle.height); b.setTransform(dpr, 0, 0, dpr, 0, 0);
      b.fillStyle = 'rgb(140,95,255)';
      for (const o of nodi.bolle) {
        if (t <= o.t) continue;
        const r = o.R * Lp * Math.pow(lin(t, o.t, nodi.z6), 0.6) * (1 + 0.8 * lin(t, nodi.z6, nodi.z6 * 1.6));
        if (r > 0.5) tessere(o.i, (x, y) => { b.beginPath(); b.arc(x, y, r, 0, 7); b.fill(); });
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = aB; ctx.drawImage(cBolle, 0, 0); ctx.globalAlpha = 1; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      leg.push('bub', 'uv');
    }
    // prime stelle: si accendono, esplodono e lasciano un buco nero (durate allungate per poterle vedere)
    const vBH = 1 - lin(z, 3, 1.5);
    let etStella = null, etBuco = null, st = false, sn = false, bh = false;
    for (const p of nodi.pop) {
      const du = Uni.u - uDaT(p.t);
      if (du < 0) continue;
      tessere(p.i, (x, y, centro, h) => {
        if (!centro && h < 0.55) return;
        if (du < 0.006) {
          const f = Math.min(1, du / 0.001), r = 9 * f;
          bagliore(x, y, r + 6, '150,190,255', 0.95);
          ctx.strokeStyle = `rgba(200,225,255,${0.7 * f})`; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x - r - 5, y); ctx.lineTo(x + r + 5, y); ctx.moveTo(x, y - r - 5); ctx.lineTo(x, y + r + 5); ctx.stroke();
          st = true; if (centro && !etStella) etStella = [x, y];
        } else if (du < 0.0095) {
          const f = (du - 0.006) / 0.0035;
          bagliore(x, y, 6 + 10 * (1 - f), '255,190,120', 1 - f);
          ctx.strokeStyle = `rgba(255,180,110,${0.9 * (1 - f)})`; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(x, y, 4 + 22 * f, 0, 7); ctx.stroke();
          sn = true;
        } else if (vBH > 0.02) {
          ctx.fillStyle = `rgba(0,0,0,${vBH})`; ctx.strokeStyle = `rgba(255,150,60,${0.6 * vBH})`; ctx.lineWidth = 1.1;
          ctx.beginPath(); ctx.arc(x, y, 2.2, 0, 7); ctx.fill(); ctx.stroke();
          bh = true; if (centro && p.r < 6 && !etBuco) etBuco = [x, y];
        }
      });
    }
    if (st) leg.push('st'); if (sn) leg.push('sn'); if (bh) leg.push('bh');
    if (etStella) testo('una delle prime stelle', etStella[0] + 14, etStella[1] - 8);
    else if (etBuco && z > 6) testo('un primo buco nero', etBuco[0] + 10, etBuco[1] - 6);
    // quasar: i buchi neri dei picchi più densi crescono e divorano gas, soprattutto intorno a z = 2-3
    let etQ = null, qMax = 0;
    for (let k = 0; k < 6; k++) {
      const i = campo.picchi[k], amp = 0.45 + 0.55 * campo.sem[i], q = z < 7 ? amp * Math.exp(-(((z - 2.4) / 1.7) ** 2)) : 0;
      if (q < 0.05) continue;
      const an = campo.sem[i] * 9;
      tessere(i, (x, y, centro, h) => {
        if (!centro && h < 0.7) return;
        bagliore(x, y, 3 + 7 * q, '170,200,255', Math.min(1, 0.4 + q));
        ctx.strokeStyle = `rgba(160,210,255,${0.85 * q})`; ctx.lineWidth = 1.3;
        const l = 6 + 16 * q;
        ctx.beginPath(); ctx.moveTo(x - Math.cos(an) * l, y - Math.sin(an) * l); ctx.lineTo(x + Math.cos(an) * l, y + Math.sin(an) * l); ctx.stroke();
        if (centro && q > qMax) { qMax = q; etQ = [x, y]; }
      });
    }
    if (etQ) { leg.push('qso'); if (qMax > 0.25) testo('quasar', etQ[0] + 12, etQ[1] + 16); }
  }

  /* ---------- Scena microscopica: dalle particelle ai primi atomi ----------
     Vista ingrandita e schematica (numeri, dimensioni e velocità non in scala). Chi c'è e com'è legato dipende solo
     dalla temperatura, quindi funziona anche all'indietro; il movimento è un'animazione indipendente dal tempo cosmico. */
  const lin = (x, a, b) => Math.max(0, Math.min(1, (x - a) / (b - a)));
  const liscio = x => x * x * (3 - 2 * x);
  const NG = 6, NCOP = 36, QCOL = ['255,90,90', '90,240,120', '90,140,255'];
  let micro = null, orologio = 0;
  function creaMicro() {
    let s = 7771;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const mobile = v => { const a = rnd() * 6.283; return { x: rnd(), y: rnd(), vx: Math.cos(a) * v, vy: Math.sin(a) * v, px: 0, py: 0 }; };
    const m = { nuc: [], ele: [], fot: [], nu: [], lampi: [], xe: 1 };
    // ogni gruppo di 16 nucleoni: 0-1 protoni dell'elio, 2-3 neutroni dell'elio, 4-9 neutroni che decadono in protoni, 10-15 protoni
    for (let g = 0; g < NG; g++) for (let k = 0; k < 16; k++) {
      const b = mobile(1); b.g = g; b.k = k; b.j = rnd(); b.fase = rnd() * 6.283; b.q = [0, 1, 2].map(() => mobile(1.6));
      m.nuc.push(b);
    }
    // un elettrone per ogni protone finale
    for (const b of m.nuc) if (b.k <= 1 || b.k >= 4) {
      const e = mobile(3); e.n = b; e.j = rnd(); e.fase = rnd() * 6.283; e.he = b.k <= 1 ? b.k + 1 : 0;
      m.ele.push(e);
    }
    for (let i = 0; i < 70; i++) { const f = mobile(1); f.coda = []; f.attesa = 0; f.uv = i < 26; m.fot.push(f); }
    for (let i = 0; i < 22; i++) m.nu.push(mobile(1));
    m.cop = Array.from({ length: NCOP }, (_, k) => ({ k, o: rnd() * 10, per: 1.2 + rnd() * 0.8 }));
    return m;
  }
  function composizione(T, z, contrazione) {
    const L = Math.log10(T);
    return {
      L, T,
      copQ: 1 - lin(L, 12.3, 11.7), copE: 1 - lin(L, 10, 9.4),               // coppie quark-antiquark, elettrone-positrone
      nfr: L >= 10.6 ? 0.5 : L >= 10 ? 0.5 - 0.34 * lin(L, 10.6, 10) : 0.16 - 0.035 * lin(L, 10, 9),   // neutroni / nucleoni
      nuc: lin(L, 9, 8.72),                                                    // nucleosintesi
      reion: contrazione ? 1 : lin(z, 14, 6), he2: contrazione ? 1 : lin(z, 4, 2.8),
      uv: contrazione ? 0 : Math.sin(Math.PI * lin(z, 20, 5))
    };
  }
  function legame(e, C) {
    const T = C.T;
    let b;
    if (e.he === 1) b = lin(T, 16000, 12000) * (1 - C.he2);
    else if (e.he === 2) b = lin(T, 7500, 5500) * (1 - lin(C.reion, e.j * 0.8, e.j * 0.8 + 0.2));
    else { const Tb = 2750 + 900 * e.j; b = lin(T, Tb + 200, Tb - 200) * (1 - lin(C.reion, e.j * 0.8, e.j * 0.8 + 0.2)); }
    return liscio(b);
  }
  const D_HE = 0.0075;
  function aggiornaMicro(dt, C) {
    const m = micro, L = C.L, vv = 0.012 * (0.3 + 0.7 * lin(L, 3, 11));
    orologio += dt;
    const mv = (p, v) => { p.x = ((p.x + p.vx * v * dt) % 1 + 1) % 1; p.y = ((p.y + p.vy * v * dt) % 1 + 1) % 1; };
    const verso = (p, tx, ty, w) => {
      if (w <= 0) return;
      let dx = tx - p.px, dy = ty - p.py; dx -= Math.round(dx); dy -= Math.round(dy);
      p.px = ((p.px + dx * w) % 1 + 1) % 1; p.py = ((p.py + dy * w) % 1 + 1) % 1;
    };
    for (const b of m.nuc) {
      mv(b, vv); b.px = b.x; b.py = b.y;
      b.conf = liscio(lin(L, 12.5 - 0.3 * b.j, 12.15 - 0.3 * b.j));
      const c = b.k - 4;
      b.neutro = b.k === 2 || b.k === 3 ? 1 : c >= 0 && c < 6 ? liscio(lin(16 * C.nfr - 2 - c, 0.2, 0.8)) : 0;
    }
    // nucleosintesi: protone + neutrone = deuterio, poi deuterio + deuterio = elio
    const wD = liscio(lin(C.nuc, 0, 0.5)), wHe = liscio(lin(C.nuc, 0.45, 1)), d = D_HE;
    for (let g = 0; g < NG; g++) {
      const [p0, p1, n2, n3] = m.nuc.slice(g * 16, g * 16 + 4);
      verso(n2, p0.x + d, p0.y, wD); verso(n3, p1.x + d, p1.y, wD);
      verso(p1, p0.x, p0.y + d, wHe); verso(n3, p0.x + d, p0.y + d, wHe);
    }
    for (const b of m.nuc) b.q.forEach((q, i) => {
      mv(q, vv * 1.6); q.px = q.x; q.py = q.y;
      const an = b.fase + orologio * 2.5 + i * 2.094;
      verso(q, b.px + 0.0026 * Math.cos(an), b.py + 0.0026 * Math.sin(an), b.conf);
    });
    // elettroni: liberi o in orbita attorno al loro nucleo
    let liberi = 0, tot = 0;
    for (const e of m.ele) {
      mv(e, vv * 2.2); e.px = e.x; e.py = e.y;
      e.vis = 1 - e.n.neutro; e.b = legame(e, C);
      const p0 = m.nuc[e.n.g * 16];
      e.nx = e.he ? p0.px + d / 2 : e.n.px; e.ny = e.he ? p0.py + d / 2 : e.n.py; e.ro = e.he ? 0.0095 : 0.012;
      const an = e.fase + orologio * 2.2 + (e.he === 2 ? Math.PI : 0);
      verso(e, e.nx + e.ro * Math.cos(an), e.ny + e.ro * Math.sin(an), e.b);
      if (e.vis > 0.5) { tot++; if (e.b < 0.5) liberi++; }
    }
    m.xe = tot ? liberi / tot : 0;
    // fotoni: viaggiano sempre alla stessa velocità; finché ci sono elettroni liberi vengono deviati (diffusione Thomson)
    const R = 0.016;
    for (const f of m.fot) {
      const x0 = f.x, y0 = f.y; mv(f, 0.09);
      f.coda.push(x0, y0); if (f.coda.length > 24) f.coda.splice(0, 2);
      if ((f.attesa -= dt) > 0) continue;
      let u = null;
      if (m.xe > 0.01) for (const e of m.ele) {
        if (e.vis < 0.5 || e.b > 0.5) continue;
        let dx = e.px - f.x, dy = e.py - f.y; dx -= Math.round(dx); dy -= Math.round(dy);
        if (dx * dx + dy * dy < R * R) { u = e; break; }
      }
      if (!u && L > 5 && Math.random() < dt * 3) u = { px: f.x, py: f.y };   // nel plasma caldissimo gli urti sono continui
      if (u) {
        const an = Math.random() * 6.283; f.vx = Math.cos(an); f.vy = Math.sin(an); f.attesa = 0.12;
        if (m.lampi.length < 60) m.lampi.push({ x: u.px, y: u.py, v: 0.3 });
      }
    }
    for (const n of m.nu) {
      mv(n, 0.085);
      if (L > 10 && Math.random() < dt * 4) { const an = Math.random() * 6.283; n.vx = Math.cos(an); n.vy = Math.sin(an); }
    }
    for (const l of m.lampi) l.v -= dt;
    m.lampi = m.lampi.filter(l => l.v > 0);
  }

  // zig-zag tra due punti (gluoni e fotoni)
  function onda(x1, y1, x2, y2, amp, n) {
    const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1, ux = -dy / l, uy = dx / l;
    ctx.moveTo(x1, y1);
    for (let i = 1; i <= n; i++) { const f = i / n, o = i < n ? (i % 2 ? amp : -amp) : 0; ctx.lineTo(x1 + dx * f + ux * o, y1 + dy * f + uy * o); }
  }

  function disegnaMicro(V, C, leg) {
    const m = micro, S = V.S, ox = V.x - S / 2, oy = V.y - S / 2, L = C.L, T = C.T;
    const X = x => ox + x * S, Y = y => oy + y * S;
    const dentro = (x, y) => (x - V.x) ** 2 + (y - V.y) ** 2 < (V.r + 12) ** 2;
    const rN = Math.max(1.4, 0.0042 * S), rE = Math.max(1.1, 0.002 * S), rQ = Math.max(1, 0.0021 * S);
    const vedoQuark = m.nuc.some(b => b.conf < 0.98), quarkDentro = L > 9.6 && rN > 3;
    // gluoni tra quark vicini
    if (vedoQuark || quarkDentro) {
      ctx.strokeStyle = 'rgba(255,215,90,0.55)'; ctx.lineWidth = 1; ctx.beginPath();
      m.nuc.forEach((b, ib) => {
        if (b.conf >= 0.98 && !quarkDentro) return;
        const vicino = m.nuc[(ib + 1) % m.nuc.length];
        for (let i = 0; i < 4; i++) {
          // tra i quark dello stesso nucleone e, finché sono liberi, anche con quelli di un altro
          const q1 = b.q[i % 3], q2 = i < 3 ? b.q[(i + 1) % 3] : vicino.q[ib % 3];
          if (i === 3 && b.conf > 0.5) continue;
          let dx = q2.px - q1.px, dy = q2.py - q1.py; dx -= Math.round(dx); dy -= Math.round(dy);
          if (dx * dx + dy * dy > 0.01) continue;
          const x1 = X(q1.px), y1 = Y(q1.py);
          if (dentro(x1, y1)) onda(x1, y1, x1 + dx * S, y1 + dy * S, Math.max(1, rQ * 0.5), 6);
        }
      });
      ctx.stroke();
      leg.push('g');
    }
    // coppie particella-antiparticella che nascono dalla luce e si annichilano
    let cq = false, ce = false;
    for (const c of m.cop) {
      const isQ = c.k < NCOP / 2, A = isQ ? C.copQ : C.copE;
      if (c.k % (NCOP / 2) >= A * NCOP / 2) continue;
      const ph = (orologio + c.o) / c.per, ciclo = Math.floor(ph), f = ph - ciclo;
      const h = n => { const s = Math.sin(c.k * 12.9898 + ciclo * 78.233 + n * 37.719) * 43758.5453; return s - Math.floor(s); };
      const x = X(h(1)), y = Y(h(2)), an = h(3) * 6.283, sep = 0.011 * S * Math.sin(Math.PI * f);
      if (!dentro(x, y)) continue;
      const c1 = isQ ? QCOL[c.k % 3] : '79,210,255', c2 = isQ ? QCOL[c.k % 3] : '255,120,210', r = isQ ? rQ * 1.3 : rE * 1.2;
      if (f > 0.06 && f < 0.94) {
        ctx.fillStyle = `rgb(${c1})`; ctx.beginPath(); ctx.arc(x + Math.cos(an) * sep, y + Math.sin(an) * sep, r, 0, 7); ctx.fill();
        ctx.strokeStyle = `rgb(${c2})`; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(x - Math.cos(an) * sep, y - Math.sin(an) * sep, r, 0, 7); ctx.stroke();
      }
      if (f < 0.1 || f > 0.9) { const v = f < 0.1 ? 1 - f / 0.1 : (f - 0.9) / 0.1; bagliore(x, y, 3 + 9 * v, '255,250,220', v); }
      if (isQ) cq = true; else ce = true;
    }
    if (cq) leg.push('aq'); if (ce) leg.push('ep');
    // nucleoni
    let np = false, nn = false;
    for (const b of m.nuc) {
      if (b.conf < 0.03) continue;
      const x = X(b.px), y = Y(b.py);
      if (!dentro(x, y)) continue;
      const w = b.neutro, r = Math.round(255 - 50 * w), g = Math.round(95 + 120 * w), bl = Math.round(80 + 150 * w);
      ctx.fillStyle = `rgba(${r},${g},${bl},${b.conf})`; ctx.beginPath(); ctx.arc(x, y, rN, 0, 7); ctx.fill();
      if (b.k > 3 || C.nuc < 0.5) { if (w > 0.5) nn = true; else np = true; }   // quelli dell'elio contano come nucleo di elio
    }
    // quark: liberi, oppure (finché fa molto caldo) visibili dentro i nucleoni
    if (vedoQuark || quarkDentro) {
      for (const b of m.nuc) {
        if (b.conf >= 0.98 && !quarkDentro) continue;
        b.q.forEach((q, i) => {
          const x = X(q.px), y = Y(q.py);
          if (!dentro(x, y)) return;
          ctx.fillStyle = `rgb(${QCOL[i]})`; ctx.beginPath(); ctx.arc(x, y, b.conf > 0.9 ? rQ * 0.75 : rQ, 0, 7); ctx.fill();
        });
      }
      leg.push('q');
    }
    // elettroni (con l'orbita, quando sono legati a un nucleo)
    let ne = false, atH = false, atHe = false;
    for (const e of m.ele) {
      if (e.vis < 0.05) continue;
      const x = X(e.px), y = Y(e.py);
      if (e.b > 0.3) {
        const nx = X(e.nx), ny = Y(e.ny);
        if (dentro(nx, ny)) { ctx.strokeStyle = `rgba(79,210,255,${0.28 * e.b})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(nx, ny, e.ro * S, 0, 7); ctx.stroke(); }
        if (e.b > 0.6) { if (e.he) atHe = true; else atH = true; }
      }
      if (!dentro(x, y)) continue;
      ctx.fillStyle = `rgba(79,210,255,${e.vis})`; ctx.beginPath(); ctx.arc(x, y, rE, 0, 7); ctx.fill();
      if (e.b < 0.6) ne = true;
    }
    // fotoni, con la scia che mostra il percorso a zig-zag
    const colF = T > 40000 ? '235,240,255' : T > 1300 ? coloreTemp(T).join(',') : '255,90,60', aF = T > 1300 ? 0.95 : T > 40 ? 0.55 : 0.3;
    const lf = Math.max(6, 0.012 * S), lam = 2 + 2.2 * Math.max(0, Math.log10(1e5 / T));
    for (const f of m.fot) {
      const uv = f.uv && C.uv > 0.05, col = uv ? '200,130,255' : colF, al = uv ? C.uv : aF;
      const x = X(f.x), y = Y(f.y);
      if (!dentro(x, y)) continue;
      ctx.strokeStyle = `rgba(${col},${al * 0.35})`; ctx.lineWidth = 1; ctx.beginPath();
      let px = x, py = y;
      for (let i = f.coda.length - 2; i >= 0; i -= 2) {
        const qx = X(f.coda[i]), qy = Y(f.coda[i + 1]);
        if (Math.abs(qx - px) > S / 3 || Math.abs(qy - py) > S / 3) break;
        ctx.moveTo(px, py); ctx.lineTo(qx, qy); px = qx; py = qy;
      }
      ctx.stroke();
      ctx.strokeStyle = `rgba(${col},${al})`; ctx.lineWidth = 1.4; ctx.beginPath();
      onda(x - f.vx * lf, y - f.vy * lf, x, y, 1.6, Math.max(2, Math.min(10, Math.round(lf / lam))));
      ctx.stroke();
    }
    leg.push('f'); if (C.uv > 0.05) leg.push('uv');
    // neutrini
    ctx.fillStyle = 'rgba(200,200,200,0.55)';
    for (const n of m.nu) { const x = X(n.x), y = Y(n.y); if (dentro(x, y)) ctx.fillRect(x - 1, y - 1, 2, 2); }
    if (T > 1e8) leg.push('nu');
    // lampi degli urti
    for (const l of m.lampi) {
      const x = X(l.x), y = Y(l.y);
      if (!dentro(x, y)) continue;
      ctx.strokeStyle = `rgba(255,250,210,${Math.min(1, l.v * 3)})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, 2 + (1 - l.v / 0.3) * 8, 0, 7); ctx.stroke();
    }
    if (np) leg.push('p'); if (nn) leg.push('n'); if (ne) leg.push('e');
    if (C.nuc > 0 && C.nuc < 0.6) leg.push('d');
    if (C.nuc > 0.5 && !atHe) leg.push('he');
    if (atH) leg.push('H'); if (atHe) leg.push('He');
    // un'etichetta sull'oggetto più vicino al centro
    if (V.r > 250) {
      let et = null, dm = Infinity;
      const prova = (x, y, s) => { const dd = (x - V.x) ** 2 + (y - V.y) ** 2; if (dd < dm) { dm = dd; et = [x, y, s]; } };
      if (C.nuc > 0.7 && T > 2700) for (let g = 0; g < NG; g++) { const p0 = m.nuc[g * 16]; prova(X(p0.px + D_HE / 2), Y(p0.py + D_HE / 2), atHe ? 'atomo di elio' : 'nucleo di elio'); }
      else if (T <= 2700 || atH) for (const e of m.ele) if (!e.he && e.b > 0.8) prova(X(e.nx), Y(e.ny), 'atomo di idrogeno');
      if (et) testo(et[2], et[0] + 16, et[1] - 12);
    }
  }

  /* ---------- Lente sul Gruppo Locale: le galassie si fondono, gli altri gruppi si allontanano ---------- */
  const GRUPPO = (() => {
    let s = 4242;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    return {
      piccole: Array.from({ length: 16 }, (_, i) => ({ ospite: i >= 13 ? 0 : i % 2, ang: rnd() * 6.283, d: 0.25 + 0.4 * rnd(), tm: i < 13 ? 1.4 + 3.6 * rnd() : 5.5 + 5 * rnd(), m: 0.3 + 0.7 * rnd() })),
      lontane: Array.from({ length: 14 }, () => ({ ang: rnd() * 6.283, d: 0.3 + 0.35 * rnd(), rot: rnd() * 3, spirale: rnd() < 0.6 }))
    };
  })();
  function galassia(x, y, R, ang, tipo, al) {
    if (R < 0.8 || al <= 0.01) return;
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.globalAlpha *= al;
    let g;
    if (tipo === 'ellittica') {
      ctx.scale(1, 0.7);
      g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
      g.addColorStop(0, 'rgba(255,240,215,1)'); g.addColorStop(0.3, 'rgba(255,215,170,0.6)'); g.addColorStop(1, 'rgba(255,190,140,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.fill();
    } else if (tipo === 'irregolare') {
      g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
      g.addColorStop(0, 'rgba(225,235,255,1)'); g.addColorStop(1, 'rgba(140,170,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.fill();
    } else {
      ctx.scale(1, 0.5);
      g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
      g.addColorStop(0, 'rgba(255,245,220,1)'); g.addColorStop(0.18, 'rgba(255,225,180,0.8)'); g.addColorStop(0.4, 'rgba(150,180,255,0.35)'); g.addColorStop(1, 'rgba(120,150,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(200,220,255,0.6)'; ctx.lineWidth = Math.max(0.8, R * 0.09);
      for (let k = 0; k < 2; k++) {
        ctx.beginPath();
        for (let s = 0; s <= 1.001; s += 0.1) { const th = k * Math.PI + s * 3.3, ro = R * (0.12 + 0.8 * s); ctx[s ? 'lineTo' : 'moveTo'](ro * Math.cos(th), ro * Math.sin(th)); }
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  function disegnaGruppo(V, t, a, leg) {
    const r = V.r, tt = t / GA, t0 = tab.t0 / GA, tf = t0 + 4.5;
    // le galassie degli altri gruppi seguono l'espansione
    const sc = a / 0.6;
    for (const g of GRUPPO.lontane) {
      const dd = g.d * sc, al = lin(tt, 1.2, 2) * (1 - lin(dd, 0.85, 1.1));
      if (al > 0.02) galassia(V.x + Math.cos(g.ang) * dd * r, V.y + Math.sin(g.ang) * dd * r, r * 0.045, g.rot, g.spirale ? 'spirale' : 'ellittica', al * 0.8);
    }
    // distanza tra Via Lattea e Andromeda: si allontanano con l'espansione, poi la gravità le riavvicina
    let d;
    if (tt < 5) d = 0.55 + 0.85 * Math.pow(lin(tt, 1, 5), 0.6);
    else if (tt < t0) d = 1.4 - 0.5 * liscio(lin(tt, 5, t0));
    else d = 0.9 * Math.pow(1 - lin(tt, t0, tf), 0.7);
    const fusa = lin(tt, tf - 0.2, tf + 1), ux = 0.88, uy = -0.47;
    const pos = [{ x: V.x - ux * d / 2 * r, y: V.y - uy * d / 2 * r }, { x: V.x + ux * d / 2 * r, y: V.y + uy * d / 2 * r }];
    const massa = [1, 1];
    for (const p of GRUPPO.piccole) {
      const o = pos[p.ospite];
      if (tt >= p.tm) {
        massa[p.ospite] += p.m;
        if (tt < p.tm + 0.3) { const v = 1 - (tt - p.tm) / 0.3; ctx.strokeStyle = `rgba(255,230,180,${v})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(o.x, o.y, r * (0.08 + 0.12 * (1 - v)), 0, 7); ctx.stroke(); }
        continue;
      }
      const al = lin(tt, 0.9, 1.4), f = lin(tt, 0.9, p.tm), dd = p.d * r * Math.pow(1 - f, 1.1), an = p.ang + 5 * f;
      galassia(o.x + Math.cos(an) * dd, o.y + Math.sin(an) * dd * 0.8, r * 0.035 * Math.sqrt(p.m), an, 'irregolare', al);
    }
    const tipo = tt < 2.5 ? 'irregolare' : 'spirale', al0 = lin(tt, 0.8, 1.3);
    if (fusa < 1) {
      galassia(pos[0].x, pos[0].y, r * 0.055 * Math.sqrt(massa[0]), 0.5 + orologio * 0.25, tipo, al0 * (1 - fusa));
      galassia(pos[1].x, pos[1].y, r * 0.05 * Math.sqrt(massa[1]), 2.2 - orologio * 0.2, tipo, al0 * (1 - fusa));
    }
    if (fusa > 0) galassia(V.x, V.y, r * 0.3, 0.4, 'ellittica', fusa);
    leg.push('gal');
    if (V.r > 60) {
      if (tt > 2.5 && fusa < 0.5) {
        testo('Via Lattea', pos[0].x, pos[0].y + r * 0.2 + 10, 'center', 11);
        testo('Andromeda', pos[1].x, pos[1].y - r * 0.15 - 4, 'center', 11);
      } else if (fusa >= 0.5) testo('Via Lattea + Andromeda', V.x, V.y + r * 0.3 + 12, 'center', 11);
    }
  }

  function posLente() {
    const cr = canvas.getBoundingClientRect();
    let fondo = dom.linea.getBoundingClientRect().top - cr.top;
    const er = dom.epoca.getBoundingClientRect();
    if (er.bottom - cr.top > H * 0.6) fondo = Math.min(fondo, er.top - cr.top);   // pannello dell'epoca in basso (telefono)
    const r = Math.max(50, Math.min(140, Math.min(W, H) * 0.17)) * (Uni.lenteGrande ? 1.7 : 1);
    return { x: W - r - 16, y: Math.max(r + 30, fondo - r - 14), r };
  }

  // la lente: a tutto schermo nel plasma primordiale, poi si rimpicciolisce in un angolo
  function disegnaLente(k, t, a, z, C, contrazione, dt, leg) {
    const P = posLente(), Sg = Math.max(W, H) * 1.08;
    const V = {
      x: W / 2 + (P.x - W / 2) * k, y: H / 2 + (P.y - H / 2) * k,
      r: Math.hypot(W, H) / 2 + 20 + (P.r - Math.hypot(W, H) / 2 - 20) * k,
      S: Sg + (P.r * 2 / 0.4 - Sg) * k
    };
    Uni.lente = k > 0.99 ? P : null;
    const wG = tab.t0 && !contrazione ? lin(t / GA, 1, 1.6) : 0;
    ctx.save(); ctx.beginPath(); ctx.arc(V.x, V.y, V.r, 0, 7); ctx.clip();
    ctx.fillStyle = '#04050c'; ctx.fillRect(V.x - V.r, V.y - V.r, 2 * V.r, 2 * V.r);
    const T = C.T, lum = T > 2600 ? 0.15 : 0.15 * lin(T, 1500, 2600);
    if (lum > 0) {
      const c = T > 40000 ? [205, 215, 255] : coloreTemp(T), g = ctx.createRadialGradient(V.x, V.y, 0, V.x, V.y, V.r);
      g.addColorStop(0, `rgba(${c},${lum * 1.3})`); g.addColorStop(1, `rgba(${c},${lum * 0.6})`);
      ctx.fillStyle = g; ctx.fillRect(V.x - V.r, V.y - V.r, 2 * V.r, 2 * V.r);
    }
    if (wG < 1) { aggiornaMicro(dt, C); ctx.globalAlpha = 1 - wG; disegnaMicro(V, C, wG > 0.5 ? [] : leg); }
    if (wG > 0) { ctx.globalAlpha = wG; disegnaGruppo(V, t, a, wG > 0.5 ? leg : []); }
    ctx.globalAlpha = 1;
    ctx.restore();
    if (k > 0.5) {
      ctx.strokeStyle = 'rgba(200,215,255,0.65)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(V.x, V.y, V.r, 0, 7); ctx.stroke();
      testo(wG > 0.5 ? 'Lente: il nostro Gruppo Locale' : 'Lente: il gas tra le galassie', V.x, V.y - V.r - 8, 'center');
    } else testo('Vista ingrandita e schematica: dimensioni, numeri e velocità non sono in scala', W / 2, 22, 'center');
  }

  function disegna(dt) {
    const t = tDaU(Uni.u), a = aDaT(t), T = T0K / a, D = crescita(t), z = 1 / a - 1, contrazione = tab.svolta && t > tab.svolta.t;
    const C = composizione(T, z, contrazione), leg = [];
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const k = liscio(lin(T, 2600, 1700));                  // 0: lente a tutto schermo, 1: lente piccola
    if (k > 0) disegnaGrande(t, a, T, D, z, contrazione, leg);
    if (t >= 1e-32) disegnaLente(k, t, a, z, C, contrazione, dt, leg);
    // inflazione: il punto che si gonfia
    if (t < 1e-30) {
      const cx = W / 2, cy = H / 2, f = Math.max(0, (Math.log10(t) + 36) / 6), r = 4 + f * Math.max(W, H);
      if (t < 1e-32) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
      const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.6, 'rgba(255,250,235,0.95)'); gr.addColorStop(1, 'rgba(255,240,220,0)');
      ctx.globalAlpha = t < 1e-32 ? 1 : 1 - lin(Math.log10(t), -32, -30); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    }
    return { t, a, T, z, D, C, leg };
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
  const LEGENDA = {
    q: ['quark', 'background:conic-gradient(#ff5a5a 0 33%,#5af078 0 66%,#5a8cff 0)'],
    g: ['gluone', 'width:12px;height:3px;border-radius:1px;background:#ffd75a'],
    aq: ['antiquark', 'background:none;border:2px solid #ff5a5a'],
    p: ['protone', 'background:#ff5f50'],
    n: ['neutrone', 'background:#cdd7e6'],
    d: ['deuterio (protone + neutrone)', 'width:14px;border-radius:5px;background:linear-gradient(90deg,#ff5f50 50%,#cdd7e6 0)'],
    he: ['nucleo di elio', 'background:conic-gradient(#ff5f50 0 25%,#cdd7e6 0 50%,#ff5f50 0 75%,#cdd7e6 0)'],
    e: ['elettrone', 'width:6px;height:6px;background:#4fd2ff'],
    ep: ['positrone (antielettrone)', 'width:6px;height:6px;background:none;border:2px solid #ff78d2'],
    H: ['atomo di idrogeno', 'background:radial-gradient(#ff5f50 30%,transparent 38%);border:1px solid #4fd2ff'],
    He: ['atomo di elio', 'background:radial-gradient(#ffaa96 30%,transparent 38%);border:1px solid #4fd2ff'],
    f: ['fotone (luce)', 'width:12px;height:3px;border-radius:1px;background:#ffe9a0'],
    uv: ['luce ultravioletta', 'width:12px;height:3px;border-radius:1px;background:#c882ff'],
    nu: ['neutrino', 'width:5px;height:5px;background:#bbb'],
    web: ['gas e materia oscura', 'width:6px;height:6px;border-radius:1px;background:#8296e6'],
    gal: ['galassie', 'background:radial-gradient(#fff6e0,#9fb4ff 60%,transparent 70%)'],
    st: ['prima stella', 'background:#cfe4ff;box-shadow:0 0 6px #8cf'],
    sn: ['supernova', 'background:none;border:2px solid #ffb46e'],
    bh: ['buco nero', 'background:#000;border:2px solid #ff963c'],
    bub: ['gas ionizzato', 'background:#8c5fff'],
    qso: ['quasar', 'background:#fff;box-shadow:0 0 6px #9cf']
  };
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
    const n = nodi, tc = [['Big Bang', 1e-36], ['Inflazione', 1e-33], ['Quark', 1e-9], ['Protoni', n.quark * 3], ['Neutrini liberi', 1.5], ['Nuclei di elio', 300],
      ['Primi atomi', n.luce], ['Prime stelle', n.pop[0].t], ['Reionizzazione', n.reion], ['Galassie e quasar', n.picco]];
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
    dom.titolo = el('h3'); dom.testo = el('p'); dom.dati = el('div.uni-dati'); dom.legenda = el('div.uni-legenda');
    const epocaP = dom.epoca = el('aside.pannello.uni-epoca', {}, el('div.corpo', { style: 'padding-top:10px' }, dom.titolo, dom.testo, dom.legenda, dom.dati));
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
    const linea = dom.linea = el('div.uni-linea', {},
      el('div.uni-comandi', {}, dom.bGioca, dom.verso, dom.ritmo, el('span', { testo: 'Tempo dal Big Bang:' }), dom.tempo,
        el('span.nota', { testo: 'Trascina il cursore o clicca un\'epoca. La scala del tempo non è uniforme: fino a 100 milioni di anni è logaritmica e le epoche ricche di eventi hanno più spazio.' })),
      el('div.uni-cursore', {}, dom.cursore, dom.tacche));
    box.append(canvas, pannello, epocaP, linea);
    if (window.ResizeObserver) new ResizeObserver(() => Uni.ridimensiona()).observe(canvas);
    canvas.addEventListener('click', e => {
      const L = Uni.lente, r = canvas.getBoundingClientRect();
      if (L && Math.hypot(e.clientX - r.left - L.x, e.clientY - r.top - L.y) < L.r) Uni.lenteGrande = !Uni.lenteGrande;
    });
    campo = creaCampo();
    micro = creaMicro();
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
    Grav.ui.avviso('Universo dal Big Bang', 'Muovi il cursore del tempo o premi ▶ (anche all\'indietro). A sinistra cambi gli "ingredienti": più materia porta al Big Crunch, un\'energia oscura con w < −1 al Big Rip. All\'inizio vedi le particelle "al microscopio": quark, protoni, elettroni, luce, i primi nuclei e i primi atomi. Dopo la prima luce la vista si allarga sulla ragnatela cosmica e le particelle restano in una lente (clic sulla lente per ingrandirla), dove più tardi si formano la Via Lattea e Andromeda. Ogni puntino della ragnatela è una regione grande come un ammasso di galassie. È un modello semplificato, ma i tempi e le temperature sono quelli calcolati con le equazioni della cosmologia.', 25);
  };

  let attesaTesto = 0;
  Uni.frame = function (dt) {
    if (!ctx) { Uni.ridimensiona(); if (!ctx) return; }
    if (Uni.gioca) {
      Uni.u += Uni.verso * dt * 0.014 * Uni.ritmo;
      if (Uni.u >= 1) { Uni.u = 1; Uni.gioca = false; aggiornaGioca(); }
      if (Uni.u <= 0) { Uni.u = 0; Uni.gioca = false; aggiornaGioca(); }
    }
    const s = disegna(Math.min(dt, 0.05));
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
      const C = s.C, pc = x => Math.round(100 * x) + '%';
      if (C.L > 8.6 && C.L < 10.8) voci.push(['Neutroni ogni 100 protoni', String(Math.round(100 * C.nfr / (1 - C.nfr)))]);
      if (s.T < 1.2e9 && s.T > 1500) voci.push(['Elio (in massa)', pc(0.25 * liscio(lin(C.nuc, 0.45, 1)))]);
      if (s.T < 2e4 && s.T > 1000) voci.push(['Elettroni liberi', pc(micro.xe)]);
      if (s.z < 25 && s.z > 2.5 && s.T < 1000) voci.push(['Idrogeno ionizzato tra le galassie', pc(C.reion)]);
      const chiavi = [...new Set(s.leg)].filter(k => LEGENDA[k]);
      if (chiavi.join() !== dom.legenda.dataset.k) {
        dom.legenda.dataset.k = chiavi.join();
        dom.legenda.replaceChildren(...chiavi.map(k => el('span', {}, el('i', { style: LEGENDA[k][1] }), LEGENDA[k][0])));
      }
      dom.dati.replaceChildren(...voci.flatMap(([k, v]) => [el('span', { testo: k }), el('span', { testo: v })]));
      disegnaScala(s.t);
    }
  };
})();
