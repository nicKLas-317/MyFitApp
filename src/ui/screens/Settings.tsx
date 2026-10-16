import { useEffect, useState } from 'react';
import { useApp } from '../../app/store';
import { parseHeight } from '../../body/model';
import { useBody } from '../../body/store';
import type { CardioMachine, MuscleGroup } from '../../domain/types';
import { machineListErrors, newMachine, type MachineListError } from '../../cardio/model';
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
      <CardioMachinesField />
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

const MACHINE_ERRORS: Record<MachineListError, string> = {
  empty_name: 'Chaque machine doit avoir un nom.',
  duplicate_name: 'Deux machines portent le même nom.',
  empty_list: 'Gardez au moins une machine.',
};

/**
 * Machines de cardio proposées pendant la séance. Renommer ou retirer une machine ne modifie pas
 * les séances déjà enregistrées : chaque bloc garde le nom de sa machine.
 */
function CardioMachinesField() {
  const { cardioMachines, setCardioMachines } = useApp();
  const [list, setList] = useState<CardioMachine[]>(cardioMachines);
  const [added, setAdded] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setList(cardioMachines), [cardioMachines]);
  const dirty = JSON.stringify(list) !== JSON.stringify(cardioMachines);
  const errors = machineListErrors(list);

  const change = (next: CardioMachine[]) => {
    setMessage(null);
    setList(next);
  };

  async function save() {
    if (errors.length > 0) return;
    const ok = await setCardioMachines(list.map((m) => ({ ...m, name: m.name.trim() })));
    setMessage(ok ? { ok: true, text: 'Machines enregistrées.' } : { ok: false, text: 'Enregistrement impossible : réessayez.' });
  }

  return (
    <fieldset className="chips-field cardio-machines">
      <legend>Machines de cardio</legend>
      <ul className="machine-list">
        {list.map((m, i) => (
          <li key={m.id} className="machine-row">
            <input
              type="text"
              aria-label={`Nom de la machine ${i + 1}`}
              value={m.name}
              onChange={(e) => change(list.map((x) => (x.id === m.id ? { ...x, name: e.target.value } : x)))}
            />
            <button
              type="button"
              className="chip"
              aria-pressed={m.incline}
              aria-label={`Inclinaison : ${m.name}`}
              onClick={() => change(list.map((x) => (x.id === m.id ? { ...x, incline: !x.incline } : x)))}
            >
              Inclinaison
            </button>
            <button
              type="button"
              className="link danger small"
              aria-label={`Retirer ${m.name}`}
              disabled={list.length === 1}
              onClick={() => change(list.filter((x) => x.id !== m.id))}
            >
              Retirer
            </button>
          </li>
        ))}
      </ul>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!added.trim()) return;
          change([...list, newMachine(added, false, list)]);
          setAdded('');
        }}
      >
        <input type="text" aria-label="Nouvelle machine" placeholder="Nouvelle machine" value={added} onChange={(e) => setAdded(e.target.value)} />
        <button type="submit" className="btn">
          Ajouter
        </button>
      </form>
      {dirty && errors.length > 0 && (
        <ul className="problems" role="alert">
          {errors.map((e) => (
            <li key={e} className="problem error">
              {MACHINE_ERRORS[e]}
            </li>
          ))}
        </ul>
      )}
      {dirty && (
        <div className="row">
          <button type="button" className="btn primary" disabled={errors.length > 0} onClick={() => void save()}>
            Enregistrer les machines
          </button>
          <button type="button" className="btn" onClick={() => change(cardioMachines)}>
            Annuler
          </button>
        </div>
      )}
      {message && (
        <p className={message.ok ? 'ok-text small' : 'field-error'} role={message.ok ? 'status' : 'alert'}>
          {message.text}
        </p>
      )}
      <p className="muted small">Les séances déjà enregistrées gardent le nom de leur machine.</p>
    </fieldset>
  );
}
