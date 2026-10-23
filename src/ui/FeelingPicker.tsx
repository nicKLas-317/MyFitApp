import type { Feeling } from '../domain/types';
import type { RatedFeeling } from '../session/ops';
import { FEELINGS } from './labels';

interface Props {
  value: Feeling;
  legend: string;
  onChange(feeling: RatedFeeling): void;
}

/**
 * Ressenti global sur cinq niveaux (§5.5) : on peut changer de niveau, jamais revenir à « inconnu ». Boutons de 48 px,
 * libellés sur une ligne, sur deux rangées si l'écran est étroit. `data-empty` : aucun niveau choisi.
 */
export function FeelingPicker({ value, legend, onChange }: Props) {
  return (
    <fieldset className="feeling" data-empty={value === 'inconnu' || undefined}>
      <legend>{legend}</legend>
      <div className="feeling-options">
        {FEELINGS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={`chip feeling-${f.value}`}
            aria-pressed={value === f.value}
            onClick={() => {
              if (value !== f.value) onChange(f.value);
            }}
          >
            {f.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
