import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../state/store.js';
import { BackHome } from '../components/BackHome.js';
import { Podium } from '../components/Podium.js';
import { SpeakingIndicator, useVoiceSpeakers } from '../components/VoiceControls.js';
import { RoundReplay } from '../components/RoundReplay.js';
import { pickVictoryLine, speakVictory } from '../audio/victorySpeech.js';

/** Riepilogo multiplayer: classifica finale o di round + parole per giocatore. */
export function MultiplayerSummaryScreen() {
  const {
    roundResults,
    finalScores,
    missedWords,
    room,
    playerId,
    startRoom,
    startNewMatch,
    closeRoom,
    leaveRoom,
    audioSettings,
  } = useAppStore();
  const isFinal = Boolean(finalScores);
  const results = finalScores ?? roundResults ?? [];
  const isHost = room?.hostId === playerId;
  const isLastRound = room ? room.currentRound >= room.rounds : false;
  const sortedWords = [...missedWords].sort((a, b) => b.length - a.length);
  /** La frase di fine partita si dice UNA volta sola (il riepilogo può ri-renderizzare). */
  const spokenRef = useRef(false);

  /*
   * A fine partita la voce annuncia la vittoria a TUTTI, non solo a chi ha
   * vinto: il vincitore sente la frase con il proprio nome, gli altri sentono il
   * nome del vincitore (vedi `pickVictoryLine`). Prima si parlava solo sul
   * dispositivo del vincitore: in multiplayer la sentiva una persona sola.
   *
   * Rispetta il muto degli effetti: chi ha zittito il gioco non si ritrova la
   * voce addosso.
   */
  useEffect(() => {
    if (!isFinal || spokenRef.current) return;
    const winner = results[0];
    if (!winner) return;
    // La frase si decide UNA volta: `spokenRef` impedisce che un re-render la
    // ripeta (e che ne scelga una diversa a ogni render).
    const line = pickVictoryLine(winner.nickname, winner.playerId === playerId);
    if (!line) return;
    spokenRef.current = true;
    if (!audioSettings.sfxEnabled) return;
    speakVictory(line);
  }, [isFinal, results, playerId, audioSettings.sfxEnabled]);

  /*
   * Replay "arcade" a fine round: appare UNA volta per round, poi si può passare
   * al riepilogo completo. A fine partita (gameEnd) non c'è una timeline unica
   * per l'intera partita, quindi si mostra direttamente la classifica finale.
   */
  const hasTimeline = useMemo(
    () => results.some((r) => (r.timeline?.length ?? 0) > 0),
    [results],
  );
  const [replayDone, setReplayDone] = useState(false);
  const showReplay = !isFinal && hasTimeline && !replayDone;

  // Avatar e foto dei giocatori: i risultati portano solo il nickname.
  const players = room?.players.map((p) => ({ id: p.id, avatar: p.avatar, photoUrl: p.photoUrl }));
  // Chi sta parlando adesso: l'indicatore compare accanto al nome.
  const speakers = useVoiceSpeakers();

  if (showReplay) {
    return (
      <div className="screen summary">
        <BackHome onLeave={leaveRoom} />
        <h2 className="screen__title">Fine round {room?.currentRound ?? ''}</h2>
        <RoundReplay results={results} players={players} onDone={() => setReplayDone(true)} />
      </div>
    );
  }

  /*
   * Con due o più partite nella stessa stanza «Classifica finale» da sola non
   * dice quale: il numero della partita lo distingue.
   */
  const title = !isFinal
    ? `Fine round ${room?.currentRound ?? ''}`
    : (room?.matchNumber ?? 1) > 1
      ? `Classifica finale — partita ${room?.matchNumber}`
      : 'Classifica finale';

  return (
    <div className="screen summary">
      <BackHome onLeave={leaveRoom} />
      <h2 className="screen__title">{title}</h2>

      {/* A fine partita il podio: i primi tre, chi ha vinto e i punti. */}
      {isFinal && <Podium results={results} players={players} meId={playerId} />}

      <ul className="results-list">
        {results.map((r, i) => (
          <li key={r.playerId} className={`result-row${r.playerId === playerId ? ' result-row--you' : ''}`}>
            <span className="result-row__rank">{i + 1}</span>
            <div className="result-row__body">
              <div className="result-row__head">
                <span className="result-row__name">
                  {r.nickname}
                  {speakers.includes(r.playerId) && <SpeakingIndicator name={r.nickname} />}
                </span>
                <span className="result-row__score">{isFinal ? r.totalScore : r.roundScore}</span>
              </div>
              <div className="chip-list chip-list--compact">
                {r.words.map((w) => {
                  const unique = r.uniqueWords?.includes(w);
                  return (
                    <span
                      key={w}
                      className={`chip chip--small${unique ? ' chip--unique' : ''}`}
                      title={unique ? 'Trovata solo da te: punti doppi' : undefined}
                    >
                      {w.toUpperCase()}
                      {unique ? ' ×2' : ''}
                    </span>
                  );
                })}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {!isFinal && sortedWords.length > 0 && (
        <section className="summary__section">
          <h3 className="summary__label">Parole che esistevano</h3>
          <div className="chip-list chip-list--muted">
            {sortedWords.map((w) => (
              <span key={w} className="chip chip--muted">
                {w.toUpperCase()}
              </span>
            ))}
          </div>
        </section>
      )}

      <div className="summary__actions">
        {isFinal ? (
          /*
           * Fine partita: la stanza NON muore qui.
           *
           * L'host decide: «Gioca ancora» apre una partita nuova nella stessa
           * stanza (stesso codice, stessi amici, schede nuove), «Chiudi la
           * stanza» la spegne per tutti. Chi non è host vede l'attesa: non può
           * decidere lui per gli altri, ma non è più costretto a rifare la stanza
           * e rigirare il link.
           */
          isHost ? (
            <>
              <button className="btn btn--primary btn--big" onClick={startNewMatch}>
                Gioca ancora nella stessa stanza
              </button>
              <button className="btn btn--ghost" onClick={closeRoom}>
                Chiudi la stanza
              </button>
            </>
          ) : (
            <>
              <p className="lobby__waiting">
                Chi ha creato la stanza può iniziare una nuova partita: resti qui e parti
                insieme a lui, lo stesso codice vale ancora.
              </p>
              <button className="btn btn--ghost" onClick={leaveRoom}>
                Esci dalla stanza
              </button>
            </>
          )
        ) : isHost ? (
          <button className="btn btn--primary btn--big" onClick={startRoom} disabled={isLastRound}>
            {isLastRound ? 'Ultimo round…' : 'Prossimo round'}
          </button>
        ) : (
          <p className="lobby__waiting">In attesa dell'host per il prossimo round…</p>
        )}
        {!isFinal && (
          <button className="btn btn--ghost" onClick={leaveRoom}>
            Esci dalla stanza
          </button>
        )}
      </div>
    </div>
  );
}
