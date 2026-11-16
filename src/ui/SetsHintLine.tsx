import { useApp } from '../app/store';
import { applySetsHint, setsHint, setsHintText } from '../analysis/setsHint';
import { resolveConfig, trackKey } from '../engine';

/**
 * Proposition discrète d'ajuster le nombre de séries (version 1.49.0), sous la prochaine cible de la fiche et de la carte
 * en séance : « Tu fais souvent 2 séries : passer à 2 ? », « Oui » / « Non ». Rien quand il n'y a rien à proposer.
 * `onAccepted` : appelé après l'enregistrement du nouveau nombre de séries standard (la carte en séance y ajuste ses
 * séries prévues).
 */
export function SetsHintLine({ variantId, home, onAccepted }: { variantId: string; home: boolean; onAccepted?(sets: number): void }) {
  const { sessions, settings, variants, setsHintDismissed, dismissSetsHint, saveExercises } = useApp();
  const ref = variants.get(variantId);
  const track = trackKey(settings, variantId, home);
  const hint = ref ? setsHint(sessions, settings, track, setsHintDismissed[track]) : null;
  if (!ref || !hint) return null;

  async function accept() {
    if (!ref || !hint) return;
    const next = applySetsHint(ref.exercise, variantId, resolveConfig(settings, variantId), hint.sets);
    if (await saveExercises([next])) onAccepted?.(hint.sets);
  }

  return (
    <div className="sets-hint" data-testid="sets-hint" role="group" aria-label="Nombre de séries">
      <p className="sets-hint-text">{setsHintText(hint)}</p>
      <div className="sets-hint-actions">
        <button type="button" className="btn" onClick={() => void accept()}>
          Oui
        </button>
        <button type="button" className="btn" onClick={() => void dismissSetsHint(hint)}>
          Non
        </button>
      </div>
    </div>
  );
}
