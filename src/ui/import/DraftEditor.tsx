import { useId, useMemo, useState } from 'react';
import type { CardioMachine, Exercise, Feeling, MuscleGroup } from '../../domain/types';
import { INCLINE_LABELS, INCLINES, parseDistance, parseMinutes } from '../../cardio/model';
import type { Evaluation } from '../../engine';
import { displayName, indexVariants } from '../../library/catalog';
import { MUSCLE_GROUP_LABELS } from '../../library/seed';
import { parseWeight } from '../../session/ops';
import {
  setDraftDate,
  updateDraftCardio,
  updateDraftExercise,
  type DraftCardio,
  type DraftExercise,
  type DraftProblem,
  type DraftSession,
  type ExerciseChoice,
} from '../../transfer/draft';
import { FEELING_LABELS } from '../labels';
import { StatusBadge } from '../StatusBadge';

const NEW_EXERCISE = '__new_exercise';
const NEW_VARIANT = '__new_variant';
const GROUPS = Object.keys(MUSCLE_GROUP_LABELS) as MuscleGroup[];
const FEELING_ORDER: Feeling[] = ['tres_bien', 'bien', 'moyen', 'mal', 'tres_mal', 'inconnu'];

export function ProblemList({ problems }: { problems: readonly DraftProblem[] }) {
  if (problems.length === 0) return null;
  return (
    <ul className="problems">
      {problems.map((p, i) => (
        <li key={`${p.code}-${i}`} className={`problem ${p.level}`} data-code={p.code}>
          {p.message}
        </li>
      ))}
    </ul>
  );
}

const DATE_HINTS: Record<DraftSession['dateSource'], string> = {
  text: 'Date trouvée dans les notes.',
  json: 'Date indiquée dans le fichier.',
  today: 'Aucune date trouvée : date du jour proposée.',
};

interface SessionProps {
  draft: DraftSession;
  problems: readonly DraftProblem[];
  evaluations: Map<string, Evaluation | null> | undefined;
  exercises: readonly Exercise[];
  machines: readonly CardioMachine[];
  onChange(next: DraftSession): void;
}

/** Séance détectée, corrigeable avant confirmation (§11.2, §11.8). */
export function DraftSessionEditor({ draft, problems, evaluations, exercises, machines, onChange }: SessionProps) {
  const id = useId();
  const duplicate = draft.allowDuplicate || problems.some((p) => p.code === 'duplicate_session');
  const sessionProblems = problems.filter((p) => !p.exerciseKey && p.code !== 'duplicate_session' && p.code !== 'date_unconfirmed');

  return (
    <section className="draft" aria-label="Séance détectée">
      <div className="draft-field">
        <label htmlFor={`${id}-date`}>Date de la séance</label>
        <div className="row">
          <input
            id={`${id}-date`}
            type="date"
            value={draft.date}
            required
            onChange={(e) => {
              if (e.target.value) onChange(setDraftDate(draft, e.target.value));
            }}
          />
          {draft.dateConfirmed ? (
            <span className="ok-text">✓ Date confirmée</span>
          ) : (
            <button type="button" className="btn primary" onClick={() => onChange({ ...draft, dateConfirmed: true })}>
              Confirmer la date
            </button>
          )}
        </div>
        <p className="muted small">
          {DATE_HINTS[draft.dateSource]}
          {draft.dateYearAssumed && ' Année absente des notes : vérifiez-la.'}
        </p>
      </div>

      <div className="draft-field">
        <label htmlFor={`${id}-name`}>Nom</label>
        <input id={`${id}-name`} type="text" value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value, nameAuto: false })} />
      </div>

      {duplicate && (
        <label className="check-line warn">
          <input type="checkbox" checked={draft.allowDuplicate} onChange={(e) => onChange({ ...draft, allowDuplicate: e.target.checked })} />
          <span>Une séance identique existe déjà à cette date. Importer quand même ce doublon.</span>
        </label>
      )}
      <ProblemList problems={sessionProblems} />

      <ol className="draft-exercises">
        {draft.exercises.map((e) => (
          <li key={e.key}>
            <DraftExerciseEditor
              entry={e}
              problems={problems.filter((p) => p.exerciseKey === e.key)}
              evaluation={evaluations?.get(e.key)}
              exercises={exercises}
              onChange={(patch) => onChange(updateDraftExercise(draft, e.key, patch))}
            />
          </li>
        ))}
      </ol>

      {draft.cardio.length > 0 && (
        <ol className="draft-exercises draft-cardio">
          {draft.cardio.map((c) => (
            <li key={c.key}>
              <DraftCardioEditor
                entry={c}
                machines={machines}
                problems={problems.filter((p) => p.exerciseKey === c.key)}
                onChange={(patch) => onChange(updateDraftCardio(draft, c.key, patch))}
              />
            </li>
          ))}
        </ol>
      )}

      {draft.sourceText && (
        <details className="source-text">
          <summary>Texte d’origine</summary>
          <pre>{draft.sourceText}</pre>
        </details>
      )}
    </section>
  );
}

interface ExerciseProps {
  entry: DraftExercise;
  problems: readonly DraftProblem[];
  evaluation: Evaluation | null | undefined;
  exercises: readonly Exercise[];
  onChange(patch: Partial<DraftExercise>): void;
}

function choiceValue(choice: ExerciseChoice | null): string {
  if (!choice) return '';
  if (choice.kind === 'variant') return choice.variantId;
  return choice.kind === 'new_exercise' ? NEW_EXERCISE : NEW_VARIANT;
}

function DraftExerciseEditor({ entry, problems, evaluation, exercises, onChange }: ExerciseProps) {
  const id = useId();
  const variants = useMemo(() => indexVariants(exercises), [exercises]);
  const active = exercises.filter((e) => !e.archived);
  const choice = entry.choice;
  // Exercice de référence pour créer une variante : celui choisi, sinon celui proposé.
  const parentId =
    choice?.kind === 'variant'
      ? variants.get(choice.variantId)?.exercise.id
      : choice?.kind === 'new_variant'
        ? choice.exerciseId
        : entry.match.suggestion
          ? variants.get(entry.match.suggestion)?.exercise.id
          : undefined;
  const parent = active.find((e) => e.id === parentId);
  const title = entry.sourceName || 'Sans nom';

  function select(value: string) {
    if (value === NEW_EXERCISE) onChange({ choice: { kind: 'new_exercise', name: entry.sourceName, primaryGroup: null } });
    else if (value === NEW_VARIANT && parent) onChange({ choice: { kind: 'new_variant', exerciseId: parent.id, name: entry.match.qualifier ?? '' } });
    else if (value) onChange({ choice: { kind: 'variant', variantId: value } });
  }

  return (
    <article className={`card draft-exercise${entry.include ? '' : ' excluded'}`} aria-label={title} data-key={entry.key}>
      <div className="draft-head">
        <div>
          <strong>{title}</strong>
          {entry.sourceLine && <div className="muted small source-line">{entry.sourceLine}</div>}
        </div>
        {entry.include && (evaluation ? <StatusBadge status={evaluation.status} /> : null)}
      </div>

      <label className="check-line">
        <input type="checkbox" checked={entry.include} onChange={(e) => onChange({ include: e.target.checked })} />
        <span>Importer cet exercice</span>
      </label>

      {entry.include && (
        <>
          <div className="draft-field">
            <label htmlFor={`${id}-ex`}>Exercice</label>
            <select id={`${id}-ex`} value={choiceValue(choice)} onChange={(e) => select(e.target.value)}>
              {!choice && <option value="">— Choisir —</option>}
              {entry.match.candidates.length > 0 && (
                <optgroup label="Propositions">
                  {entry.match.candidates.map((c) => (
                    <option key={c.variantId} value={c.variantId}>
                      {displayName(variants.get(c.variantId))}
                    </option>
                  ))}
                </optgroup>
              )}
              {GROUPS.map((g) => {
                const list = active.filter((e) => e.primaryGroup === g);
                if (list.length === 0) return null;
                return (
                  <optgroup key={g} label={MUSCLE_GROUP_LABELS[g]}>
                    {list.flatMap((e) =>
                      e.variants
                        .filter((v) => !v.archived && !entry.match.candidates.some((c) => c.variantId === v.id))
                        .map((v) => (
                          <option key={v.id} value={v.id}>
                            {displayName({ exercise: e, variant: v })}
                          </option>
                        )),
                    )}
                  </optgroup>
                );
              })}
              <optgroup label="Créer">
                <option value={NEW_EXERCISE}>Nouvel exercice…</option>
                {parent && <option value={NEW_VARIANT}>Nouvelle variante de « {parent.name} »…</option>}
              </optgroup>
            </select>
          </div>

          {choice?.kind === 'new_exercise' && (
            <div className="field-grid">
              <div className="draft-field">
                <label htmlFor={`${id}-new-name`}>Nom du nouvel exercice</label>
                <input
                  id={`${id}-new-name`}
                  type="text"
                  value={choice.name}
                  onChange={(e) => onChange({ choice: { ...choice, name: e.target.value } })}
                />
              </div>
              <div className="draft-field">
                <label htmlFor={`${id}-group`}>Groupe musculaire</label>
                <select
                  id={`${id}-group`}
                  value={choice.primaryGroup ?? ''}
                  onChange={(e) => onChange({ choice: { ...choice, primaryGroup: (e.target.value || null) as MuscleGroup | null } })}
                >
                  <option value="">— Choisir —</option>
                  {GROUPS.map((g) => (
                    <option key={g} value={g}>
                      {MUSCLE_GROUP_LABELS[g]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          {choice?.kind === 'new_variant' && (
            <div className="draft-field">
              <label htmlFor={`${id}-variant`}>Nom de la variante de « {parent?.name ?? ''} »</label>
              <input
                id={`${id}-variant`}
                type="text"
                value={choice.name}
                placeholder="ex. 70°, prise serrée"
                onChange={(e) => onChange({ choice: { ...choice, name: e.target.value } })}
              />
            </div>
          )}

          <div className="field-grid">
            <TextField
              label="Poids (kg)"
              inputMode="decimal"
              initial={entry.weightKg === null ? '' : String(entry.weightKg).replace('.', ',')}
              onChange={(t) => onChange({ weightKg: t.trim() ? parseWeight(t) : null })}
            />
            <TextField
              label="Répétitions"
              inputMode="text"
              placeholder="8-8-8"
              initial={entry.reps?.join('-') ?? ''}
              onChange={(t) => onChange({ reps: t.trim() ? (t.match(/\d+/g) ?? []).map(Number) : null })}
            />
            <TextField
              label="Séries prévues"
              inputMode="numeric"
              initial={entry.plannedSets === null ? '' : String(entry.plannedSets)}
              onChange={(t) => onChange({ plannedSets: readInt(t) })}
            />
            <TextField
              label="Cible"
              inputMode="numeric"
              initial={entry.targetReps === null ? '' : String(entry.targetReps)}
              onChange={(t) => onChange({ targetReps: readInt(t) })}
            />
          </div>

          <div className="draft-field">
            <label htmlFor={`${id}-feeling`}>
              Ressenti{entry.feelingSymbol ? ` (symbole lu : « ${entry.feelingSymbol} »)` : ''}
            </label>
            <select
              id={`${id}-feeling`}
              value={entry.feelingConfirmed ? entry.feeling : ''}
              onChange={(e) => {
                if (e.target.value) onChange({ feeling: e.target.value as Feeling, feelingConfirmed: true });
              }}
            >
              {!entry.feelingConfirmed && <option value="">— À choisir —</option>}
              {FEELING_ORDER.map((f) => (
                <option key={f} value={f}>
                  {f === 'inconnu' ? 'Inconnu' : FEELING_LABELS[f]}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      <ProblemList problems={entry.include ? problems : []} />
      {entry.include && entry.toConfirm.length > 0 &&
        (entry.checksConfirmed ? (
          <p className="ok-text small">✓ Points vérifiés : {entry.toConfirm.join(' ')}</p>
        ) : (
          <button type="button" className="btn" onClick={() => onChange({ checksConfirmed: true })}>
            J’ai vérifié
          </button>
        ))}
    </article>
  );
}

interface CardioProps {
  entry: DraftCardio;
  machines: readonly CardioMachine[];
  problems: readonly DraftProblem[];
  onChange(patch: Partial<DraftCardio>): void;
}

/** Bloc de cardio lu : machine, inclinaison (tapis), durée, distance ; rien n'est deviné. */
function DraftCardioEditor({ entry, machines, problems, onChange }: CardioProps) {
  const id = useId();
  const title = entry.sourceName || 'Cardio';
  // La machine reconnue reste proposée même si elle n'est plus dans la liste.
  const list = entry.machine && !machines.some((m) => m.id === entry.machine!.id) ? [...machines, entry.machine] : machines;
  return (
    <article className={`card draft-cardio-entry${entry.include ? '' : ' excluded'}`} aria-label={`Cardio : ${title}`} data-key={entry.key}>
      <div className="draft-head">
        <div>
          <span className="tag">Cardio</span> <strong>{title}</strong>
          {entry.sourceLine && <div className="muted small source-line">{entry.sourceLine}</div>}
        </div>
      </div>
      <label className="check-line">
        <input type="checkbox" checked={entry.include} onChange={(e) => onChange({ include: e.target.checked })} />
        <span>Importer ce cardio</span>
      </label>
      {entry.include && (
        <>
          <div className="draft-field">
            <label htmlFor={`${id}-machine`}>Machine</label>
            <select
              id={`${id}-machine`}
              value={entry.machine?.id ?? ''}
              onChange={(e) => {
                const machine = list.find((m) => m.id === e.target.value);
                if (machine) onChange({ machine });
              }}
            >
              {!entry.machine && <option value="">— Choisir —</option>}
              {list.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          {entry.machine?.incline && (
            <fieldset className="chips-field">
              <legend>Inclinaison</legend>
              <div className="feeling-options">
                {INCLINES.map((x) => (
                  <button key={x} type="button" className="chip" aria-pressed={entry.incline === x} onClick={() => onChange({ incline: x })}>
                    {INCLINE_LABELS[x]}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          <div className="field-grid">
            <TextField
              label="Durée (min)"
              inputMode="numeric"
              initial={entry.minutes === null ? '' : String(entry.minutes)}
              onChange={(t) => onChange({ minutes: parseMinutes(t) ?? (t.trim() ? -1 : null) })}
            />
            <TextField
              label="Distance (km, facultatif)"
              inputMode="decimal"
              initial={entry.distanceKm === null ? '' : String(entry.distanceKm).replace('.', ',')}
              onChange={(t) => {
                const km = parseDistance(t);
                onChange({ distanceKm: km === undefined ? null : (km ?? -1) });
              }}
            />
          </div>
        </>
      )}
      <ProblemList problems={entry.include ? problems : []} />
    </article>
  );
}

function readInt(text: string): number | null {
  const t = text.trim();
  return /^\d+$/.test(t) ? Number(t) : null;
}

interface TextFieldProps {
  label: string;
  initial: string;
  inputMode: 'decimal' | 'numeric' | 'text';
  placeholder?: string;
  onChange(text: string): void;
}

/** Champ texte libre : la saisie reste telle quelle, la valeur interprétée remonte à chaque frappe. */
function TextField({ label, initial, inputMode, placeholder, onChange }: TextFieldProps) {
  const id = useId();
  const [text, setText] = useState(initial);
  return (
    <div className="draft-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        inputMode={inputMode}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value);
        }}
      />
    </div>
  );
}
