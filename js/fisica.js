/* Motore fisico: gravità a N corpi, correzioni relativistiche, urti, fusioni, maree, supernove.
   Integratore "kick-drift-kick" (leapfrog) con passo adattivo: il passo è una frazione del tempo
   caratteristico più breve tra tutte le coppie di corpi (caduta libera o avvicinamento). */
(function () {
  'use strict';
  const { G, C, U, fmt } = Grav;
  const K = Grav.corpi, TIPI = Grav.TIPI;
  const MAX_PART = 3000;

  const S = Grav.sim = {
    corpi: [], particelle: [], t: 0, modo: 'classica', fattoreC: 1,
    opz: { collisioni: true, maree: true, frammenti: true, spinta: true },
    eventi: [], tau: Infinity, eta: 0.01, attrito: 8, sporco: true, rallentato: false, piano: true,
    gw: { campioni: [], passo: 1e-3, ultimo: 0, coppia: null, rd: null, ampiezza: 0 }
  };
  S.rel = () => S.modo === 'relativistica';
  S.cEff = () => C * (S.rel() ? S.fattoreC : 1);
  S.trova = id => S.corpi.find(b => b.id === id);
  const vivo = b => !b.morto;

  // Effetti visivi (in tempo reale, disegnati dalla vista)
  const LAMPO = (colore, raggio, durata) => ({ tipo: 'lampo', colore, raggio, durata });
  const ANELLO = (colore, raggio, durata) => ({ tipo: 'anello', colore, raggio, durata });
  const ONDE = (n, raggio, durata) => ({ tipo: 'onde', n, raggio, durata, colore: '#b9a4ff' });
  const evento = e => S.eventi.push(e);

  /* ---------- Forze ---------- */
  function forze(L, rel, c, rileva) {
    const n = L.length, c2 = c * c, c5 = c2 * c2 * c;
    let tau = Infinity;
    const urti = [], maree = [];
    for (let i = 0; i < n; i++) { const b = L[i]; b.ax = 0; b.ay = 0; b.az = 0; }
    for (let i = 0; i < n; i++) {
      const a = L[i];
      for (let j = i + 1; j < n; j++) {
        const b = L[j];
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const r2 = dx * dx + dy * dy + dz * dz, r = Math.sqrt(r2), R = a.r + b.r, M = a.m + b.m;
        const re = r > R ? r : R, GM = G * M || 1e-30;
        // in relatività due oggetti compatti dentro l'ultima orbita stabile (6GM/c²) precipitano e si fondono
        const isco = rel && TIPI[a.tipo].compatto && TIPI[b.tipo].compatto ? 6 * GM / c2 : 0;
        if (rileva && S.opz.collisioni && (r < R || r < isco)) urti.push([a, b]);
        const inv3 = r < R ? 1 / (R * R * R) : 1 / (r2 * r);   // dentro: forza di una sfera uniforme
        const ga = G * b.m * inv3, gb = G * a.m * inv3;
        a.ax += ga * dx; a.ay += ga * dy; a.az += ga * dz;
        b.ax -= gb * dx; b.ay -= gb * dy; b.az -= gb * dz;

        const ux = a.vx - b.vx, uy = a.vy - b.vy, uz = a.vz - b.vz, v2 = ux * ux + uy * uy + uz * uz;
        let t = Math.sqrt(re * re * re / GM);
        if (r < 20 * R || GM / (re * v2) > 0.01) { const t2 = re / Math.sqrt(v2 + 1e-300); if (t2 < t) t = t2; }
        if (t < tau) tau = t;

        if (rel) {
          // Correzione post-newtoniana 1PN (precessione delle orbite) e reazione di radiazione 2.5PN
          // (energia persa in onde gravitazionali), applicate al moto relativo della coppia.
          // (sotto 7GM/c² lo sviluppo post-newtoniano non vale più: i termini vengono limitati)
          const k = Math.max(re, 7 * GM / c2) / re, nx = -dx * k, ny = -dy * k, nz = -dz * k, rp = re * k;
          const rv = nx * ux + ny * uy + nz * uz, gmr = GM / rp, re3 = rp * rp * rp;
          const k1 = GM / (c2 * re3), A = 4 * gmr - v2, B = 4 * rv;
          let px = k1 * (A * nx + B * ux), py = k1 * (A * ny + B * uy), pz = k1 * (A * nz + B * uz);
          const eta = a.m * b.m / (M * M), rd = rv / rp;
          const k2 = 1.6 * eta * GM * GM / (c5 * re3);
          const P = (18 * v2 + 2 / 3 * gmr - 25 * rd * rd) * rd / rp, Q = 6 * v2 - 2 * gmr - 15 * rd * rd;
          px += k2 * (P * nx - Q * ux); py += k2 * (P * ny - Q * uy); pz += k2 * (P * nz - Q * uz);
          const fa = b.m / M, fb = a.m / M;
          a.ax += fa * px; a.ay += fa * py; a.az += fa * pz;
          b.ax -= fb * px; b.ay -= fb * py; b.az -= fb * pz;
        }

        if (a.tipo === 'galassia' && b.tipo === 'galassia' && re < 4e21) {
          // attrito dinamico: gli aloni di materia oscura si frenano a vicenda, e le galassie finiscono per fondersi
          const k = 1 / (S.attrito * Math.sqrt(re * re * re / GM)), fa = b.m / M, fb = a.m / M;
          a.ax -= fa * k * ux; a.ay -= fa * k * uy; a.az -= fa * k * uz;
          b.ax += fb * k * ux; b.ay += fb * k * uy; b.az += fb * k * uz;
        }

        if (rileva && S.opz.maree && r >= R) {
          const h = a.m >= b.m ? a : b, l = h === a ? b : a, Tl = TIPI[l.tipo];
          if ((l.fragile || !Tl.piccolo && l.r > 1e5) && !Tl.compatto && h.m > 10 * l.m) {
            const dR = (Tl.fluido ? 2.44 : 1.26) * l.r * Math.cbrt(h.m / l.m);   // limite di Roche
            if (r < dR && dR > R) maree.push([h, l]);
          }
        }
      }
    }
    for (let i = 0; i < n; i++) if (L[i].fisso) { L[i].ax = 0; L[i].ay = 0; L[i].az = 0; }
    return { tau, urti, maree };
  }

  function ricalcola() {
    S.tau = forze(S.corpi, S.rel(), S.cEff(), false).tau;
    S.sporco = false;
  }

  function passo(dt) {
    const L = S.corpi, rel = S.rel(), c = S.cEff(), h = dt / 2;
    if (S.sporco) ricalcola();
    for (const b of L) if (!b.fisso) {
      b.vx += b.ax * h; b.vy += b.ay * h; b.vz += b.az * h;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    }
    // Con le forze relativistiche (che dipendono dalla velocità) la forza va calcolata con una stima
    // della velocità a fine passo, altrimenti nasce un errore sistematico sull'energia.
    for (const b of L) {
      b.hx = b.vx; b.hy = b.vy; b.hz = b.vz;
      if (!b.fisso) { b.vx += b.ax * h; b.vy += b.ay * h; b.vz += b.az * h; }
    }
    const f = forze(L, rel, c, true);
    for (const b of L) { b.vx = b.hx; b.vy = b.hy; b.vz = b.hz; }
    for (const b of L) if (!b.fisso) {
      b.vx += b.ax * h; b.vy += b.ay * h; b.vz += b.az * h;
      if (rel) {                                   // nessun corpo può raggiungere la luce
        const v = Math.hypot(b.vx, b.vy, b.vz), max = 0.98 * c;
        if (v > max) { const k = max / v; b.vx *= k; b.vy *= k; b.vz *= k; }
      }
    }
    S.tau = f.tau;
    muoviParticelle(dt);
    S.t += dt;
    campioneGW();
    if (f.urti.length || f.maree.length) {
      for (const [a, b] of f.urti) if (vivo(a) && vivo(b)) urto(a, b);
      for (const [hh, l] of f.maree) if (vivo(hh) && vivo(l)) disgrega(hh, l);
      S.sporco = true;
    }
  }

  S.avanza = function (durata, scadenza) {
    S.rallentato = false;
    let resto = durata, k = 0;
    while (resto > 0) {
      if (S.sporco) ricalcola();
      if (!S.corpi.length) { muoviParticelle(resto); S.t += resto; break; }
      const dt = Math.min(S.eta * S.tau, S.dtMax || Infinity, resto);
      passo(dt);
      resto -= dt;
      if ((++k & 7) === 0 && performance.now() > scadenza) { S.rallentato = true; break; }
    }
  };

  /* ---------- Particelle (detriti senza massa, solo per l'effetto visivo) ---------- */
  function muoviParticelle(dt) {
    const P = S.particelle, L = S.corpi;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      let ax = 0, ay = 0, az = 0, morta = false;
      for (let j = 0; j < L.length; j++) {
        const b = L[j], dx = b.x - p.x, dy = b.y - p.y, dz = b.z - p.z, r2 = dx * dx + dy * dy + dz * dz;
        const lim = b.tipo === 'buco' ? b.r * 1.5 : b.r;
        if (r2 < lim * lim) {
          morta = true;
          if (b.tipo === 'buco') b.bagliore = Math.min(1, (b.bagliore || 0) + 0.03);
          break;
        }
        const s = r2 + b.r * b.r * 0.01, k = G * b.m / (s * Math.sqrt(s));
        ax += k * dx; ay += k * dy; az += k * dz;
      }
      if (morta) { P[i] = P[P.length - 1]; P.pop(); continue; }
      p.vx += ax * dt; p.vy += ay * dt; p.vz += az * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }
  }

  // o: {x,y,z, vx,vy,vz, n, r0, vmin, vmax, colori, vita, dim, lungo}
  S.emetti = function (o) {
    const P = S.particelle;
    for (let i = 0; i < o.n; i++) {
      if (P.length >= MAX_PART) P.shift();
      let ux, uy, uz;
      if (o.lungo) {                                  // lungo un segmento (flussi mareali)
        const s = (Math.random() * 2 - 1) * o.lungo.l;
        const v = Math.random() * o.vmax, a = Math.random() * 2 * Math.PI;
        P.push({
          x: o.x + o.lungo.nx * s, y: o.y + o.lungo.ny * s, z: o.z + o.lungo.nz * s,
          vx: o.vx + Math.cos(a) * v, vy: o.vy + Math.sin(a) * v, vz: o.vz + (S.piano ? 0 : (Math.random() - 0.5) * v),
          vita: o.vita * (0.7 + Math.random() * 0.6), vitaMax: o.vita * 1.3, colore: o.colori[i % o.colori.length], dim: o.dim || 1.4
        });
        continue;
      }
      if (S.piano) { const a = Math.random() * 2 * Math.PI; ux = Math.cos(a); uy = Math.sin(a); uz = (Math.random() - 0.5) * 0.08; }
      else {
        uz = Math.random() * 2 - 1; const a = Math.random() * 2 * Math.PI, s = Math.sqrt(1 - uz * uz);
        ux = Math.cos(a) * s; uy = Math.sin(a) * s;
      }
      const v = o.vmin + Math.random() * (o.vmax - o.vmin), r0 = (o.r0 || 0) * (1.02 + Math.random() * 0.1);
      P.push({
        x: o.x + ux * r0, y: o.y + uy * r0, z: o.z + uz * r0,
        vx: (o.vx || 0) + ux * v, vy: (o.vy || 0) + uy * v, vz: (o.vz || 0) + uz * v,
        vita: o.vita * (0.6 + Math.random() * 0.5), vitaMax: o.vita * 1.1,
        colore: o.colori[i % o.colori.length], dim: o.dim || 1.5
      });
    }
  };

  S.invecchia = function (dtReale) {
    const P = S.particelle;
    for (let i = P.length - 1; i >= 0; i--) {
      P[i].vita -= dtReale;
      if (P[i].vita <= 0) { P[i] = P[P.length - 1]; P.pop(); }
    }
    for (const b of S.corpi) if (b.bagliore) b.bagliore = Math.max(0, b.bagliore - dtReale * 0.15);
  };

  /* ---------- Gestione dei corpi ---------- */
  S.aggiungi = b => { S.corpi.push(b); S.sporco = true; return b; };
  function rimuovi(b) {
    b.morto = true;
    const i = S.corpi.indexOf(b);
    if (i >= 0) S.corpi.splice(i, 1);
    S.sporco = true;
  }
  S.rimuovi = rimuovi;

  // q confluisce in p: conserva massa (meno l'eventuale perdita) e quantità di moto
  function unisci(p, q, perdita = 0) {
    const M = p.m + q.m;
    if (p.fisso || q.fisso) {
      const f = p.fisso ? p : q;
      p.x = f.x; p.y = f.y; p.z = f.z; p.vx = p.vy = p.vz = 0; p.fisso = true;
    } else {
      p.x = (p.m * p.x + q.m * q.x) / M; p.y = (p.m * p.y + q.m * q.y) / M; p.z = (p.m * p.z + q.m * q.z) / M;
      p.vx = (p.m * p.vx + q.m * q.vx) / M; p.vy = (p.m * p.vy + q.m * q.vy) / M; p.vz = (p.m * p.vz + q.m * q.vz) / M;
    }
    p.m = M * (1 - perdita);
    rimuovi(q);
    return p;
  }

  function avviaRingdown(Mf) {
    const g = S.gw, c = S.cEff(), w0 = c * c * c / (G * Mf);
    g.rd = { t0: S.t, A: g.ampiezza || 1, w: 0.53 * w0, tau: 1 / (0.081 * w0) };
    g.coppia = null;
  }

  function urto(a, b) {
    const big = a.m >= b.m ? a : b, small = big === a ? b : a;
    const M = a.m + b.m, mu = a.m * b.m / M, rel = S.rel(), c2 = S.cEff() ** 2;
    const vrel = Math.hypot(a.vx - b.vx, a.vy - b.vy, a.vz - b.vz), Eimp = 0.5 * mu * vrel * vrel;
    const ha = t => a.tipo === t || b.tipo === t, entrambi = t => a.tipo === t && b.tipo === t;
    const pos = { x: small.x, y: small.y, z: small.z };
    const ev = e => evento(Object.assign({ x: pos.x, y: pos.y, z: pos.z }, e));

    if (ha('buco')) {
      const bh = entrambi('buco') ? big : (a.tipo === 'buco' ? a : b), altro = bh === a ? b : a;
      if (altro.tipo === 'buco') {
        const eta = a.m * b.m / (M * M), perdita = rel ? 0.2 * eta : 0;
        const testo = `${fmt.massa(a.m)} + ${fmt.massa(b.m)} → ${fmt.massa(M * (1 - perdita))}. ` + (rel
          ? `Circa ${fmt.massa(perdita * M)} sono diventate energia di onde gravitazionali (E = mc² ≈ ${fmt.numero(perdita * M * c2)} J): per un istante più potenza di tutte le stelle dell'universo visibile messe insieme.`
          : 'Nella fisica classica le masse si sommano e basta: prova la modalità relativistica per vedere le onde gravitazionali.');
        unisci(bh, altro, perdita);
        ev({ titolo: 'Fusione di buchi neri', testo, effetti: [LAMPO('#e9e0ff', 160, 1.6), ONDE(7, 700, 4), ANELLO('#ffffff', 300, 1.5)], scossa: 1, sopravvissuto: bh.id });
        if (rel) avviaRingdown(bh.m);
      } else if (altro.tipo === 'neutroni') {
        const perdita = rel ? 0.01 : 0;
        unisci(bh, altro, perdita);
        S.emetti({ x: pos.x, y: pos.y, z: pos.z, vx: bh.vx, vy: bh.vy, vz: bh.vz, n: 150, r0: bh.r * 2, vmin: 0.05 * C, vmax: 0.2 * C, colori: ['#ffd36b', '#ff9a3c', '#fff1c4'], vita: 4, dim: 1.6 });
        ev({ titolo: 'Un buco nero inghiotte una stella di neutroni', testo: 'La stella di neutroni viene in parte fatta a pezzi dalle maree e poi inghiottita. Eventi così sono stati osservati con le onde gravitazionali.', effetti: [LAMPO('#ffd9a0', 120, 1.4), ONDE(5, 500, 3.5)], scossa: 0.7, sopravvissuto: bh.id });
        if (rel) avviaRingdown(bh.m);
      } else {
        const lum = K.luce(altro);
        if (altro.m > 1e-3 * U.MS || lum)
          S.emetti({ x: pos.x, y: pos.y, z: pos.z, vx: altro.vx, vy: altro.vy, vz: altro.vz, n: 80, r0: altro.r, vmin: 0, vmax: Math.sqrt(G * altro.m / altro.r), colori: [altro.colore, '#ffb15a', '#ffffff'], vita: 6, dim: 1.3 });
        const notevole = altro.m > 1e-6 * bh.m;
        unisci(bh, altro);
        if (notevole) ev({ titolo: `${bh.nome} inghiotte ${altro.nome}`, testo: 'Oltre l\'orizzonte degli eventi non si torna indietro: la massa del buco nero cresce e con lei il suo raggio.', effetti: [LAMPO('#ffb46a', 70, 1.2)], scossa: 0.2, sopravvissuto: bh.id });
        else ev({ effetti: [LAMPO('#ffb46a', 25, 0.6)], sopravvissuto: bh.id });
        bh.bagliore = 1;
      }
      bh.tipo = 'buco'; K.adatta(bh);
      return;
    }

    if (entrambi('neutroni')) {
      const perdita = rel ? 0.01 : 0, ej = Math.min(0.03 * U.MS, 0.02 * M);
      unisci(big, small, perdita);
      big.m -= ej;
      S.emetti({ x: big.x, y: big.y, z: big.z, vx: big.vx, vy: big.vy, vz: big.vz, n: 450, r0: big.r * 3, vmin: 0.08 * C, vmax: 0.3 * C, colori: ['#ffd36b', '#ff9a3c', '#ff5d5d', '#fff1c4'], vita: 6, dim: 1.7 });
      let testo = `Le due stelle di neutroni si fondono. L'esplosione (kilonova) scaglia via ${fmt.massa(ej)} di materia ricchissima di elementi pesanti: gran parte dell'oro e del platino dell'universo nasce così.`;
      if (big.m > K.MAX_NEUTRONI) { big.tipo = 'buco'; big.colore = '#000000'; big.luce = undefined; testo += ' La massa supera il limite delle stelle di neutroni: nasce un buco nero.'; }
      K.adatta(big);
      ev({ titolo: 'Kilonova!', testo, effetti: [LAMPO('#fff3c9', 220, 2.5), ANELLO('#ffb347', 380, 2.5), ONDE(6, 600, 4)], scossa: 1, sopravvissuto: big.id });
      if (rel) avviaRingdown(big.m);
      return;
    }

    if (ha('neutroni')) {
      const ns = a.tipo === 'neutroni' ? a : b, o = ns === a ? b : a;
      unisci(ns, o);
      ev({ titolo: `${o.nome} si schianta su ${ns.nome}`, testo: 'La gravità della stella di neutroni è così intensa che la materia colpisce la superficie a una frazione notevole della velocità della luce.', effetti: [LAMPO('#c9f4ff', 90, 1.2)], scossa: 0.3, sopravvissuto: ns.id });
      S.verifica(ns);
      return;
    }

    if (ha('nana')) {
      const nb = entrambi('nana') ? big : (a.tipo === 'nana' ? a : b), o = nb === a ? b : a;
      if ((o.tipo === 'stella' || o.tipo === 'gigante') && o.m > nb.m) {
        unisci(o, nb); K.adatta(o);
        ev({ titolo: `${o.nome} ingloba ${nb.nome}`, testo: 'La nana bianca affonda nella stella più grande e ne diventa parte.', effetti: [LAMPO('#ffffff', 80, 1.2)], scossa: 0.3, sopravvissuto: o.id });
        return;
      }
      unisci(nb, o); nb.r = K.raggioNana(nb.m);
      if (nb.m > K.MAX_NANA) { supernovaIa(nb); return; }
      ev({
        titolo: o.tipo === 'nana' ? 'Fusione di due nane bianche' : `${nb.nome} cattura ${o.nome}`,
        testo: `Ora la nana bianca ha ${fmt.massa(nb.m)}: oltre 1,44 M☉ (limite di Chandrasekhar) esploderebbe.`,
        effetti: [LAMPO('#e4ecff', 80, 1.2)], scossa: 0.3, sopravvissuto: nb.id
      });
      return;
    }

    if (entrambi('galassia')) {
      const nomeNuovo = big.nome + ' + ' + small.nome;
      unisci(big, small); big.r = Math.cbrt(big.r ** 3 + small.r ** 3); big.nome = nomeNuovo;
      ev({ titolo: 'Fusione di galassie', testo: 'Le stelle non si scontrano quasi mai: sono separate da distanze enormi. I due nuclei si fondono e il risultato, dopo centinaia di milioni di anni, è una grande galassia ellittica. Tra circa 5 miliardi di anni toccherà alla Via Lattea e ad Andromeda.', effetti: [LAMPO('#fff1d0', 120, 2)], scossa: 0.4, sopravvissuto: big.id });
      return;
    }

    // Corpi ordinari: fusione, oppure frammentazione negli impatti violenti tra corpi rocciosi
    // (i frammenti non si frantumano di nuovo: si riuniscono)
    const rocciosi = ['roccioso', 'luna', 'asteroide'];
    const vfuga = Math.sqrt(2 * G * M / (a.r + b.r));
    if (S.opz.frammenti && rocciosi.includes(a.tipo) && rocciosi.includes(b.tipo) && small.m > 0.02 * big.m && vrel > 0.5 * vfuga && small.r > 1e5) {
      frammenta(big, small, vfuga);
      return;
    }
    const rN = Math.cbrt(big.r ** 3 + small.r ** 3), legame = G * big.m * big.m / big.r;
    const forza = Math.max(0, Math.min(1, 0.25 + Math.log10(Eimp / legame + 1e-12) / 8));
    const nomi = [small.nome, big.nome], tipi = [small.tipo, big.tipo];
    if (small.m > 1e-4 * big.m)
      S.emetti({ x: pos.x, y: pos.y, z: pos.z, vx: (a.m * a.vx + b.m * b.vx) / M, vy: (a.m * a.vy + b.m * b.vy) / M, vz: (a.m * a.vz + b.m * b.vz) / M,
        n: Math.round(40 + 160 * forza), r0: small.r, vmin: 0.1 * vfuga, vmax: 0.7 * vfuga, colori: [small.colore, big.colore, '#ffcf8a'], vita: 5, dim: 1.3 });
    unisci(big, small);
    big.r = rN; K.adatta(big);
    const stelle = t => t === 'stella' || t === 'gigante';
    let titolo, testo;
    if (stelle(tipi[0]) && stelle(tipi[1])) { titolo = 'Fusione di due stelle'; testo = 'Le due stelle diventano una sola, più massiccia e più calda: gli astronomi chiamano "vagabonde blu" le stelle nate così.'; }
    else if (stelle(tipi[1])) { titolo = `${nomi[1]} inghiotte ${nomi[0]}`; testo = 'Il corpo precipita nella stella e si vaporizza.'; }
    else { titolo = `Impatto: ${nomi[0]} colpisce ${nomi[1]}`; testo = `Velocità d'impatto ${fmt.velocita(vrel)}. I due corpi si fondono in uno solo.`; }
    const st = small.storia;                      // impatti storici: testo dedicato (una sola volta)
    if (tipi[0] === 'frammento' && tipi[1] === 'frammento') {
      // frammenti in orbita che si riuniscono: nasce un satellite
      const nuovo = !/^Proto-/.test(big.nome) && !/^Proto-/.test(nomi[0]) && big.m > 1e20;
      if (/^Proto-/.test(nomi[0])) big.nome = nomi[0];
      if (nuovo) big.nome = 'Proto-Luna';
      if (nuovo) ev({ titolo: 'I frammenti si riuniscono', testo: 'Due frammenti in orbita si scontrano piano e si uniscono in un corpo più grande, la "Proto-Luna". Urto dopo urto, secondo l\'ipotesi dell\'impatto gigante, il disco di detriti formò la Luna in pochi anni.', effetti: [LAMPO('#ffd59a', 40, 1)], scossa: 0.1, sopravvissuto: big.id });
      else ev({ effetti: [LAMPO('#ffd59a', 25, 0.7)], sopravvissuto: big.id });
    } else if (tipi[0] === 'frammento' && !(st && !st.usata)) {
      ev({ effetti: [LAMPO('#ffd59a', 35, 0.8)], sopravvissuto: big.id });   // niente avviso per ogni frammento
    } else if (st && !st.usata) {
      st.usata = true;
      ev({ titolo: st.titolo, testo: `${st.testo} Velocità d'impatto ${fmt.velocita(vrel)}, energia liberata circa ${fmt.numero(Eimp)} J (${fmt.numero(Eimp / 4.184e15)} megatoni di tritolo).`, effetti: [LAMPO('#ffe2b0', 150, 2.2), ANELLO('#ff9a4c', 220, 2)], scossa: 0.8, sopravvissuto: big.id });
    } else if (small.m > 1e-6 * big.m || st) ev({ titolo, testo, effetti: [LAMPO('#ffd59a', 30 + 140 * forza, 0.8 + 1.5 * forza)], scossa: forza * 0.8, sopravvissuto: big.id });
    else ev({ effetti: [LAMPO('#ffd59a', 18, 0.5)], sopravvissuto: big.id });
  }

  function frammenta(big, small, vfuga) {
    const M = big.m + small.m, k = 6, mF = 0.4 * small.m / k;
    const Px = big.m * big.vx + small.m * small.vx, Py = big.m * big.vy + small.m * small.vy, Pz = big.m * big.vz + small.m * small.vz;
    const cx = (big.m * big.x + small.m * small.x) / M, cy = (big.m * big.y + small.m * small.y) / M, cz = (big.m * big.z + small.m * small.z) / M;
    // direzione d'impatto n e direzione trasversale t (nel piano del moto relativo)
    let nx = small.x - big.x, ny = small.y - big.y, nz = small.z - big.z;
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    let tx = small.vx - big.vx, ty = small.vy - big.vy, tz = small.vz - big.vz;
    const pr = tx * nx + ty * ny + tz * nz; tx -= pr * nx; ty -= pr * ny; tz -= pr * nz;
    let tl = Math.hypot(tx, ty, tz);
    if (tl < 1e-9) { tx = -ny; ty = nx; tz = 0; tl = Math.hypot(tx, ty) || 1; }
    tx /= tl; ty /= tl; tz /= tl;
    const rho = K.densita(small), rF = K.raggioDaDensita(mF, rho);
    const nucleo = big;
    nucleo.m = big.m + 0.6 * small.m; nucleo.r = Math.cbrt(big.r ** 3 + 0.6 * small.r ** 3);
    nucleo.x = cx; nucleo.y = cy; nucleo.z = cz;
    let qx = 0, qy = 0, qz = 0;
    const nuovi = [];
    for (let i = 0; i < k; i++) {
      const th = (i / (k - 1) - 0.5) * 2.2, cs = Math.cos(th), sn = Math.sin(th);
      const dx = nx * cs + tx * sn, dy = ny * cs + ty * sn, dz = nz * cs + tz * sn;
      const ex = -nx * sn + tx * cs, ey = -ny * sn + ty * cs, ez = -nz * sn + tz * cs;
      const d = (nucleo.r + rF) * 1.6, vc = Math.sqrt(G * nucleo.m / d) * (0.85 + Math.random() * 0.4);
      const vx = Px / M + ex * vc + dx * vc * 0.15, vy = Py / M + ey * vc + dy * vc * 0.15, vz = Pz / M + ez * vc + dz * vc * 0.15;
      qx += mF * vx; qy += mF * vy; qz += mF * vz;
      nuovi.push(K.crea('frammento', { nome: 'Frammento di ' + small.nome, m: mF, r: rF, colore: small.colore, x: cx + dx * d, y: cy + dy * d, z: cz + dz * d, vx, vy, vz }));
    }
    nucleo.vx = (Px - qx) / nucleo.m; nucleo.vy = (Py - qy) / nucleo.m; nucleo.vz = (Pz - qz) / nucleo.m;
    S.emetti({ x: cx, y: cy, z: cz, vx: nucleo.vx, vy: nucleo.vy, vz: nucleo.vz, n: 220, r0: nucleo.r, vmin: 0.3 * vfuga, vmax: 0.9 * vfuga, colori: ['#ffcf8a', '#ff8a4c', small.colore, big.colore], vita: 8, dim: 1.3 });
    rimuovi(small);
    nuovi.forEach(S.aggiungi);
    evento({ x: cx, y: cy, z: cz, titolo: 'Impatto gigante!', testo: 'L\'urto è così violento che parte del materiale viene scagliata in orbita. Si pensa che la Luna sia nata così, dallo scontro tra la Terra primordiale e un pianeta grande come Marte (Theia).', effetti: [LAMPO('#ffe2b0', 160, 2.2), ANELLO('#ff9a4c', 260, 2)], scossa: 0.9, sopravvissuto: nucleo.id });
  }

  function disgrega(h, l) {
    const k = 8, mF = l.m / k, rF = l.r / 2, lum = K.luce(l);
    let nx = l.x - h.x, ny = l.y - h.y, nz = l.z - h.z;
    const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
    const nuovi = [];
    const passoF = l.fragile ? 0.05 * nl : 2.4 * rF;     // una cometa si sgrana in una lunga "collana di perle"
    for (let i = 0; i < k; i++) {
      const s = (i - (k - 1) / 2) * passoF;
      nuovi.push(K.crea('frammento', { nome: (l.fragile ? 'Frammento ' + 'ABCDEFGH'[i] : 'Frammento di ' + l.nome), m: mF, r: rF, colore: l.colore, luce: lum, storia: l.storia, x: l.x + nx * s, y: l.y + ny * s, z: l.z + nz * s, vx: l.vx, vy: l.vy, vz: l.vz }));
    }
    S.emetti({ x: l.x, y: l.y, z: l.z, vx: l.vx, vy: l.vy, vz: l.vz, n: 320, lungo: { nx, ny, nz, l: k * 1.3 * rF }, vmax: 0.4 * Math.sqrt(2 * G * l.m / l.r), colori: [l.colore, '#ffb15a', '#ffe7c2'], vita: 40, dim: 1.2 });
    rimuovi(l);
    nuovi.forEach(S.aggiungi);
    evento({ x: l.x, y: l.y, z: l.z, titolo: 'Distruzione mareale', testo: `${l.nome} è passato troppo vicino a ${h.nome}: la differenza di attrazione tra il lato vicino e quello lontano (forza di marea) supera la gravità che lo tiene insieme. Il confine si chiama limite di Roche.`, effetti: [LAMPO(lum ? '#fff0c8' : '#ffd59a', 90, 1.6)], scossa: 0.4 });
  }

  /* ---------- Evoluzione stellare ---------- */
  function supernovaIa(b) {
    S.emetti({ x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, n: 650, r0: b.r * 3, vmin: 5e6, vmax: 2e7, colori: ['#ffffff', '#fff3c4', '#ffd27a', '#9ad0ff'], vita: 12, dim: 1.8 });
    rimuovi(b);
    evento({ x: b.x, y: b.y, z: b.z, titolo: 'Supernova di tipo Ia!', testo: `${b.nome} ha superato il limite di Chandrasekhar (1,44 M☉) ed esplode completamente, senza lasciare resti. Queste supernove brillano sempre più o meno allo stesso modo: servono come "candele standard" per misurare le distanze tra le galassie.`, effetti: [LAMPO('#ffffff', 280, 3.2), ANELLO('#cfe6ff', 420, 3), ANELLO('#ffd27a', 300, 2.5)], scossa: 1 });
  }

  S.supernova = function (b) {
    const MS = U.MS, m = b.m;
    if (b.tipo === 'nana') { supernovaIa(b); return null; }
    if (b.tipo !== 'stella' && b.tipo !== 'gigante') return 'Solo le stelle possono esplodere come supernova.';
    if (m < 8 * MS) return 'Serve una stella di almeno 8 masse solari. Le stelle più leggere finiscono come nane bianche: usa "Fine della vita".';
    const bh = m >= 25 * MS, vecchio = b.nome, r0 = b.r;
    const resto = bh ? Math.max(3 * MS, 0.3 * m) : Math.min(2.0, 1.25 + 0.03 * (m / MS - 8)) * MS;
    b.tipo = bh ? 'buco' : 'neutroni'; b.m = resto; b.colore = TIPI[b.tipo].colore; b.coloreAuto = true; b.luce = undefined;
    b.nome = (bh ? 'Buco nero' : 'Pulsar') + ' (ex ' + vecchio + ')';
    K.adatta(b);
    S.emetti({ x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, n: 750, r0, vmin: 3e6, vmax: 1e7, colori: ['#fff6d5', '#ffd27a', '#ff8a4c', '#ff5470', '#9ad0ff'], vita: 12, dim: 1.8 });
    let spinta = '';
    if (S.opz.spinta) {
      const v = bh ? 3e4 * Math.random() : 1.5e5 + 3e5 * Math.random(), a = Math.random() * 2 * Math.PI;
      const uz = S.piano ? 0 : Math.random() * 2 - 1, s = Math.sqrt(1 - uz * uz);
      b.vx += v * Math.cos(a) * s; b.vy += v * Math.sin(a) * s; b.vz += v * uz;
      spinta = ` L'esplosione non è perfettamente simmetrica e dà al resto una spinta di ${fmt.velocita(v)}.`;
    }
    S.sporco = true;
    evento({ x: b.x, y: b.y, z: b.z, titolo: 'Supernova!', testo: `${vecchio} ha esaurito il combustibile: il nucleo collassa e gli strati esterni vengono scagliati via a migliaia di km/s. Si disperdono ${fmt.massa(m - resto)} di materia; resta ${bh ? 'un buco nero' : 'una stella di neutroni'} di ${fmt.massa(resto)}.${spinta} Con meno massa al centro, i corpi in orbita possono essere liberati.`, effetti: [LAMPO('#ffffff', 300, 3.5), ANELLO('#fff3c4', 450, 3), ANELLO('#ff8a4c', 320, 2.6)], scossa: 1, sopravvissuto: b.id });
    return null;
  };

  S.fineVita = function (b) {
    const MS = U.MS, m = b.m;
    if (b.tipo !== 'stella' && b.tipo !== 'gigante') return 'Solo le stelle hanno questa evoluzione.';
    if (m >= 8 * MS) return S.supernova(b);
    const mw = Math.min(0.9 * m, Math.min(1.35, Math.max(0.5, 0.109 * m / MS + 0.394)) * MS), vecchio = b.nome, r0 = b.r;
    b.tipo = 'nana'; b.m = mw; b.r = K.raggioNana(mw); b.colore = TIPI.nana.colore; b.coloreAuto = true; b.luce = undefined;
    b.nome = 'Nana bianca (ex ' + vecchio + ')';
    S.emetti({ x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, n: 550, r0: Math.max(r0, 50 * U.RS), vmin: 1.5e4, vmax: 4e4, colori: ['#7cf2c8', '#6ab8ff', '#ff7ab6', '#c8a2ff', '#fff2a8'], vita: 20, dim: 1.6 });
    S.sporco = true;
    evento({ x: b.x, y: b.y, z: b.z, titolo: 'Nebulosa planetaria', testo: `${vecchio} si è gonfiata in gigante rossa e ha soffiato via gli strati esterni (${fmt.massa(m - mw)}), formando una nebulosa colorata. Al centro resta una nana bianca di ${fmt.massa(mw)}, grande più o meno come la Terra. Qui la massa si perde di colpo e i pianeti possono sfuggire; in natura succede in centinaia di migliaia di anni e le orbite si allargano soltanto.` + (m < 0.5 * MS ? ' (In realtà una stella così piccola vive più dell\'età attuale dell\'universo!)' : ''), effetti: [LAMPO('#c8f7ff', 90, 2), ANELLO('#7cf2c8', 200, 3)], scossa: 0.2, sopravvissuto: b.id });
    return null;
  };

  function collassa(b, testo) {
    b.tipo = 'buco'; b.colore = '#000000'; b.luce = undefined; K.adatta(b); S.sporco = true;
    evento({ x: b.x, y: b.y, z: b.z, titolo: 'Collasso gravitazionale', testo, effetti: [LAMPO('#d8c8ff', 120, 1.5), ONDE(4, 400, 3)], scossa: 0.6, sopravvissuto: b.id });
  }

  // Controlla i limiti fisici dopo un cambio di massa o raggio
  S.verifica = function (b) {
    if (b.morto) return;
    if (b.tipo === 'neutroni' && b.m > K.MAX_NEUTRONI) collassa(b, `${b.nome} ha superato circa 2,3 M☉: nessuna forza nota può più sostenerla e collassa in un buco nero.`);
    else if (b.tipo === 'nana' && b.m > K.MAX_NANA) supernovaIa(b);
    else if (b.tipo !== 'buco' && b.r <= K.raggioSchw(b.m)) collassa(b, `${b.nome} è diventato più piccolo del suo raggio di Schwarzschild (${fmt.lunghezza(K.raggioSchw(b.m))}): diventa un buco nero.`);
  };

  /* ---------- Onde gravitazionali (grafico) ---------- */
  S.scegliCoppiaGW = function () {
    const g = S.gw;
    g.coppia = null; g.x = 0;
    if (!S.rel()) return;
    const L = S.corpi, c2 = S.cEff() ** 2;
    let best = 0;
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const a = L[i], b = L[j], M = a.m + b.m, r = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      const x = G * M / (r * c2), s = a.m * b.m / M * x;
      if (x > 1e-5 && s > best) { best = s; g.coppia = [a, b]; g.x = x; }
    }
  };
  function campioneGW() {
    const g = S.gw;
    if (S.t - g.ultimo < g.passo) return;
    g.ultimo = S.t;
    let h = 0;
    if (g.rd) {
      const s = S.t - g.rd.t0;
      if (s > 12 * g.rd.tau) g.rd = null;
      else h = g.rd.A * Math.exp(-s / g.rd.tau) * Math.cos(g.rd.w * s);
    } else if (g.coppia && vivo(g.coppia[0]) && vivo(g.coppia[1])) {
      const [a, b] = g.coppia, c2 = S.cEff() ** 2, M = a.m + b.m;
      const dx = b.x - a.x, dy = b.y - a.y, r = Math.hypot(dx, dy, b.z - a.z);
      g.ampiezza = (G * a.m * b.m / M / c2) * (G * M / (r * c2));
      h = g.ampiezza * Math.cos(2 * Math.atan2(dy, dx));
    }
    g.campioni.push(h);
    if (g.campioni.length > 700) g.campioni.splice(0, g.campioni.length - 700);
  }

  /* ---------- Misure ---------- */
  S.energia = function () {
    const L = S.corpi;
    let Kin = 0, Pot = 0;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (!a.fisso) Kin += 0.5 * a.m * (a.vx * a.vx + a.vy * a.vy + a.vz * a.vz);
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        Pot -= G * a.m * b.m / Math.max(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z), a.r + b.r);
      }
    }
    return { K: Kin, U: Pot };
  };

  // Sfera di Hill: la regione in cui un corpo "comanda" sui satelliti nonostante l'attrazione del suo primario
  // (es. la Luna è attirata più dal Sole che dalla Terra, ma è dentro la sfera di Hill della Terra).
  const d2 = (a, x, y, z) => (a.x - x) ** 2 + (a.y - y) ** 2 + (a.z - z) ** 2;
  S.aggiornaHill = function () {
    for (const o of S.corpi) {
      let p = null, g = 0;
      for (const q of S.corpi) {
        if (q === o || q.m < o.m) continue;
        const gg = q.m / (d2(q, o.x, o.y, o.z) + 1e-9);
        if (gg > g) { g = gg; p = q; }
      }
      o._hill = p ? Math.sqrt(d2(p, o.x, o.y, o.z)) * Math.cbrt(o.m / (3 * p.m)) : Infinity;
    }
  };
  // Il corpo che domina il moto in un punto: il più piccolo che lo contiene nella sua sfera di Hill,
  // altrimenti quello che attrae di più.
  S.dominanteInPunto = function (x, y, z, escludi, mMin = 0) {
    let best = null, hmin = Infinity, forte = null, gmax = 0;
    for (const o of S.corpi) {
      if (o === escludi || o.m < mMin) continue;
      const dd = d2(o, x, y, z), h = o._hill == null ? Infinity : o._hill;
      if (h < hmin && dd < h * h) { hmin = h; best = o; }
      const g = o.m / (dd + 1e-9);
      if (g > gmax) { gmax = g; forte = o; }
    }
    return best || forte;
  };
  S.dominante = b => S.dominanteInPunto(b.x, b.y, b.z, b, 0.3 * b.m);

  // Elementi orbitali osculanti di b rispetto a d (problema dei due corpi)
  S.elementi = function (b, d) {
    const rx = b.x - d.x, ry = b.y - d.y, rz = b.z - d.z, vx = b.vx - d.vx, vy = b.vy - d.vy, vz = b.vz - d.vz;
    const r = Math.hypot(rx, ry, rz), v2 = vx * vx + vy * vy + vz * vz, mu = G * (b.m + d.m);
    const en = v2 / 2 - mu / r;
    const hx = ry * vz - rz * vy, hy = rz * vx - rx * vz, hz = rx * vy - ry * vx, h2 = hx * hx + hy * hy + hz * hz;
    const ex = (vy * hz - vz * hy) / mu - rx / r, ey = (vz * hx - vx * hz) / mu - ry / r, ez = (vx * hy - vy * hx) / mu - rz / r;
    const e = Math.hypot(ex, ey, ez), a = -mu / (2 * en), p = h2 / mu;
    return {
      r, v: Math.sqrt(v2), mu, en, a, e, ex, ey, ez, hx, hy, hz, h: Math.sqrt(h2), p,
      T: en < 0 ? 2 * Math.PI * Math.sqrt(a * a * a / mu) : Infinity,
      rp: p / (1 + e), ra: e < 1 ? p / (1 - e) : Infinity,
      vcirc: Math.sqrt(mu / r), vfuga: Math.sqrt(2 * mu / r)
    };
  };

  // Velocità (relativa a d) per un'orbita circolare antioraria nel punto (x,y,z)
  S.velocitaCircolare = function (x, y, z, d, m) {
    let rx = x - d.x, ry = y - d.y, rz = z - d.z;
    const r = Math.hypot(rx, ry, rz) || 1;
    rx /= r; ry /= r; rz /= r;
    let tx = -ry, ty = rx, tz = 0;                         // ẑ × r̂
    let tl = Math.hypot(tx, ty);
    if (tl < 1e-6) { tx = 0; ty = -rz; tz = ry; tl = Math.hypot(ty, tz); }   // x̂ × r̂
    tx /= tl; ty /= tl; tz /= tl;
    const GM = G * (d.m + (m || 0));
    let v2 = GM / r;
    if (S.rel()) { const x1 = GM / (r * S.cEff() ** 2); v2 *= Math.max(0.05, (1 - 4 * x1) / (1 - x1)); }
    const v = Math.sqrt(v2);
    return { vx: tx * v, vy: ty * v, vz: tz * v, v };
  };

  // Traiettoria prevista di un corpo di prova (copia del sistema, senza urti tra gli altri)
  S.prevedi = function (prova, maxPassi = 2500) {
    const L = S.corpi.map(b => ({ x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, m: b.m, r: b.r, fisso: b.fisso, tipo: b.tipo, ax: 0, ay: 0, az: 0 }));
    const p = { x: prova.x, y: prova.y, z: prova.z, vx: prova.vx, vy: prova.vy, vz: prova.vz, m: prova.m, r: prova.r, tipo: prova.tipo, ax: 0, ay: 0, az: 0 };
    const punti = [p.x, p.y, p.z];
    if (!L.length) {
      const v = Math.hypot(p.vx, p.vy, p.vz) || 1, T = 1e13 / v;
      punti.push(p.x + p.vx * T, p.y + p.vy * T, p.z + p.vz * T);
      return { punti, urto: false, chiusa: false };
    }
    const d = L[S.corpi.indexOf(S.dominanteInPunto(p.x, p.y, p.z))];
    const el = S.elementi(p, d);
    const orizzonte = el.en < 0 ? el.T * 1.02 : 8 * el.r / Math.max(el.v, 1);
    L.push(p);
    const rel = S.rel(), c = S.cEff();
    let t = 0, n = 0, tau = forze(L, rel, c, false).tau, urto = false;
    while (t < orizzonte && n++ < maxPassi) {
      const dt = Math.min(0.02 * tau, orizzonte - t), h = dt / 2;
      for (const b of L) if (!b.fisso) { b.vx += b.ax * h; b.vy += b.ay * h; b.vz += b.az * h; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; }
      tau = forze(L, rel, c, false).tau;
      for (const b of L) if (!b.fisso) { b.vx += b.ax * h; b.vy += b.ay * h; b.vz += b.az * h; }
      t += dt;
      punti.push(p.x, p.y, p.z);
      for (const o of L) if (o !== p && Math.hypot(o.x - p.x, o.y - p.y, o.z - p.z) < o.r + p.r) { urto = true; break; }
      if (urto) break;
    }
    return { punti, urto, chiusa: el.en < 0, elementi: el, dominante: d };
  };

  /* ---------- Stato: istantanee, modalità ---------- */
  // Le particelle "permanenti" (vita infinita, es. le stelle delle galassie) fanno parte dello stato
  const persistenti = P => P.filter(p => p.vita === Infinity).map(p => Object.assign({}, p));
  S.istantanea = () => ({ t: S.t, modo: S.modo, fattoreC: S.fattoreC, eta: S.eta, dtMax: S.dtMax, corpi: S.corpi.map(K.copia), particelle: persistenti(S.particelle) });
  S.carica = function (ist) {
    S.modo = ist.modo || 'classica';
    S.fattoreC = ist.fattoreC || 1;
    S.eta = ist.eta || 0.01;
    S.dtMax = ist.dtMax || 0;
    S.t = ist.t || 0;
    S.corpi = ist.corpi.map(c => K.crea(c.tipo, c));
    S.particelle = (ist.particelle || []).map(p => Object.assign({}, p, { vita: Infinity }));   // (JSON trasforma Infinity in null)
    S.gw.campioni = []; S.gw.rd = null; S.gw.coppia = null; S.gw.ultimo = S.t;
    S.eventi = [];
    S.sporco = true;
  };
  S.impostaModo = function (modo, fattoreC) {
    S.modo = modo;
    if (fattoreC) S.fattoreC = fattoreC;
    for (const b of S.corpi) { K.adatta(b); S.verifica(b); }
    S.sporco = true;
  };
})();
