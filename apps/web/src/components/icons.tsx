import type { SVGProps } from 'react';

/**
 * Icone disegnate a mano (SVG in linea), al posto della libreria `lucide-react`.
 *
 * Perché non una libreria:
 *  - servivano **quattro** icone (casa, microfono, microfono spento, condividi);
 *    aggiungere una dipendenza per questo significava anche tenerla allineata nel
 *    file di lock, e il server di build rifiuta l'installazione quando il lock non
 *    è aggiornato (`pnpm install --frozen-lockfile`). Con l'SVG in linea il lock
 *    resta valido così com'è;
 *  - l'app funziona **offline** nell'APK: meno codice da scaricare, meno peso;
 *  - i tratti sono gli stessi della libreria (24×24, tratto 2, estremità
 *    arrotondate): l'aspetto non cambia.
 *
 * Il colore segue `currentColor`, quindi le icone prendono il colore dal testo del
 * pulsante che le contiene (compresi i temi e gli stati "acceso/spento").
 */

/** Attributi comuni: stessa geometria e stesso tratto delle icone di prima. */
function base({ size = 24, ...rest }: Props) {
  return {
    xmlns: 'http://www.w3.org/2000/svg',
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...rest,
  };
}

interface Props extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> {
  /** Lato dell'icona in pixel (le icone sono quadrate). */
  size?: number;
}

/** Casa con il tetto: tasto "torna alla home". */
export function House(props: Props) {
  return (
    <svg {...base(props)}>
      <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
      <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

/** Microfono: si tiene premuto per parlare. */
export function Mic(props: Props) {
  return (
    <svg {...base(props)}>
      <path d="M12 19v3" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <rect x="9" y="2" width="6" height="13" rx="3" />
    </svg>
  );
}

/** Microfono sbarrato: il proprio microfono è silenziato. */
export function MicOff(props: Props) {
  return (
    <svg {...base(props)}>
      <path d="M12 19v3" />
      <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
      <path d="M16.95 16.95A7 7 0 0 1 5 12v-2" />
      <path d="M18.89 13.23A7 7 0 0 0 19 12v-2" />
      <path d="m2 2 20 20" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
    </svg>
  );
}

/** Nodo con due rami: condividi l'invito della stanza. */
export function Share2(props: Props) {
  return (
    <svg {...base(props)}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" x2="15.42" y1="13.51" y2="17.49" />
      <line x1="15.41" x2="8.59" y1="6.51" y2="10.49" />
    </svg>
  );
}

/** Stella: i PUNTI della partita (barra compatta e pannello volumi). */
export function Star(props: Props) {
  return (
    <svg {...base(props)}>
      <path d="M11.53 2.3a.53.53 0 0 1 .94 0l2.31 4.68a2.12 2.12 0 0 0 1.6 1.16l5.16.75a.53.53 0 0 1 .3.91l-3.74 3.64a2.12 2.12 0 0 0-.61 1.88l.88 5.14a.53.53 0 0 1-.77.56l-4.62-2.43a2.12 2.12 0 0 0-1.97 0l-4.62 2.43a.53.53 0 0 1-.77-.56l.88-5.14a2.12 2.12 0 0 0-.61-1.88L2.16 9.8a.53.53 0 0 1 .3-.9l5.16-.76a2.12 2.12 0 0 0 1.6-1.16z" />
    </svg>
  );
}

/** Segno di spunta in un cerchio: le PAROLE trovate. */
export function CheckCircle(props: Props) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </svg>
  );
}

/** Una persona: modalità single player. */
export function User(props: Props) {
  return (
    <svg {...base(props)}>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

/** Più persone: modalità multiplayer. */
export function Users(props: Props) {
  return (
    <svg {...base(props)}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

/** Altoparlante con onde: pannello dei volumi. */
export function Volume2(props: Props) {
  return (
    <svg {...base(props)}>
      <path d="M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6a1.4 1.4 0 0 1-1 .4H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z" />
      <path d="M16 9a5 5 0 0 1 0 6" />
      <path d="M19.36 18.36a9 9 0 0 0 0-12.73" />
    </svg>
  );
}
