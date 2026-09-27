/**
 * Regole CORS del server.
 *
 * Il test che conta è il primo: l'app Android (WebView Capacitor) parla col
 * server da un'origine sintetica, quindi DEVE essere accettata anche quando
 * `CLIENT_ORIGIN` non è configurata. Era esattamente questa la causa del
 * "server non raggiungibile" nella Classifica dell'APK, con il server online.
 */
import { describe, expect, it } from 'vitest';
import {
  CAPACITOR_ORIGINS,
  corsOriginList,
  corsSettingsFromEnv,
  makeCorsOrigin,
  type CorsSettings,
} from './corsOrigin.js';

/** Interroga la policy come farebbe il middleware `cors`. */
function allowed(settings: CorsSettings, origin?: string): boolean {
  let result: boolean | undefined;
  makeCorsOrigin(settings)(origin as string, (_err, ok) => {
    result = Boolean(ok);
  });
  return result === true;
}

/** Configurazione di PRODUZIONE reale: nessuna `CLIENT_ORIGIN` impostata. */
const productionDefaults: CorsSettings = {
  clientOrigins: ['http://localhost:5173'],
  allowCapacitor: true,
  devLocalhost: false,
};

describe('CORS: app Android (Capacitor)', () => {
  it('accetta il WebView Android anche senza CLIENT_ORIGIN configurata', () => {
    // La regressione: prima l'APK prendeva 403/CORS block su /leaderboard.
    expect(allowed(productionDefaults, 'https://localhost')).toBe(true);
  });

  it('accetta anche capacitor://localhost (iOS e config storica)', () => {
    expect(allowed(productionDefaults, 'capacitor://localhost')).toBe(true);
  });

  it('le origini Capacitor sono attive di default da env vuoto', () => {
    const settings = corsSettingsFromEnv({ NODE_ENV: 'production' } as NodeJS.ProcessEnv);
    expect(settings.allowCapacitor).toBe(true);
    expect(allowed(settings, 'https://localhost')).toBe(true);
  });

  it('ALLOW_CAPACITOR=0 le disattiva esplicitamente', () => {
    const settings = corsSettingsFromEnv({
      NODE_ENV: 'production',
      ALLOW_CAPACITOR: '0',
    } as NodeJS.ProcessEnv);
    expect(allowed(settings, 'https://localhost')).toBe(false);
  });
});

describe('CORS: origini esplicite', () => {
  it('accetta le origini elencate in CLIENT_ORIGIN', () => {
    const settings = corsSettingsFromEnv({
      CLIENT_ORIGIN: 'https://sbooble.netlify.app,http://localhost:5173',
      NODE_ENV: 'production',
    } as NodeJS.ProcessEnv);
    expect(allowed(settings, 'https://sbooble.netlify.app')).toBe(true);
    expect(allowed(settings, 'http://localhost:5173')).toBe(true);
  });

  it('rifiuta un dominio non elencato', () => {
    expect(allowed(productionDefaults, 'https://evil.example')).toBe(false);
  });

  it('con `*` accetta qualunque origine', () => {
    expect(allowed({ ...productionDefaults, clientOrigins: ['*'] }, 'https://evil.example')).toBe(
      true,
    );
  });

  it("un'origine assente è ammessa (curl, health check, same-origin)", () => {
    expect(allowed(productionDefaults, undefined)).toBe(true);
  });
});

describe('CORS: sviluppo', () => {
  it('in sviluppo accetta localhost su qualsiasi porta', () => {
    const settings = corsSettingsFromEnv({
      NODE_ENV: 'development',
    } as NodeJS.ProcessEnv);
    expect(allowed(settings, 'http://localhost:4000')).toBe(true);
  });

  it('in produzione NON accetta localhost arbitrari', () => {
    expect(allowed(productionDefaults, 'http://localhost:4000')).toBe(false);
  });
});

describe('CORS: log delle origini', () => {
  it('elenca le origini Capacitor insieme a quelle esplicite', () => {
    const list = corsOriginList(productionDefaults);
    for (const origin of CAPACITOR_ORIGINS) expect(list).toContain(origin);
    expect(list).toContain('http://localhost:5173');
  });
});
