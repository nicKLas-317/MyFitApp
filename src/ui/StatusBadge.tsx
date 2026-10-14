import type { Status } from '../domain/types';

/**
 * Pastille de statut (§8) : trois couleurs, chacune doublée d'une forme distincte
 * pour ne pas dépendre de la seule couleur (rond = vert, losange = orange, triangle = rouge).
 */
export function StatusBadge({ status }: { status: Status | undefined }) {
  if (!status) return null;
  return (
    <svg className={`status status-${status}`} viewBox="0 0 20 20" role="img" aria-label={`Statut ${status}`} data-status={status}>
      {status === 'vert' && (
        <>
          <circle cx="10" cy="10" r="9" />
          <path d="M5.5 10.5l3 3 6-7" className="status-mark" />
        </>
      )}
      {status === 'orange' && (
        <>
          <path d="M10 1l9 9-9 9-9-9z" />
          <path d="M6 10h8" className="status-mark" />
        </>
      )}
      {status === 'rouge' && (
        <>
          <path d="M10 19L1 3h18z" />
          <path d="M10 6.5v5M10 14.5v.5" className="status-mark" />
        </>
      )}
    </svg>
  );
}
