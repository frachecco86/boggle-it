import { useState } from 'react';
import { AVATARS, type Avatar } from '../avatars.js';

interface AvatarPickerProps {
  value: Avatar;
  onChange: (a: Avatar) => void;
}

/** Selettore avatar a comparsa: griglia di emoji, nessun asset. */
export function AvatarPicker({ value, onChange }: AvatarPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="avatar-picker">
      <button
        type="button"
        className="avatar-picker__current"
        onClick={() => setOpen((v) => !v)}
        aria-label="Scegli avatar"
        aria-expanded={open}
      >
        <span className="avatar-picker__emoji" aria-hidden>
          {value}
        </span>
        <span className="avatar-picker__hint">{open ? 'Chiudi' : 'Cambia avatar'}</span>
      </button>

      {open && (
        <div className="avatar-picker__grid" role="listbox" aria-label="Avatar disponibili">
          {AVATARS.map((a) => (
            <button
              key={a}
              type="button"
              role="option"
              aria-selected={a === value}
              className={`avatar-picker__option${a === value ? ' avatar-picker__option--active' : ''}`}
              onClick={() => {
                onChange(a);
                setOpen(false);
              }}
            >
              {a}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
