import type { ReactNode } from 'react';
import { usePendingReports } from './ReportBanner';

export type Tab = 'seance' | 'historique' | 'progres' | 'plus';

/** Onglet d'un écran (§3.4) : celui qui est mis en évidence dans la barre. */
export function tabOf(page: string, extra?: string): Tab {
  switch (page) {
    case 'historique':
      return 'historique';
    case 'progres':
    case 'bilan':
    case 'bilan-periode':
    case 'bilan-groupes':
    case 'poids':
      return 'progres';
    case 'exercice':
      return extra === 'evolution' ? 'progres' : 'plus';
    case 'plus':
    case 'bibliotheque':
    case 'modifier':
    case 'nouvel-exercice':
    case 'reglages':
    case 'donnees':
      return 'plus';
    default:
      return 'seance';
  }
}

/** Mode salle (§5.8) : pendant la saisie d'une séance, écran plein, sans barre d'onglets. */
export function isGymMode(page: string, extra?: string): boolean {
  return page === 'seance' || page === 'ajouter' || (page === 'nouvel-exercice' && extra === 'seance');
}

const icon = (path: ReactNode) => (
  <svg className="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
    {path}
  </svg>
);

const TABS: { id: Tab; href: string; label: string; icon: ReactNode }[] = [
  {
    id: 'seance',
    href: '#/',
    label: 'Séance',
    // Haltère.
    icon: icon(<path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12" />),
  },
  {
    id: 'historique',
    href: '#/historique',
    label: 'Historique',
    // Horloge.
    icon: icon(
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" />
      </>,
    ),
  },
  {
    id: 'progres',
    href: '#/progres',
    label: 'Progrès',
    // Courbe montante.
    icon: icon(<path d="M3 19h18M5 15l4.5-4.5 3.5 3.5L19 8M15 8h4v4" />),
  },
  {
    id: 'plus',
    href: '#/plus',
    label: 'Plus',
    // Trois points.
    icon: icon(
      <>
        <circle cx="5.5" cy="12" r="1.2" />
        <circle cx="12" cy="12" r="1.2" />
        <circle cx="18.5" cy="12" r="1.2" />
      </>,
    ),
  },
];

/**
 * Barre d'onglets fixe en bas de l'écran (§3.4), au-dessus de la zone système d'Android : Séance, Historique,
 * Progrès, Plus. Un bilan prêt (§19.7) met une pastille sur l'onglet Progrès.
 */
export function TabBar({ active }: { active: Tab }) {
  const reports = usePendingReports();
  return (
    <nav className="tab-bar" aria-label="Onglets">
      {TABS.map((t) => (
        <a key={t.id} className="tab" href={t.href} data-tab="" aria-current={t.id === active ? 'page' : undefined}>
          <span className="tab-icon-box">
            {t.icon}
            {t.id === 'progres' && reports.length > 0 && <span className="tab-badge" data-testid="report-badge" />}
          </span>
          <span className="tab-label">{t.label}</span>
          {t.id === 'progres' && reports.length > 0 && <span className="visually-hidden"> : bilan prêt</span>}
        </a>
      ))}
    </nav>
  );
}
