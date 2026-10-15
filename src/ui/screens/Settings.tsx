import { useEffect, useState } from 'react';
import { useApp } from '../../app/store';
import { parseHeight } from '../../body/model';
import { useBody } from '../../body/store';
import type { MuscleGroup } from '../../domain/types';
import { MUSCLE_GROUP_LABELS } from '../../library/seed';
import { Stepper } from '../ExerciseCard';

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
      <RecapSettingsField />
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

const RECAP_CHOICES: MuscleGroup[] = ['pectoraux', 'dos', 'epaules', 'biceps', 'triceps', 'jambes', 'abdominaux'];

/** Récapitulatif hebdomadaire de l'accueil (§19.6) : groupes affichés et seuil du rouge. */
function RecapSettingsField() {
  const { recapSettings, setRecapSettings } = useApp();
  const [failed, setFailed] = useState(false);
  const save = async (next: typeof recapSettings) => setFailed(!(await setRecapSettings(next)));

  return (
    <fieldset className="chips-field recap-settings">
      <legend>Récapitulatif de la semaine</legend>
      <div className="feeling-options" role="group" aria-label="Groupes affichés">
        {RECAP_CHOICES.map((g) => {
          const on = recapSettings.groups.includes(g);
          return (
            <button
              key={g}
              type="button"
              className="chip"
              aria-pressed={on}
              disabled={on && recapSettings.groups.length === 1}
              onClick={() => {
                const groups = on ? recapSettings.groups.filter((x) => x !== g) : RECAP_CHOICES.filter((x) => x === g || recapSettings.groups.includes(x));
                void save({ ...recapSettings, groups });
              }}
            >
              {MUSCLE_GROUP_LABELS[g]}
            </button>
          );
        })}
      </div>
      <Stepper
        label="Rouge à partir de (séances)"
        value={recapSettings.redThreshold}
        min={2}
        max={7}
        onChange={(redThreshold) => void save({ ...recapSettings, redThreshold })}
      />
      {failed && (
        <p className="field-error" role="alert">
          Enregistrement impossible : réessayez.
        </p>
      )}
    </fieldset>
  );
}
