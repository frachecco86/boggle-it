import { defineConfig } from 'vitest/config';

/**
 * Vitest passa da Vite, che non conosce il modulo builtin `node:sqlite`
 * (introdotto di recente): lo alias esplicito a un re-export così Node lo
 * carica davvero, senza che Vite provi a risolverlo come pacchetto npm.
 */
export default defineConfig({
  test: {
    environment: 'node',
    server: {
      deps: {
        external: [/^node:/],
      },
    },
  },
  resolve: {
    alias: {
      'node:sqlite': 'node:sqlite',
    },
  },
});
