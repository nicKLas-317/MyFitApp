import { useEffect } from 'react';
import { useApp } from '../app/store';

export const UNDO_VISIBLE_MS = 6000;

/** Bouton « Annuler » visible quelques secondes après une modification de série ou un retrait d'exercice (§13). */
export function UndoToast() {
  const { undo, applyUndo, dismissUndo } = useApp();

  useEffect(() => {
    if (!undo) return;
    const id = window.setTimeout(dismissUndo, UNDO_VISIBLE_MS);
    return () => window.clearTimeout(id);
  }, [undo, dismissUndo]);

  if (!undo) return null;
  return (
    <div className="toast" role="status">
      <span>{undo.label}</span>
      <button type="button" className="btn" onClick={applyUndo}>
        Annuler
      </button>
    </div>
  );
}
