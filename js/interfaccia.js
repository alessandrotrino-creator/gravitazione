/* Interfaccia del laboratorio: comandi, mouse e tocco, pannello delle proprietà, grafici, finestre */
(function () {
  'use strict';
  const { G, U, fmt, el, memoria, VELOCITA } = Grav;
  const S = Grav.sim, V = Grav.vista, K = Grav.corpi, TIPI = Grav.TIPI;
  const $ = id => document.getElementById(id);

  const UI = Grav.ui = {
    strumento: 'seleziona', tipo: 'stella', pausa: false, velIndice: 12, istantanea: null,
    grafico: 'energia', energia: [], diario: [], scenario: null, blocco: 'densita', sezione: 'lab'
  };

  /* ---------- Piccoli aiuti ---------- */
  function interruttore(id, cb) {
    $(id).addEventListener('click', e => {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      imposta(id, b.dataset.v); cb(b.dataset.v);
    });
  }
  function imposta(id, v) { for (const b of $(id).querySelectorAll('button[data-v]')) b.classList.toggle('attivo', b.dataset.v === v); }
  UI.imposta = imposta;
  // Pulsante per azioni distruttive: il primo clic chiede conferma, il secondo esegue
  function conferma(testo, azione) {
    const b = el('button.pericolo', { testo });
    let timer = null;
    b.addEventListener('click', () => {
      if (b.classList.contains('conferma')) { clearTimeout(timer); azione(); return; }
      b.classList.add('conferma'); b.textContent = 'Sicuro? Clicca di nuovo';
      timer = setTimeout(() => { b.classList.remove('conferma'); b.textContent = testo; }, 3000);
    });
    return b;
  }
  const leggiNumero = s => { const v = parseFloat(String(s).trim().replace(/\s/g, '').replace(',', '.')); return isFinite(v) ? v : NaN; };
  const scriviNumero = (x, c = 4) => {
    if (!isFinite(x)) return '';
    const a = Math.abs(x);
    if (a !== 0 && (a >= 1e7 || a < 1e-3)) return x.toExponential(c - 1).replace('.', ',');
    return String(Number(x.toPrecision(c))).replace('.', ',');
  };

  /* ---------- Avvisi e diario ---------- */
  UI.avviso = function (titolo, testo, durata = 10) {
    const box = $('avvisi');
    while (box.children.length >= 3) box.firstChild.remove();
    const a = el('div.avviso', {}, el('b', { testo: titolo }), testo ? el('p', { testo }) : null,
      el('button', { testo: '✕', 'aria-label': 'Chiudi', onclick: () => a.remove() }));
    box.append(a);
    setTimeout(() => a.remove(), durata * 1000);
  };
  function annota(titolo, testo) {
    UI.diario.unshift({ t: S.t, titolo, testo });
    if (UI.diario.length > 200) UI.diario.pop();
  }

  /* ---------- Tempo ---------- */
  function etichettaVel(i) { return fmt.tempo(VELOCITA[i]) + ' al secondo'; }
  UI.impostaVel = function (i) {
    UI.velIndice = Math.max(0, Math.min(VELOCITA.length - 1, i));
    $('rVel').value = UI.velIndice; $('oVel').textContent = etichettaVel(UI.velIndice);
  };
  UI.velIndiceVicino = v => {
    let best = 0;
    VELOCITA.forEach((x, i) => { if (Math.abs(Math.log(x / v)) < Math.abs(Math.log(VELOCITA[best] / v))) best = i; });
    return best;
  };
  UI.avvia = function () {
    if (UI.pausa) UI.istantanea = Object.assign(S.istantanea(), { vel: UI.velIndice, cam2: Object.assign({}, V.cam2), cam3: Object.assign({}, V.cam3), seguito: V.seguito });
    UI.pausa = false; $('bPlay').textContent = '❚❚'; $('bPlay').title = 'Pausa (barra spaziatrice)';
  };
  UI.ferma = function () { UI.pausa = true; $('bPlay').textContent = '▶'; $('bPlay').title = 'Avvia (barra spaziatrice)'; };
  UI.ripristina = function () {
    if (!UI.istantanea) return;
    const sel = V.selezionato;
    const ist = UI.istantanea;
    S.carica(ist);
    if (ist.vel != null) UI.impostaVel(ist.vel);                   // anche velocità e inquadratura tornano com'erano
    if (ist.cam2) { Object.assign(V.cam2, ist.cam2); Object.assign(V.cam3, ist.cam3); V.seguito = ist.seguito && S.trova(ist.seguito) ? ist.seguito : null; }
    V.cancellaScie(); V.effetti = []; V.onde = []; UI.energia = [];
    UI.ferma();
    UI.seleziona(S.trova(sel) || null);
    UI.avviso('Ripristinato', 'Tutto è tornato come all\'ultimo avvio. Premi ▶ per ripartire.', 4);
  };

  /* ---------- Scenari ---------- */
  UI.caricaScenario = function (sc) {
    S.modo = sc.modo || 'classica'; S.fattoreC = sc.fattoreC || 1; S.eta = sc.eta || 0.01; S.dtMax = sc.dtMax || 0;
    UI.programma = (sc.programma || []).map(p => Object.assign({}, p));
    const con = !!(sc.opzione && memoria.leggi('opzioni', {})[sc.id]);     // parte facoltativa (es. Terra e Luna)
    const descr = sc.descrizione + (con ? ' ' + sc.opzione.testo : '');
    UI.descrizioneAttuale = descr;
    const r = sc.costruisci(con);
    S.corpi = r.corpi; S.particelle = r.particelle || []; S.t = 0; S.sporco = true; S.eventi = [];
    Object.assign(S.gw, { campioni: [], rd: null, coppia: null, ultimo: 0 });
    imposta('gModo', S.modo);
    const o = sc.opz || {};
    V.opz.scieRelative = !!o.scieRelative; V.opz.baricentro = !!o.baricentro; V.opz.scia = o.scia || 'media';
    if (sc.vista) { V.cambiaTipo(sc.vista); imposta('gVista', sc.vista); $('lIncl').hidden = sc.vista !== '3d'; }
    V.seguito = null;
    const cam = (con && sc.opzione.camera) || sc.camera || { ampiezza: 10 * U.UA }, c = cam.centro || [0, 0];
    V.inquadra(cam.ampiezza, c[0], c[1]);
    V.cam3.pitch = 0.6; V.cam3.yaw = -Math.PI / 2;
    const seg = cam.segui && S.corpi.find(b => b.nome === cam.segui);
    if (seg) V.seguito = seg.id;
    V.effetti = []; V.onde = []; UI.energia = [];
    UI.impostaVel(UI.velIndiceVicino(sc.velocita || U.GIORNO));
    if (sc.grafico) { UI.grafico = sc.grafico; imposta('gGrafico', sc.grafico); }
    UI.seleziona(sc.seleziona ? S.corpi.find(b => b.nome === sc.seleziona) || null : null);
    UI.scenario = sc.id; memoria.scrivi('scenario', sc.id);
    UI.pausa = true; UI.avvia();
    UI.schedaAttuale = sc.scheda ? sc : null;
    $('bScheda').hidden = !sc.scheda;
    if (sc.scheda) { UI.ferma(); UI.mostraScheda(true); }
    else UI.avviso(sc.nome, descr, 16);
  };
  // Scheda storica: descrizione, quando, dove, chi e cronologia dell'evento
  let avviaDopoScheda = false;
  UI.mostraScheda = function (automatica) {
    const sc = UI.schedaAttuale;
    if (!sc) return;
    const s = sc.scheda;
    $('schedaTitolo').textContent = sc.nome;
    $('schedaCorpo').replaceChildren(
      el('p', { testo: UI.descrizioneAttuale || sc.descrizione }),
      el('dl', {}, ...[['Quando', s.quando], ['Dove', s.dove], ['Chi', s.chi]].flatMap(([k, v]) => [el('dt', { testo: k }), el('dd', { testo: v })])),
      el('h3', { testo: 'Cronologia' }),
      el('ol.cronologia', {}, s.cronologia.map(([d, t]) => el('li', {}, el('b', { testo: d }), el('span', { testo: t })))));
    avviaDopoScheda = !!automatica;
    $('bSchedaVia').textContent = automatica ? 'Avvia la simulazione' : 'Chiudi';
    if (!$('dScheda').open) $('dScheda').showModal();
  };
  const VUOTO = {
    id: 'vuoto', gruppo: 'Costruisci tu', nome: 'Spazio vuoto',
    descrizione: 'Nessun corpo: scegli nella tavolozza a sinistra e costruisci il tuo sistema. Comincia da una stella!',
    velocita: 5 * U.GIORNO, camera: { ampiezza: 6 * U.UA }, costruisci: () => ({ corpi: [] })
  };
  const tuttiScenari = () => [VUOTO].concat(Grav.scenari.SCENARI);

  function costruisciScenari() {
    const box = $('listaScenari'); box.innerHTML = '';
    const gruppi = {};
    for (const sc of tuttiScenari()) (gruppi[sc.gruppo] = gruppi[sc.gruppo] || []).push(sc);
    for (const g in gruppi) {
      box.append(el('div.gruppo-scenari', {}, el('h3', { testo: g }), el('div.carte', {}, gruppi[g].map(sc => {
        const carta = el('button.carta', { onclick: () => { $('dScenari').close(); UI.caricaScenario(sc); } },
          el('b', { testo: sc.nome }), sc.modo === 'relativistica' ? el('em', { testo: 'relativistica' }) : null, el('span', { testo: sc.descrizione }));
        if (!sc.opzione) return carta;
        // casella facoltativa (es. aggiungere Terra e Luna): viene ricordata per la prossima volta
        const c = el('input', { type: 'checkbox', checked: !!memoria.leggi('opzioni', {})[sc.id], onchange: () => {
          const o = memoria.leggi('opzioni', {}); o[sc.id] = c.checked; memoria.scrivi('opzioni', o);
        } });
        return el('div.carta-con-opzione', {}, carta, el('label.spunta', {}, c, sc.opzione.etichetta));
      }))));
    }
    box.append(el('div.gruppo-scenari', {}, el('h3', { testo: 'Cosmologia' }), el('div.carte', {},
      el('button.carta', { onclick: () => { $('dScenari').close(); UI.vaiSezione('universo'); } },
        el('b', { testo: 'L\'universo dal Big Bang a oggi (e oltre)' }), el('span', { testo: 'Apri la sezione "Universo": l\'espansione, la prima luce, la nascita delle galassie. Puoi andare avanti e indietro nel tempo.' })))));
  }

  /* ---------- Selezione e pannello delle proprietà ---------- */
  let pann = null;            // riferimenti agli elementi del pannello aperto
  UI.seleziona = function (b) {
    V.selezionato = b ? b.id : null;
    costruisciPannello(b);
  };

  const UM = { 'M☉': U.MS, 'M♃': U.MG, 'M⊕': U.MT, 'kg': 1 };
  const UR = { 'R☉': U.RS, 'UA': U.UA, 'km': 1e3, 'R⊕': U.RT, 'm': 1 };
  const unitaMassa = m => m >= 0.01 * U.MS ? 'M☉' : m >= 0.05 * U.MG ? 'M♃' : m >= 1e-4 * U.MT ? 'M⊕' : 'kg';
  const unitaRaggio = r => r >= 0.1 * U.UA ? 'UA' : r >= 0.1 * U.RS ? 'R☉' : r >= 1e3 ? 'km' : 'm';

  function selettore(opzioni, valore, cb) {
    const s = el('select', { onchange: () => cb(s.value) }, Object.keys(opzioni).map(k => el('option', { value: k, testo: k })));
    s.value = valore;
    return s;
  }

  function costruisciPannello(b) {
    const p = $('proprieta');
    p.innerHTML = ''; pann = null;
    p.hidden = !b;
    if (!b) return;
    const T = TIPI[b.tipo];
    const cambiato = () => { S.verifica(b); S.sporco = true; if (b.morto) return; aggiornaPannello(true); };

    const colore = el('input', { type: 'color', value: b.colore === '#000000' ? '#000000' : b.colore, title: 'Colore', oninput: () => { b.colore = colore.value; b.coloreAuto = false; } });
    const nome = el('input', { type: 'text', value: b.nome, 'aria-label': 'Nome', oninput: () => { b.nome = nome.value; } });
    p.append(el('div.prop-testa', {}, colore, nome, el('button.chiudi-pannello', { testo: '✕', 'aria-label': 'Chiudi', onclick: () => UI.seleziona(null) })));

    const tipo = el('select', { 'aria-label': 'Tipo', onchange: () => { K.impostaTipo(b, tipo.value); S.verifica(b); S.sporco = true; UI.seleziona(b.morto ? null : b); } },
      Object.keys(TIPI).filter(k => !TIPI[k].interno || k === b.tipo).map(k => el('option', { value: k, testo: TIPI[k].nome })));
    tipo.value = b.tipo;

    // massa, raggio, densità
    let um = unitaMassa(b.m), ur = unitaRaggio(b.r);
    const massa = el('input', { type: 'text', inputmode: 'decimal', 'aria-label': 'Massa' });
    const raggio = el('input', { type: 'text', inputmode: 'decimal', 'aria-label': 'Raggio', disabled: b.tipo === 'buco' });
    const dens = el('input', { type: 'text', inputmode: 'decimal', 'aria-label': 'Densità', disabled: b.tipo === 'buco' });
    massa.addEventListener('change', () => {
      const v = leggiNumero(massa.value) * UM[um];
      if (!(v > 0)) return aggiornaPannello(true);
      if (b.tipo !== 'buco' && UI.blocco === 'densita') b.r = K.raggioDaDensita(v, K.densita(b));
      b.m = v; K.adatta(b); cambiato();
    });
    raggio.addEventListener('change', () => {
      const v = leggiNumero(raggio.value) * UR[ur];
      if (!(v > 0)) return aggiornaPannello(true);
      if (UI.blocco === 'densita') b.m = K.massaDaDensita(v, K.densita(b));
      b.r = v; K.adatta(b); cambiato();
    });
    dens.addEventListener('change', () => {
      const v = leggiNumero(dens.value) * 1000;
      if (!(v > 0)) return aggiornaPannello(true);
      b.r = K.raggioDaDensita(b.m, v); cambiato();
    });
    const selM = selettore(UM, um, v => { um = v; aggiornaPannello(true); });
    const selR = selettore(UR, ur, v => { ur = v; aggiornaPannello(true); });
    const blocco = el('div.blocco.tutta', {}, el('span', { testo: 'Cambiando un valore resta fissa:' }),
      ...[['densita', 'la densità'], ['altro', 'l\'altro valore']].map(([v, t]) => {
        const r = el('input', { type: 'radio', name: 'blocco', value: v, checked: UI.blocco === v, onchange: () => { UI.blocco = v; } });
        return el('label', {}, r, t);
      }));

    // velocità relativa al corpo dominante
    const vel = el('input', { type: 'text', inputmode: 'decimal', 'aria-label': 'Velocità in km/s' });
    const dir = el('input', { type: 'text', inputmode: 'decimal', 'aria-label': 'Direzione in gradi' });
    const relA = el('span.descr');
    const impostaVel = (modulo, angolo) => {
      const d = S.dominante(b), bx = d ? d.vx : 0, by = d ? d.vy : 0;
      const a = angolo * Math.PI / 180;
      b.vx = bx + modulo * Math.cos(a); b.vy = by + modulo * Math.sin(a);
      S.sporco = true; aggiornaPannello(true);
    };
    const leggiVel = () => {
      const d = S.dominante(b), vx = b.vx - (d ? d.vx : 0), vy = b.vy - (d ? d.vy : 0);
      return { v: Math.hypot(vx, vy), a: Math.atan2(vy, vx) * 180 / Math.PI };
    };
    vel.addEventListener('change', () => { const v = leggiNumero(vel.value); if (v >= 0) impostaVel(v * 1e3, leggiVel().a); else aggiornaPannello(true); });
    dir.addEventListener('change', () => { const a = leggiNumero(dir.value); if (isFinite(a)) impostaVel(leggiVel().v, a); else aggiornaPannello(true); });

    const corpo = el('div.corpo', {},
      tipo, el('p.descr', { testo: T.info }),
      el('div.campi', {},
        el('label', { testo: 'Massa' }), massa, selM,
        el('label', { testo: 'Raggio' }), raggio, b.tipo === 'buco' ? el('span.descr', { testo: 'km' }) : selR,
        el('label', { testo: 'Densità' }), dens, el('span.descr', { testo: 'g/cm³' }),
        b.tipo === 'buco' ? el('p.descr.tutta', { testo: 'Il raggio di un buco nero dipende solo dalla massa: è il raggio di Schwarzschild 2GM/c².' }) : blocco,
        el('label', { testo: 'Velocità' }), vel, el('span.descr', { testo: 'km/s' }),
        el('label', { testo: 'Direzione' }), dir, el('span.descr', { testo: '°' }),
        el('span.tutta', {}, relA)));

    const fisso = el('input', { type: 'checkbox', checked: b.fisso, onchange: () => { b.fisso = fisso.checked; if (b.fisso) { b.vx = b.vy = b.vz = 0; } S.sporco = true; } });
    const segui = el('input', { type: 'checkbox', checked: V.seguito === b.id, onchange: () => { V.seguito = segui.checked ? b.id : null; } });
    const opzioni = el('div.blocco', {},
      el('label', { title: 'Il corpo resta fermo in quel punto' }, fisso, 'Fermo (fisso)'),
      el('label', {}, segui, 'Segui con la vista'),
      b.tipo === 'gassoso' ? el('label', {}, el('input', { type: 'checkbox', checked: b.anelli, onchange: e => { b.anelli = e.target.checked; } }), 'Anelli') : null);

    const azioni = el('div.azioni', {},
      el('button', { testo: 'Orbita circolare', title: 'Dà al corpo la velocità giusta per un\'orbita circolare attorno al corpo che lo attrae di più', onclick: () => {
        const d = S.dominante(b) || V.scalaVelocita(b.x, b.y, b.z, b).dom;
        if (!d) return UI.avviso('Nessun corpo vicino', 'Non c\'è niente attorno a cui orbitare.', 4);
        const c = S.velocitaCircolare(b.x, b.y, b.z, d, b.m);
        b.vx = d.vx + c.vx; b.vy = d.vy + c.vy; b.vz = d.vz + c.vz; b.fisso = false; fisso.checked = false; S.sporco = true; aggiornaPannello(true);
      } }),
      el('button', { testo: 'Ferma', title: 'Azzera la velocità rispetto al corpo che lo attrae di più: cadrà verso di lui', onclick: () => {
        const d = S.dominante(b); b.vx = d ? d.vx : 0; b.vy = d ? d.vy : 0; b.vz = d ? d.vz : 0; S.sporco = true; aggiornaPannello(true);
      } }),
      (b.tipo === 'stella' || b.tipo === 'gigante') && b.m < 8 * U.MS ? el('button', { testo: 'Fine della vita', title: 'Nebulosa planetaria e nana bianca', onclick: () => esplodi(S.fineVita) }) : null,
      (b.tipo === 'stella' || b.tipo === 'gigante' || b.tipo === 'nana') ? el('button', { testo: 'Supernova', title: b.tipo === 'nana' ? 'Esplosione termonucleare (tipo Ia)' : 'Serve una stella di almeno 8 masse solari', onclick: () => esplodi(S.supernova) }) : null,
      el('button', { testo: 'Duplica', onclick: () => {
        const c = K.crea(b.tipo, Object.assign(K.copia(b), { id: undefined, nome: b.nome + ' (copia)', x: b.x + 4 * Math.max(b.r, V.metriPerPixel() * 6) }));
        delete c.scia; c.scia = []; S.aggiungi(c); UI.seleziona(c);
      } }),
      conferma('Elimina', () => { S.rimuovi(b); UI.seleziona(null); }));
    function esplodi(f) {
      const err = f(b);
      if (err) return UI.avviso('Non è possibile', err, 7);
      UI.seleziona(b.morto ? null : b);
    }

    const fase = el('div.fase', { hidden: true }), cf = el('canvas', { width: 64, height: 64 }), testoFase = el('div');
    fase.append(cf, testoFase);
    const dati = el('table.dati');
    corpo.append(opzioni, azioni, fase, dati);
    p.append(corpo);
    pann = { b, massa, raggio, dens, vel, dir, relA, um: () => um, ur: () => ur, dati, fase, cf, testoFase, fisso, segui };
    aggiornaPannello(true);
  }

  function riga(t, v) { return el('tr', {}, el('td', { testo: t }), el('td', { testo: v })); }

  function aggiornaPannello(forza) {
    if (!pann) return;
    const b = pann.b;
    if (b.morto) return;
    const att = document.activeElement;
    const metti = (inp, v) => { if (forza || att !== inp) inp.value = v; };
    metti(pann.massa, scriviNumero(b.m / UM[pann.um()]));
    metti(pann.raggio, b.tipo === 'buco' ? scriviNumero(b.r / 1e3) : scriviNumero(b.r / UR[pann.ur()]));
    metti(pann.dens, scriviNumero(K.densita(b) / 1000));
    const d = S.dominante(b);
    const vx = b.vx - (d ? d.vx : 0), vy = b.vy - (d ? d.vy : 0);
    metti(pann.vel, scriviNumero(Math.hypot(vx, vy, b.vz - (d ? d.vz : 0)) / 1e3));
    metti(pann.dir, scriviNumero(Math.atan2(vy, vx) * 180 / Math.PI, 3));
    pann.relA.textContent = d ? `Velocità e direzione rispetto a ${d.nome} (0° = verso destra).` : 'Velocità rispetto al centro della scena (0° = verso destra).';
    if (att !== pann.fisso) pann.fisso.checked = b.fisso;
    pann.segui.checked = V.seguito === b.id;

    const righe = [];
    if (d) {
      const e = S.elementi(b, d);
      const tipoOrb = e.e < 0.01 ? 'circolare' : e.e < 0.99 ? 'ellittica' : e.e < 1.01 ? 'parabolica' : 'iperbolica: si allontana';
      righe.push(riga('Corpo che lo attrae di più', d.nome), riga('Distanza', fmt.lunghezza(e.r)), riga('Velocità', fmt.velocita(e.v)),
        riga('Orbita', tipoOrb), riga('Eccentricità', fmt.numero(e.e, 3)));
      if (e.e < 1) {
        righe.push(riga('Semiasse maggiore', fmt.lunghezza(e.a)), riga('Periodo', fmt.tempo(e.T)),
          riga('Distanza minima / massima', fmt.lunghezza(e.rp) + ' / ' + fmt.lunghezza(e.ra)));
      } else righe.push(riga('Distanza minima', fmt.lunghezza(e.rp)));
      righe.push(riga('Velocità orbitale circolare', fmt.velocita(e.vcirc)), riga('Velocità di fuga (lì)', fmt.velocita(e.vfuga)));
      if (S.rel()) {
        const c2 = S.cEff() ** 2, f = Math.sqrt(Math.max(0, 1 - 2 * G * d.m / (e.r * c2) - e.v * e.v / c2)), ritardo = (1 - f) * U.GIORNO;
        righe.push(riga('Orologio rispetto a uno lontano', f <= 0 ? 'fermo' : ritardo < 1 ? `indietro di ${fmt.tempo(ritardo).replace(' ms', ' ms')} al giorno` : `scorre al ${fmt.numero(f * 100, 4)}%`));
      }
    } else righe.push(riga('Velocità', fmt.velocita(Math.hypot(b.vx, b.vy, b.vz))));
    if (b.tipo !== 'buco') {
      const g = G * b.m / (b.r * b.r);
      righe.push(riga('Gravità in superficie', `${fmt.numero(g)} m/s² (${fmt.numero(g / 9.81)} volte la Terra)`),
        riga('Velocità di fuga dalla superficie', fmt.velocita(Math.sqrt(2 * G * b.m / b.r))));
    }
    righe.push(riga('Raggio di Schwarzschild', fmt.lunghezza(2 * G * b.m / Grav.C ** 2)));
    pann.dati.replaceChildren(...righe);
    aggiornaFase(b, d);
  }

  // Fase del corpo vista dal pianeta attorno a cui gira (es. la Luna vista dalla Terra)
  function aggiornaFase(b, d) {
    const box = pann.fase;
    let s = null, lmax = 0;
    if (d && !K.luce(d) && d.tipo !== 'buco' && !K.luce(b))
      for (const o of S.corpi) if (K.luce(o)) { const l = Math.pow(o.m, 3.5) / ((o.x - d.x) ** 2 + (o.y - d.y) ** 2); if (l > lmax) { lmax = l; s = o; } }
    if (!s) { box.hidden = true; return; }
    box.hidden = false;
    const lam = Math.atan2(b.y - d.y, b.x - d.x) - Math.atan2(s.y - d.y, s.x - d.x);
    const l = ((lam % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), fr = (1 - Math.cos(l)) / 2, cresc = l < Math.PI;
    const nome = fr < 0.03 ? 'Luna nuova' : fr > 0.97 ? 'Luna piena' : Math.abs(fr - 0.5) < 0.06 ? (cresc ? 'Primo quarto' : 'Ultimo quarto')
      : fr < 0.5 ? (cresc ? 'Falce crescente' : 'Falce calante') : (cresc ? 'Gibbosa crescente' : 'Gibbosa calante');
    const ctx = pann.cf.getContext('2d');
    ctx.clearRect(0, 0, 64, 64);
    V.disegnaFase(ctx, 32, 32, 26, l, b.colore);
    // eclissi: Sole, pianeta e satellite allineati anche in altezza
    const ux = b.x - d.x, uy = b.y - d.y, uz = b.z - d.z, rb = Math.hypot(ux, uy, uz);
    const sx = s.x - d.x, sy = s.y - d.y, sz = s.z - d.z, rs = Math.hypot(sx, sy, sz);
    const ang = Math.acos(Math.max(-1, Math.min(1, (ux * sx + uy * sy + uz * sz) / (rb * rs))));
    let eclissi = '';
    if (ang < b.r / rb + s.r / rs) eclissi = 'Eclissi di Sole! La Luna copre il Sole.';
    else if (Math.PI - ang < (d.r + b.r) / rb) eclissi = 'Eclissi di Luna! È nell\'ombra della Terra.';
    pann.testoFase.replaceChildren(el('b', { testo: nome }), el('small', { testo: `vista da ${d.nome} · illuminata al ${Math.round(fr * 100)}%` }),
      ...(eclissi ? [el('div.eclissi', { testo: eclissi.replace('La Luna', b.nome).replace('Terra', d.nome) })] : []));
  }

  /* ---------- Grafico ---------- */
  function disegnaGrafico() {
    const cv = $('cGrafico'), ctx = cv.getContext('2d'), W = cv.width, H = cv.height, nota = $('gNota');
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#070a18'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(150,170,255,0.25)'; ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    ctx.font = '10px system-ui, sans-serif';
    if (UI.grafico === 'energia') {
      const E = UI.energia;
      if (E.length < 2) { nota.textContent = 'L\'energia cinetica (movimento) e quella potenziale (attrazione) si scambiano; la loro somma resta costante finché non ci sono urti.'; return; }
      let max = 0;
      for (const e of E) max = Math.max(max, Math.abs(e.K), Math.abs(e.U), Math.abs(e.K + e.U));
      const y = v => H / 2 - v / max * (H / 2 - 6);
      for (const [f, c] of [[e => e.K, '#ffb347'], [e => e.U, '#6fa8ff'], [e => e.K + e.U, '#ffffff']]) {
        ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.beginPath();
        E.forEach((e, i) => { const x = i / (E.length - 1) * W; if (i) ctx.lineTo(x, y(f(e))); else ctx.moveTo(x, y(f(e))); });
        ctx.stroke();
      }
      [['cinetica', '#ffb347'], ['potenziale', '#6fa8ff'], ['totale', '#ffffff']].forEach(([t, c], i) => { ctx.fillStyle = c; ctx.fillText(t, 6 + i * 70, 12); });
      nota.textContent = 'Energia del sistema nel tempo. Cinetica = movimento, potenziale = legame gravitazionale (negativa). Negli urti parte dell\'energia si trasforma in calore.';
    } else {
      if (!S.rel()) { nota.textContent = 'Le onde gravitazionali compaiono in modalità relativistica: prova lo scenario "Fusione di due buchi neri".'; return; }
      const C = S.gw.campioni;
      let max = 0;
      for (const h of C) max = Math.max(max, Math.abs(h));
      if (!max) { nota.textContent = 'Nessuna coppia abbastanza compatta e vicina da emettere onde gravitazionali visibili.'; return; }
      ctx.strokeStyle = '#b9a4ff'; ctx.lineWidth = 1.4; ctx.beginPath();
      C.forEach((h, i) => { const x = i / 699 * W + (700 - C.length) / 699 * W, yy = H / 2 - h / max * (H / 2 - 6); if (i) ctx.lineTo(x, yy); else ctx.moveTo(x, yy); });
      ctx.stroke();
      ctx.fillStyle = '#b9a4ff'; ctx.fillText('deformazione dello spazio (scala automatica)', 6, 12);
      nota.textContent = 'Ogni giro della coppia produce due oscillazioni. Avvicinandosi, le onde diventano più rapide e più forti ("chirp"); dopo la fusione si smorzano.';
    }
  }

  /* ---------- Mouse e tocco ---------- */
  let azione = null;          // trascinamento in corso
  const puntatori = new Map();
  let anteprimaDaFare = false;

  function posizione(e) { const r = V.ctx.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  const zPiano = () => V.tipo === '3d' ? V.cam3.tz : 0;

  function iniziaLancio(p) {
    const w = V.daSchermo(p.x, p.y, zPiano());
    if (!w) return null;
    const { scala, dom } = V.scalaVelocita(w.x, w.y, w.z, null);
    V.lancio = { tipo: UI.tipo, x: w.x, y: w.y, z: w.z, ex: null, ey: null, testo: '', anteprima: null };
    return { tipo: 'lancio', sx0: p.x, sy0: p.y, scala, dom, w };
  }
  function aggiornaLancio(p) {
    const a = azione, l = V.lancio, dom = a.dom, rel = $('cRelativa').checked && dom;
    let vx = rel ? dom.vx : 0, vy = rel ? dom.vy : 0, vz = rel ? dom.vz : 0;
    const px = Math.hypot(p.x - a.sx0, p.y - a.sy0);
    let modo = 'fermo';
    if (px < 6) {
      l.ex = null;
      if ($('cCircolare').checked && dom) {
        const c = S.velocitaCircolare(l.x, l.y, l.z, dom, TIPI[UI.tipo].m);
        vx = dom.vx + c.vx; vy = dom.vy + c.vy; vz = dom.vz + c.vz; modo = 'circolare';
      }
    } else {
      const w1 = V.daSchermo(p.x, p.y, l.z);
      let dx, dy, dz = 0;
      if (w1) { dx = w1.x - l.x; dy = w1.y - l.y; } else { dx = p.x - a.sx0; dy = a.sy0 - p.y; }
      const n = Math.hypot(dx, dy) || 1, sp = px * a.scala, inc = V.tipo === '3d' ? +$('rIncl').value * Math.PI / 180 : 0;
      vx += dx / n * sp * Math.cos(inc); vy += dy / n * sp * Math.cos(inc); vz += sp * Math.sin(inc);
      l.ex = p.x; l.ey = p.y; modo = 'lancio';
    }
    l.vx = vx; l.vy = vy; l.vz = vz; l.modo = modo;
    anteprimaDaFare = true;
  }
  function calcolaAnteprima() {
    anteprimaDaFare = false;
    const l = V.lancio;
    if (!l) return;
    const T = TIPI[l.tipo];
    const prova = { x: l.x, y: l.y, z: l.z, vx: l.vx, vy: l.vy, vz: l.vz, m: T.m, r: l.tipo === 'buco' ? K.raggioSchw(T.m) : T.r, tipo: l.tipo };
    const a = S.corpi.length ? S.prevedi(prova) : null;
    l.anteprima = a;
    const d = azione && azione.dom, rel = d && $('cRelativa').checked;
    const v = Math.hypot(l.vx - (rel ? d.vx : 0), l.vy - (rel ? d.vy : 0), l.vz - (rel ? d.vz : 0));
    const righe = [`${T.nome}: ${fmt.velocita(v)}${rel ? ' rispetto a ' + d.nome : ''}`];
    if (a && a.dominante) {
      const e = a.elementi, dn = d ? d.nome : 'il corpo vicino';
      righe.push(`per l'orbita circolare: ${fmt.velocita(e.vcirc)} · per la fuga: ${fmt.velocita(e.vfuga)}`);
      righe.push(a.urto ? 'URTO!' : a.chiusa ? `orbita chiusa (ellisse), periodo ${fmt.tempo(e.T)}` : `traiettoria aperta: sfugge a ${dn}`);
    }
    if (l.modo === 'fermo' && S.corpi.length) righe.push('fermo: cadrà verso il corpo più vicino');
    l.testo = righe.join('\n');
  }
  function fineLancio() {
    const l = V.lancio;
    V.lancio = null;
    if (!l || l.vx == null) return;
    const b = K.crea(l.tipo, { x: l.x, y: l.y, z: l.z, vx: l.vx, vy: l.vy, vz: l.vz });
    S.aggiungi(b);
    S.verifica(b);
    if (!b.morto) UI.seleziona(b);
  }

  function installaInput(cv) {
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId);
      const p = posizione(e);
      puntatori.set(e.pointerId, p);
      if (puntatori.size === 2) {
        V.lancio = null;
        const [a, b] = [...puntatori.values()];
        azione = { tipo: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
        return;
      }
      if (puntatori.size > 2) return;
      const inizio = { sx0: p.x, sy0: p.y, ux: p.x, uy: p.y, mosso: 0 };
      if (e.button === 1 || e.button === 2 || (e.button === 0 && e.shiftKey && V.tipo === '3d')) { azione = Object.assign(inizio, { tipo: 'sposta' }); return; }
      if (UI.strumento === 'aggiungi') {
        const l = iniziaLancio(p);
        if (l) { azione = Object.assign(inizio, l); aggiornaLancio(p); }
        return;
      }
      if (V.maniglia && Math.hypot(p.x - V.maniglia.x, p.y - V.maniglia.y) < 11) {
        azione = Object.assign(inizio, { tipo: 'velocita', b: S.trova(V.selezionato), scala: V.maniglia.scala, dom: V.maniglia.dom });
        return;
      }
      const b = V.corpoInPunto(p.x, p.y);
      if (b) {
        UI.seleziona(b);
        azione = Object.assign(inizio, { tipo: 'muovi', b, ox: p.x - b._sx, oy: p.y - b._sy });
        return;
      }
      azione = Object.assign(inizio, { tipo: V.tipo === '3d' ? 'ruota' : 'sposta', deseleziona: true });
    });
    cv.addEventListener('pointermove', e => {
      const p = posizione(e);
      if (puntatori.has(e.pointerId)) puntatori.set(e.pointerId, p);
      if (!azione) { suggerisciCursore(cv, p); return; }
      if (azione.tipo === 'pinch') {
        if (puntatori.size < 2) return;
        const [a, b] = [...puntatori.values()], d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        V.zoom(d / azione.d0, cx, cy); V.sposta(cx - azione.cx, cy - azione.cy);
        azione.d0 = d; azione.cx = cx; azione.cy = cy;
        return;
      }
      const dx = p.x - azione.ux, dy = p.y - azione.uy;
      azione.ux = p.x; azione.uy = p.y; azione.mosso += Math.abs(dx) + Math.abs(dy);
      switch (azione.tipo) {
        case 'sposta': V.sposta(dx, dy); break;
        case 'ruota': V.ruota(dx, dy); break;
        case 'lancio': aggiornaLancio(p); break;
        case 'muovi': {
          const b = azione.b;
          if (b.morto) { azione = null; return; }
          const w = V.daSchermo(p.x - azione.ox, p.y - azione.oy, b.z);
          if (w) { b.x = w.x; b.y = w.y; b.scia = []; S.sporco = true; }
          break;
        }
        case 'velocita': {
          const b = azione.b;
          if (!b || b.morto) { azione = null; return; }
          const w = V.daSchermo(p.x, p.y, b.z);
          if (!w) break;
          const wx = w.x - b.x, wy = w.y - b.y, n = Math.hypot(wx, wy) || 1, k = V.proiettaK(b), sp = n * k * azione.scala;
          const d = azione.dom;
          b.vx = (d ? d.vx : 0) + wx / n * sp; b.vy = (d ? d.vy : 0) + wy / n * sp;
          S.sporco = true;
          break;
        }
      }
    });
    const fine = e => {
      puntatori.delete(e.pointerId);
      if (!azione) return;
      if (azione.tipo === 'pinch') { if (puntatori.size < 2) azione = null; return; }
      if (azione.tipo === 'lancio') { calcolaAnteprima(); fineLancio(); }
      if (azione.deseleziona && azione.mosso < 4) UI.seleziona(null);
      if (azione.tipo === 'velocita' || azione.tipo === 'muovi') aggiornaPannello(true);
      azione = null;
    };
    cv.addEventListener('pointerup', fine);
    cv.addEventListener('pointercancel', e => { V.lancio = null; azione = null; puntatori.delete(e.pointerId); });
    cv.addEventListener('pointerleave', () => { V.fantasma = null; });
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const p = posizione(e);
      V.zoom(Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0015)), p.x, p.y);
    }, { passive: false });
  }
  function suggerisciCursore(cv, p) {
    if (UI.strumento === 'aggiungi') {
      cv.style.cursor = 'crosshair';
      const w = V.daSchermo(p.x, p.y, zPiano());
      V.fantasma = w ? Object.assign(w, { tipo: UI.tipo }) : null;
      return;
    }
    V.fantasma = null;
    const suManiglia = V.maniglia && Math.hypot(p.x - V.maniglia.x, p.y - V.maniglia.y) < 11;
    cv.style.cursor = suManiglia ? 'grab' : V.corpoInPunto(p.x, p.y) ? 'pointer' : V.tipo === '3d' ? 'move' : 'grab';
  }

  /* ---------- Strumenti ---------- */
  const SUGG = {
    seleziona: 'Clicca un corpo per vederne le proprietà. Trascinalo per spostarlo, trascina il pallino verde per cambiarne la velocità. Trascina lo spazio vuoto per muovere la vista.',
    aggiungi: 'Clic: posa il corpo. Trascina: lancialo (più lunga la freccia, più veloce). La linea tratteggiata mostra la traiettoria prevista.'
  };
  UI.scegliStrumento = function (s) {
    UI.strumento = s; imposta('gStrumento', s);
    $('pSugg').textContent = SUGG[s];
    V.mostraManiglia = s === 'seleziona';
    for (const b of $('tavolozza').children) b.classList.toggle('attivo', s === 'aggiungi' && b.dataset.tipo === UI.tipo);
    if (s !== 'aggiungi') V.fantasma = null;
  };
  function costruisciTavolozza() {
    const t = $('tavolozza');
    for (const k in TIPI) {
      const T = TIPI[k];
      if (T.interno) continue;
      const pall = el('span.pallino' + (T.luce ? '.luce' : '') + (k === 'buco' ? '.buco' : ''));
      pall.style.background = T.colore; pall.style.color = T.colore;
      t.append(el('button', { 'data-tipo': k, title: T.info, onclick: () => { UI.tipo = k; UI.scegliStrumento('aggiungi'); } }, pall, T.nome));
    }
  }

  /* ---------- Opzioni ---------- */
  function costruisciOpzioni() {
    const box = $('listaOpzioni'); box.innerHTML = '';
    const sp = (oggetto, chiave, testo, spieg, dopo) => {
      const c = el('input', { type: 'checkbox', checked: !!oggetto[chiave], onchange: () => { oggetto[chiave] = c.checked; if (dopo) dopo(); } });
      return el('label.spunta', {}, c, el('span', {}, testo, spieg ? el('small', { testo: spieg }) : null));
    };
    const fc = el('select', { onchange: () => { S.impostaModo(S.modo, +fc.value); UI.avviso('Velocità della luce', +fc.value === 1 ? 'La luce ha di nuovo la sua velocità vera.' : `Ora la luce è ${Math.round(1 / fc.value)} volte più lenta: gli effetti relativistici diventano molto più grandi. Vale solo in modalità relativistica.`, 6); } },
      [1, 0.3, 0.1, 0.03, 0.01, 0.004, 0.001].map(f => el('option', { value: f, testo: f === 1 ? 'c (vera, 300 000 km/s)' : `c / ${Math.round(1 / f)}` })));
    fc.value = String(S.fattoreC);
    const lung = el('select', { onchange: () => { V.opz.scia = lung.value; } }, [['corta', 'corte'], ['media', 'medie'], ['lunga', 'lunghe']].map(([v, t]) => el('option', { value: v, testo: t })));
    lung.value = V.opz.scia;
    box.append(
      el('h3', { testo: 'Disegno' }),
      sp(V.opz, 'scie', 'Scie (traiettorie)'),
      el('label.spunta', {}, 'Lunghezza delle scie: ', lung),
      sp(V.opz, 'scieRelative', 'Scie relative al corpo dominante', 'Es. l\'orbita della Luna disegnata attorno alla Terra invece che attorno al Sole.', () => V.cancellaScie()),
      sp(V.opz, 'etichette', 'Nomi dei corpi'),
      sp(V.opz, 'orbita', 'Orbita prevista del corpo selezionato', 'L\'ellisse (o l\'iperbole) che seguirebbe se ci fosse solo il corpo che lo attrae di più.'),
      sp(V.opz, 'dimensioniReali', 'Dimensioni reali', 'Senza ingrandimento minimo: si capisce quanto è vuoto lo spazio.'),
      sp(V.opz, 'baricentro', 'Mostra il baricentro'),
      sp(V.opz, 'griglia', 'Griglia'),
      sp(V.opz, 'campo', 'Campo gravitazionale (solo 2D)', 'Frecce che indicano direzione e intensità dell\'attrazione in ogni punto.'),
      sp(V.opz, 'telo', 'Telo elastico (solo 3D)', 'Lo spazio come un telo deformato dalle masse: un\'immagine per capire la curvatura dello spazio-tempo.'),
      sp(V.opz, 'effetti', 'Effetti speciali', 'Lampi, onde d\'urto, scosse.'),
      sp(V.opz, 'lenti', 'Lenti gravitazionali (relativistica)', 'I buchi neri deviano la luce delle stelle dietro di loro.'),
      el('h3', { testo: 'Fisica' }),
      sp(S.opz, 'collisioni', 'Urti e fusioni', 'Se disattivato i corpi si attraversano.'),
      sp(S.opz, 'maree', 'Distruzione mareale', 'Un corpo che si avvicina troppo a uno molto più massiccio viene fatto a pezzi (limite di Roche).'),
      sp(S.opz, 'frammenti', 'Frammenti negli impatti violenti'),
      sp(S.opz, 'spinta', 'Spinta del resto di supernova'),
      el('label.spunta', {}, 'Velocità della luce (relativistica): ', fc));
  }

  /* ---------- Esperimenti salvati ---------- */
  function statoCompleto() {
    return Object.assign(S.istantanea(), {
      versione: 1, vel: VELOCITA[UI.velIndice], vista: V.tipo, cam2: Object.assign({}, V.cam2), cam3: Object.assign({}, V.cam3),
      opz: Object.assign({}, V.opz), seguito: V.seguito, scenario: UI.scenario
    });
  }
  UI.applicaStato = function (st) {
    if (!st || !Array.isArray(st.corpi)) throw new Error('formato');
    st.corpi = st.corpi.filter(c => TIPI[c.tipo] && isFinite(c.m) && isFinite(c.x));
    UI.programma = [];
    S.carica(st);
    imposta('gModo', S.modo);
    if (st.opz) Object.assign(V.opz, st.opz);
    if (st.vista) { V.cambiaTipo(st.vista); imposta('gVista', st.vista); $('lIncl').hidden = st.vista !== '3d'; }
    if (st.cam2) Object.assign(V.cam2, st.cam2);
    if (st.cam3) Object.assign(V.cam3, st.cam3);
    V.seguito = st.seguito && S.trova(st.seguito) ? st.seguito : null;
    if (st.vel) UI.impostaVel(UI.velIndiceVicino(st.vel));
    V.cancellaScie(); V.effetti = []; V.onde = []; UI.energia = [];
    UI.seleziona(null);
    UI.istantanea = S.istantanea();
    UI.ferma();
  };
  function costruisciEsperimenti() {
    const lista = $('listaEsp'), esp = memoria.leggi('esperimenti', []);
    lista.innerHTML = '';
    if (!esp.length) lista.append(el('li', {}, el('span.nota', { testo: 'Nessun esperimento salvato.' })));
    esp.forEach((e, i) => lista.append(el('li', {},
      el('span', {}, e.nome, ' ', el('small', { testo: '· ' + new Date(e.data).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) + ' · ' + e.stato.corpi.length + ' corpi' })),
      el('button', { testo: 'Apri', onclick: () => { UI.applicaStato(JSON.parse(JSON.stringify(e.stato))); $('dEsperimenti').close(); UI.avviso('Esperimento aperto', e.nome + '. Premi ▶ per avviare.', 5); } }),
      conferma('Elimina', () => { const l = memoria.leggi('esperimenti', []); l.splice(i, 1); memoria.scrivi('esperimenti', l); costruisciEsperimenti(); }))));
  }
  function salvaEsperimento() {
    const nome = $('tNomeEsp').value.trim() || 'Esperimento del ' + new Date().toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
    const l = memoria.leggi('esperimenti', []);
    l.unshift({ nome, data: Date.now(), stato: statoCompleto() });
    if (!memoria.scrivi('esperimenti', l.slice(0, 40))) UI.avviso('Impossibile salvare', 'Il browser non permette di salvare dati (forse sei in navigazione privata). Usa "Scarica come file".', 8);
    $('tNomeEsp').value = '';
    costruisciEsperimenti();
  }
  function esporta() {
    const blob = new Blob([JSON.stringify(statoCompleto(), null, 1)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: 'esperimento-gravita.json' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function importa(file) {
    const r = new FileReader();
    r.onload = () => {
      try { UI.applicaStato(JSON.parse(r.result)); $('dEsperimenti').close(); UI.avviso('File aperto', file.name + '. Premi ▶ per avviare.', 5); }
      catch (e) { UI.avviso('File non valido', 'Questo file non sembra un esperimento del laboratorio.', 6); }
    };
    r.readAsText(file);
  }

  /* ---------- Sezioni ---------- */
  UI.vaiSezione = function (s) {
    UI.sezione = s; imposta('gSezione', s);
    $('lab').hidden = s !== 'lab'; $('universo').hidden = s !== 'universo';
    for (const n of document.querySelectorAll('.solo-lab')) n.hidden = s !== 'lab';
    $('bScheda').hidden = s !== 'lab' || !UI.schedaAttuale;
    if (s === 'lab') window.dispatchEvent(new Event('resize'));
    Grav.universo.attiva(s === 'universo');
  };

  /* ---------- Aggiornamento a ogni fotogramma ---------- */
  let attesaPannello = 0, attesaEnergia = 0, faseOnde = 0, ultimaOnda = 0, angoloOnde = null;
  UI.tick = function (dt) {
    for (const ev of S.eventi) {
      V.aggiungiEffetti(ev);
      if (ev.titolo) { UI.avviso(ev.titolo, ev.testo, 12); annota(ev.titolo, ev.testo); }
      if (V.selezionato && !S.trova(V.selezionato) && ev.sopravvissuto) UI.seleziona(S.trova(ev.sopravvissuto) || null);
      if (V.seguito && !S.trova(V.seguito)) V.seguito = ev.sopravvissuto || null;
    }
    S.eventi.length = 0;
    // azioni programmate degli scenari storici (es. l'esplosione di una supernova a un certo istante)
    // (con "t" scattano a un istante preciso, con "quando" appena una condizione diventa vera)
    const trova = nome => S.corpi.find(b => b.nome === nome);
    if (S.t < UI.tPrec) for (const p of UI.programma || []) p.fatto = false;       // si è tornati indietro (Ripristina)
    for (const p of UI.programma || []) {
      if (p.quando) { if (!p.fatto && p.quando(trova)) { p.fatto = true; p.fai(trova); } }
      else if (UI.tPrec < p.t && S.t >= p.t) p.fai(trova);
    }
    UI.tPrec = S.t;
    if (V.selezionato && !S.trova(V.selezionato)) UI.seleziona(null);

    if (anteprimaDaFare) calcolaAnteprima();
    if ((attesaPannello -= dt) <= 0) {
      attesaPannello = 0.25; aggiornaPannello(false);
      const lar = id => { const p = $(id); return p.hidden || innerWidth < 760 ? 0 : p.offsetWidth + 12; };
      V.margini.s = lar('strumenti'); V.margini.d = lar('proprieta');
    }
    if (!UI.pausa && (attesaEnergia -= dt) <= 0) {
      attesaEnergia = 1 / 20;
      const e = S.energia();
      UI.energia.push(e);
      if (UI.energia.length > 300) UI.energia.shift();
    }
    if (!$('grafico').classList.contains('ridotto')) disegnaGrafico();
    $('oTempo').textContent = 't = ' + fmt.tempo(S.t);
    $('oRallentato').hidden = !(S.rallentato && !UI.pausa);

    // increspature delle onde gravitazionali attorno alle coppie compatte
    const g = S.gw;
    if (!UI.pausa && g.coppia && V.opz.effetti && g.x > 0.002) {
      const [a, b] = g.coppia, ang = Math.atan2(b.y - a.y, b.x - a.x);
      if (angoloOnde != null) { let d = ang - angoloOnde; d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI; faseOnde += Math.abs(d); }
      angoloOnde = ang;
      ultimaOnda += dt;
      if (faseOnde > Math.PI && ultimaOnda > 0.14) {
        faseOnde %= Math.PI; ultimaOnda = 0;
        const M = a.m + b.m;
        V.onde.push({ x: (a.m * a.x + b.m * b.x) / M, y: (a.m * a.y + b.m * b.y) / M, z: (a.m * a.z + b.m * b.z) / M, t: 0, a: Math.min(0.75, g.x * 6), fase: ang });
      }
    } else angoloOnde = null;
  };

  /* ---------- Avvio dell'interfaccia ---------- */
  UI.installa = function () {
    const cv = $('cielo');
    installaInput(cv);
    costruisciTavolozza();
    UI.scegliStrumento('seleziona');
    interruttore('gStrumento', UI.scegliStrumento);
    interruttore('gModo', v => {
      S.impostaModo(v);
      UI.avviso(v === 'relativistica' ? 'Fisica relativistica' : 'Fisica classica', v === 'relativistica'
        ? 'Si aggiungono gli effetti della relatività generale: precessione delle orbite, onde gravitazionali, deviazione della luce.' + (S.fattoreC < 1 ? ` La luce è rallentata di ${Math.round(1 / S.fattoreC)} volte (vedi Opzioni).` : '')
        : 'Vale solo la legge di gravitazione di Newton.', 6);
    });
    interruttore('gVista', v => { V.cambiaTipo(v); $('lIncl').hidden = v !== '3d'; });
    interruttore('gGrafico', v => { UI.grafico = v; });
    interruttore('gSezione', UI.vaiSezione);
    $('rIncl').addEventListener('input', () => { $('oIncl').textContent = $('rIncl').value + '°'; });

    $('rVel').max = VELOCITA.length - 1;
    $('rVel').addEventListener('input', () => UI.impostaVel(+$('rVel').value));
    $('bPlay').addEventListener('click', () => UI.pausa ? UI.avvia() : UI.ferma());
    $('bPasso').addEventListener('click', () => { UI.ferma(); S.avanza(VELOCITA[UI.velIndice] / 30, performance.now() + 100); V.aggiornaScie(); });
    $('bRipristina').addEventListener('click', UI.ripristina);

    for (const b of document.querySelectorAll('.chiudi-pannello')) {
      const p = b.closest('.pannello');
      if (p.id === 'proprieta') continue;
      const riduci = si => { p.classList.toggle('ridotto', si); b.textContent = si ? '+' : '–'; };
      if (innerWidth < 760) riduci(true);                 // sui telefoni i pannelli partono chiusi
      b.addEventListener('click', () => riduci(!p.classList.contains('ridotto')));
    }
    for (const d of document.querySelectorAll('dialog')) {
      d.querySelector('.chiudi').addEventListener('click', () => d.close());
      d.addEventListener('click', e => { if (e.target === d) d.close(); });
    }
    $('bScenari').addEventListener('click', () => { costruisciScenari(); $('dScenari').showModal(); });
    $('bOpzioni').addEventListener('click', () => { costruisciOpzioni(); $('dOpzioni').showModal(); });
    $('bEsperimenti').addEventListener('click', () => { costruisciEsperimenti(); $('dEsperimenti').showModal(); });
    $('bDiario').addEventListener('click', () => {
      const l = $('listaDiario'); l.innerHTML = '';
      if (!UI.diario.length) l.append(el('li', {}, el('span.nota', { testo: 'Ancora nessun evento: prova a far scontrare qualcosa!' })));
      for (const d of UI.diario) l.append(el('li', {}, el('b', { testo: d.titolo }), el('small', { testo: ' · t = ' + fmt.tempo(d.t) }), el('p', { testo: d.testo })));
      $('dDiario').showModal();
    });
    $('bAiuto').addEventListener('click', () => UI.sezione === 'universo' ? Grav.universo.aiuto() : $('dAiuto').showModal());
    $('bScheda').addEventListener('click', () => UI.mostraScheda(false));
    $('bSchedaVia').addEventListener('click', () => $('dScheda').close());
    $('dScheda').addEventListener('close', () => { if (avviaDopoScheda) { avviaDopoScheda = false; UI.avvia(); } });
    $('bSalvaEsp').addEventListener('click', salvaEsperimento);
    $('tNomeEsp').addEventListener('keydown', e => { if (e.key === 'Enter') salvaEsperimento(); });
    $('bEsporta').addEventListener('click', esporta);
    $('fImporta').addEventListener('change', e => { if (e.target.files[0]) importa(e.target.files[0]); e.target.value = ''; });

    const tema = memoria.leggi('tema', null);
    if (tema) document.documentElement.dataset.theme = tema;
    $('bTema').addEventListener('click', () => {
      const scuro = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.dataset.theme = scuro ? 'light' : 'dark';
      memoria.scrivi('tema', document.documentElement.dataset.theme);
    });

    document.addEventListener('keydown', e => {
      if (e.target.closest('input, select, textarea') || document.querySelector('dialog[open]') || UI.sezione !== 'lab') return;
      const sel = V.selezionato && S.trova(V.selezionato);
      switch (e.key) {
        case ' ': e.preventDefault(); UI.pausa ? UI.avvia() : UI.ferma(); break;
        case 's': case 'S': UI.scegliStrumento('seleziona'); break;
        case 'a': case 'A': UI.scegliStrumento('aggiungi'); break;
        case 'f': case 'F': if (sel) { V.seguito = V.seguito === sel.id ? null : sel.id; aggiornaPannello(true); } break;
        case 'Delete': case 'Backspace': if (sel) { S.rimuovi(sel); UI.seleziona(null); } break;
        case 'Escape': V.lancio = null; azione = null; UI.seleziona(null); break;
        case '+': UI.impostaVel(UI.velIndice + 1); break;
        case '-': UI.impostaVel(UI.velIndice - 1); break;
      }
    });
  };
})();
