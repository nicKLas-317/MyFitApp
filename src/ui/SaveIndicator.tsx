import { useApp } from '../app/store';

/** Indique l'état réel du dernier enregistrement : jamais « Enregistré » si l'écriture a échoué (§12). */
export function SaveIndicator() {
  const { save } = useApp();
  if (save.kind === 'saving') return <span className="save-indicator muted small">Enregistrement…</span>;
  if (save.kind === 'saved') return <span className="save-indicator ok small">Enregistré</span>;
  return <span className="save-indicator" />;
}

/** Bandeau persistant en cas d'échec, avec relance. */
export function SaveErrorBanner() {
  const { save, retrySave } = useApp();
  if (save.kind !== 'error') return null;
  return (
    <div className="banner error" role="alert">
      <span>Échec de l’enregistrement : les dernières modifications ne sont pas sauvegardées.</span>
      <button type="button" className="btn" onClick={retrySave}>
        Réessayer
      </button>
    </div>
  );
}
