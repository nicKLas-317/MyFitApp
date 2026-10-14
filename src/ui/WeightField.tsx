import { useEffect, useId, useState } from 'react';
import { checkWeight } from '../session/ops';
import { formatKg } from '../session/format';

interface Props {
  value: number | null;
  /** Dernier poids utilisé sur cet exercice-variante, pour la confirmation au-delà de 50 % (§5.3). */
  previous: number | undefined;
  label?: string;
  highlight?: boolean;
  autoFocus?: boolean;
  onCommit(value: number): void;
}

/** Saisie du poids en kg, avec virgule décimale et protection contre les fautes de frappe. */
export function WeightField({ value, previous, label = 'Poids (kg)', highlight = false, autoFocus = false, onCommit }: Props) {
  const id = useId();
  const format = (v: number | null) => (v === null ? '' : String(v).replace('.', ','));
  const [text, setText] = useState(format(value));
  const [error, setError] = useState(false);
  const [pending, setPending] = useState<number | null>(null);

  useEffect(() => {
    setText(format(value));
  }, [value]);

  function submit() {
    if (pending !== null) return;
    if (value !== null && text === format(value)) return;
    const result = checkWeight(text, previous);
    if (result.kind === 'invalid') {
      setError(true);
      return;
    }
    setError(false);
    if (result.kind === 'confirm') setPending(result.value);
    else onCommit(result.value);
  }

  return (
    <div className={`weight-field${highlight ? ' highlight' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <div className="weight-input-row">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          autoFocus={autoFocus}
          value={text}
          aria-invalid={error}
          onChange={(e) => {
            setText(e.target.value);
            setError(false);
          }}
          onBlur={submit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
        />
        <span className="unit">kg</span>
      </div>
      {error && (
        <p className="field-error" role="alert">
          Poids invalide : saisir un nombre supérieur à 0.
        </p>
      )}
      {pending !== null && previous !== undefined && (
        <div className="confirm-box" role="alertdialog" aria-label="Confirmer le poids">
          <p>
            {formatKg(pending)} ? C’est très différent de {formatKg(previous)}.
          </p>
          <div className="row">
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                const v = pending;
                setPending(null);
                onCommit(v);
              }}
            >
              Confirmer {formatKg(pending)}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setPending(null);
                setText(format(value));
              }}
            >
              Corriger
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
