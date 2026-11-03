import { useMemo } from 'react';
import { useApp } from '../app/store';
import { routeHash, useNow } from '../app/hooks';
import { alertFigures, groupAlerts, type GroupAlert } from '../analysis/groupAlerts';
import { MUSCLE_GROUP_LABELS } from '../library/seed';

/**
 * Alertes « groupe moins travaillé » à afficher (version 1.38.0, §19.11) : recalculées à l'affichage (l'horloge passe
 * le lundi 0 h 00), sans celles ignorées pour la même semaine.
 */
export function useGroupAlerts(): GroupAlert[] {
  const { sessions, exercises, recapSettings, ignoredAlerts } = useApp();
  const hour = Math.floor(useNow(60_000) / 3_600_000);
  return useMemo(
    () => groupAlerts(sessions, exercises, recapSettings.groups, Date.now(), ignoredAlerts),
    [sessions, exercises, recapSettings, ignoredAlerts, hour],
  );
}

/**
 * Une ligne discrète par groupe (3 au plus), sous le récapitulatif de l'onglet Séance (une seule ligne de résumé à
 * partir de 2 groupes, `compact`) et en haut de l'onglet Progrès :
 * un appui ouvre les séries par semaine du groupe, « Ignorer » la masque jusqu'à la semaine suivante encore sous la
 * moyenne. Neutre comme le récapitulatif : ni couleur de groupe, ni vert, orange ou rouge.
 */
export function GroupAlerts({ compact = false }: { compact?: boolean }) {
  const alerts = useGroupAlerts();
  const { ignoreGroupAlert } = useApp();
  if (alerts.length === 0) return null;
  // Onglet Séance (version 1.40.0) : à partir de 2 groupes, une seule ligne qui mène à l'onglet Progrès, où restent le
  // détail et « Ignorer » ; « Démarrer une séance » reste ainsi à l'écran sans défiler.
  if (compact && alerts.length >= 2) {
    return (
      <a className="link group-alerts-summary" href={routeHash('progres')} data-testid="group-alerts-summary">
        <span>
          <strong className="group-alert-name">{alerts.length}{'\u00a0'}groupes sous ta moyenne</strong>
          {`\u00a0: ${alerts.map((a) => MUSCLE_GROUP_LABELS[a.group]).join(', ')}`}
        </span>
      </a>
    );
  }
  return (
    <ul className="group-alerts" aria-label="Groupes moins travaillés" data-testid="group-alerts">
      {alerts.map((a) => (
        <li key={a.group} className="group-alert" data-group={a.group}>
          <a className="link group-alert-link" href={routeHash('bilan-groupes', a.group, 'series')}>
            <span>
              <strong className="group-alert-name">{MUSCLE_GROUP_LABELS[a.group]}</strong>
              {`\u00a0: ${alertFigures(a)}`}
            </span>
          </a>
          <button type="button" className="link group-alert-ignore" aria-label={`Ignorer l’alerte : ${MUSCLE_GROUP_LABELS[a.group]}`} onClick={() => void ignoreGroupAlert(a)}>
            Ignorer
          </button>
        </li>
      ))}
    </ul>
  );
}
