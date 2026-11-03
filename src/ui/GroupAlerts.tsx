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
 * Une ligne discrète par groupe (3 au plus), sous le récapitulatif de l'onglet Séance et en haut de l'onglet Progrès :
 * un appui ouvre les séries par semaine du groupe, « Ignorer » la masque jusqu'à la semaine suivante encore sous la
 * moyenne. Neutre comme le récapitulatif : ni couleur de groupe, ni vert, orange ou rouge.
 */
export function GroupAlerts() {
  const alerts = useGroupAlerts();
  const { ignoreGroupAlert } = useApp();
  if (alerts.length === 0) return null;
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
