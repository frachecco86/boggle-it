/**
 * Regole dell'invito a una stanza, pure e testabili senza browser.
 *
 * PERCHÉ UN MODULO A PARTE: la decisione "si entra direttamente?" vive nella home
 * (che monta React, lo store e `localStorage`), quindi da lì non si può provare
 * senza jsdom — che il progetto non usa. Qui la regola è una funzione pura: il
 * componente la chiama, il test la verifica.
 *
 * Le due regole dell'invito:
 *  1. chi apre `?stanza=CODICE` entra DIRETTAMENTE, senza dover capire che basta
 *     premere un tasto;
 *  2. ma solo se ha già un'identità, altrimenti entrerebbe come "Giocatore"
 *     anonimo in una stanza dove lo aspettano con il suo nome.
 */

/**
 * true se chi apre un invito può entrare SUBITO, senza scegliere prima il nome.
 *
 * Serve un'identità: un profilo (nickname e avatar salvati sul server) oppure un
 * nome già scritto su questo dispositivo. Un nome di soli spazi non conta: è il
 * caso del campo toccato e lasciato vuoto.
 */
export function canAutoJoinFromInvite(hasProfile: boolean, nickname: string): boolean {
  return hasProfile || nickname.trim().length > 0;
}
