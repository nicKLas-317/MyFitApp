import { useEffect, useState } from 'react';
import { useApp } from '../../app/store';
import { parseHeight } from '../../body/model';
import { useBody } from '../../body/store';

const PERSIST_LABELS = {
  granted: 'accordé',
  denied: 'non accordé (le navigateur peut effacer les données en cas de manque de place)',
  unsupported: 'non pris en charge par ce navigateur',
} as const;

export function Settings() {
  const { persist } = useApp();
  return (
    <main className="screen settings">
      <header className="simple-header">
        <a href="#/" className="back" aria-label="Accueil">
          ‹
        </a>
        <h1>Réglages</h1>
      </header>
      <HeightField />
      <dl className="settings-list">
        <dt>Stockage persistant</dt>
        <dd data-testid="persist-state">{persist ? PERSIST_LABELS[persist] : '…'}</dd>
        <dt>Version</dt>
        <dd>{__APP_VERSION__}</dd>
      </dl>
      <div className="settings-links">
        <a className="btn big" href="#/bibliotheque">
          Exercices, variantes et réglages par exercice
        </a>
        <a className="btn big" href="#/donnees">
          Importer ou exporter mes données
        </a>
      </div>
    </main>
  );
}

/** Taille, saisie une seule fois (§14, §20). Indépendante des séances. */
function HeightField() {
  const { status, data, setHeight } = useBody();
  const [text, setText] = useState(data.heightCm === null ? '' : String(data.heightCm));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setText(data.heightCm === null ? '' : String(data.heightCm)), [data.heightCm]);
  if (status === 'error') return <p className="muted small">Suivi corporel indisponible sur cet appareil.</p>;

  async function save() {
    const parsed = parseHeight(text);
    if ('error' in parsed) return setMessage({ ok: false, text: 'Taille invalide : entre 80 et 250 cm.' });
    const ok = await setHeight(parsed.value);
    setMessage(ok ? { ok: true, text: 'Taille enregistrée.' } : { ok: false, text: 'Enregistrement impossible : réessayez.' });
  }

  return (
    <form
      className="name-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label htmlFor="height">Taille (cm)</label>
      <div className="row">
        <input id="height" type="text" inputMode="numeric" value={text} disabled={status !== 'ready'} onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="btn">
          Enregistrer
        </button>
      </div>
      {message && (
        <p className={message.ok ? 'ok-text small' : 'field-error'} role={message.ok ? 'status' : 'alert'}>
          {message.text}
        </p>
      )}
    </form>
  );
}
