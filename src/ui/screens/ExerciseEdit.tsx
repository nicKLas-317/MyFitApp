import { useId, useState } from 'react';
import type { Exercise, MuscleGroup, Variant } from '../../domain/types';
import { useApp } from '../../app/store';
import { navigateBack, navigateReplace } from '../../app/hooks';
import { BODYWEIGHT_RANGE, DEFAULT_VARIANT_CONFIG, resolveConfig, SECONDS_RANGE } from '../../engine';
import {
  createExercise,
  EQUIPMENT_OPTIONS,
  exerciseHasHistory,
  parseList,
  removeVariant,
  setVariantConfig,
  updateExercise,
  validateConfig,
  validateExerciseInput,
  validateVariantName,
  variantHasHistory,
} from '../../library/edit';
import { MUSCLE_GROUP_LABELS } from '../../library/seed';
import { groupColorProps } from '../groupColors';

const GROUPS = Object.keys(MUSCLE_GROUP_LABELS) as MuscleGroup[];

interface VariantForm {
  id: string;
  name: string;
  synonyms: string;
  sets: string;
  minReps: string;
  maxReps: string;
  assisted: boolean;
  bodyweight: boolean;
  seconds: boolean;
  archived: boolean;
  removed: boolean;
}

interface Props {
  /** Exercice modifié ; absent pour une création. */
  exerciseId?: string;
  /** Nom prérempli à la création (texte recherché sans résultat). */
  initialName?: string;
  /** Création depuis l'ajout à la séance : l'exercice créé y est ajouté. */
  forSession?: boolean;
  /** Création depuis l'ajout à la séance prévue (§5.9) : l'exercice créé y est ajouté. */
  forPlan?: boolean;
}

type Mode = 'load' | 'bodyweight' | 'seconds';

const RANGES: Record<Mode, { minReps: number; maxReps: number }> = {
  load: DEFAULT_VARIANT_CONFIG,
  bodyweight: BODYWEIGHT_RANGE,
  seconds: SECONDS_RANGE,
};

const modeOf = (v: VariantForm): Mode => (v.seconds ? 'seconds' : v.bodyweight ? 'bodyweight' : 'load');

/**
 * Passage à charge, au poids du corps ou en secondes : la plage par défaut suit (8 à 12, 10 à 40, 20 à 60 s) si elle
 * n'avait pas été changée ; un exercice en secondes est au poids du corps, et aucun des deux n'est assisté.
 */
function modePatch(v: VariantForm, to: Mode): Partial<VariantForm> {
  const from = RANGES[modeOf(v)];
  const defaultRange = v.minReps === String(from.minReps) && v.maxReps === String(from.maxReps);
  return {
    bodyweight: to !== 'load',
    seconds: to === 'seconds',
    ...(to !== 'load' ? { assisted: false } : {}),
    ...(defaultRange ? { minReps: String(RANGES[to].minReps), maxReps: String(RANGES[to].maxReps) } : {}),
  };
}

/** Création et modification d'un exercice et de ses variantes (§4.3, §14). */
export function ExerciseEdit({ exerciseId, initialName = '', forSession = false, forPlan = false }: Props) {
  const { exercises, sessions, settings, saveExercises, deleteExercise } = useApp();
  const id = useId();
  const original = exerciseId ? exercises.find((e) => e.id === exerciseId) : undefined;

  const [name, setName] = useState(original?.name ?? initialName);
  const [synonyms, setSynonyms] = useState(original?.synonyms.join(', ') ?? '');
  const [primary, setPrimary] = useState<MuscleGroup | null>(original?.primaryGroup ?? null);
  const [secondary, setSecondary] = useState<MuscleGroup[]>(original?.secondaryGroups ?? []);
  const [equipment, setEquipment] = useState(original?.equipment ?? 'machine');
  const [variantForms, setVariantForms] = useState<VariantForm[]>(() =>
    (original?.variants ?? []).map((v) => {
      const cfg = resolveConfig(settings, v.id);
      return {
        id: v.id,
        name: v.name,
        synonyms: v.synonyms.join(', '),
        sets: String(cfg.sets),
        minReps: String(cfg.minReps),
        maxReps: String(cfg.maxReps),
        assisted: cfg.assisted,
        bodyweight: !!cfg.bodyweight,
        seconds: !!cfg.seconds,
        archived: v.archived,
        removed: false,
      };
    }),
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [failed, setFailed] = useState(false);

  if (exerciseId && !original) {
    return (
      <main className="screen">
        <p className="empty">Exercice introuvable.</p>
        <a className="btn primary big" href="#/bibliotheque">
          Bibliothèque
        </a>
      </main>
    );
  }

  const hasHistory = original ? exerciseHasHistory(original, sessions) : false;
  const input = { name, synonyms: parseList(synonyms), primaryGroup: primary, secondaryGroups: secondary, equipment };
  const backHref = original
    ? `#/exercice/${encodeURIComponent(original.id)}`
    : forSession
      ? '#/ajouter'
      : forPlan
        ? '#/seance-prevue/ajouter'
        : '#/bibliotheque';

  function patchVariant(vid: string, patch: Partial<VariantForm>) {
    setVariantForms((list) => list.map((v) => (v.id === vid ? { ...v, ...patch } : v)));
  }

  /** Applique le formulaire à l'exercice ; renvoie les erreurs ou l'exercice prêt à enregistrer. */
  function build(): { errors: string[]; exercise?: Exercise } {
    const list: string[] = [];
    for (const e of validateExerciseInput(input, exercises, original?.id)) {
      list.push(e === 'name_missing' ? 'Saisis un nom.' : e === 'name_taken' ? 'Un autre exercice porte déjà ce nom.' : 'Choisis le groupe musculaire principal.');
    }
    if (list.length > 0 || !original) return { errors: list, exercise: list.length ? undefined : createExercise(input, exercises) };

    let next = updateExercise(original, input);
    for (const form of variantForms) {
      if (form.removed) {
        next = removeVariant(next, form.id);
        continue;
      }
      const standard = form.id === original.id;
      const label = standard ? 'Variante standard' : `Variante « ${form.name.trim() || '?'} »`;
      if (!standard) {
        const err = validateVariantName(next, form.name, form.id);
        if (err) list.push(`${label} : ${err === 'name_missing' ? 'nom manquant' : 'nom déjà utilisé'}.`);
      }
      const cfg = {
        sets: Number(form.sets),
        minReps: Number(form.minReps),
        maxReps: Number(form.maxReps),
        assisted: form.assisted,
        ...(form.bodyweight ? { bodyweight: true } : {}),
        ...(form.seconds ? { seconds: true } : {}),
      };
      const cfgErrors = validateConfig(cfg);
      if (cfgErrors.includes('sets')) list.push(`${label} : nombre de séries entre 1 et 10.`);
      if (cfgErrors.includes('range')) list.push(`${label} : plage ${form.seconds ? 'de durée' : 'de répétitions'} invalide (minimum ≤ maximum).`);
      const current = next.variants.find((v) => v.id === form.id)!;
      const patch: Partial<Variant> = { synonyms: parseList(form.synonyms), archived: form.archived };
      if (!standard) patch.name = form.name.trim().replace(/\s+/g, ' ');
      next = { ...next, variants: next.variants.map((v) => (v.id === current.id ? { ...v, ...patch } : v)) };
      if (cfgErrors.length === 0) next = setVariantConfig(next, form.id, cfg);
    }
    return { errors: list, exercise: list.length ? undefined : next };
  }

  async function save() {
    const result = build();
    setErrors(result.errors);
    if (!result.exercise) return;
    const ok = await saveExercises([result.exercise]);
    setFailed(!ok);
    if (!ok) return;
    if (!original && forSession) navigateReplace('ajouter', result.exercise.id);
    else if (!original && forPlan) navigateReplace('seance-prevue', 'ajouter', result.exercise.id);
    else if (original) navigateBack('exercice', result.exercise.id);
    else navigateReplace('exercice', result.exercise.id);
  }

  async function setArchived(archived: boolean) {
    if (!original) return;
    const ok = await saveExercises([{ ...original, archived }]);
    setFailed(!ok);
    if (ok) navigateBack('exercice', original.id);
  }

  async function remove() {
    if (!original) return;
    const ok = await deleteExercise(original);
    setFailed(!ok);
    if (ok) navigateBack('bibliotheque');
  }

  return (
    <main className="screen edit" {...(original ? groupColorProps(original.primaryGroup) : {})}>
      <header className="simple-header">
        <a href={backHref} className="back" aria-label="Retour">
          ‹
        </a>
        <h1>{original ? 'Modifier l’exercice' : 'Nouvel exercice'}</h1>
      </header>

      <form
        className="edit-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="draft-field">
          <label htmlFor={`${id}-name`}>Nom</label>
          <input id={`${id}-name`} type="text" value={name} autoFocus={!original} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="draft-field">
          <label htmlFor={`${id}-syn`}>Autres noms (français, anglais…)</label>
          <textarea id={`${id}-syn`} rows={2} value={synonyms} placeholder="Séparés par des virgules" onChange={(e) => setSynonyms(e.target.value)} />
        </div>
        <div className="field-grid">
          <div className="draft-field">
            <label htmlFor={`${id}-group`}>Groupe principal</label>
            <select id={`${id}-group`} value={primary ?? ''} onChange={(e) => setPrimary((e.target.value || null) as MuscleGroup | null)}>
              {!primary && <option value="">— Choisir —</option>}
              {GROUPS.map((g) => (
                <option key={g} value={g}>
                  {MUSCLE_GROUP_LABELS[g]}
                </option>
              ))}
            </select>
          </div>
          <div className="draft-field">
            <label htmlFor={`${id}-equip`}>Matériel</label>
            <select id={`${id}-equip`} value={equipment} onChange={(e) => setEquipment(e.target.value)}>
              {!(EQUIPMENT_OPTIONS as readonly string[]).includes(equipment) && <option value={equipment}>{equipment}</option>}
              {EQUIPMENT_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
        </div>
        <fieldset className="chips-field">
          <legend>Groupes secondaires</legend>
          <div className="feeling-options">
            {GROUPS.filter((g) => g !== primary).map((g) => (
              <button
                key={g}
                type="button"
                className="chip"
                aria-pressed={secondary.includes(g)}
                onClick={() => setSecondary((list) => (list.includes(g) ? list.filter((x) => x !== g) : [...list, g]))}
              >
                {MUSCLE_GROUP_LABELS[g]}
              </button>
            ))}
          </div>
        </fieldset>

        {original && (
          <section className="variant-forms">
            <h2 className="section-title">Variantes et réglages</h2>
            {variantForms.map((v) => {
              const standard = v.id === original.id;
              if (v.removed) return null;
              const locked = variantHasHistory(v.id, sessions);
              return (
                <fieldset key={v.id} className="card variant-form" aria-label={standard ? 'Variante standard' : `Variante ${v.name}`}>
                  <legend>{standard ? (v.name && v.name !== 'Standard' ? `Variante standard — ${v.name}` : 'Variante standard') : v.name || 'Variante'}</legend>
                  {!standard && (
                    <div className="draft-field">
                      <label htmlFor={`${id}-${v.id}-name`}>Nom de la variante</label>
                      <input id={`${id}-${v.id}-name`} type="text" value={v.name} onChange={(e) => patchVariant(v.id, { name: e.target.value })} />
                    </div>
                  )}
                  <div className="draft-field">
                    <label htmlFor={`${id}-${v.id}-syn`}>Autres noms de la variante</label>
                    <input id={`${id}-${v.id}-syn`} type="text" value={v.synonyms} onChange={(e) => patchVariant(v.id, { synonyms: e.target.value })} />
                  </div>
                  <div className="field-grid three">
                    <NumberField label="Séries" value={v.sets} onChange={(t) => patchVariant(v.id, { sets: t })} />
                    <NumberField label={v.seconds ? 'Durée min (s)' : 'Rép. min'} value={v.minReps} onChange={(t) => patchVariant(v.id, { minReps: t })} />
                    <NumberField label={v.seconds ? 'Durée max (s)' : 'Rép. max'} value={v.maxReps} onChange={(t) => patchVariant(v.id, { maxReps: t })} />
                  </div>
                  <label className="check-line">
                    <input
                      type="checkbox"
                      checked={v.assisted}
                      onChange={(e) => patchVariant(v.id, { assisted: e.target.checked, ...(e.target.checked ? { bodyweight: false, seconds: false } : {}) })}
                    />
                    <span>Exercice assisté : la charge est une aide (moins d’aide = plus dur)</span>
                  </label>
                  {/* Poids du corps : sans charge enregistrée. Figé dès qu'il existe un historique (charges incompatibles). */}
                  <label className="check-line">
                    <input
                      type="checkbox"
                      checked={v.bodyweight}
                      disabled={locked}
                      onChange={(e) => patchVariant(v.id, modePatch(v, e.target.checked ? 'bodyweight' : 'load'))}
                    />
                    <span>
                      Poids du corps : sans charge, progression par les répétitions
                      {locked && <span className="muted"> (déjà réalisé : non modifiable)</span>}
                    </span>
                  </label>
                  {/* En secondes (gainage) : durée par série, au poids du corps. Figé dès qu'il existe un historique. */}
                  <label className="check-line">
                    <input
                      type="checkbox"
                      checked={v.seconds}
                      disabled={locked}
                      onChange={(e) => patchVariant(v.id, modePatch(v, e.target.checked ? 'seconds' : 'bodyweight'))}
                    />
                    <span>
                      En secondes (gainage) : durée par série, par pas de 5 s
                      {locked && <span className="muted"> (déjà réalisé : non modifiable)</span>}
                    </span>
                  </label>
                  {!standard && (
                    <div className="row">
                      <label className="check-line">
                        <input type="checkbox" checked={v.archived} onChange={(e) => patchVariant(v.id, { archived: e.target.checked })} />
                        <span>Variante archivée</span>
                      </label>
                      {!locked && (
                        <button type="button" className="link danger" onClick={() => patchVariant(v.id, { removed: true })}>
                          Supprimer la variante
                        </button>
                      )}
                    </div>
                  )}
                </fieldset>
              );
            })}
            <p className="muted small">
              Par défaut : 3 séries de 8 à 12 répétitions (de 10 à 40 au poids du corps, de 20 à 60 s en secondes). Un réglage modifié recalcule la progression de la variante.
            </p>
          </section>
        )}

        {errors.length > 0 && (
          <ul className="problems" role="alert">
            {errors.map((e) => (
              <li key={e} className="problem error">
                {e}
              </li>
            ))}
          </ul>
        )}
        {failed && (
          <p className="field-error" role="alert">
            Enregistrement impossible : réessaie.
          </p>
        )}
        <button type="submit" className="btn primary big">
          Enregistrer
        </button>
      </form>

      {original && (
        <section className="danger-zone">
          {original.archived ? (
            <button type="button" className="btn big" onClick={() => void setArchived(false)}>
              Désarchiver l’exercice
            </button>
          ) : (
            <button type="button" className="btn big" onClick={() => void setArchived(true)}>
              Archiver l’exercice
            </button>
          )}
          {hasHistory ? (
            <p className="muted small">Cet exercice a un historique : il peut être archivé (masqué de la recherche), pas supprimé.</p>
          ) : confirmDelete ? (
            <div className="confirm-box">
              <p>Supprimer définitivement « {original.name} » ?</p>
              <div className="row">
                <button type="button" className="btn danger" onClick={() => void remove()}>
                  Oui, supprimer
                </button>
                <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="link danger" onClick={() => setConfirmDelete(true)}>
              Supprimer l’exercice
            </button>
          )}
        </section>
      )}
    </main>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: string; onChange(text: string): void }) {
  const id = useId();
  return (
    <div className="draft-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="text" inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
