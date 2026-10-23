import { goHome, leaveTo, push, replace } from './navigation';
import { useEffect, useState } from 'react';

/** Route courante, en routage par hash (compatible hébergement statique, §21). */
export function useHashRoute(): string[] {
  const read = () => window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

/** Adresse d'un écran : `routeHash('exercice', id)` → « #/exercice/<id> ». */
export function routeHash(...parts: string[]): string {
  return `#/${parts.filter((p) => p !== '').map(encodeURIComponent).join('/')}`;
}

/** Ouvre un écran par-dessus l'écran courant (« retour » y ramène) ; `navigate('')` revient à l'onglet Séance. */
export function navigate(...parts: string[]): void {
  const hash = routeHash(...parts);
  if (hash === '#/') goHome();
  else push(hash);
}

/** Remplace l'écran courant, sans nouvelle entrée dans l'historique. */
export function navigateReplace(...parts: string[]): void {
  replace(routeHash(...parts));
}

/** Quitte l'écran courant vers un écran d'où l'on vient (voir `leaveTo`). */
export function navigateBack(...parts: string[]): void {
  leaveTo(routeHash(...parts));
}

/** Heure courante rafraîchie périodiquement, et immédiatement au retour au premier plan. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [intervalMs]);
  return now;
}
