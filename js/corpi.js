/* Catalogo dei tipi di corpo celeste e funzioni per crearli e modificarli */
(function () {
  'use strict';
  const { G, U } = Grav;

  // luce: brilla di luce propria; compatto: oggetto degenere; piccolo: tenuto insieme dalla
  // rigidità del materiale (non viene distrutto dalle maree); fluido: per il limite di Roche;
  // albedo: frazione di luce riflessa (per la temperatura prevista); elastico: rimbalza invece di fondersi
  const TIPI = {
    stella:    { nome: 'Stella', m: U.MS, r: U.RS, colore: '#ffe08a', luce: 1, fluido: 1, minPx: 7,
                 info: 'Sfera di gas caldo che produce energia con la fusione nucleare.' },
    gigante:   { nome: 'Gigante rossa', m: 1.2 * U.MS, r: 120 * U.RS, colore: '#ff7b4f', luce: 1, fluido: 1, minPx: 9,
                 info: 'Stella anziana che si è gonfiata: enorme ma poco densa.' },
    nana:      { nome: 'Nana bianca', m: 0.6 * U.MS, r: 0.0126 * U.RS, colore: '#e4ecff', luce: 1, compatto: 1, minPx: 4,
                 info: 'Nucleo spento di una stella come il Sole: grande come la Terra, massa come il Sole. Oltre 1,4 M☉ (limite di Chandrasekhar) esplode.' },
    neutroni:  { nome: 'Stella di neutroni', m: 1.4 * U.MS, r: 12e3, colore: '#a6ecff', luce: 1, compatto: 1, minPx: 4.5,
                 info: 'Resto di una supernova: più del Sole in una sfera di 12 km. Oltre circa 2,3 M☉ collassa in buco nero.' },
    buco:      { nome: 'Buco nero', m: 10 * U.MS, r: 0, colore: '#000000', compatto: 1, minPx: 6,
                 info: 'Nulla, nemmeno la luce, sfugge dall\'orizzonte degli eventi. Il raggio è quello di Schwarzschild: 2GM/c².' },
    gassoso:   { nome: 'Gigante gassoso', m: U.MG, r: U.RG, colore: '#d8a26a', fluido: 1, minPx: 6, albedo: 0.34,
                 info: 'Pianeta fatto soprattutto di idrogeno ed elio, come Giove.' },
    roccioso:  { nome: 'Pianeta roccioso', m: U.MT, r: U.RT, colore: '#4c8fdc', minPx: 4.5, albedo: 0.3,
                 info: 'Pianeta di roccia e metallo, come la Terra.' },
    luna:      { nome: 'Luna', m: U.ML, r: U.RL, colore: '#c4c0b8', minPx: 3.5, albedo: 0.12,
                 info: 'Satellite naturale.' },
    asteroide: { nome: 'Asteroide', m: 1e15, r: 5e3, colore: '#a08f7a', piccolo: 1, minPx: 2.5, albedo: 0.1,
                 info: 'Piccolo corpo roccioso.' },
    cometa:    { nome: 'Cometa', m: 2e13, r: 2e3, colore: '#c9f1ff', piccolo: 1, minPx: 2.5, albedo: 0.04,
                 info: 'Blocco di ghiaccio e polvere: vicino a una stella sviluppa la coda, che punta sempre lontano dalla stella.' },
    satellite: { nome: 'Satellite artificiale', m: 1000, r: 10, colore: '#f2f2f2', piccolo: 1, minPx: 2.5, albedo: 0.5,
                 info: 'Oggetto costruito dall\'uomo: la sua massa non influisce sugli altri corpi.' },
    // densità di un vero pallone da basket (0,6 kg in una sfera di 12 cm di raggio) con il raggio della Terra
    pallone:   { nome: 'Pallone da basket gigante', m: 9e22, r: U.RT, colore: '#e8742c', piccolo: 1, elastico: 1, minPx: 5, albedo: 0.3,
                 info: 'Pura fantasia: un pallone da basket grande come la Terra. È pieno d\'aria, quindi leggerissimo (stessa densità di un pallone vero, circa 0,08 g/cm³). Sui corpi solidi rimbalza con un urto perfettamente elastico (un pallone vero perde un po\' di energia a ogni rimbalzo); stelle, giganti gassosi e buchi neri invece lo inghiottono. In questo gioco le maree non lo distruggono.' },
    galassia:  { nome: 'Nucleo di galassia', m: 1e11 * U.MS, r: 1e19, colore: '#fff1d0', luce: 1, piccolo: 1, minPx: 6, interno: 1,
                 info: 'Centro di una galassia: rappresenta la massa di stelle, gas e materia oscura.' },
    frammento: { nome: 'Frammento', m: 1e20, r: 2e5, colore: '#bbbbbb', piccolo: 1, minPx: 2.5, interno: 1, albedo: 0.2,
                 info: 'Pezzo nato da un urto o da una distruzione mareale.' }
  };

  const MAX_NANA = 1.44 * U.MS, MAX_NEUTRONI = 2.3 * U.MS;
  const VOL = r => 4 / 3 * Math.PI * r * r * r;

  function coloreTemperatura(T) {
    const t = T / 100; let r, g, b;
    if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04; }
    else { r = 329.7 * Math.pow(t - 60, -0.1332); g = 288.12 * Math.pow(t - 60, -0.0755); b = 255; }
    const h = v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
    return '#' + h(r) + h(g) + h(b);
  }
  // Colore approssimato di una stella di sequenza principale in base alla massa
  const coloreStella = m => coloreTemperatura(Math.max(2600, Math.min(40000, 5778 * Math.pow(m / U.MS, 0.55))));

  let prossimoId = 1;
  const contatori = {};

  const C = {
    TIPI, MAX_NANA, MAX_NEUTRONI, coloreStella,
    raggioSchw: m => 2 * G * m / Math.pow(Grav.sim.cEff(), 2),
    densita: b => b.m / VOL(b.r),
    raggioDaDensita: (m, rho) => Math.cbrt(m / rho / (4 / 3 * Math.PI)),
    massaDaDensita: (r, rho) => rho * VOL(r),
    raggioNana: m => 0.0126 * U.RS * Math.cbrt(0.6 * U.MS / m),
    luce: b => b.luce != null ? b.luce : !!TIPI[b.tipo].luce,
    compatto: b => !!TIPI[b.tipo].compatto,

    // Luminosità stimata in watt. Stelle: relazione massa-luminosità della sequenza principale; gli altri
    // corpi luminosi: temperatura tipica della superficie e raggio (L = 4πR²σT⁴); galassie: 1 L☉ ogni 10 M☉.
    luminosita(b) {
      const m = b.m / U.MS, daT = T => 4 * Math.PI * b.r * b.r * U.SIGMA * T ** 4;
      switch (b.tipo) {
        case 'gigante': return daT(3800);
        case 'nana': return daT(1e4);
        case 'neutroni': return daT(1e6);
        case 'galassia': return U.LS * m / 10;
      }
      return U.LS * (m < 0.43 ? 0.23 * m ** 2.3 : m < 2 ? m ** 4 : m < 55 ? 1.4 * m ** 3.5 : 32000 * m);
    },

    crea(tipo, p = {}) {
      const T = TIPI[tipo];
      contatori[tipo] = (contatori[tipo] || 0) + 1;
      const b = Object.assign({
        tipo, nome: T.nome + (contatori[tipo] > 1 ? ' ' + contatori[tipo] : ''),
        m: T.m, r: T.r, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ax: 0, ay: 0, az: 0,
        colore: T.colore, fisso: false, anelli: false
      }, p);
      if (p.id == null) b.id = prossimoId++; else prossimoId = Math.max(prossimoId, p.id + 1);
      b.scia = [];
      if (p.colore && p.coloreAuto == null) b.coloreAuto = false;
      C.adatta(b);
      return b;
    },

    // Mantiene coerenti raggio e colore dopo un cambio di massa
    adatta(b) {
      if (b.tipo === 'buco') b.r = C.raggioSchw(b.m);
      if (b.tipo === 'stella' && b.coloreAuto !== false) b.colore = coloreStella(b.m);
    },

    // Cambia tipo: gli oggetti compatti conservano la massa (es. "il Sole diventa un buco nero"),
    // gli altri prendono i valori tipici del nuovo tipo.
    impostaTipo(b, tipo) {
      const T = TIPI[tipo];
      b.tipo = tipo; b.colore = T.colore; b.coloreAuto = true; b.luce = undefined;
      if (tipo === 'nana') { b.r = C.raggioNana(b.m); }
      else if (tipo === 'neutroni') { b.r = 12e3; }
      else if (!T.compatto) { b.m = T.m; b.r = T.r; }
      C.adatta(b);
    },

    copia(b) {
      const o = {};
      for (const k of ['id', 'tipo', 'nome', 'm', 'r', 'x', 'y', 'z', 'vx', 'vy', 'vz', 'colore', 'fisso', 'anelli', 'luce', 'coloreAuto', 'fragile', 'storia'])
        if (b[k] !== undefined) o[k] = b[k];
      if (b.storia) o.storia = { titolo: b.storia.titolo, testo: b.storia.testo };   // copia "fresca", non ancora mostrata
      return o;
    }
  };
  Grav.corpi = C;
  Grav.TIPI = TIPI;
})();
