/**
 * Test delle icone disegnate a mano (`icons.tsx`).
 *
 * Perché contano: le icone sono state riscritte come SVG in linea al posto della
 * libreria `lucide-react`, quindi **nessuna dipendenza esterna le verifica più**.
 * Un tratto sbagliato non si vede in compilazione: si vede come un'icona storta.
 *
 * Qui si disegna il componente in HTML statico (niente browser) e si controllano
 * la geometria del riquadro e **i tratti esatti**, che sono quelli della libreria
 * di prima: se qualcuno li cambia, il test lo dice.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { House, Mic, MicOff, Share2 } from './icons.js';

/** Il tratto di un'icona, così com'è nell'HTML generato. */
const markup = (icon: (props: { size?: number }) => JSX.Element, size?: number) =>
  renderToStaticMarkup(icon({ size }));

describe('icone: attributi comuni', () => {
  it('sono quadrati 24×24 con tratto 2 e colore dal testo', () => {
    for (const icon of [House, Mic, MicOff, Share2]) {
      const html = markup(icon);
      expect(html).toContain('viewBox="0 0 24 24"');
      expect(html).toContain('fill="none"');
      expect(html).toContain('stroke="currentColor"');
      expect(html).toContain('stroke-width="2"');
      expect(html).toContain('stroke-linecap="round"');
      expect(html).toContain('stroke-linejoin="round"');
    }
  });

  it('la dimensione si può cambiare e vale per larghezza e altezza', () => {
    const html = markup(House, 17);
    expect(html).toContain('width="17"');
    expect(html).toContain('height="17"');
  });

  it('senza dimensione vale 24', () => {
    expect(markup(Mic)).toContain('width="24"');
  });
});

describe('icone: i tratti sono quelli giusti', () => {
  it('la casa ha tetto e porta', () => {
    const html = markup(House);
    expect(html).toContain('M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8');
    expect(html).toContain(
      'M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    );
  });

  it('il microfono ha capsula, archetto e gambo', () => {
    const html = markup(Mic);
    expect(html).toContain('<rect x="9" y="2" width="6" height="13" rx="3"');
    expect(html).toContain('M19 10v2a7 7 0 0 1-14 0v-2');
    expect(html).toContain('M12 19v3');
  });

  it('il microfono spento ha la sbarra diagonale in più', () => {
    const html = markup(MicOff);
    expect(html).toContain('m2 2 20 20');
    expect(html).toContain('M15 9.34V5a3 3 0 0 0-5.68-1.33');
  });

  it('condividi ha tre nodi e due rami', () => {
    const html = markup(Share2);
    expect(html).toContain('<circle cx="18" cy="5" r="3"');
    expect(html).toContain('<circle cx="6" cy="12" r="3"');
    expect(html).toContain('<circle cx="18" cy="19" r="3"');
    expect(html.match(/<line /g)).toHaveLength(2);
  });
});
