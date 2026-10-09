# Schede `ale` generate a runtime: svuotare e rigenerare

Le schede del catalogo arrivano da **due famiglie diverse**:

| famiglia | dove vive | chi la scrive | in git? |
| --- | --- | --- | --- |
| ale **di base** | `packages/shared/schede/` | `gen:schede:ale` (offline) | sì |
| ale **a runtime** | `<volume>/schede-ale/` | tasto **Genera** del pannello admin | **no** |
| standard / full a runtime | `<volume>/schede-extra/` | tasto **Genera** | no |

> ## ⚠️ Da fare **una volta sola**: dopo il deploy della 0.47.0
>
> Le 270 schede **versionate** sono state riallineate al dizionario con `pnpm sync:schede`
> (101 schede toccate, **+315 parole accettate**, griglie intatte). Le ale **a runtime** del
> volume no: sono rimaste risolte sul dizionario di quando sono state generate — quello **senza**
> le 4.339 parole tecniche riammesse nella 0.43.0 — e continuano a rifiutare parole come
> **`setosa`** (segnalato sulla scheda ale `6-facile-085`, 6×6 facile).
>
> **Dopo questo deploy: svuotare e rigenerare le ale** (e le `schede-extra/`, se si usano).
> È un'operazione **una tantum**: non è parte del deploy, nessun hook la esegue, e va ripetuta
> solo se cambia di nuovo il dizionario. Costo ~450 MB di picco e alcuni minuti — ecco perché non
> la si automatizza a ogni rilascio.
>
> Verifica rapida che il volume sia ancora vecchio: il totale ale nel pannello admin è molto più
> alto di `15 × 9 = 135` (lotti accumulati), e su una scheda ale che compone `s-e-t-o-s-a` la
> parola viene rifiutata in single player.


Le ale a runtime sono comode (si generano lotti nuovi senza toccare il repo), ma
**non seguono il codice**: restano nel volume con la semantica del giorno in cui
sono state create. Quando cambia la calibrazione (metrica ad anelli, rail delle
rare) o la scala dei punteggi, quelle schede continuano a essere taggate `ale`
pur essendo tarate su bande e punteggi vecchi: la difficoltà non è più omogenea
con il catalogo versionato.

Sintomo tipico: nel pannello admin il totale ale è molto più alto di
`15 × 9 = 135`. Esempio reale su `boggle-it-production`:

```
570 schede totali · 389 ale
  4-facile   ale 10   ← 10 di base? no: base vecchia senza ale + 10 a runtime
  5-facile   ale 210  ← due lotti da 100 generati dall'admin
  6-facile   ale 110  ← un lotto da 100
```

## Quando rigenerare

- **dopo un cambio del dizionario** (`words.br`, `technical-words.txt`, `consonant-endings.txt`,
  `frequency-it.txt`): le schede del volume restano risolte sul dizionario vecchio e rifiutano le
  parole riammesse. È il caso della 0.47.0 (blocco ⚠ qui sopra); `pnpm check:schede` dice se le
  schede *versionate* sono allineate, ma **non vede quelle del volume**;
- dopo un cambio di calibrazione (`calibration.json`) o della scala punteggi;
- quando le ale a runtime non rispettano più i gate delle rare (le difficili
  devono averne almeno una, le facili al massimo una);
- dopo aver svuotato il catalogo per ripartire pulito.

**Prima di rigenerare, il servizio deve girare con il codice nuovo**: la
generazione la fa il server, con la calibrazione della sua immagine. Lo script
lo verifica da sé (rifiuta di procedere se la scala punteggi è ancora quella
lineare).

## Procedura A — script (consigliata)

Lo script `tools/rigenera-ale-server.mjs` fa tutto: login, backup, svuotamento
dello scope `ale`, rigenerazione, verifica.

```bash
# 1. la scala punteggi del server deve essere quella classica (altrimenti esce)
SERVER_URL=https://<server> ADMIN_USER=<admin> ADMIN_PASSWORD=<password> \
  node tools/rigenera-ale-server.mjs                 # DRY-RUN: mostra cosa farebbe

# 2. esegue: backup → svuota schede-ale/ → genera 15 ale per chiave → verifica
SERVER_URL=https://<server> ADMIN_USER=<admin> ADMIN_PASSWORD=<password> \
  node tools/rigenera-ale-server.mjs --apply
```

Cosa fa e cosa non fa:

- **backup prima di cancellare**: scarica tutte le schede ale in
  `backup-ale-<data>/ale-backup-<timestamp>.json` (~600 KB per 140 schede);
- svuota **solo** `<volume>/schede-ale/`: standard, full e il catalogo
  versionato restano intatti;
- genera `--per-key` schede (default 15) per ogni dimensione × difficoltà, a
  lotti di 100 (limite dell'API);
- controlla i gate delle rare su un campione (`--verify`, default 3 per chiave);
- **non** tocca i record di partita, i profili né lo storico "schede già giocate".

Opzioni utili: `--sizes 4,5`, `--difficulty facile,difficile`, `--per-key 10`,
`--skip-generate` (solo svuotare), `--skip-delete` (solo aggiungere),
`--no-backup`, `--force` (procede anche con la scala vecchia).

⚠️ Lo **svuotamento è globale**: `--sizes`/`--difficulty` limitano solo la
rigenerazione, non la cancellazione. Per questo lo script avvisa quando filtri
solo una parte delle chiavi.

### Ripristino da backup

```bash
node tools/rigenera-ale-server.mjs --restore backup-ale-<data>/ale-backup-<ts>.json --out ./ripristino
# copia i file in <volume>/schede-ale/ e RIAVVIA il server
```

I file prodotti hanno lo stesso formato del catalogo (`version`, `size`,
`difficulty`, `schede`) e il riavvio è obbligatorio: il catalogo si legge in
avvio. Le ale di base eventualmente presenti nel backup vengono riscritte anche
qui, ma all'avvio vincono quelle versionate (deduplica per `id`): nessun
doppione.

Il backup JSON non sostituisce uno **snapshot del volume**: per un ripristino
"vero" della cartella, fai prima un backup del volume dalla piattaforma.

## Procedura B — pannello admin (senza script)

1. **Svuota → *Solo Ale***: cancella `<volume>/schede-ale/` (chiede conferma
   scrivendo `DELETE`).
2. Per ogni dimensione (4×4, 5×5, 6×6) e difficoltà (facile, normale,
   difficile): **Genera** con variante *Ale*, 15 schede. Sono 9 chiamate; il
   pannello accetta fino a 100 schede per volta.
3. Controlla il totale: deve tornare a `base + 135`.

Per il backup manuale, prima del punto 1 scarica le schede ale con
`GET /schede/:id` (o usa lo script, che lo fa da sé).

## Cosa aspettarsi dopo

- gli **id non vengono riusati**: la generazione riparte da
  `schede.list(size, difficoltà).length + 1`, quindi lo storico "schede già
  giocate" dei profili e i record per scheda restano coerenti;
- le nuove ale usano la **calibrazione dell'immagine in esecuzione** (anelli di
  frequenza, rail delle rare) e la **scala punteggi** del codice;
- i punteggi delle partite già giocate non cambiano: sono salvati.

## Se il catalogo base è vecchio

Se `SCHEDE_DIR` punta a una copia del catalogo sul volume, il server continua a
usare le schede base vecchie anche dopo il deploy (lo si vede dalla riga di
avvio `✓ Schede caricate: N (base X da …, extra Y da …, ale Z da …)`). In quel
caso va riallineato prima il base, altrimenti le ale nuove convivono con un
catalogo base vecchio.
