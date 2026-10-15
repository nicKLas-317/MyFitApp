import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Mise à jour de l'application (§21) : une nouvelle version est proposée, jamais imposée.
 * Recharger ne touche pas aux données : elles restent dans IndexedDB, sur l'appareil.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.error('[MyFitApp] service worker non enregistré', error);
    },
  });

  if (!needRefresh) return null;
  return (
    <div className="toast update-toast" role="status">
      <span>Nouvelle version disponible.</span>
      <button type="button" className="btn primary" onClick={() => void updateServiceWorker(true)}>
        Recharger
      </button>
      <button type="button" className="btn" onClick={() => setNeedRefresh(false)}>
        Plus tard
      </button>
    </div>
  );
}
