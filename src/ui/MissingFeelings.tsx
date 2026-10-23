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
      <p className="missing-note">
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

/** Il reste au moins un exercice sans ressenti parmi ceux relevés à l'ouverture de la confirmation. */
export function remainingFeelings(session: Session, variantIds: readonly string[]): boolean {
  return variantIds.some((id) => findPerformance(session, id)?.feeling === 'inconnu');
}

/**
 * Libellé du bouton de fin. Tant qu'un ressenti manque, l'action principale est de le choisir : « Terminer sans
 * compléter » n'est qu'un bouton secondaire.
 */
export function finishLabel(session: Session, variantIds: readonly string[]): string {
  return remainingFeelings(session, variantIds) ? 'Terminer sans compléter' : 'Oui, terminer';
}
