import { useEffect, useId, useState } from 'react';
import type { CardioBlock, CardioMachine, Incline } from '../domain/types';
import { ActionMenu, ConfirmRemove } from './ActionMenu';
import { cardioErrors, formatCardio, INCLINE_LABELS, INCLINES, makeCardioBlock, parseDistance, parseMinutes } from '../cardio/model';

/** Contenu du formulaire : rien de saisi, bloc prêt à enregistrer, ou saisie invalide. */
export type CardioDraft = { kind: 'empty' } | { kind: 'block'; block: CardioBlock } | { kind: 'error'; message: string };

/** Valeurs saisies du formulaire, gardées hors du composant pour survivre à un changement d'écran. */
export interface CardioFormValues {
  machineId: string;
  incline: Incline;
  minutes: string;
  distance: string;
}

export interface CardioFormMemory {
  current: CardioFormValues | null;
}

interface FormProps {
  machines: readonly CardioMachine[];
  /** Bloc corrigé ; absent pour un nouveau bloc. */
  initial?: CardioBlock;
  newId(): string;
  onSave(block: CardioBlock): void;
  onCancel(): void;
  /** Suit la saisie en cours, pour ne pas perdre un bloc rempli mais pas encore validé. */
  onDraft?(draft: CardioDraft): void;
  /** Saisie gardée en mémoire : retrouvée si l'on quitte l'écran puis revient (bouton retour, fiche…). */
  memory?: CardioFormMemory;
}

/**
 * Saisie d'un bloc de cardio en quelques secondes : machine, inclinaison (tapis seulement, Neutre par défaut),
 * durée, puis « Valider ». Distance facultative.
 */
export function CardioForm({ machines, initial, newId, onSave, onCancel, onDraft, memory }: FormProps) {
  const id = useId();
  // Une machine retirée des réglages reste proposée pour corriger un bloc qui l'utilise.
  const list =
    initial && !machines.some((m) => m.id === initial.machineId)
      ? [...machines, { id: initial.machineId, name: initial.machine, incline: initial.incline !== undefined }]
      : machines;
  const kept = memory?.current;
  const [machineId, setMachineId] = useState(kept?.machineId ?? initial?.machineId ?? list[0]?.id ?? '');
  const [incline, setIncline] = useState<Incline>(kept?.incline ?? initial?.incline ?? 'neutre');
  const [minutes, setMinutes] = useState(kept?.minutes ?? (initial ? String(initial.minutes) : ''));
  const [distance, setDistance] = useState(kept?.distance ?? (initial?.distanceKm !== undefined ? String(initial.distanceKm).replace('.', ',') : ''));
  if (memory) memory.current = { machineId, incline, minutes, distance };
  const [error, setError] = useState<string | null>(null);
  const [blockId] = useState(() => initial?.id ?? newId());
  const machine = list.find((m) => m.id === machineId);

  function read(): CardioDraft {
    if (!initial && !minutes.trim() && !distance.trim()) return { kind: 'empty' };
    if (!machine) return { kind: 'error', message: 'Choisis une machine.' };
    const value = parseMinutes(minutes);
    const km = parseDistance(distance);
    if (value === null) return { kind: 'error', message: 'Durée invalide : un nombre entier de minutes.' };
    if (km === null) return { kind: 'error', message: 'Distance invalide.' };
    const input = { machine, incline, minutes: value, distanceKm: km };
    if (cardioErrors(input).length > 0) return { kind: 'error', message: 'Bloc de cardio invalide.' };
    // Le nom enregistré reste celui du bloc corrigé si la machine n'a pas changé.
    const named = initial && initial.machineId === machine.id ? { ...machine, name: initial.machine } : machine;
    return { kind: 'block', block: makeCardioBlock({ ...input, machine: named }, blockId) };
  }

  const draft = read();
  const draftKey = JSON.stringify(draft);
  useEffect(() => {
    onDraft?.(draft);
  }, [draftKey]);

  function submit() {
    if (draft.kind === 'block') onSave(draft.block);
    else setError(draft.kind === 'error' ? draft.message : 'Durée invalide : un nombre entier de minutes.');
  }

  return (
    <form
      className="card cardio-form"
      aria-label="Cardio"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <fieldset className="chips-field">
        <legend>Machine</legend>
        <div className="feeling-options">
          {list.map((m) => (
            <button key={m.id} type="button" className="chip" aria-pressed={m.id === machineId} onClick={() => setMachineId(m.id)}>
              {m.name}
            </button>
          ))}
        </div>
      </fieldset>
      {machine?.incline && (
        <fieldset className="chips-field">
          <legend>Inclinaison</legend>
          <div className="feeling-options">
            {INCLINES.map((x) => (
              <button key={x} type="button" className="chip" aria-pressed={x === incline} onClick={() => setIncline(x)}>
                {INCLINE_LABELS[x]}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <div className="field-grid">
        <div className="draft-field">
          <label htmlFor={`${id}-min`}>Durée (min)</label>
          <input id={`${id}-min`} type="text" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </div>
        <div className="draft-field">
          <label htmlFor={`${id}-km`}>Distance (km, facultatif)</label>
          <input id={`${id}-km`} type="text" inputMode="decimal" value={distance} onChange={(e) => setDistance(e.target.value)} />
        </div>
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button type="submit" className="btn primary">
          Valider
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </form>
  );
}

interface ListProps {
  blocks: readonly CardioBlock[];
  machines: readonly CardioMachine[];
  newId(): string;
  onSave(block: CardioBlock): void;
  onRemove(block: CardioBlock): void;
}

/** Blocs de cardio d'une séance : « Corriger » et « Retirer » (après confirmation) dans le menu « ⋯ » de chaque bloc. */
export function CardioList({ blocks, machines, newId, onSave, onRemove }: ListProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  if (blocks.length === 0) return null;
  return (
    <ul className="recap-list cardio-list" aria-label="Cardio">
      {blocks.map((b) =>
        editing === b.id ? (
          <li key={b.id}>
            <CardioForm
              machines={machines}
              initial={b}
              newId={newId}
              onCancel={() => setEditing(null)}
              onSave={(next) => {
                setEditing(null);
                onSave(next);
              }}
            />
          </li>
        ) : (
          <li key={b.id} className="card recap-item cardio-item" data-cardio={b.id}>
            <div className="card-line">
              <CardioLine block={b} />
              <ActionMenu
                label={`cardio ${formatCardio(b)}`}
                actions={[
                  { label: 'Corriger', onSelect: () => setEditing(b.id) },
                  { label: 'Retirer', danger: true, onSelect: () => setRemoving(b.id) },
                ]}
              />
            </div>
            {removing === b.id && (
              <ConfirmRemove
                question="Retirer ce cardio de la séance ?"
                onCancel={() => setRemoving(null)}
                onConfirm={() => {
                  setRemoving(null);
                  onRemove(b);
                }}
              />
            )}
          </li>
        ),
      )}
    </ul>
  );
}

/** « Cardio · Tapis de marche · inclinaison haute · 20 min » ; « Prévu · … » pour un cardio de la séance prévue. */
export function CardioLine({ block, prefix = 'Cardio' }: { block: CardioBlock; prefix?: string }) {
  return (
    <div className="cardio-line">
      <span className="tag">{prefix}</span> <span data-testid="cardio-text">{formatCardio(block)}</span>
    </div>
  );
}
