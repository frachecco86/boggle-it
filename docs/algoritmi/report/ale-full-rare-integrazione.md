# Integrazione delle lettere rare su `ale-full` (score lineare)

> Piano operativo per portare le modifiche di `rare-letters` sul branch `ale-full`
> **senza cambiare il metodo di calcolo dello score** (lineare, `lunghezza − 2`).
> Nessuna modifica al codice in questo documento.

---

## 0. Esito dell'analisi (perché il vincolo è rispettabile)

Verificato su git:

- **`rare-letters` è discendente diretto di `ale-full`**: `merge-base = 1f4a897`
  = HEAD di `ale-full`. `git merge-base --is-ancestor ale-full rare-letters` → OK.
  I tre commit presenti solo su `rare-letters` sono **solo docs** del piano
  (`075153f`, `a634787`, `5413c5f`); le modifiche al codice sono **non committate**.
- **`nonlinear-score` NON è antenato di `rare-letters`**
  (`git merge-base --is-ancestor nonlinear-score rare-letters` → no). Quindi le
  modifiche rare **non trascinano** la scala non lineare.
- **Lo score è identico** tra `ale-full` e il working tree di `rare-letters`:
  - `packages/shared/src/scoring.ts`: `git diff ale-full -- .../scoring.ts` vuoto;
  - `schedaAle.ts`: `pointsFor(word) = max(0, len − 2)`, `richnessFor`,
    `compositeDifficulty`, `ALE_DIFFICULTY_WEIGHTS = {0.5, 0.5}`, `scoreAleBoard`
    invariati;
  - `nonlinear-score` al contrario sostituisce `pointsFor` con
    `scoreForWord`/`scoreForLength` (scala a soglie 1/1/2/3/5/11).

**Conclusione**: "applicare le rare ad `ale-full` lasciando lo score lineare" non
richiede di neutralizzare nulla. Il rischio è solo **non introdurre per errore**
il cambio di score di `nonlinear-score` e **rigenerare** calibrazione/schede sul
branch di destinazione.

---

## 1. Cosa costituisce la feature "lettere rare"

Da portare (codice + docs), **non** gli artefatti generati:

| file | modifica |
| --- | --- |
| `packages/shared/src/schedaAle.ts` | cuore della feature (vedi §2) |
| `packages/shared/src/schedaAle.test.ts` | test floor, `h` posizionale, gate |
| `apps/server/scripts/report-ale.ts` | presenza rare per fascia, `tierRareOut`, `railText` |
| `apps/server/scripts/gen-schede-ale.ts` | log `tierRareOut` |
| `docs/algoritmi/ale.md`, `docs/algoritmi/report/ale.md` | documentazione |
| `docs/algoritmi/report/ale-vincoli-rare-piano.md` | piano (già su `rare-letters`) |
| `apps/web/src/version.ts` | changelog 0.40.0 |

Artefatti da **rigenerare** sul branch di destinazione (non copiare):
`packages/dictionary/data/ale/calibration.json`, `packages/shared/schede/schede-*.json`.

### 1.1 Modifiche a `schedaAle.ts`

1. `ALE_VOWEL_TOKENS = {a,e,i,o,u}` (`qu` fuori dalla banda vocali).
2. `AleGuardRails`: nuovi campi `tokenFloor`, `rareByTier`, `hNearCG`, `hBoost`.
3. `DEFAULT_ALE_GUARD_RAILS`:
   `tokenFloor: { qu: 0.003 }`, `rareByTier: { facile:{max:1}, normale:{}, difficile:{min:1} }`,
   `hNearCG: true`, `hBoost: 1`.
4. `AleGenerationStats`: nuovo `tierRareOut` (+ init in `newAleGenerationStats`).
5. `tokenSamplingWeights` (nuovo) + `sampleTokens(freq, count, rng, floors?, omit?)`.
6. `isHPromotableToken`, `placePositionalH`, `sampleTokensWithPositionalH`,
   `countRareTokens` (nuovi); import di `FOREIGN_LETTERS`.
7. `generateAleGrid`: usa `tokenFloor` e, se `hNearCG`, il campionamento posizionale.
8. `nextAleCandidate`: gate `rareByTier` **dopo** la fascia naturale.

---

## 2. Vincolo "score lineare": cosa NON toccare

Bloccare esplicitamente:

- `packages/shared/src/scoring.ts` — nessuna modifica (`scoreForWord` resta
  `len − 2`, niente `scoreForLength` a soglie).
- `schedaAle.ts` — **non toccare**:
  - `pointsFor` (`max(0, len − 2)`);
  - `richnessFor`, `compositeDifficulty`, `ALE_DIFFICULTY_WEIGHTS`;
  - `scoreAleBoard` (continua a usare `pointsFor`);
  - nessun import di `scoreForWord`/`scoreForLength`.
- `apps/server/scripts/report-ale.ts` — il calcolo inline della difficoltà per
  fascia resta `Math.max(0, w.length - 2)`.
- `calibration.provenance.weights` deve restare `{ rarity: 0.5, richness: 0.5 }`.

### 2.1 Test di salvaguardia (da aggiungere/tenere)

- Un test che verifichi la scala lineare (es. `scoreAleBoard` su una board nota
  produce `Σ (len − 2)`); in alternativa un test che confronti
  `scoring.scoreForWord` con `len − 2` per len 3..12.
- `schedaAle.test.ts` già importa `compositeDifficulty` e verifica i pesi 0.5/0.5:
  mantenerlo.
- Verifica di diff in CI/review:
  `git diff ale-full -- packages/shared/src/scoring.ts` deve essere **vuoto**;
  `git diff ale-full -- packages/shared/src/schedaAle.ts` non deve contenere
  "scoreForWord" né "scoreForLength".

---

## 3. Strategia di branch (sceglierne una)

- **A — merge `rare-letters` → `ale-full` (consigliata)**. Coerente con la
  topologia (discendente diretto): `git checkout ale-full && git merge --no-ff rare-letters`.
  Porta anche i 3 commit di docs del piano.
- **B — branch nuovo da `ale-full` + cherry-pick**. Se non si vogliono i commit di
  docs esplorativi:
  `git checkout -b ale-full-rare ale-full` poi applicare il diff di codice
  (patch) e rigenerare.
- **C — rebase**. Inutile (già basato su `ale-full`); cambierebbe solo la storia.

---

## 4. Procedura passo-passo

### Fase 0 — Congelare `rare-letters`
```bash
git add -A
git commit -m "feat(ale): floor qu, gate rareByTier e h posizionale (lettere rare)"
# opzionale: dividere in 2 commit (rail+qu | h posizionale) per pulizia
git branch backup/rare-letters   # rete di sicurezza
```

### Fase 1 — Branch di destinazione
```bash
git checkout ale-full
git pull --ff-only                      # allinearsi a origin/ale-full
# strategia A:
git merge --no-ff rare-letters
# oppure strategia B:
git checkout -b ale-full-rare ale-full
git cherry-pick <commit-code>           # solo i commit di codice
```

### Fase 2 — Guardia sullo score (prima di rigenerare)
```bash
git diff ale-full -- packages/shared/src/scoring.ts           # deve essere vuoto
git diff ale-full -- packages/shared/src/schedaAle.ts | grep -E "scoreForWord|scoreForLength"
# deve essere vuoto
```

### Fase 3 — Ricalibrazione (lo score è lineare)
Il cambio di `DEFAULT_ALE_GUARD_RAILS` invalida la calibrazione committata
(deep-equal in `apps/server/src/ale.ts`). Rigenerare **sul branch di destinazione**:
```bash
pnpm --filter @boggle/server gen:schede:ale -- --replace --samples 5000
node apps/web/scripts/copy-schede.mjs
```

### Fase 4 — Verifica
```bash
pnpm typecheck
pnpm --filter @boggle/shared test
pnpm --filter @boggle/server verify:schede
pnpm --filter @boggle/server report:ale -- --all-sizes --samples 5000 --n 15 --seed 1
```
Attesi: 135 ale (15/fascia × 9), `anyRare = 100%` su difficile,
`Qu` presente su una minoranza, 15/15 in banda, zero ripieghi, riproduzione 15/15.

### Fase 5 — Docs e versione
Aggiornare `docs/algoritmi/ale.md`, `report/ale.md`, changelog; nota che la scala
di punteggio è quella **lineare di `ale-full`**.

### Fase 6 — Chiusura
`git push` e, se `ale-full` è condiviso, PR con la sola feature rare (nessun
commit di `nonlinear-score`).

---

## 5. Interazione con `nonlinear-score` (se in futuro si vogliono entrambe)

- **Entrambe le feature invalidano `calibration.json` e `schede/*.json`.** Non si
  può tenere la calibrazione di uno dei due branch: si fa il merge delle feature
  e si **rigenera una sola volta** sul branch combinato, con lo score scelto.
- **Conflitto di codice atteso**: `packages/shared/src/schedaAle.ts` e
  `apps/server/scripts/report-ale.ts` (punto in cui si somma il punteggio).
  Risoluzione: tenere la funzione di score scelta (`pointsFor` lineare **oppure**
  `scoreForWord` a soglie) e lasciare intatte le aggiunte rare.
- **Ordine indifferente**, purché l'ultimo passo sia sempre la rigenerazione.
- `rareByTier` dipende dalla fascia `D = f(R, M)`; cambiando score cambiano
  `M` e i confini k-means, quindi la calibrazione va rifatta comunque.

---

## 6. Criteri di accettazione

- `git diff ale-full -- packages/shared/src/scoring.ts` vuoto.
- Nessun `scoreForWord`/`scoreForLength` in `schedaAle.ts`; `pointsFor` invariato.
- `calibration.json` con `provenance.weights = {0.5, 0.5}` e `guardRails` nuovi.
- `pnpm typecheck`, test shared/server, `verify:schede` verdi.
- Report: 15/15 per fascia, zero ripieghi, `difficile` con ≥1 rara (100%).
- Nessuna modifica ai file di `nonlinear-score` (`scoring.ts`, `grid.test.ts`, ecc.).

---

## 7. File toccati (riepilogo)

**Portare (codice/docs)**
- `packages/shared/src/schedaAle.ts`
- `packages/shared/src/schedaAle.test.ts`
- `apps/server/scripts/report-ale.ts`
- `apps/server/scripts/gen-schede-ale.ts`
- `apps/web/src/version.ts`
- `docs/algoritmi/ale.md`, `docs/algoritmi/report/ale.md`,
  `docs/algoritmi/report/ale-vincoli-rare-piano.md`

**Rigenerare (non copiare)**
- `packages/dictionary/data/ale/calibration.json`
- `packages/shared/schede/schede-*.json`

**Da NON toccare**
- `packages/shared/src/scoring.ts`
- `pointsFor`/`richnessFor`/`compositeDifficulty`/`ALE_DIFFICULTY_WEIGHTS`/`scoreAleBoard`
