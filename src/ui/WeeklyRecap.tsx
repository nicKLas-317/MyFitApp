import { useMemo } from 'react';
import { useApp } from '../app/store';
import { useNow } from '../app/hooks';
import { recapCountLabel, recapTitle, weeklyRecap } from '../analysis/weekly';
import { MUSCLE_GROUP_LABELS } from '../library/seed';

const RECENCY_LABELS = { today: 'aujourd’hui', yesterday: 'hier' } as const;

/**
 * Récapitulatif de la semaine en haut de l'accueil (§19.6) : un coup d'œil pour choisir les groupes à travailler.
 * Recalculé à chaque affichage à partir des séances enregistrées ; rien d'autre que la grille.
 */
export function WeeklyRecapBlock() {
  const { sessions, exercises, recapSettings } = useApp();
  // Recalculé à chaque affichage, à l'heure exacte ; l'horloge rafraîchit l'accueil chaque minute
  // (passage de minuit, mention « hier »).
  const minute = Math.floor(useNow(60_000) / 60_000);
  const recap = useMemo(() => weeklyRecap(sessions, exercises, Date.now(), recapSettings), [sessions, exercises, minute, recapSettings]);

  return (
    <section className="weekly-recap frame" aria-label="Récapitulatif de la semaine" data-testid="weekly-recap">
      <h2 className="recap-title">{recapTitle(recap)}</h2>
      <ul className="recap-grid">
        {recap.cells.map((c) => {
          const label = MUSCLE_GROUP_LABELS[c.group];
          const count = c.color === 'vert' ? '' : ` (${recapCountLabel(c)})`;
          const when = c.recency ? ` · ${RECENCY_LABELS[c.recency]}` : '';
          return (
            <li key={c.group} className={`recap-cell recap-${c.color}`} data-group={c.group} data-color={c.color}>
              {label}
              {count && <span className="recap-count">{count}</span>}
              {when && <span className="recap-when">{when}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
