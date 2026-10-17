# CLAUDE.md

Guida per Claude Code su questo progetto. L'utente scrive in italiano: rispondi in italiano.

## Cos'è

Laboratorio di gravitazione universale per la scuola (medie e superiori): si collocano e si lanciano
stelle, pianeti, buchi neri, stelle di neutroni…; urti, fusioni, maree, supernove, onde gravitazionali.
Seconda sezione: "Universo dal Big Bang" (cosmologia, avanti e indietro nel tempo).
HTML + CSS + JavaScript "vanilla", niente build né dipendenze: deve funzionare aprendo `index.html`
con doppio clic (`file://`), quindi niente `fetch`, moduli ES o CDN.

## Architettura (oggetto globale `window.Grav`)

- `js/unita.js`: costanti (SI: metri, kg, secondi), `fmt` (numeri all'italiana), `VELOCITA`, `memoria`
  (localStorage con try/catch, prefisso `gravitazione:`), `el()` per creare nodi DOM.
- `js/corpi.js`: `TIPI` (catalogo dei corpi) e `Grav.corpi` (creazione, densità, cambio di tipo, copia).
- `js/fisica.js`: `Grav.sim`. Leapfrog con passo adattivo (`eta` × tempo scala minimo delle coppie, `dtMax`
  facoltativo) e predittore della velocità per le forze che dipendono dalla velocità. Relatività: 1PN
  (precessione) + reazione di radiazione 2.5PN (onde), limitate sotto 7GM/c²; due oggetti compatti dentro
  6GM/c² si fondono. Urti/fusioni (`urto`), frammentazione, distruzione mareale (limite di Roche), supernove,
  nebulose planetarie, collassi (`verifica`), attrito dinamico tra galassie. Il "corpo dominante" usa la
  sfera di Hill (`aggiornaHill`, `dominante`). Gli eventi vanno in `sim.eventi` e li consuma l'interfaccia.
  Il "pallone da basket gigante" (`elastico`) rimbalza sui corpi `SOLIDI` con un urto elastico (`rimbalzo`, che
  conserva anche l'energia quando separa i corpi compenetrati). `temperatura(b)`: superficie per i corpi luminosi
  (luminosità da `corpi.luminosita`), Hawking per i buchi neri, equilibrio radiativo (albedo del tipo) per gli altri.
- `js/scenari.js`: scenari pronti (`SCENARI`), schede storiche (`SCHEDE`: quando, dove, chi, cronologia),
  azioni programmate (`programma`), testi d'impatto dedicati (proprietà `storia` dei corpi).
- `js/vista.js`: disegno 2D (dall'alto) e 3D (prospettiva su canvas, "telo elastico"), scie, effetti.
- `js/interfaccia.js`: strumenti, lancio con traiettoria prevista, pannello proprietà, grafici, finestre.
- `js/universo.js`: equazioni di Friedmann (tabella t(a)), crescita delle strutture con l'approssimazione
  di Zel'dovich, epoche, linea del tempo.
- `js/app.js`: avvio e ciclo principale.

## Convenzioni

- Codice, nomi e commenti in italiano, stile compatto.
- Colori dei pannelli solo tramite variabili CSS in `:root`, con tema scuro (`prefers-color-scheme` e `data-theme`).
  Lo spazio (canvas) è sempre scuro.
- Niente `alert`/`confirm`: per le azioni distruttive c'è il pulsante a doppio clic `conferma(...)`.
- Testi per studenti: esatti, neutrali, con le semplificazioni dichiarate.
- Prima di dire che qualcosa funziona, provalo nel browser (server: `strumenti/server.ps1`, porta 8777).
- File di testo in UTF-8 senza BOM.
