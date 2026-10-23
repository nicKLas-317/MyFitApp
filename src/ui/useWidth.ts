import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

/**
 * Largeur affichée d'un élément, suivie au redimensionnement. Les graphiques s'en servent pour dessiner à l'échelle 1 :
 * une étiquette de 13 px fait 13 px à l'écran, quelle que soit la largeur du téléphone.
 */
export function useWidth<T extends Element>(fallback: number): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const w = Math.round(el.getBoundingClientRect().width);
      if (w > 0) setWidth(w);
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}
