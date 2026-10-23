/**
 * Navigation et bouton retour d'Android (§3.4). Le routage reste par hash (§21), mais chaque entrée de l'historique
 * connaît sa profondeur : 0 = onglet Séance (accueil), 1 = un onglet ou un écran ouvert depuis l'accueil, etc.
 * - Un onglet s'ouvre toujours juste au-dessus de l'onglet Séance : « retour » depuis un onglet ramène à la Séance.
 * - Une adresse ouverte directement (lien, rechargement) reçoit une entrée Séance en dessous : « retour » ne ferme
 *   jamais l'appli ailleurs que sur l'onglet Séance.
 * - Pendant une séance, une entrée de garde sur l'onglet Séance absorbe « retour » : l'appli ne se ferme pas.
 */

interface NavState {
  depth: number;
  /** Adresse de l'écran d'où l'on vient. */
  from?: string;
  /** Entrée de garde (séance en cours) : même adresse que l'onglet Séance. */
  guard?: boolean;
}

const HOME = '#/';

function state(): NavState | null {
  const s = window.history.state as NavState | null;
  return s && typeof s.depth === 'number' ? s : null;
}

/** Profondeur de l'entrée courante (0 : onglet Séance, ou adresse ouverte sans historique). */
export function depth(): number {
  return state()?.depth ?? 0;
}

const isHome = (hash: string) => hash === '' || hash === '#' || hash === HOME;

/** Prévient l'appli (useHashRoute) d'un changement d'adresse fait par pushState ou replaceState. */
function emit(): void {
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/** Ouvre un écran par-dessus l'écran courant. */
export function push(hash: string): void {
  if (hash === window.location.hash) return;
  window.history.pushState({ depth: depth() + 1, from: window.location.hash } satisfies NavState, '', hash);
  emit();
}

/** Remplace l'écran courant (changement de période, de groupe, création puis fiche…). */
export function replace(hash: string): void {
  if (hash === window.location.hash) return;
  window.history.replaceState({ ...(state() ?? { depth: 0 }), guard: false } satisfies NavState, '', hash);
  emit();
}

/** Revient de `n` entrées, puis exécute `then` une fois arrivé. */
function back(n: number, then?: () => void): void {
  if (then) window.addEventListener('popstate', then, { once: true });
  window.history.go(-n);
}

/** Onglet Séance (accueil) : on redescend dans l'historique au lieu d'empiler un nouvel accueil. */
export function goHome(): void {
  const d = depth();
  if (d > 0) back(d);
  else if (!isHome(window.location.hash)) replace(HOME);
}

/** Onglet : toujours juste au-dessus de l'onglet Séance, quel que soit l'écran de départ. */
export function goTab(hash: string): void {
  if (isHome(hash)) return goHome();
  const d = depth();
  if (d === 0) return push(hash);
  if (d === 1 && state()?.from !== undefined && isHome(state()!.from!) && !state()?.guard) return replace(hash);
  back(d, () => push(hash));
}

/**
 * Quitte l'écran courant vers `hash` : si l'on vient de cet écran, on y revient (retour), sinon on remplace l'écran
 * courant. « Ajouter un exercice » revient ainsi à la séance au lieu d'empiler une seconde séance.
 */
export function leaveTo(hash: string): void {
  const from = state()?.from;
  const screen = (h: string) => h.replace(/^#\/?/, '').split('/')[0];
  if (depth() > 0 && from === hash) return back(1);
  if (depth() > 0 && from !== undefined && screen(from) === screen(hash)) return back(1, () => replace(hash));
  replace(hash);
}

/** Flèche « ‹ » d'un écran : retour à l'écran précédent ; à défaut (adresse ouverte directement), l'écran parent. */
export function goBack(parent: string): void {
  if (isHome(parent)) return goHome();
  if (depth() > 0) return back(1);
  replace(parent);
}

let sessionActive = false;

/** Séance en cours ou non : décide de la garde de sortie. */
export function setSessionActive(active: boolean): void {
  sessionActive = active;
}

/** Pose l'entrée de garde si l'on est sur l'onglet Séance pendant une séance. */
export function armExitGuard(): void {
  if (depth() === 0 && isHome(window.location.hash) && sessionActive) {
    window.history.pushState({ depth: 1, from: HOME, guard: true } satisfies NavState, '', HOME);
  }
}

/**
 * À appeler une fois, avant le premier affichage : entrée Séance sous une adresse ouverte directement, interception
 * des liens internes (onglets, flèches « ‹ », écrans), et garde de sortie pendant une séance.
 */
export function initNavigation(): void {
  if (!state()) {
    const hash = window.location.hash;
    window.history.replaceState({ depth: 0 } satisfies NavState, '', HOME);
    if (!isHome(hash)) window.history.pushState({ depth: 1, from: HOME } satisfies NavState, '', hash);
  }
  // « Retour » jusqu'à l'onglet Séance pendant une séance : la garde est reposée, l'appli reste ouverte.
  window.addEventListener('popstate', armExitGuard);
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const link = (e.target as Element | null)?.closest?.('a[href^="#"]');
    if (!(link instanceof HTMLAnchorElement) || link.target) return;
    const hash = link.getAttribute('href')!;
    e.preventDefault();
    if (link.dataset.tab !== undefined) goTab(hash);
    else if (link.classList.contains('back')) goBack(hash);
    else if (isHome(hash)) goHome();
    else push(hash);
  });
}
