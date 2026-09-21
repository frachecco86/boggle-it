import { PROFILE_LIMITS } from '@boggle/shared';
import { useAppStore } from '../state/store.js';
import { AvatarPicker } from '../components/AvatarPicker.js';
import { BackHome } from '../components/BackHome.js';
import { PhotoEditor } from '../components/PhotoEditor.js';
import { SfxRecorder } from '../components/SfxRecorder.js';
import { MusicPicker } from '../components/MusicPicker.js';
import type { Avatar } from '../avatars.js';

/**
 * Il mio profilo: foto, suoni personali per lunghezza parola e musica preferita.
 * Tutto sincronizzato sul server.
 *
 * La foto viene solo ritagliata al centro (256×256) nel browser: niente filtri
 * né stili AI, che sono stati rimossi perché aggiungevano complessità e un
 * modello da 8 MB per un risultato che non serviva al gioco.
 */
export function ProfileScreen() {
  const {
    profile,
    profileBusy,
    profileError,
    sfxUrls,
    setScreen,
    setProfileAvatar,
    saveProfilePhoto,
    saveProfileSfx,
    deleteProfileSfx,
    setProfileMusic,
    logoutProfile,
  } = useAppStore();

  if (!profile) {
    return (
      <div className="screen">
        <h2 className="screen__title">Nessun profilo attivo</h2>
        <p className="screen__hint">Crea o accedi a un profilo per personalizzare foto e suoni.</p>
        <button className="btn btn--primary" onClick={() => setScreen('profiles')}>
          Vai ai profili
        </button>
      </div>
    );
  }

  return (
    <div className="screen profile">
      <BackHome />

      <header className="profile__head">
        <h2 className="screen__title">{profile.nickname}</h2>
        <p className="screen__hint">
          Profilo creato il {new Date(profile.createdAt).toLocaleDateString('it-IT')}
        </p>
      </header>

      {profileError && <div className="banner banner--error">{profileError}</div>}

      <section className="profile-section">
        <h3 className="summary__label">Avatar</h3>
        <AvatarPicker
          value={profile.avatar as Avatar}
          onChange={(a) => void setProfileAvatar(a)}
        />
      </section>

      <section className="profile-section">
        <h3 className="summary__label">Foto profilo</h3>
        <PhotoEditor
          currentUrl={profile.photoUrl}
          busy={profileBusy}
          onChange={(dataUrl) => void saveProfilePhoto(dataUrl)}
        />
      </section>

      <SfxRecorder
        clips={sfxUrls}
        maxDurationMs={PROFILE_LIMITS.sfxMaxDurationMs}
        onSave={saveProfileSfx}
        onDelete={deleteProfileSfx}
      />

      <MusicPicker
        value={profile.musicId}
        onChange={(choice) => void setProfileMusic(choice)}
        title="La mia musica"
        hint="La tua preferenza per il single player. In multiplayer la musica la scegle l'host."
      />

      <div className="summary__actions">
        <button className="btn btn--ghost" onClick={() => setScreen('profiles')}>
          Cambia profilo
        </button>
        <button className="btn btn--ghost" onClick={() => void logoutProfile()}>
          Esci
        </button>
      </div>
    </div>
  );
}
