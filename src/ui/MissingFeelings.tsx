import type { Session } from '../domain/types';
import { useApp } from '../app/store';
import { displayName } from '../library/catalog';
import { findPerformance, setFeeling } from '../session/ops';
import { FeelingPicker } from './FeelingPicker';

/**
 * Exercices réalisés sans ressenti, à compléter avant de terminer (§5.5).
 * `variantIds` est figé à l'ouverture de la confirmation : un ressenti complété reste affiché, sélectionné.
 */
export function MissingFeelings({ session, variantIds }: { session: Session; variantIds: readonly string[] }) {
  const { variants, commit } = useApp();
  if (variantIds.length === 0) return null;
  const remaining = variantIds.filter((id) => findPerformance(session, id)?.feeling === 'inconnu').length;
  return (
    <div className="missing-feelings">
      <p>
        {remaining > 0
          ? `Ressenti manquant (${remaining}) : sans ressenti, l’exercice ne valide pas son palier.`
          : 'Ressentis complétés.'}
      </p>
      {variantIds.map((id) => {
        const p = findPerformance(session, id);
        if (!p) return null;
        return (
          <FeelingPicker
            key={id}
            legend={displayName(variants.get(id))}
            value={p.feeling}
            onChange={(f) => void commit(setFeeling(session, id, f, Date.now()))}
          />
        );
      })}
    </div>
  );
}

/** Libellé du bouton de fin selon qu'il reste des ressentis manquants. */
export function finishLabel(session: Session, variantIds: readonly string[]): string {
  const remaining = variantIds.some((id) => findPerformance(session, id)?.feeling === 'inconnu');
  return remaining ? 'Terminer sans compléter' : 'Oui, terminer';
}
