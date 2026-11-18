import { useMemo } from 'react';
import { useApp } from '../app/store';
import { routeHash, useNow } from '../app/hooks';
import { alertBanner, groupAlerts, type GroupAlert } from '../analysis/groupAlerts';

/**
 * Alerte « groupe moins travaillé » à afficher (§19.11 ; une seule depuis la version 1.51.0) : recalculée à
 * l'affichage (l'horloge passe le lundi 0 h 00), sans celles ignorées pour la même semaine.
 */
export function useGroupAlerts(): GroupAlert[] {
  const { sessions, exercises, activities, cardioMachines, recapSettings, ignoredAlerts } = useApp();
  const hour = Math.floor(useNow(60_000) / 3_600_000);
  return useMemo(
    () =>
      groupAlerts(
        { sessions, exercises, activities, machines: cardioMachines, groups: recapSettings.groups, threshold: recapSettings.alertSets, now: Date.now() },
        ignoredAlerts,
      ),
    [sessions, exercises, activities, cardioMachines, recapSettings, ignoredAlerts, hour],
  );
}

/**
 * Une ligne discrète, sous le récapitulatif de l'onglet Séance et en haut de l'onglet Progrès : un appui ouvre les
 * séries par semaine du groupe, « Ignorer » la masque jusqu'à la semaine suivante encore sous le seuil. Neutre comme le
 * récapitulatif jusqu'à la version 1.51.0 ; depuis la version 1.52.0, un bandeau jaune (texte foncé, icône
 * d'avertissement), le même sur les deux onglets, ni couleur de groupe, ni vert, orange ou rouge. Version 1.51.0 : une
 * seule alerte, donc plus de ligne de résumé sur l'onglet Séance (version 1.40.0, à partir de 2 groupes).
 */
/** Petit triangle d'avertissement, décoratif (le texte dit tout) : bandeau, et ligne du bilan de la semaine (1.52.1). */
export function WarningIcon() {
  return (
    <svg className="group-alert-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 2.5 1.5 21h21L12 2.5z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M12 9v5.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="12" cy="17.6" r="1.4" fill="currentColor" />
    </svg>
  );
}

export function GroupAlerts() {
  const alerts = useGroupAlerts();
  const { ignoreGroupAlerts } = useApp();
  if (alerts.length === 0) return null;
  // Version 1.52.1 : un seul bandeau cite tous les groupes en alerte, du plus bas au plus haut ; l'appui mène aux séries
  // du premier, la croix masque l'alerte de tous les groupes cités.
  const { names, rest } = alertBanner(alerts);
  const first = alerts[0]!.group;
  return (
    <ul className="group-alerts" aria-label="Groupe moins travaillé" data-testid="group-alerts">
      <li className="group-alert" data-group={first} data-groups={alerts.map((a) => a.group).join(' ')}>
        <a className="link group-alert-link" href={routeHash('bilan-groupes', first, 'series')}>
          <WarningIcon />
          <span>
            <strong className="group-alert-name">{names}</strong>
            {`\u00a0: ${rest}`}
          </span>
        </a>
        {/* Version 1.52.0 : une croix au lieu du mot « Ignorer » (le texte tient sur 2 lignes à 320 px, §3.7) ; nommée pour
            le lecteur d'écran, zone d'appui de 48 px. */}
        <button type="button" className="link group-alert-ignore" aria-label={`Ignorer l’alerte : ${names}`} onClick={() => void ignoreGroupAlerts(alerts)}>
          <svg className="group-alert-cross" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
          </svg>
        </button>
      </li>
    </ul>
  );
}
