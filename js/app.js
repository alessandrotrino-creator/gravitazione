/* Avvio e ciclo principale */
(function () {
  'use strict';
  const S = Grav.sim, V = Grav.vista, UI = Grav.ui, VEL = Grav.VELOCITA;
  const cv = document.getElementById('cielo');

  V.ridimensiona(cv);
  if (window.ResizeObserver) new ResizeObserver(() => V.ridimensiona(cv)).observe(cv);
  window.addEventListener('resize', () => {
    if (UI.sezione === 'lab') V.ridimensiona(cv);
    Grav.universo.ridimensiona();
  });
  UI.installa();
  Grav.universo.installa();
  UI.impostaVel(UI.velIndice);

  const id = Grav.memoria.leggi('scenario', 'solare');
  const sc = Grav.scenari.SCENARI.find(s => s.id === id) || Grav.scenari.SCENARI[0];
  UI.caricaScenario(sc);

  let ultimo = performance.now();
  function fotogramma(ora) {
    const dt = Math.min(0.1, Math.max(0, (ora - ultimo) / 1000));
    ultimo = ora;
    try {
      if (UI.sezione === 'lab') {
        S.piano = V.tipo === '2d';
        if (!UI.pausa) {
          const vel = VEL[UI.velIndice];
          S.gw.passo = vel / 240;
          S.scegliCoppiaGW();
          S.avanza(vel * dt, performance.now() + 14);
          S.invecchia(dt);
        }
        S.aggiornaHill();
        for (const b of S.corpi) b._dom = S.dominante(b);
        if (!UI.pausa) V.aggiornaScie();
        UI.tick(dt);
        V.disegna(dt);
      } else Grav.universo.frame(dt);
    } catch (e) { console.error(e); }
    requestAnimationFrame(fotogramma);
  }
  requestAnimationFrame(fotogramma);
})();
