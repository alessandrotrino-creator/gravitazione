/* Costanti fisiche, unità di misura, formattazione dei numeri e memoria locale.
   Tutto il simulatore lavora in unità SI: metri, chilogrammi, secondi. */
(function () {
  'use strict';
  const G = 6.674e-11, C = 2.99792458e8;
  const U = {
    MS: 1.98847e30, RS: 6.957e8, LS: 3.828e26,   // Sole (luminosità in W)
    SIGMA: 5.670374e-8, T_CMB: 2.725,  // costante di Stefan-Boltzmann, fondo cosmico a microonde (K)
    MT: 5.9722e24, RT: 6.371e6,       // Terra
    ML: 7.342e22, RL: 1.7374e6,       // Luna
    MG: 1.89813e27, RG: 6.9911e7,     // Giove
    UA: 1.495978707e11, AL: 9.4607e15, KM: 1e3,
    MINUTO: 60, ORA: 3600, GIORNO: 86400, ANNO: 3.15576e7
  };

  const APICI = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  const apice = n => String(n).replace('-', '⁻').replace(/\d/g, d => APICI[d]);
  const loc = (x, c) => x.toLocaleString('it-IT', { maximumSignificantDigits: c });

  function numero(x, cifre = 3) {
    if (!isFinite(x)) return '—';
    if (x === 0) return '0';
    const a = Math.abs(x);
    if (a >= 1e6 || a < 1e-3) {
      let e = Math.floor(Math.log10(a)), m = Number((x / Math.pow(10, e)).toPrecision(cifre));
      if (Math.abs(m) >= 10) { m /= 10; e++; }
      return loc(m, cifre) + ' × 10' + apice(e);
    }
    return loc(Number(x.toPrecision(cifre)), cifre);
  }
  const unoPiu = (x, sing, plur) => numero(x) + ' ' + (Math.abs(Number(x.toPrecision(3))) === 1 ? sing : plur);

  const fmt = {
    numero,
    massa(m) {
      if (m >= 0.01 * U.MS) return numero(m / U.MS) + ' M☉';
      if (m >= 1e-4 * U.MT) return numero(m / U.MT) + ' M⊕';
      return numero(m) + ' kg';
    },
    lunghezza(d) {
      if (d < 1e3) return numero(d) + ' m';
      if (d < 0.01 * U.UA) return numero(d / 1e3) + ' km';
      if (d < 0.1 * U.AL) return numero(d / U.UA) + ' UA';
      return unoPiu(d / U.AL, 'anno luce', 'anni luce');
    },
    velocita(v) {
      return numero(v / 1e3) + ' km/s' + (v > 0.01 * C ? ' (' + numero(v / C, 2) + ' c)' : '');
    },
    tempo(t) {
      const a = Math.abs(t);
      if (a === 0) return '0 s';
      if (a < 1) return numero(t * 1000) + ' ms';
      if (a < 120) return numero(t) + ' s';
      if (a < 2 * U.ORA) return unoPiu(t / 60, 'minuto', 'minuti');
      if (a < 2 * U.GIORNO) return unoPiu(t / U.ORA, 'ora', 'ore');
      if (a < U.ANNO) return unoPiu(t / U.GIORNO, 'giorno', 'giorni');
      const y = t / U.ANNO;
      if (Math.abs(y) < 1e6) return unoPiu(y, 'anno', 'anni');
      if (Math.abs(y) < 1e9) return numero(y / 1e6) + ' milioni di anni';
      return numero(y / 1e9) + ' miliardi di anni';
    },
    densita: rho => numero(rho / 1000) + ' g/cm³'
  };

  // Velocità della simulazione: secondi simulati per ogni secondo reale
  const VELOCITA = [0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1, 10, 60, 600, 3600, 6 * 3600,
    U.GIORNO, 5 * U.GIORNO, 20 * U.GIORNO, 60 * U.GIORNO, 0.5 * U.ANNO, 2 * U.ANNO,
    10 * U.ANNO, 50 * U.ANNO, 200 * U.ANNO, 1000 * U.ANNO, 1e4 * U.ANNO, 1e5 * U.ANNO,
    1e6 * U.ANNO, 1e7 * U.ANNO, 3e7 * U.ANNO, 1e8 * U.ANNO];

  const memoria = {
    leggi(k, def) { try { const v = localStorage.getItem('gravitazione:' + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
    scrivi(k, v) { try { localStorage.setItem('gravitazione:' + k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };

  // Piccolo aiuto per creare nodi DOM: el('div.classe', {attr}, figli...)
  function el(sel, attr, ...figli) {
    const [tag, ...cl] = sel.split('.');
    const n = document.createElement(tag || 'div');
    if (cl.length) n.className = cl.join(' ');
    for (const k in attr || {}) {
      const v = attr[k];
      if (v == null || v === false) continue;
      if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (k === 'testo') n.textContent = v;
      else if (k in n && k !== 'list') n[k] = v;
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const f of figli.flat()) if (f != null && f !== false) n.append(f.nodeType ? f : String(f));
    return n;
  }

  window.Grav = { G, C, U, fmt, VELOCITA, memoria, el };
})();
