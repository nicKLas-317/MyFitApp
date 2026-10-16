import { useLayoutEffect } from 'react';

/**
 * Cadres de section (§3.1) : liste unique des éléments encadrés dans toute l'application. Leur style est défini
 * une seule fois (règle `[data-frame]` de styles.css) ; leur couleur alterne d'un cadre à l'autre sur un même écran,
 * dans l'ordre d'affichage, parmi une palette de couleurs vives (jamais vert, orange ni rouge, réservés aux statuts).
 */
export const FRAME_SELECTOR = [
  '.frame',
  '.card',
  '.pick-item',
  '.history-item',
  '.chart',
  '.reco',
  '.banner.info',
  '.banner.error-inline',
  '.confirm-box',
  '.to-fix',
  '.dialog',
].join(', ');

/** Nombre de couleurs de la palette (--frame-1 à --frame-5). */
export const FRAME_TONES = 5;

/** Numérote les cadres dans l'ordre d'affichage : `data-frame` = rang modulo la palette. */
export function numberFrames(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>(FRAME_SELECTOR).forEach((el, i) => {
    const tone = String(i % FRAME_TONES);
    if (el.dataset.frame !== tone) el.dataset.frame = tone;
  });
}

/** Tient la numérotation à jour à chaque changement d'écran ou de contenu (avant l'affichage). */
export function useFramePalette(): void {
  useLayoutEffect(() => {
    numberFrames(document);
    const observer = new MutationObserver(() => numberFrames(document));
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
}
