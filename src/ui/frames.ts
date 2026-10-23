import { useLayoutEffect } from 'react';

/**
 * Cadres de section (§3.1) : liste unique des éléments encadrés dans toute l'application. Leur style est défini
 * une seule fois (règle `[data-frame]` de styles.css) : gris neutre, sauf ce qui concerne un groupe musculaire
 * (`data-group-color`, §3.2), qui prend la couleur du groupe.
 */
export const FRAME_SELECTOR = [
  '.frame',
  '.card',
  '.pick-item',
  '.bilan-item',
  '.history-item',
  '.chart',
  '.banner.info',
  '.banner.error-inline',
  '.confirm-box',
  '.to-fix',
  '.dialog',
  '.menu-panel',
  '.bottom-sheet',
].join(', ');

/** Marque les cadres (`data-frame`) : un seul style pour tous. */
export function markFrames(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>(FRAME_SELECTOR).forEach((el) => {
    if (el.dataset.frame === undefined) el.dataset.frame = '';
  });
}

/** Tient le marquage à jour à chaque changement d'écran ou de contenu (avant l'affichage). */
export function useFrames(): void {
  useLayoutEffect(() => {
    markFrames(document);
    const observer = new MutationObserver(() => markFrames(document));
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
}
