import { Fragment, type ReactNode } from 'react';

/**
 * Evidenziazione nel testo delle note di rilascio.
 *
 * Le note sono scritte con tre sole forme: `**grassetto**`, `*corsivo*` e
 * `` `codice` ``. Fino a ieri finivano a schermo **così com'erano** — con gli
 * asterischi e i backtick in vista (251 grassetti, 21 corsivi e 201 frammenti di
 * codice nella pagina Novità): bastava guardare la pagina per vedere che qualcosa
 * non tornava.
 *
 * Perché non una libreria Markdown: servono tre forme, tutte in linea, e questo
 * file ne fa poche decine di righe **senza dipendenze e senza
 * `dangerouslySetInnerHTML`** (il testo passa da React come testo, quindi non
 * c'è modo di iniettare HTML dalle note di rilascio).
 */
export interface InlineNode {
  kind: 'text' | 'bold' | 'italic' | 'code';
  /** Testo della parte (per il codice è il contenuto, senza i backtick). */
  text: string;
  /**
   * Solo per grassetto e corsivo: se dentro c'è altro markup, i figli già
   * risolti. È il caso di `**Il campo `promo` è opzionale**`.
   */
  children?: InlineNode[];
}

/**
 * Ordine dell'alternanza: **prima il codice**, poi il grassetto, poi il corsivo.
 *
 * Conta: `**punti**` non deve diventare un corsivo che si porta dietro un
 * asterisco, e un `*` dentro un frammento di codice non è un corsivo. Le forme
 * non chiuse (`**ciao`) restano testo normale: meglio un asterisco in più che
 * una pagina con la formattazione che "sbarella".
 */
const INLINE_PATTERN = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*/g;

/**
 * Divide il testo in parti, **risolvendo anche i markup annidati**.
 *
 * La ricorsione è limitata: il testo di un grassetto non può contenere `*` (lo
 * esclude l'espressione regolare), quindi al massimo si scende di un livello.
 */
export function parseInline(input: string): InlineNode[] {
  return flatParts(input).map((part) =>
    part.kind === 'bold' || part.kind === 'italic'
      ? { ...part, children: parseInline(part.text) }
      : part,
  );
}

/** Le parti di primo livello, senza scendere nei markup annidati. */
function flatParts(input: string): InlineNode[] {
  const parts: InlineNode[] = [];
  let last = 0;
  for (const match of input.matchAll(INLINE_PATTERN)) {
    const start = match.index;
    if (start > last) parts.push({ kind: 'text', text: input.slice(last, start) });
    if (match[1] !== undefined) parts.push({ kind: 'code', text: match[1] });
    else if (match[2] !== undefined) parts.push({ kind: 'bold', text: match[2] });
    else if (match[3] !== undefined) parts.push({ kind: 'italic', text: match[3] });
    last = start + match[0].length;
  }
  if (last < input.length) parts.push({ kind: 'text', text: input.slice(last) });
  return parts;
}

/** Testo delle note con grassetti, corsivi e frammenti di codice resi. */
export function RichText({ text }: { text: string }): ReactNode {
  return <>{renderNodes(parseInline(text))}</>;
}

function renderNodes(nodes: InlineNode[]): ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.kind) {
      case 'bold':
        return <strong key={index}>{renderNodes(node.children ?? [])}</strong>;
      case 'italic':
        return <em key={index}>{renderNodes(node.children ?? [])}</em>;
      case 'code':
        return (
          <code key={index} className="rich-code">
            {node.text}
          </code>
        );
      default:
        // `Fragment` con chiave: le parti di testo sono tante e non hanno un
        // contenitore proprio, così restano in linea come nel testo originale.
        return <Fragment key={index}>{node.text}</Fragment>;
    }
  });
}
