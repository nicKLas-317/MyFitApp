import { useId, useMemo, useState } from 'react';
import { useBody } from '../../body/store';
import { availablePeriods, inPeriod, parseWeighIn, type Period, type WeighIn, type WeighInError } from '../../body/model';
import { formatKg, formatShortDate, localDate } from '../../session/format';
import { LineChart } from '../LineChart';

const ERRORS: Record<WeighInError, string> = {
  invalid_date: 'Date invalide.',
  future_date: 'La date ne peut pas être dans le futur.',
  invalid_weight: 'Poids invalide : saisir un nombre.',
  out_of_range: 'Poids hors des valeurs plausibles (20 à 350 kg).',
};

/** « Mon poids » (§20) : rubrique indépendante des entraînements. */
export function BodyScreen() {
  const { status, data, saveWeighIn, deleteWeighIn } = useBody();
  const today = localDate(Date.now());
  const periods = useMemo(() => availablePeriods(data.weighIns, today), [data.weighIns, today]);
  const [periodKey, setPeriodKey] = useState<Period['key']>('3m');
  const period = periods.find((p) => p.key === periodKey) ?? periods[periods.length - 1]!;
  const shown = inPeriod(data.weighIns, today, period.months);
  const [editing, setEditing] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  return (
    <main className="screen body-screen">
      <header className="simple-header">
        <a href="#/progres" className="back" aria-label="Progrès">
          ‹
        </a>
        <h1>Mon poids</h1>
      </header>

      {status === 'loading' && <p className="muted">Chargement…</p>}
      {status === 'error' && (
        <p className="banner error-inline" role="alert">
          Le suivi du poids est indisponible sur cet appareil. Tes séances ne sont pas concernées.
        </p>
      )}
      {status === 'ready' && (
        <>
          <section className="frame" aria-label="Nouvelle pesée">
            <WeighInForm
              today={today}
              submitLabel="Enregistrer"
              existing={data.weighIns}
              onSubmit={async (w) => {
                const ok = await saveWeighIn(w);
                setFailed(!ok);
                return ok;
              }}
            />
            {failed && (
              <p className="field-error" role="alert">
                Enregistrement impossible : réessaie.
              </p>
            )}
            <p className="muted small height-line">
              <span>
                <span>Taille : {data.heightCm ? `${data.heightCm} cm` : 'non renseignée'}</span>
                <span className="height-link">
                  <a className="link" href="#/reglages">
                    modifier dans les réglages
                  </a>
                </span>
              </span>
            </p>
          </section>

          {data.weighIns.length > 0 && (
            <section aria-label="Évolution">
              <div className="row period-chips" role="group" aria-label="Période">
                {periods.map((p) => (
                  <button key={p.key} type="button" className="chip" aria-pressed={p.key === period.key} onClick={() => setPeriodKey(p.key)}>
                    {p.label}
                  </button>
                ))}
              </div>
              {shown.length > 0 ? (
                <LineChart data={shown.map((w) => ({ date: w.date, value: w.weightKg }))} label="Évolution du poids" unit="kg" testId="body-chart" />
              ) : (
                <p className="muted small">Aucune pesée sur cette période.</p>
              )}
            </section>
          )}

          <section aria-label="Pesées">
            <h2 className="section-title">Pesées</h2>
            {data.weighIns.length === 0 ? (
              <p className="muted">Aucune pesée. Elle n’est jamais obligatoire.</p>
            ) : (
              <ul className="frame weigh-list" aria-label="Historique des pesées">
                {[...data.weighIns].reverse().map((w) => (
                  <li key={w.date} className="weigh-in">
                    {editing === w.date ? (
                      <WeighInForm
                        today={today}
                        initial={w}
                        submitLabel="Enregistrer la correction"
                        existing={data.weighIns.filter((x) => x.date !== w.date)}
                        onCancel={() => setEditing(null)}
                        onDelete={async () => {
                          const ok = await deleteWeighIn(w.date);
                          setFailed(!ok);
                          if (ok) setEditing(null);
                        }}
                        onSubmit={async (next) => {
                          const ok = await saveWeighIn(next, w.date);
                          setFailed(!ok);
                          if (ok) setEditing(null);
                          return ok;
                        }}
                      />
                    ) : (
                      <>
                        <span className="history-date">{formatShortDate(w.date)}</span>
                        <span className="weigh-value">
                          <span>{formatKg(w.weightKg)}</span>
                          <button type="button" className="link" onClick={() => setEditing(w.date)}>
                            Corriger
                          </button>
                        </span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}

export interface FormProps {
  today: string;
  initial?: WeighIn;
  existing: readonly WeighIn[];
  submitLabel: string;
  onSubmit(w: WeighIn): Promise<boolean>;
  onCancel?(): void;
  onDelete?(): Promise<void>;
}

/** Saisie d'une pesée en une action : date préremplie à aujourd'hui (§20). */
export function WeighInForm({ today, initial, existing, submitLabel, onSubmit, onCancel, onDelete }: FormProps) {
  const id = useId();
  const [date, setDate] = useState(initial?.date ?? today);
  const [weight, setWeight] = useState(initial ? String(initial.weightKg).replace('.', ',') : '');
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const replaces = existing.find((w) => w.date === date);

  async function submit() {
    const result = parseWeighIn(date, weight, today);
    if ('errors' in result) return setErrors(result.errors.map((e) => ERRORS[e]));
    setErrors([]);
    const sent = weight;
    // Vide le champ après l'enregistrement, sauf si une nouvelle saisie a commencé entre-temps.
    if ((await onSubmit(result.value)) && !initial) setWeight((current) => (current === sent ? '' : current));
  }

  return (
    <form
      className="weigh-in-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="field-grid">
        <div className="draft-field">
          <label htmlFor={`${id}-date`}>Date</label>
          <input id={`${id}-date`} type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="draft-field">
          <label htmlFor={`${id}-w`}>Poids (kg)</label>
          <input
            id={`${id}-w`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={weight}
            aria-invalid={errors.length > 0}
            onChange={(e) => {
              setWeight(e.target.value);
              setErrors([]);
            }}
          />
        </div>
      </div>
      {replaces && <p className="muted small">Remplace la pesée de cette date ({formatKg(replaces.weightKg)}).</p>}
      {errors.length > 0 && (
        <ul className="problems" role="alert">
          {errors.map((e) => (
            <li key={e} className="problem error">
              {e}
            </li>
          ))}
        </ul>
      )}
      <div className="row">
        <button type="submit" className="btn primary">
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            Annuler
          </button>
        )}
        {onDelete &&
          (confirmDelete ? (
            <>
              <button type="button" className="btn danger" onClick={() => void onDelete()}>
                Oui, supprimer
              </button>
              <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
                Non
              </button>
            </>
          ) : (
            <button type="button" className="link danger" onClick={() => setConfirmDelete(true)}>
              Supprimer
            </button>
          ))}
      </div>
    </form>
  );
}
