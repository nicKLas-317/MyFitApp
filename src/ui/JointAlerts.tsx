import { useMemo } from 'react';
import { useApp } from '../app/store';
import { useNow } from '../app/hooks';
import { jointAlerts, jointBanner, type JointAlert } from '../analysis/jointAlerts';

/**
 * Articulations en alerte « trop sollicitée » à afficher (§19.14, version 1.53.0) : recalculées à l'affichage
 * (l'horloge passe le lundi 0 h 00), sans celles ignorées pour la même semaine.
 */
export function useJointAlerts(): JointAlert[] {
  const { sessions, exercises, activities, cardioMachines, ignoredJointAlerts } = useApp();
  const hour = Math.floor(useNow(60_000) / 3_600_000);
  return useMemo(
    () => jointAlerts({ sessions, exercises, activities, machines: cardioMachines, now: Date.now() }, ignoredJointAlerts),
    [sessions, exercises, activities, cardioMachines, ignoredJointAlerts, hour],
  );
}

/** Petit cercle avec un point d'exclamation, décoratif : distinct du triangle de l'alerte « groupe moins travaillé ». */
export function JointIcon() {
  return (
    <svg className="group-alert-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9.6" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M12 6.8v6.4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="12" cy="16.9" r="1.4" fill="currentColor" />
    </svg>
  );
}

/**
 * Bandeau « articulation trop sollicitée », sous l'alerte « groupe moins travaillé » sur l'onglet Séance et dans
 * Progrès : même forme que le bandeau jaune, fond lavande (choix de l'utilisateur), un ton de conseil, toutes les
 * articulations en alerte dans un seul bandeau. Pas de lien (aucun écran par articulation) ; la croix les masque toutes
 * jusqu'au lundi suivant.
 */
export function JointAlerts() {
  const alerts = useJointAlerts();
  const { ignoreJointAlerts } = useApp();
  if (alerts.length === 0) return null;
  const { names, rest } = jointBanner(alerts);
  return (
    <ul className="group-alerts joint-alerts" aria-label="Articulation trop sollicitée" data-testid="joint-alerts">
      <li className="group-alert joint-alert" data-joints={alerts.map((a) => a.joint).join(' ')}>
        <span className="joint-alert-text">
          <JointIcon />
          <span>
            <strong className="group-alert-name">{names}</strong>
            {` : ${rest}`}
          </span>
        </span>
        <button type="button" className="link group-alert-ignore" aria-label={`Ignorer l’alerte : ${names}`} onClick={() => void ignoreJointAlerts(alerts)}>
          <svg className="group-alert-cross" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
          </svg>
        </button>
      </li>
    </ul>
  );
}
