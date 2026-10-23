import { useId, useState } from 'react';
import { useApp } from '../app/store';
import { activityLabel, HABIT_GROUPS, knownActivities, oneOffActivity, type OneOffError } from '../activities/model';
import type { MuscleGroup } from '../domain/types';
import { MUSCLE_GROUP_LABELS } from '../library/seed';
import { formatShortDate, localDate } from '../session/format';

const ERRORS: Record<OneOffError, string> = {
  empty_name: 'Nom de l’activité manquant.',
  bad_minutes: 'Durée invalide : un nombre entier de minutes, de 1 à 600.',
  bad_date: 'Date invalide.',
  future_date: 'La date ne peut pas être dans le futur.',
  already_recorded: 'Cette activité est déjà enregistrée ce jour-là.',
};

/**
 * Activité ponctuelle hors salle (futsal de temps en temps…), saisie depuis l'onglet Séance : activité (déjà connue,
 * habitudes désactivées comprises, ou nouveau nom), date (aujourd'hui par défaut), durée et groupes, préremplis d'après
 * la dernière fois ou l'habitude. Elle compte ensuite comme une activité habituelle confirmée.
 */
export function ActivityEntry() {
  const { habits, activities, addActivity } = useApp();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  return (
    <>
      {open ? (
        <ActivityForm
          known={knownActivities(habits, activities)}
          onCancel={() => setOpen(false)}
          onSave={async (input) => {
            const result = oneOffActivity(input, habits, activities, Date.now());
            if ('errors' in result) return result.errors.map((e) => ERRORS[e]);
            if (!(await addActivity(result.record))) return ['Activité non enregistrée : réessaie.'];
            setOpen(false);
            setSaved(`Activité enregistrée : ${activityLabel(result.record)}, ${formatShortDate(result.record.date)}.`);
            return [];
          }}
        />
      ) : (
        <button
          type="button"
          className="link add-activity"
          onClick={() => {
            setSaved(null);
            setOpen(true);
          }}
        >
          + Activité
        </button>
      )}
      {saved && (
        <p className="muted small" role="status">
          {saved}
        </p>
      )}
    </>
  );
}

interface FormProps {
  known: ReturnType<typeof knownActivities>;
  onCancel(): void;
  /** Renvoie les messages d'erreur ; liste vide = enregistrée. */
  onSave(input: { name: string; date: string; minutes: number; groups: MuscleGroup[] }): Promise<string[]>;
}

function ActivityForm({ known, onCancel, onSave }: FormProps) {
  const id = useId();
  const today = localDate(Date.now());
  // Présélection : seulement une activité hors habitude active (le futsal), jamais le badminton par erreur.
  const first = known[0]?.habitual ? undefined : known[0];
  /** Nom choisi ; `null` : « Autre » (nouveau nom) ; `undefined` : rien de choisi. */
  const [chosen, setChosen] = useState<string | null | undefined>(known.length === 0 ? null : first?.name);
  const [name, setName] = useState('');
  const [date, setDate] = useState(today);
  const [minutes, setMinutes] = useState(first ? String(first.minutes) : '');
  const [groups, setGroups] = useState<MuscleGroup[]>(first?.groups ?? []);
  const [errors, setErrors] = useState<string[]>([]);

  const choose = (activity: (typeof known)[number] | null) => {
    setErrors([]);
    setChosen(activity?.name ?? null);
    setMinutes(activity ? String(activity.minutes) : '');
    setGroups(activity?.groups ?? []);
  };

  async function submit() {
    const text = minutes.trim();
    const value = /^\d+$/.test(text) ? Number(text) : NaN;
    if (chosen === undefined) return setErrors(['Choisis une activité.']);
    setErrors(await onSave({ name: chosen ?? name, date, minutes: value, groups }));
  }

  return (
    <form
      className="card activity-form"
      aria-label="Activité ponctuelle"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {known.length > 0 && (
        <fieldset className="chips-field">
          <legend>Activité</legend>
          <div className="feeling-options">
            {known.map((a) => (
              <button key={a.name} type="button" className="chip" aria-pressed={chosen === a.name} onClick={() => choose(a)}>
                {a.name}
              </button>
            ))}
            <button type="button" className="chip" aria-pressed={chosen === null} onClick={() => choose(null)}>
              Autre
            </button>
          </div>
        </fieldset>
      )}
      {chosen === null && (
        <div className="draft-field">
          <label htmlFor={`${id}-name`}>Nom de l’activité</label>
          <input id={`${id}-name`} type="text" value={name} autoFocus={known.length > 0} onChange={(e) => setName(e.target.value)} />
        </div>
      )}
      <div className="field-grid">
        <div className="draft-field">
          <label htmlFor={`${id}-date`}>Date</label>
          <input id={`${id}-date`} type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="draft-field">
          <label htmlFor={`${id}-min`}>Durée (min)</label>
          <input id={`${id}-min`} type="text" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </div>
      </div>
      <fieldset className="chips-field">
        <legend>Groupes sollicités</legend>
        <div className="feeling-options">
          {HABIT_GROUPS.map((g) => {
            const on = groups.includes(g);
            return (
              <button
                key={g}
                type="button"
                className="chip"
                aria-pressed={on}
                onClick={() => setGroups(on ? groups.filter((x) => x !== g) : HABIT_GROUPS.filter((x) => x === g || groups.includes(x)))}
              >
                {MUSCLE_GROUP_LABELS[g]}
              </button>
            );
          })}
        </div>
      </fieldset>
      {errors.length > 0 && (
        <ul className="problems" role="alert">
          {errors.map((e) => (
            <li key={e} className="field-error">
              {e}
            </li>
          ))}
        </ul>
      )}
      <div className="row">
        <button type="submit" className="btn primary">
          Enregistrer l’activité
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </form>
  );
}
