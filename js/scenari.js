/* Scenari pronti. Ogni scenario costruisce corpi normali: dopo averlo caricato si può modificare tutto. */
(function () {
  'use strict';
  const { G, C, U } = Grav;
  const K = Grav.corpi;
  const rad = Math.PI / 180;

  // Stato (posizione, velocità) da elementi orbitali kepleriani; angoli in gradi
  function stato(mu, a, e = 0, i = 0, Om = 0, om = 0, M = 0) {
    M *= rad; i *= rad; Om *= rad; om *= rad;
    let E = e < 0.8 ? M : Math.PI;
    for (let k = 0; k < 60; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    const cE = Math.cos(E), sE = Math.sin(E), n = Math.sqrt(mu / (a * a * a)), f = 1 - e * cE, q = Math.sqrt(1 - e * e);
    const xo = a * (cE - e), yo = a * q * sE, vxo = -a * n * sE / f, vyo = a * n * q * cE / f;
    const cO = Math.cos(Om), sO = Math.sin(Om), ci = Math.cos(i), si = Math.sin(i), co = Math.cos(om), so = Math.sin(om);
    const r11 = cO * co - sO * so * ci, r12 = -cO * so - sO * co * ci;
    const r21 = sO * co + cO * so * ci, r22 = -sO * so + cO * co * ci;
    const r31 = so * si, r32 = co * si;
    return { x: r11 * xo + r12 * yo, y: r21 * xo + r22 * yo, z: r31 * xo + r32 * yo,
      vx: r11 * vxo + r12 * vyo, vy: r21 * vxo + r22 * vyo, vz: r31 * vxo + r32 * vyo };
  }
  // Mette "corpo" in orbita attorno a "centro"
  function orbita(corpo, centro, a, e, i, Om, om, M) {
    const s = stato(G * (centro.m + corpo.m), a, e, i, Om, om, M);
    corpo.x = centro.x + s.x; corpo.y = centro.y + s.y; corpo.z = centro.z + s.z;
    corpo.vx = centro.vx + s.vx; corpo.vy = centro.vy + s.vy; corpo.vz = centro.vz + s.vz;
    return corpo;
  }
  // Porta il baricentro nell'origine e ferma il suo moto
  function centra(L) {
    let M = 0, x = 0, y = 0, z = 0, px = 0, py = 0, pz = 0;
    for (const b of L) { M += b.m; x += b.m * b.x; y += b.m * b.y; z += b.m * b.z; px += b.m * b.vx; py += b.m * b.vy; pz += b.m * b.vz; }
    for (const b of L) { b.x -= x / M; b.y -= y / M; b.z -= z / M; b.vx -= px / M; b.vy -= py / M; b.vz -= pz / M; }
    return L;
  }
  // Coppia in orbita reciproca (al pericentro), con correzione relativistica per le orbite circolari
  function coppia(a, b, sep, e = 0) {
    const M = a.m + b.m, r = sep * (1 - e);
    let v2 = G * M * (1 + e) / r;
    if (e === 0 && Grav.sim.rel()) { const x = G * M / (r * Grav.sim.cEff() ** 2); v2 *= (1 - 4 * x) / (1 - x); }
    const v = Math.sqrt(v2);
    a.x = -r * b.m / M; b.x = r * a.m / M; a.y = b.y = 0;
    a.vy = -v * b.m / M; b.vy = v * a.m / M; a.vx = b.vx = 0;
    return [a, b];
  }
  // Traiettoria in arrivo da distanza d con pericentro rp (parabolica, o iperbolica se vinf > 0);
  // angolo di partenza e inclinazione in gradi
  function avvicina(corpo, centro, d, rp, ang, vinf = 0, incl = 0) {
    const GM = G * (centro.m + corpo.m), v = Math.sqrt(vinf * vinf + 2 * GM / d), vp = Math.sqrt(vinf * vinf + 2 * GM / rp);
    const vt = rp * vp / d, vr = -Math.sqrt(Math.max(0, v * v - vt * vt));
    const c = Math.cos(ang * rad), s = Math.sin(ang * rad), ci = Math.cos(incl * rad), si = Math.sin(incl * rad);
    const y = d * s, vy = vr * s + vt * c;
    corpo.x = centro.x + d * c; corpo.y = centro.y + y * ci; corpo.z = centro.z + y * si;
    corpo.vx = centro.vx + vr * c - vt * s; corpo.vy = centro.vy + vy * ci; corpo.vz = centro.vz + vy * si;
    return corpo;
  }
  const parabola = (corpo, centro, d, rp, ang) => avvicina(corpo, centro, d, rp, ang);
  // Disco di stelle (particelle senza massa) in orbita circolare attorno al nucleo g
  function disco(P, g, R, n, incl, colori) {
    const ci = Math.cos(incl * rad), si = Math.sin(incl * rad);
    for (let k = 0; k < n; k++) {
      const r = R * (0.35 + 0.65 * Math.sqrt(casuale())), th = casuale() * 2 * Math.PI, v = Math.sqrt(G * g.m / r);
      const x = r * Math.cos(th), y = r * Math.sin(th), vx = -v * Math.sin(th), vy = v * Math.cos(th);
      P.push({ x: g.x + x, y: g.y + y * ci, z: g.z + y * si, vx: g.vx + vx, vy: g.vy + vy * ci, vz: g.vz + vy * si,
        vita: Infinity, vitaMax: Infinity, colore: colori[k % colori.length], dim: 1.3 });
    }
  }
  const casuale = (function () { let s = 12345; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();

  const PIANETI = [
    // nome, tipo, massa, raggio, colore, a (UA), e, i, Ω, ϖ (long. perielio), L (long. media), al 1° gennaio 2000
    ['Mercurio', 'roccioso', 3.301e23, 2.4397e6, '#a9a39b', 0.38710, 0.20563, 7.005, 48.33, 77.46, 252.25],
    ['Venere', 'roccioso', 4.867e24, 6.0518e6, '#e8cf98', 0.72333, 0.00677, 3.395, 76.68, 131.60, 181.98],
    ['Terra', 'roccioso', 5.9722e24, 6.371e6, '#4c8fdc', 1.00000, 0.01671, 0.000, 0, 102.94, 100.46],
    ['Marte', 'roccioso', 6.417e23, 3.3895e6, '#d0623d', 1.52371, 0.09339, 1.850, 49.56, 336.06, 355.45],
    ['Giove', 'gassoso', 1.898e27, 6.9911e7, '#d8a26a', 5.20289, 0.04839, 1.304, 100.47, 14.73, 34.40],
    ['Saturno', 'gassoso', 5.683e26, 5.8232e7, '#e6cf8f', 9.53668, 0.05386, 2.486, 113.66, 92.60, 49.95],
    ['Urano', 'gassoso', 8.681e25, 2.5362e7, '#9fe3ea', 19.1892, 0.04726, 0.773, 74.02, 170.95, 313.24],
    ['Nettuno', 'gassoso', 1.024e26, 2.4622e7, '#5b7fe8', 30.0699, 0.00859, 1.770, 131.78, 44.96, 304.88],
    ['Plutone', 'luna', 1.303e22, 1.1883e6, '#cdb59a', 39.482, 0.2488, 17.14, 110.30, 224.07, 238.93]
  ];
  function solare(quanti) {
    const sole = K.crea('stella', { nome: 'Sole', colore: '#ffe08a' });
    const L = [sole];
    for (const p of PIANETI.slice(0, quanti)) {
      const [nome, tipo, m, r, colore, a, e, i, Om, w, Lm] = p;
      L.push(orbita(K.crea(tipo, { nome, m, r, colore, anelli: nome === 'Saturno' }), sole, a * U.UA, e, i, Om, w - Om, Lm - w));
    }
    return L;
  }

  const SCENARI = [
    /* ----- Sistema solare e pianeti ----- */
    {
      id: 'solare', gruppo: 'Sistema solare', nome: 'Il Sistema solare',
      descrizione: 'Sole, otto pianeti e Plutone con le orbite vere (posizioni del 1° gennaio 2000). Allontana la vista con la rotellina per vedere i pianeti esterni. In 3D si vede che l\'orbita di Plutone è molto inclinata.',
      velocita: 20 * U.GIORNO, camera: { ampiezza: 4 * U.UA },
      costruisci: () => ({ corpi: centra(solare(9)) })
    },
    {
      id: 'fasi', gruppo: 'Sistema solare', nome: 'Sole, Terra e Luna: le fasi',
      descrizione: 'La vista segue la Terra; la Luna le gira intorno in circa 27 giorni (mese siderale), ma le fasi si ripetono ogni 29,5 giorni (mese sinodico), perché nel frattempo la Terra si è spostata attorno al Sole. Nel pannello della Luna vedi la sua fase come appare dalla Terra: nuova, crescente, primo quarto, piena… Il Sole è fuori dallo schermo, nella direzione della freccia gialla. Le scie sono disegnate rispetto al corpo dominante.',
      velocita: U.GIORNO, camera: { ampiezza: 1.3e9, segui: 'Terra' }, opz: { scieRelative: true }, seleziona: 'Luna',
      costruisci() {
        const sole = K.crea('stella', { nome: 'Sole', colore: '#ffe08a' });
        const terra = orbita(K.crea('roccioso', { nome: 'Terra' }), sole, U.UA, 0.0167, 0, 0, 0, 0);
        const luna = orbita(K.crea('luna', { nome: 'Luna' }), terra, 3.844e8, 0.0549, 5.1, 0, 0, 180);
        return { corpi: centra([sole, terra, luna]) };
      }
    },
    {
      id: 'satelliti', gruppo: 'Sistema solare', nome: 'Satelliti intorno alla Terra',
      descrizione: 'La Stazione Spaziale (400 km di quota, un giro in 92 minuti), un satellite GPS, uno geostazionario (un giro in un giorno: resta sempre sopra lo stesso punto) e uno in orbita Molniya, molto ellittica. Più il satellite è lontano, più va piano.',
      velocita: U.ORA, camera: { ampiezza: 1.1e8 }, seleziona: 'Stazione Spaziale',
      costruisci() {
        const terra = K.crea('roccioso', { nome: 'Terra' });
        const s = (nome, a, e, i, M) => orbita(K.crea('satellite', { nome }), terra, a, e, i, 0, 270, M);
        return { corpi: [terra, s('Stazione Spaziale', 6.371e6 + 4.08e5, 0, 51.6, 0), s('Satellite GPS', 2.6571e7, 0, 55, 90),
          s('Satellite geostazionario', 4.2164e7, 0, 0, 200), s('Molniya', 2.66e7, 0.74, 63.4, 0)] };
      }
    },
    {
      id: 'fionda', gruppo: 'Sistema solare', nome: 'La fionda gravitazionale',
      descrizione: 'Una sonda passa dietro a Giove, che si muove a 13 km/s. Nel riferimento di Giove la sonda entra ed esce con la stessa velocità, ma rispetto al Sole ne guadagna moltissima: guarda la velocità nel pannello prima e dopo il passaggio (da 10 a circa 25 km/s). Il Sole non è disegnato: le velocità sono misurate nel riferimento in cui Giove si muove a 13 km/s, come rispetto al Sole. Così hanno viaggiato le sonde Voyager.',
      velocita: 6 * U.ORA, camera: { ampiezza: 1.6e10, centro: [1.5e9, -1e9] }, seleziona: 'Sonda',
      costruisci() {
        const giove = K.crea('gassoso', { nome: 'Giove', m: U.MG, vx: 1.3e4 });
        const sonda = K.crea('satellite', { nome: 'Sonda', x: 3.658e9, y: -3.445e9, vy: 1e4 });
        return { corpi: [giove, sonda] };
      }
    },
    {
      id: 'lagrange', gruppo: 'Sistema solare', nome: 'Asteroidi troiani (punti di Lagrange)',
      descrizione: 'Due gruppi di asteroidi viaggiano sull\'orbita di Giove, 60° davanti e 60° dietro: sono i punti di Lagrange L4 e L5. Lì le attrazioni del Sole e di Giove non si annullano: insieme danno esattamente la forza che serve per girare intorno al Sole con lo stesso periodo di Giove, così l\'asteroide resta sempre alla stessa distanza dal pianeta. Gli asteroidi oscillano attorno a questi punti (orbite "a girino"). Prova a spostarne uno lontano.',
      velocita: 0.5 * U.ANNO, camera: { ampiezza: 14 * U.UA },
      costruisci() {
        const sole = K.crea('stella', { nome: 'Sole', colore: '#ffe08a' });
        const giove = orbita(K.crea('gassoso', { nome: 'Giove' }), sole, 5.2 * U.UA, 0, 0, 0, 0, 0);
        const L = [sole, giove];
        for (const [gr, ang] of [['L4', 60], ['L5', -60]])
          for (let k = 0; k < 6; k++)
            L.push(orbita(K.crea('asteroide', { nome: `Troiano ${gr}-${k + 1}` }), sole, 5.2 * U.UA * (0.98 + 0.04 * casuale()), 0.02 * casuale(), 0, 0, 0, ang + (casuale() - 0.5) * 16));
        return { corpi: centra(L) };
      }
    },
    {
      id: 'buconero-sole', gruppo: 'Sistema solare', nome: 'E se il Sole diventasse un buco nero?',
      descrizione: 'Il Sole è selezionato: nel pannello a destra cambia il suo tipo in "Buco nero". La massa resta la stessa… e le orbite dei pianeti non cambiano affatto! La gravità dipende dalla massa e dalla distanza, non dalle dimensioni. Poi seleziona la Terra e guarda la temperatura: il buco nero non fa luce, e la Terra, sulla stessa orbita, gela a pochi gradi sopra lo zero assoluto.',
      velocita: 10 * U.GIORNO, camera: { ampiezza: 4 * U.UA }, seleziona: 'Sole',
      costruisci: () => ({ corpi: centra(solare(4)) })
    },

    /* ----- Sistemi stellari ----- */
    {
      id: 'binaria', gruppo: 'Sistemi stellari', nome: 'Stella doppia',
      descrizione: 'Due stelle di massa diversa girano intorno al baricentro comune (la crocetta), su orbite ellittiche. La stella più leggera fa il giro più largo.',
      velocita: 5 * U.GIORNO, camera: { ampiezza: 4 * U.UA }, opz: { baricentro: true },
      costruisci() {
        return { corpi: coppia(K.crea('stella', { nome: 'Stella A', m: 1.3 * U.MS, r: 1.4 * U.RS }), K.crea('stella', { nome: 'Stella B', m: 0.7 * U.MS, r: 0.7 * U.RS }), U.UA, 0.45) };
      }
    },
    {
      id: 'tatooine', gruppo: 'Sistemi stellari', nome: 'Pianeta con due soli (tipo Kepler-16)',
      descrizione: 'Un pianeta gira intorno a una coppia stretta di stelle, come Tatooine in Guerre stellari. Il sistema reale Kepler-16 è stato scoperto nel 2011. Prova ad avvicinare il pianeta alle stelle: l\'orbita diventa instabile.',
      velocita: 5 * U.GIORNO, camera: { ampiezza: 2.2 * U.UA },
      costruisci() {
        const [a, b] = coppia(K.crea('stella', { nome: 'Kepler-16 A', m: 0.69 * U.MS, r: 0.65 * U.RS }), K.crea('stella', { nome: 'Kepler-16 B', m: 0.2 * U.MS, r: 0.23 * U.RS }), 0.224 * U.UA, 0.16);
        const cm = K.crea('stella', { m: a.m + b.m, r: 1 });
        const p = orbita(K.crea('gassoso', { nome: 'Pianeta', m: 0.33 * U.MG, r: 0.75 * U.RG, colore: '#c9a27a' }), cm, 0.705 * U.UA, 0.007, 0, 0, 0, 90);
        return { corpi: centra([a, b, p]) };
      }
    },
    {
      id: 'triplo', gruppo: 'Sistemi stellari', nome: 'Sistema triplo gerarchico',
      descrizione: 'Una coppia stretta di stelle e una terza stella lontana che gira intorno alla coppia: è la configurazione stabile più comune dei sistemi tripli. Alfa Centauri, il sistema più vicino a noi, è fatto così, ma con proporzioni molto diverse: A e B distano 23 UA e Proxima, la terza, circa 13 000 UA. Qui le distanze sono compresse per vedere tutto insieme.',
      velocita: 20 * U.GIORNO, camera: { ampiezza: 26 * U.UA },
      costruisci() {
        const [a, b] = coppia(K.crea('stella', { nome: 'Stella A', m: 1.1 * U.MS, r: 1.2 * U.RS }), K.crea('stella', { nome: 'Stella B', m: 0.9 * U.MS, r: 0.86 * U.RS }), 1.5 * U.UA, 0.3);
        const cm = K.crea('stella', { m: a.m + b.m, r: 1 });
        const c = orbita(K.crea('stella', { nome: 'Stella C', m: 0.5 * U.MS, r: 0.5 * U.RS }), cm, 10 * U.UA, 0.2, 0, 0, 0, 120);
        return { corpi: centra([a, b, c]) };
      }
    },
    {
      id: 'otto', gruppo: 'Sistemi stellari', nome: 'Tre stelle a forma di otto',
      descrizione: 'Tre stelle uguali si inseguono lungo una stessa orbita a forma di 8: una soluzione speciale del "problema dei tre corpi" trovata al computer da Cris Moore nel 1993 e dimostrata da Alain Chenciner e Richard Montgomery nel 2000. Sorprendentemente è stabile: se sposti di poco una stella, l\'8 si deforma ma resiste. Con spostamenti grandi o masse diverse, invece, si rompe.',
      velocita: 10 * U.GIORNO, camera: { ampiezza: 3 * U.UA },
      costruisci() {
        const v0 = Math.sqrt(G * U.MS / U.UA);
        const p = [[-0.97000436, 0.24308753], [0.97000436, -0.24308753], [0, 0]];
        const v3 = [-0.93240737, -0.86473146], v = [[-v3[0] / 2, -v3[1] / 2], [-v3[0] / 2, -v3[1] / 2], v3];
        return { corpi: p.map((q, i) => K.crea('stella', { nome: 'Stella ' + 'ABC'[i], x: q[0] * U.UA, y: q[1] * U.UA, vx: v[i][0] * v0, vy: v[i][1] * v0, colore: ['#ffd27a', '#9ad0ff', '#ffffff'][i] })) };
      }
    },
    {
      id: 'pitagorico', gruppo: 'Sistemi stellari', nome: 'Tre corpi caotici (problema pitagorico)',
      descrizione: 'Tre buchi neri di 3, 4 e 5 masse solari, fermi ai vertici di un triangolo rettangolo di lati 3-4-5. Il problema fu posto da Carl Burrau nel 1913 e risolto al computer da Victor Szebehely e C. Frederick Peters nel 1967. Il moto è caotico: dopo una lunga danza il più leggero viene espulso e gli altri due restano legati. Il caos significa che una minima differenza iniziale cambia tutto.',
      velocita: 0.5 * U.ANNO, camera: { ampiezza: 12 * U.UA },
      costruisci() {
        const d = [[3, 1, 3], [4, -2, -1], [5, 1, -1]];
        return { corpi: d.map(([m, x, y], i) => K.crea('buco', { nome: `Buco nero ${m} M☉`, m: m * U.MS, x: x * U.UA, y: y * U.UA })) };
      }
    },
    {
      id: 'ammasso', gruppo: 'Sistemi stellari', nome: 'Ammasso di stelle (3D)',
      descrizione: 'Quaranta stelle di masse diverse legate dalla gravità. Col tempo le stelle leggere vengono scagliate via e quelle pesanti si concentrano al centro. Ruota la vista 3D trascinando.',
      vista: '3d', velocita: 200 * U.ANNO, camera: { ampiezza: 4000 * U.UA },
      costruisci() {
        const L = [], R = 1000 * U.UA;
        for (let i = 0; i < 40; i++) {
          const m = (0.3 + 2.7 * Math.pow(casuale(), 3)) * U.MS;
          let x, y, z; do { x = casuale() * 2 - 1; y = casuale() * 2 - 1; z = casuale() * 2 - 1; } while (x * x + y * y + z * z > 1);
          L.push(K.crea('stella', { nome: 'Stella ' + (i + 1), m, r: Math.pow(m / U.MS, 0.8) * U.RS, x: x * R, y: y * R, z: z * R }));
        }
        const M = L.reduce((s, b) => s + b.m, 0), sig = 0.5 * Math.sqrt(G * M / R);
        const g = () => { let s = 0; for (let k = 0; k < 6; k++) s += casuale(); return (s - 3) / Math.sqrt(0.5); };
        for (const b of L) { b.vx = g() * sig; b.vy = g() * sig; b.vz = g() * sig; }
        return { corpi: centra(L) };
      }
    },

    /* ----- Relatività e oggetti compatti ----- */
    {
      id: 'mercurio', gruppo: 'Relatività', nome: 'La precessione di Mercurio',
      descrizione: 'Secondo la relatività generale l\'orbita di Mercurio ruota lentamente (43 secondi d\'arco per secolo): fu la prima prova della teoria di Einstein. Qui la velocità della luce è ridotta di 250 volte per rendere l\'effetto visibile: l\'ellisse ruota a ogni giro. In modalità classica non succede.',
      modo: 'relativistica', fattoreC: 0.004, velocita: 20 * U.GIORNO, camera: { ampiezza: 1.1 * U.UA }, opz: { scia: 'lunga' }, seleziona: 'Mercurio',
      costruisci() {
        const sole = K.crea('stella', { nome: 'Sole', colore: '#ffe08a' });
        const m = orbita(K.crea('roccioso', { nome: 'Mercurio', m: 3.301e23, r: 2.4397e6, colore: '#a9a39b' }), sole, 0.387 * U.UA, 0.2056, 0, 0, 0, 0);
        return { corpi: centra([sole, m]) };
      }
    },
    {
      id: 'mareale', gruppo: 'Relatività', nome: 'Una stella troppo vicina a un buco nero',
      descrizione: 'Una stella come il Sole cade verso un buco nero di un milione di masse solari. Entro il limite di Roche le forze di marea la fanno a pezzi: metà dei detriti resta legata al buco nero e torna indietro, metà sfugge per sempre. (In natura i detriti legati formano un disco che il buco nero inghiotte, con un lampo che dura mesi: un "evento di distruzione mareale". Qui basta la fisica di Newton.)',
      velocita: U.ORA, camera: { ampiezza: 14 * U.UA }, seleziona: 'Stella',
      programma: [{ quando: trova => !trova('Stella') && trova('Buco nero supermassiccio'), fai: () => {
        Grav.ui.avviso('Spaghettificazione', 'La stella è stata stirata e fatta a pezzi. I frammenti più vicini al buco nero hanno meno energia e restano in orbita; quelli più lontani ne hanno di più e se ne vanno. I telescopi osservano decine di questi eventi ogni anno.', 14);
      } }],
      costruisci() {
        const bh = K.crea('buco', { nome: 'Buco nero supermassiccio', m: 1e6 * U.MS });
        return { corpi: [bh, parabola(K.crea('stella', { nome: 'Stella', colore: '#ffe08a' }), bh, 6 * U.UA, 0.4 * U.UA, 150)] };
      }
    },

    /* ----- Esplosioni e urti ----- */
    {
      id: 'supernova', gruppo: 'Esplosioni e urti', nome: 'Supernova in un sistema doppio',
      descrizione: 'Una stella di 15 masse solari con una compagna simile al Sole. La stella grande è selezionata: premi "Supernova" nel pannello a destra. Perde quasi tutta la massa in un istante e la compagna, non più trattenuta, schizza via.',
      velocita: 20 * U.GIORNO, camera: { ampiezza: 10 * U.UA }, seleziona: 'Stella massiccia',
      programma: [{ quando: trova => !trova('Stella massiccia') && (trova('Compagna') || trova('Compagna (un Sole)')), fai: trova => {
        const c = trova('Compagna') || trova('Compagna (un Sole)');
        Grav.ui.avviso('Una stella in fuga', `La compagna non è più trattenuta e fugge a circa ${Grav.fmt.velocita(Math.hypot(c.vx, c.vy, c.vz))}. In cielo vediamo davvero stelle "in fuga" nate così, come Zeta Ophiuchi. Semplificazione: una vera supergigante di 15 masse solari sarebbe larga qualche UA e non entrerebbe in un'orbita così stretta.`, 14);
      } }],
      opzione: {
        etichetta: 'Aggiungi la Terra e la Luna',
        testo: 'Attorno alla compagna girano una Terra e la sua Luna; la coppia di stelle è a 12 UA, perché più vicine la Terra non avrebbe un\'orbita stabile. Dopo l\'esplosione la compagna schizza via portandosi dietro Terra e Luna, che restano legate alla loro stella.',
        camera: { ampiezza: 32 * U.UA }
      },
      costruisci(conTerra) {
        const [big, comp] = coppia(K.crea('stella', { nome: 'Stella massiccia', m: 15 * U.MS, r: 7 * U.RS }),
          K.crea('stella', conTerra ? { nome: 'Compagna (un Sole)', m: U.MS, colore: '#ffe08a' } : { nome: 'Compagna', m: U.MS }), (conTerra ? 12 : 3) * U.UA);
        if (!conTerra) return { corpi: [big, comp] };
        const terra = orbita(K.crea('roccioso', { nome: 'Terra' }), comp, U.UA, 0.0167, 0, 0, 0, 0);
        const luna = orbita(K.crea('luna', { nome: 'Luna' }), terra, 3.844e8, 0.0549, 5.1, 0, 0, 180);
        return { corpi: [big, comp, terra, luna] };
      }
    },
    {
      id: 'nane', gruppo: 'Esplosioni e urti', nome: 'Due nane bianche: supernova di tipo Ia',
      descrizione: 'Due nane bianche di 0,8 e 0,7 masse solari stanno per scontrarsi. Insieme superano 1,44 M☉, il limite di Chandrasekhar: la nana bianca risultante esplode completamente.',
      velocita: 10, camera: { ampiezza: 5e8 },
      opzione: {
        etichetta: 'Aggiungi Sole, Terra e Luna (e se fosse vicina?)',
        testo: 'Per confronto, il Sole con la Terra e la Luna è a 25 UA (la freccia gialla indica dove): quando le nane bianche esplodono, la vista si allarga e il tempo accelera per seguire l\'onda d\'urto fino alla Terra. In realtà le supernove di tipo Ia che osserviamo sono in altre galassie, a milioni o miliardi di anni luce.'
      },
      programma: (() => {
        let tEspl = 0;
        const esplose = trova => !trova('Nana bianca A') && !trova('Nana bianca B') && trova('Terra');
        return [
          { quando: esplose, fai: trova => {
            tEspl = Grav.sim.t;
            const sole = trova('Sole');
            Grav.vista.seguito = null;
            Grav.vista.inquadra(60 * U.UA, sole.x / 2, sole.y / 2);
            Grav.ui.impostaVel(Grav.ui.velIndiceVicino(6 * U.ORA));
            Grav.ui.avviso('Seguiamo l\'esplosione', 'La vista si è allargata a 60 UA e il tempo ora scorre a 6 ore al secondo: guarda i detriti allontanarsi verso il Sole e la Terra.', 10);
          } },
          { quando: trova => esplose(trova) && Grav.sim.t > tEspl + 25 * U.UA / 2e7, fai: () => {
            Grav.ui.avviso('L\'onda d\'urto raggiunge la Terra', 'I detriti più veloci, a 20 000 km/s, hanno percorso 25 UA in circa 2 giorni. Una supernova di tipo Ia libera in pochi secondi l\'energia che il Sole emette in miliardi di anni: a questa distanza la Terra sarebbe sterilizzata dalle radiazioni.', 16);
          } }
        ];
      })(),
      costruisci(conTerra) {
        const a = K.crea('nana', { nome: 'Nana bianca A', m: 0.8 * U.MS }), b = K.crea('nana', { nome: 'Nana bianca B', m: 0.7 * U.MS });
        a.r = K.raggioNana(a.m); b.r = K.raggioNana(b.m);
        a.x = -1e8; b.x = 1e8; a.vy = -1.2e5; b.vy = 1.2e5;
        centra([a, b]);
        if (!conTerra) return { corpi: [a, b] };
        const sole = K.crea('stella', { nome: 'Sole', colore: '#ffe08a', x: 25 * U.UA * Math.cos(200 * rad), y: 25 * U.UA * Math.sin(200 * rad) });
        const terra = orbita(K.crea('roccioso', { nome: 'Terra' }), sole, U.UA, 0.0167, 0, 0, 0, 0);
        const luna = orbita(K.crea('luna', { nome: 'Luna' }), terra, 3.844e8, 0.0549, 5.1, 0, 0, 180);
        return { corpi: [a, b, sole, terra, luna] };
      }
    },
    {
      id: 'galassie', gruppo: 'Esplosioni e urti', nome: 'Scontro tra due galassie',
      descrizione: 'Due galassie a disco si sfiorano, come nelle simulazioni di Alar e Juri Toomre (1972). Le maree strappano lunghe "code" di stelle, come nelle galassie Antenne. Ogni puntino è un gruppo di stelle; scala dei tempi: decine di milioni di anni al secondo.',
      velocita: 3e7 * U.ANNO, dtMax: 6e13, camera: { ampiezza: 1.6e22 },
      costruisci() {
        const R = 5e20, a = K.crea('galassia', { nome: 'Galassia A', colore: '#fff1d0' }), b = K.crea('galassia', { nome: 'Galassia B', colore: '#d6e4ff' });
        parabola(b, a, 7 * R, 1.6 * R, 30);
        centra([a, b]);
        const P = [];
        disco(P, a, R, 380, 0, ['#fff1d0', '#ffd9a0', '#cfe0ff']);
        disco(P, b, R, 380, 40, ['#d6e4ff', '#a9c4ff', '#fff1d0']);
        return { corpi: [a, b], particelle: P };
      }
    },

    /* ----- Eventi della storia cosmica, in ordine di tempo ----- */
    {
      id: 'theia', gruppo: 'Eventi della storia cosmica', nome: '4,5 miliardi di anni fa: Theia e la nascita della Luna',
      descrizione: 'La Terra primordiale e Theia, un pianeta grande come Marte, si scontrano di striscio. Parte del materiale viene scagliata in orbita e forma un disco di frammenti e detriti: secondo l\'ipotesi più accreditata la Luna si è formata da quel disco in pochi anni (qui i frammenti più grandi possono fondersi tra loro). Prova a cambiare la velocità di Theia e l\'angolo dell\'impatto.',
      velocita: 600, camera: { ampiezza: 1.5e8 },
      programma: [{ quando: trova => !trova('Theia') && trova('Terra primordiale'), fai: () => {
        Grav.ui.avviso('Un oceano di magma', 'L\'energia dell\'urto fonde la superficie della Terra e forse buona parte del mantello: per migliaia di anni il pianeta resta coperto da un oceano di roccia fusa (il bagliore arancione). I frammenti in orbita si urtano e si riuniscono: la Luna si forma in pochi anni, o forse, secondo alcune simulazioni recenti, addirittura in poche ore.', 16);
      } }],
      costruisci() {
        const terra = K.crea('roccioso', { nome: 'Terra primordiale', m: 0.9 * U.MT, r: 6.15e6, colore: '#c26a3d' });
        const theia = K.crea('roccioso', { nome: 'Theia', m: 0.11 * U.MT, r: 3.39e6, colore: '#8f8a80', x: 4.5e7, y: 1.53e7, vx: -4e3 });   // urto a circa 45°
        return { corpi: centra([terra, theia]) };
      }
    },
    {
      id: 'chicxulub', gruppo: 'Eventi della storia cosmica', nome: '66 milioni di anni fa: l\'asteroide dei dinosauri',
      descrizione: 'Un asteroide largo circa 10 km sta per colpire la Terra, nell\'attuale penisola dello Yucatán (Messico). Il cratere di Chicxulub, sepolto sotto i sedimenti, è largo 180 km. Seleziona l\'asteroide: la linea tratteggiata mostra che finirà dritto sulla Terra.',
      velocita: 600, camera: { ampiezza: 9e8 }, seleziona: 'Asteroide di Chicxulub',
      programma: [{ quando: trova => !trova('Asteroide di Chicxulub') && trova('Terra'), fai: trova => {
        const t = trova('Terra');
        Grav.vista.seguito = t.id; Grav.vista.inquadra(9 * U.RT, t.x, t.y);
        Grav.ui.impostaVel(Grav.ui.velIndiceVicino(60));
        Grav.ui.avviso('Zoom sull\'impatto', 'Il tempo ora scorre a un minuto al secondo. Le rocce fuse e vaporizzate ricadono su tutto il pianeta come una pioggia di fuoco; polveri e fuliggine avvolgono la Terra (il velo scuro) e oscurano il Sole per mesi o anni: un lungo inverno da impatto.', 16);
      } }],
      costruisci() {
        const terra = K.crea('roccioso', { nome: 'Terra' });
        const luna = orbita(K.crea('luna', { nome: 'Luna' }), terra, 3.844e8, 0.0549, 0, 0, 0, 70);
        const ast = avvicina(K.crea('asteroide', { nome: 'Asteroide di Chicxulub', m: 1.3e15, r: 5e3,
          storia: { titolo: 'Impatto di Chicxulub', testo: 'L\'esplosione solleva polveri e fuliggine che oscurano il Sole per mesi: le piante smettono di crescere e scompaiono i dinosauri non aviani e circa tre quarti delle specie viventi. Da allora i mammiferi hanno potuto diffondersi.' } }),
          terra, 4e8, 0.5 * U.RT, 30, 1.5e4);
        return { corpi: [terra, luna, ast] };
      }
    },
    {
      id: '1054', gruppo: 'Eventi della storia cosmica', nome: '1054: la supernova della Nebulosa del Granchio',
      descrizione: 'Una supergigante rossa di circa 10 masse solari, larga come l\'orbita di Marte, è arrivata alla fine: tra pochi istanti il suo nucleo collasserà. Il 4 luglio 1054 gli astronomi cinesi registrarono una "stella ospite" nella costellazione del Toro, così brillante da essere visibile di giorno per 23 giorni.',
      velocita: U.GIORNO, camera: { ampiezza: 60 * U.UA }, seleziona: 'Progenitrice del Granchio',
      opzione: {
        etichetta: 'Aggiungi Sole, Terra e Luna (e se fosse vicina?)',
        testo: 'Per confronto, qui il Sole, la Terra e la Luna sono messi a 25 UA, meno della distanza di Nettuno: in realtà erano a 6500 anni luce, circa 16 milioni di volte più lontano. Una supernova così vicina sarebbe una catastrofe per la vita; per fortuna le stelle che potrebbero esplodere sono tutte a centinaia di anni luce, oltre la distanza di pericolo (qualche decina di anni luce).'
      },
      programma: [{ t: 3 * U.GIORNO, fai: trova => {
        const b = trova('Progenitrice del Granchio');
        if (!b || (b.tipo !== 'stella' && b.tipo !== 'gigante')) return;
        Grav.sim.supernova(b);
        // la futura Nebulosa del Granchio: filamenti più lenti che restano attorno alla pulsar
        Grav.sim.emetti({ x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, n: 450, r0: 1e10, vmin: 9e5, vmax: 1.6e6, colori: ['#ff6a4d', '#ff9a5c', '#ffc07a', '#7fb2ff', '#a9c8ff'], vita: Infinity, dim: 1.7 });
        Grav.ui.avviso('4 luglio 1054', 'Nasce la Nebulosa del Granchio: i filamenti rossi e arancioni sono gas della stella, l\'alone azzurro è luce emessa da elettroni velocissimi spinti dalla pulsar. Oggi la nebulosa è larga 11 anni luce e si espande a circa 1500 km/s; la pulsar al centro ruota su se stessa 30 volte al secondo.', 16);
      } }, { t: 26 * U.GIORNO, fai: trova => {
        if (trova('Progenitrice del Granchio')) return;
        Grav.ui.avviso('27 luglio 1054', 'Dopo 23 giorni la "stella ospite" non si vede più in pieno giorno. Di notte resterà visibile a occhio nudo per quasi due anni (653 giorni), poi sparirà. Nessuna cronaca europea sicura ne parla: la conosciamo dagli annali cinesi e giapponesi.', 14);
      } }, { t: 7.6 * U.GIORNO, fai: trova => {
        if (!trova('Terra') || trova('Progenitrice del Granchio')) return;
        Grav.ui.avviso('L\'onda d\'urto raggiunge la Terra', 'I detriti più veloci, a 10 000 km/s, hanno percorso 25 UA in poco più di 4 giorni. A questa distanza le radiazioni dell\'esplosione avrebbero già distrutto lo strato di ozono. A 6500 anni luce, invece, nel 1054 arrivò soltanto la luce: una nuova "stella" nel cielo.', 16);
      } }],
      costruisci(conTerra) {
        const stella = K.crea('gigante', { nome: 'Progenitrice del Granchio', m: 10 * U.MS, r: 500 * U.RS, colore: '#ff7a4a' });
        if (!conTerra) return { corpi: [stella] };
        const sole = K.crea('stella', { nome: 'Sole', colore: '#ffe08a', x: 25 * U.UA * Math.cos(200 * rad), y: 25 * U.UA * Math.sin(200 * rad) });
        const terra = orbita(K.crea('roccioso', { nome: 'Terra' }), sole, U.UA, 0.0167, 0, 0, 0, 0);
        const luna = orbita(K.crea('luna', { nome: 'Luna' }), terra, 3.844e8, 0.0549, 5.1, 0, 0, 180);
        return { corpi: [stella, sole, terra, luna] };
      }
    },
    {
      id: 'halley', gruppo: 'Eventi della storia cosmica', nome: '1758: il ritorno della cometa di Halley',
      descrizione: 'Edmund Halley usò le leggi di Newton per capire che le comete del 1531, del 1607 e del 1682 erano la stessa, e ne predisse il ritorno per il 1758. Halley era morto da quasi 17 anni quando, la notte di Natale del 1758, la cometa riapparve: un trionfo della gravitazione universale. La sua orbita è molto allungata e "al contrario" rispetto ai pianeti; torna ogni 76 anni circa, la prossima volta nel 2061.',
      velocita: 10 * U.GIORNO, camera: { ampiezza: 7 * U.UA }, seleziona: 'Cometa di Halley',
      programma: [{ quando: trova => { const c = trova('Cometa di Halley'), s = trova('Sole'); return c && s && Math.hypot(c.x - s.x, c.y - s.y, c.z - s.z) < 0.62 * U.UA; }, fai: () => {
        Grav.ui.avviso('Perielio', 'La cometa passa a 0,59 UA dal Sole a circa 55 km/s. Il ghiaccio evapora e trascina polvere: si formano due code, una di gas azzurra, dritta e sempre opposta al Sole (la spinge il vento solare), e una di polveri giallina, più larga e incurvata. Ogni passaggio la cometa perde qualche metro di superficie.', 14);
      } }],
      costruisci() {
        const L = solare(6);
        L.push(orbita(K.crea('cometa', { nome: 'Cometa di Halley', m: 2.2e14, r: 5.5e3 }), L[0], 17.83 * U.UA, 0.967, 162.26, 58.42, 111.33, -4));
        return { corpi: centra(L) };
      }
    },
    {
      id: 'nettuno', gruppo: 'Eventi della storia cosmica', nome: '1846: Nettuno, il pianeta trovato con i calcoli',
      descrizione: 'Urano non seguiva esattamente l\'orbita prevista: qualcosa lo tirava. Urbain Le Verrier calcolò dove doveva trovarsi un pianeta sconosciuto e il 23 settembre 1846 Johann Galle lo trovò a meno di un grado dal punto previsto. Prova: elimina Nettuno e confronta l\'orbita di Urano (con ↺ torni indietro).',
      velocita: 2 * U.ANNO, camera: { ampiezza: 75 * U.UA }, opz: { scia: 'lunga' }, seleziona: 'Urano',
      opzione: {
        etichetta: 'Nettuno 30 volte più massiccio (effetto esagerato)',
        testo: 'Con la massa vera, togliere Nettuno sposta Urano di appena 0,01 UA: troppo poco per vederlo qui, eppure Le Verrier lo misurò nei dati. Con un Nettuno 30 volte più massiccio la spinta si vede a occhio: prima del 1822 (congiunzione) Nettuno tira Urano in avanti, dopo lo trattiene.'
      },
      costruisci(forte) {
        const L = solare(8);
        if (forte) { const n = L.find(b => b.nome === 'Nettuno'); n.m *= 30; n.r *= 3; }
        return { corpi: centra(L) };
      }
    },
    {
      id: 'sl9', gruppo: 'Eventi della storia cosmica', nome: '1994: la cometa Shoemaker-Levy 9 contro Giove',
      descrizione: 'Una cometa catturata da Giove passa troppo vicino al pianeta: le forze di marea la spezzano in una "collana di perle" di frammenti, che poi si schiantano su Giove uno dopo l\'altro. Per la prima volta l\'umanità vide in diretta lo scontro tra due corpi del Sistema solare (luglio 1994). Qui la storia è accorciata: rottura e impatti avvengono nello stesso passaggio. Rallenta il tempo per vedere gli impatti uno a uno.',
      velocita: 600, camera: { ampiezza: 1.4e9 }, seleziona: 'Shoemaker-Levy 9',
      costruisci() {
        const giove = K.crea('gassoso', { nome: 'Giove', colore: '#d8a26a' });
        const c = avvicina(K.crea('cometa', { nome: 'Shoemaker-Levy 9', m: 2e13, r: 2e3, fragile: true,
          storia: { titolo: 'Impatto su Giove', testo: 'Ogni frammento esplode nell\'atmosfera di Giove lasciando una macchia scura più grande della Terra, visibile per settimane anche con piccoli telescopi.' } }),
          giove, 12 * U.RG, 0.6 * U.RG, 200);
        return { corpi: [giove, c] };
      }
    },
    {
      id: 'buchineri', gruppo: 'Eventi della storia cosmica', nome: '2015: la prima onda gravitazionale (GW150914)', modo: 'relativistica',
      descrizione: 'Due buchi neri di 36 e 29 masse solari, a 1,3 miliardi di anni luce. Il 14 settembre 2015 gli strumenti LIGO registrarono per la prima volta le onde gravitazionali previste da Einstein cento anni prima (premio Nobel 2017). I buchi neri perdono energia, si avvicinano a spirale sempre più in fretta e si fondono. Guarda il grafico "Onde gravitazionali": è il famoso "cinguettio" (chirp). Alla fusione lo senti anche, trasformato in suono e rallentato, come fecero i ricercatori di LIGO.',
      velocita: 0.1, camera: { ampiezza: 5e6 }, grafico: 'onde',
      costruisci: () => ({ corpi: coppia(K.crea('buco', { nome: 'Buco nero 36 M☉', m: 36 * U.MS }), K.crea('buco', { nome: 'Buco nero 29 M☉', m: 29 * U.MS }), 1.5e6) })
    },
    {
      id: 'oumuamua', gruppo: 'Eventi della storia cosmica', nome: '2017: ʻOumuamua, il primo visitatore interstellare',
      descrizione: 'Il 19 ottobre 2017 il telescopio Pan-STARRS scoprì il primo oggetto arrivato da un\'altra stella. Va così veloce che il Sole non può trattenerlo: la sua orbita è un\'iperbole (selezionalo e guarda il pannello) e se ne andrà per sempre. Il nome hawaiano significa "messaggero che arriva per primo da lontano". In 3D si vede che arriva da sopra il piano dei pianeti.',
      velocita: 2 * U.GIORNO, camera: { ampiezza: 4 * U.UA }, seleziona: 'ʻOumuamua',
      costruisci() {
        const L = solare(4);
        L.push(avvicina(K.crea('asteroide', { nome: 'ʻOumuamua', m: 4e9, r: 100, colore: '#c98a5a' }), L[0], 4 * U.UA, 0.255 * U.UA, 100, 2.63e4, 122));
        return { corpi: centra(L) };
      }
    },
    {
      id: 'neutroni', gruppo: 'Eventi della storia cosmica', nome: '2017: la kilonova GW170817', modo: 'relativistica',
      descrizione: 'Due stelle di neutroni a 130 milioni di anni luce. Il 17 agosto 2017 la loro fusione fu osservata sia con le onde gravitazionali sia con i telescopi di tutto il mondo: la sua luce mostrò la formazione di elementi pesanti (nel 2019 vi fu riconosciuto lo stronzio). Alla fusione ascolta il "cinguettio". Qui partono da 100 km di distanza: spiraleggiano, si scontrano ed esplodono in una kilonova.',
      velocita: 0.03, camera: { ampiezza: 4e5 }, grafico: 'onde',
      costruisci: () => ({ corpi: coppia(K.crea('neutroni', { nome: 'Stella di neutroni A', m: 1.4 * U.MS }), K.crea('neutroni', { nome: 'Stella di neutroni B', m: 1.3 * U.MS }), 1e5) })
    },
    {
      id: 's2', gruppo: 'Eventi della storia cosmica', nome: '2020: la stella S2 e il buco nero al centro della Galassia', modo: 'relativistica',
      descrizione: 'Al centro della Via Lattea c\'è un buco nero di 4 milioni di masse solari, Sagittarius A*. Per trent\'anni Reinhard Genzel e Andrea Ghez hanno seguito le stelle che gli girano intorno (premio Nobel 2020). La stella S2 compie un giro in 16 anni e passa a 120 UA dal buco nero a quasi 8000 km/s. Nel 2018 si è misurato il rallentamento del tempo previsto da Einstein: guarda la riga "Orologio" nel pannello quando S2 è vicina.',
      velocita: 0.5 * U.ANNO, camera: { ampiezza: 2600 * U.UA }, seleziona: 'S2',
      costruisci() {
        const sgr = K.crea('buco', { nome: 'Sagittarius A*', m: 4.3e6 * U.MS });
        const s2 = orbita(K.crea('stella', { nome: 'S2', m: 14 * U.MS, r: 6 * U.RS }), sgr, 1031 * U.UA, 0.884, 0, 0, 0, 180);
        return { corpi: centra([sgr, s2]) };
      }
    },
    {
      id: 'andromeda', gruppo: 'Eventi della storia cosmica', nome: 'Fra 4,5 miliardi di anni: Via Lattea contro Andromeda',
      descrizione: 'La galassia di Andromeda si avvicina alla nostra a 110 km/s. Secondo le stime più citate, fra circa 4,5 miliardi di anni le due galassie si sfioreranno, poi torneranno indietro e probabilmente si fonderanno in un\'unica grande galassia ellittica (uno studio del 2025 stima circa una possibilità su due) (qualcuno l\'ha già chiamata "Lattomeda"). Il pallino giallo è il Sole: dove finirà? Le stelle quasi mai si scontrano. Le masse includono la materia oscura; date ed esito sono stime incerte. Semplificazione: ogni galassia è un unico punto massiccio, perciò le stelle del disco (e il Sole) girano più in fretta che nella realtà.',
      velocita: 1e8 * U.ANNO, dtMax: 4e13, eta: 0.04, camera: { ampiezza: 3.6e22, centro: [-2.4e21, 0] }, seleziona: 'Sole',
      costruisci() {
        const vl = K.crea('galassia', { nome: 'Via Lattea', m: 1.0e12 * U.MS, colore: '#fff1d0' });
        const an = K.crea('galassia', { nome: 'Andromeda', m: 1.5e12 * U.MS, colore: '#d6e4ff' });
        const d = 2.4e22, vr = -1.1e5, vt = 5.7e4;
        an.x = d; an.vx = vr; an.vy = vt;
        centra([vl, an]);
        const sole = orbita(K.crea('stella', { nome: 'Sole', colore: '#ffe08a' }), vl, 2.46e20, 0, 0, 0, 0, 120);
        const P = [];
        disco(P, vl, 4.7e20, 320, 0, ['#fff1d0', '#ffd9a0', '#cfe0ff']);
        disco(P, an, 6e20, 320, 60, ['#d6e4ff', '#a9c4ff', '#fff1d0']);
        return { corpi: [vl, an, sole], particelle: P };
      }
    }
  ];

  /* Schede storiche degli eventi: quando, dove, chi, cronologia */
  const SCHEDE = {
    theia: {
      quando: 'Circa 4,5 miliardi di anni fa, poche decine di milioni di anni dopo la nascita del Sistema solare',
      dove: 'Sull\'orbita della Terra primordiale',
      chi: 'Ipotesi di William Hartmann e Donald Davis (1975) e, indipendentemente, di Alastair Cameron e William Ward (1976)',
      cronologia: [
        ['1879', 'George Darwin, figlio di Charles, propone che la Luna si sia staccata da una Terra che ruotava velocissima.'],
        ['1969–1972', 'Le missioni Apollo riportano 382 kg di rocce lunari: sono simili al mantello terrestre e povere di ferro.'],
        ['1975–1976', 'Nasce l\'ipotesi dell\'impatto gigante, che spiega sia la composizione sia la grande rotazione del sistema Terra-Luna.'],
        ['2000', 'Il geochimico Alex Halliday chiama Theia il pianeta che colpì la Terra: nel mito greco Theia è la madre di Selene, la Luna.'],
        ['Oggi', 'È l\'ipotesi più accreditata, studiata con simulazioni al computer; alcuni dettagli, come la composizione quasi identica di Terra e Luna, sono ancora discussi.']
      ]
    },
    chicxulub: {
      quando: '66 milioni di anni fa, alla fine del periodo Cretaceo (limite Cretaceo-Paleogene)',
      dove: 'Penisola dello Yucatán, Messico: il cratere, largo circa 180 km, è sepolto sotto i sedimenti',
      chi: 'Luis e Walter Alvarez (ipotesi dell\'impatto); Glen Penfield, Antonio Camargo e Alan Hildebrand (identificazione del cratere)',
      cronologia: [
        ['1978', 'Due geofisici della compagnia petrolifera messicana Pemex, Glen Penfield e Antonio Camargo, notano una struttura ad arco sotto lo Yucatán.'],
        ['1980', 'Il fisico Luis Alvarez e il figlio geologo Walter trovano nelle rocce di Gubbio, in Umbria, uno strato ricchissimo di iridio, raro sulla Terra ma comune negli asteroidi: propongono l\'impatto di un asteroide.'],
        ['1991', 'Alan Hildebrand e colleghi dimostrano che Chicxulub è il cratere cercato.'],
        ['2016', 'Una perforazione scientifica internazionale preleva le rocce dell\'anello interno del cratere.'],
        ['Oggi', 'L\'impatto è considerato la causa principale dell\'estinzione dei dinosauri non aviani, forse insieme alle enormi eruzioni vulcaniche dell\'India (Trappi del Deccan).']
      ]
    },
    1054: {
      quando: '4 luglio 1054 (la luce partì dalla stella circa 6500 anni prima)',
      dove: 'Costellazione del Toro, a circa 6500 anni luce dalla Terra',
      chi: 'Astronomi della corte cinese della dinastia Song; più tardi John Bevis, Charles Messier, Lord Rosse, Edwin Hubble',
      cronologia: [
        ['1054', 'I cronisti cinesi registrano una "stella ospite", visibile di giorno per 23 giorni e di notte per quasi due anni. Ne parlano anche fonti giapponesi e arabe.'],
        ['1731', 'L\'inglese John Bevis osserva per primo la nebulosa.'],
        ['1758', 'Charles Messier la nota mentre cerca il ritorno della cometa di Halley e la mette al primo posto del suo catalogo: M1.'],
        ['1844', 'Lord Rosse la disegna con il suo grande telescopio: la forma gli ricorda un granchio.'],
        ['1928', 'Edwin Hubble collega la nebulosa alla "stella ospite" del 1054, osservando che si espande da circa 900 anni.'],
        ['1968', 'Al centro viene scoperta una pulsar che ruota 30 volte al secondo: la stella di neutroni lasciata dall\'esplosione.']
      ]
    },
    halley: {
      quando: 'Previsione pubblicata nel 1705; ritorno osservato il 25 dicembre 1758',
      dove: 'Sistema solare interno; l\'orbita arriva oltre Nettuno',
      chi: 'Edmund Halley, Isaac Newton, Alexis Clairaut, Johann Georg Palitzsch',
      cronologia: [
        ['1301', 'Passaggio della cometa che probabilmente ispirò Giotto: la dipinse come stella cometa nell\'Adorazione dei Magi della Cappella degli Scrovegni a Padova.'],
        ['1682', 'Halley osserva la cometa.'],
        ['1687', 'Newton pubblica i Principia, con la legge di gravitazione universale; è Halley a convincerlo e a pagarne la stampa.'],
        ['1705', 'Halley capisce che le comete del 1531, 1607 e 1682 sono la stessa e ne predice il ritorno per il 1758.'],
        ['1742', 'Halley muore.'],
        ['1758', 'Il matematico Clairaut calcola il ritardo dovuto all\'attrazione di Giove e Saturno. La notte di Natale l\'astronomo dilettante Palitzsch avvista la cometa.'],
        ['1986', 'La sonda europea Giotto passa a meno di 600 km dal nucleo e lo fotografa.'],
        ['2061', 'Prossimo ritorno.']
      ]
    },
    nettuno: {
      quando: 'Calcoli del 1845–1846; scoperta la notte del 23 settembre 1846',
      dove: 'Osservatorio di Berlino; il pianeta era nella costellazione dell\'Acquario',
      chi: 'Urbain Le Verrier (calcoli), Johann Galle e Heinrich d\'Arrest (osservazione); in modo indipendente John Couch Adams',
      cronologia: [
        ['1612–1613', 'Galileo Galilei vede Nettuno vicino a Giove e lo disegna, ma lo scambia per una stella.'],
        ['1781', 'William Herschel scopre Urano.'],
        ['1821', 'Alexis Bouvard pubblica le tavole del moto di Urano, ma il pianeta non le rispetta.'],
        ['1845–1846', 'Adams in Inghilterra e Le Verrier in Francia calcolano dove dovrebbe trovarsi un pianeta sconosciuto che disturba Urano.'],
        ['23 settembre 1846', 'Galle e d\'Arrest trovano Nettuno a meno di un grado dal punto indicato da Le Verrier: "scoperto con la punta della penna".'],
        ['1989', 'La sonda Voyager 2 sorvola Nettuno.']
      ]
    },
    sl9: {
      quando: 'Rottura il 7 luglio 1992; impatti dal 16 al 22 luglio 1994',
      dove: 'Giove',
      chi: 'Scoperta da Carolyn ed Eugene Shoemaker e David Levy all\'osservatorio di Monte Palomar (California)',
      cronologia: [
        ['Prima del 1992', 'Giove cattura la cometa, probabilmente alcuni decenni prima: da allora gli gira intorno.'],
        ['7 luglio 1992', 'Passa a circa 40 000 km dalle nubi di Giove: le forze di marea la spezzano in più di 20 frammenti.'],
        ['24 marzo 1993', 'Viene scoperta: appare come una "collana di perle". È la nona cometa periodica trovata da Shoemaker e Levy.'],
        ['16–22 luglio 1994', '21 frammenti colpiscono Giove a 60 km/s. Il frammento G libera un\'energia pari a milioni di megatoni. Osservano il telescopio spaziale Hubble e la sonda Galileo.'],
        ['Dopo', 'L\'evento convince molti governi dell\'importanza di sorvegliare gli asteroidi vicini alla Terra.']
      ]
    },
    buchineri: {
      quando: '14 settembre 2015, ore 09:50:45 (tempo universale); annuncio l\'11 febbraio 2016',
      dove: 'A circa 1,3 miliardi di anni luce; segnale registrato dai due rivelatori LIGO negli Stati Uniti (Hanford e Livingston), a 7 millesimi di secondo l\'uno dall\'altro',
      chi: 'Collaborazioni LIGO e Virgo; premio Nobel 2017 a Rainer Weiss, Barry Barish e Kip Thorne',
      cronologia: [
        ['1916', 'Albert Einstein prevede l\'esistenza delle onde gravitazionali con la relatività generale.'],
        ['1974', 'Russell Hulse e Joseph Taylor scoprono una pulsar doppia che si avvicina proprio come previsto: prova indiretta delle onde (Nobel 1993).'],
        ['2003', 'Entra in funzione Virgo, il rivelatore italo-francese di Cascina, vicino a Pisa.'],
        ['2015', 'Prima rilevazione diretta: in un quinto di secondo i due buchi neri si fondono, irradiando in onde gravitazionali l\'energia di circa 3 masse solari.'],
        ['Oggi', 'Sono state osservate centinaia di fusioni di buchi neri e stelle di neutroni.']
      ]
    },
    oumuamua: {
      quando: 'Scoperto il 19 ottobre 2017; perielio il 9 settembre 2017',
      dove: 'Telescopio Pan-STARRS1, sul vulcano Haleakalā (Hawaii)',
      chi: 'Scoperto da Robert Weryk',
      cronologia: [
        ['9 settembre 2017', 'Passa al perielio, a 0,25 UA dal Sole (più vicino di Mercurio).'],
        ['14 ottobre 2017', 'Passa a circa 24 milioni di km dalla Terra.'],
        ['19 ottobre 2017', 'Viene scoperto mentre già si allontana: è il primo oggetto interstellare conosciuto (sigla 1I).'],
        ['2018', 'Si scopre una piccola accelerazione non dovuta alla gravità, forse causata da gas che evapora. La forma è molto allungata e il colore rossastro.'],
        ['2019', 'Gennadij Borisov scopre il secondo visitatore interstellare, la cometa 2I/Borisov.'],
        ['2025', 'Il 1° luglio il telescopio ATLAS scopre la cometa 3I/ATLAS, il terzo oggetto interstellare conosciuto.']
      ]
    },
    neutroni: {
      quando: '17 agosto 2017, ore 12:41 (tempo universale)',
      dove: 'Galassia NGC 4993, a circa 130 milioni di anni luce, nella costellazione dell\'Idra',
      chi: 'LIGO, Virgo e circa 70 osservatori nel mondo',
      cronologia: [
        ['12:41', 'LIGO e Virgo registrano il segnale per circa 100 secondi: è la prima fusione di stelle di neutroni osservata.'],
        ['+1,7 secondi', 'Il satellite Fermi della NASA registra un lampo di raggi gamma dalla stessa zona di cielo: le onde gravitazionali viaggiano alla velocità della luce.'],
        ['+11 ore', 'I telescopi trovano la kilonova nella galassia NGC 4993; nei giorni seguenti la sua luce mostra la formazione di elementi pesanti come oro e platino.'],
        ['Oggi', 'Nasce l\'"astronomia multimessaggero", che studia lo stesso evento con onde gravitazionali e luce.']
      ]
    },
    s2: {
      quando: 'Osservazioni dal 1992 a oggi; passaggi ravvicinati nel 2002 e nel 2018; premio Nobel 2020',
      dove: 'Centro della Via Lattea, a circa 26 000 anni luce, nella costellazione del Sagittario',
      chi: 'I gruppi di Reinhard Genzel (Germania, telescopi ESO in Cile) e di Andrea Ghez (Stati Uniti, telescopi Keck alle Hawaii)',
      cronologia: [
        ['1992 e 1995', 'Iniziano le osservazioni delle stelle attorno al centro della Galassia, possibili solo con l\'infrarosso e ottiche che correggono la turbolenza dell\'aria.'],
        ['2002', 'S2 passa vicinissima al centro: la sua orbita dimostra che lì c\'è una massa di 4 milioni di soli in uno spazio piccolissimo.'],
        ['2018', 'Nuovo passaggio: lo strumento GRAVITY misura lo spostamento verso il rosso della luce di S2 dovuto alla gravità, come previsto da Einstein.'],
        ['2020', 'Si misura la precessione dell\'orbita di S2. Premio Nobel per la fisica a Genzel e Ghez (insieme a Roger Penrose).'],
        ['2022', 'L\'Event Horizon Telescope pubblica la prima immagine dell\'ombra di Sagittarius A*.'],
        ['2034', 'Prossimo passaggio ravvicinato di S2.']
      ]
    },
    andromeda: {
      quando: 'Primo passaggio stimato fra circa 4,5 miliardi di anni; fusione completa qualche miliardo di anni dopo',
      dove: 'Andromeda (M31) oggi dista circa 2,5 milioni di anni luce',
      chi: 'Misure di Vesto Slipher (1912), Edwin Hubble (1923), Roeland van der Marel e colleghi (2012)',
      cronologia: [
        ['964', 'L\'astronomo persiano al-Sufi descrive Andromeda come una "piccola nuvola" nel suo Libro delle stelle fisse.'],
        ['1912', 'Vesto Slipher misura che Andromeda si avvicina a circa 300 km/s rispetto al Sole.'],
        ['1923', 'Edwin Hubble trova in Andromeda stelle variabili Cefeidi e dimostra che è una galassia lontanissima, non una nebulosa della Via Lattea.'],
        ['2012', 'Con il telescopio Hubble si misura il moto laterale di Andromeda: è piccolo, quindi la collisione è molto probabile.'],
        ['2025', 'Uno studio che considera anche la Grande Nube di Magellano e la galassia del Triangolo stima che la probabilità di fusione nei prossimi 10 miliardi di anni sia intorno al 50%: il futuro è meno certo di quanto si pensava.'],
        ['Fra ~5 miliardi di anni', 'Il Sole diventerà una gigante rossa, indipendentemente dallo scontro.']
      ]
    }
  };
  for (const s of SCENARI) if (SCHEDE[s.id]) s.scheda = SCHEDE[s.id];

  Grav.scenari = { SCENARI, stato, orbita, centra, coppia };
})();
