import { useLayoutEffect, useMemo, useState } from 'react';
import { useApp } from '../app/store';
import { useNow } from '../app/hooks';
import { RECAP_TITLE_FORMS, recapCountLabel, recapTitle, weeklyRecap, type WeeklyRecap } from '../analysis/weekly';
import { MUSCLE_GROUP_LABELS } from '../library/seed';

const RECENCY_LABELS = { today: 'aujourd’hui', yesterday: 'hier' } as const;

/**
 * Récapitulatif de la semaine en haut de l'accueil (§19.6) : un coup d'œil pour choisir les groupes à travailler.
 * Recalculé à chaque affichage à partir des séances enregistrées ; rien d'autre que la grille.
 */
/**
 * Titre raccourci seulement quand il le faut (version 1.41.1) : la forme la plus complète qui laisse le bouton
 * « Démarrer » (`data-home-start`) entièrement au-dessus de la barre d'onglets, page en haut ; sinon la plus courte.
 * Dernière forme (`compact`, version 1.45.0) : le titre court, et la case Jambes sans la mention du cardio.
 * Chaque forme est mesurée à la largeur et à la taille de texte réelles (sondes invisibles, sans hauteur : les titres,
 * et la grille avec et sans la mention du cardio) : le choix ne dépend pas de la forme affichée, donc il ne bascule
 * jamais d'une forme à l'autre. Refait quand la page change de taille (contenu de l'accueil, écran tourné) ou quand la
 * taille du texte change.
 */
function useTitleForm(key: string): number {
  const [form, setForm] = useState(0);
  useLayoutEffect(() => {
    const probes = document.querySelector<HTMLElement>('[data-probes]');
    if (!probes) return;
    const fit = () => {
      const start = document.querySelector('[data-home-start]');
      const section = probes.parentElement;
      const title = section?.querySelector('h2.recap-title');
      const grid = section?.querySelector(':scope > .recap-grid');
      if (!start || !title || !grid) return;
      const nav = document.querySelector('.tab-bar');
      const limit = nav ? nav.getBoundingClientRect().top : window.innerHeight;
      const height = (el: Element | null | undefined) => el?.getBoundingClientRect().height ?? 0;
      const titles = [...probes.querySelectorAll('[data-probe-title]')].map(height);
      const grids = { full: height(probes.querySelector('[data-probe-grid="full"]')), compact: height(probes.querySelector('[data-probe-grid="compact"]')) };
      // Bas de « Démarrer », page en haut, sans le titre ni la grille affichés.
      const base = start.getBoundingClientRect().bottom + window.scrollY - height(title) - height(grid);
      const found = RECAP_TITLE_FORMS.findIndex((f, i) => base + titles[i]! + (f === 'compact' ? grids.compact : grids.full) <= limit);
      const next = found === -1 ? RECAP_TITLE_FORMS.length - 1 : found;
      setForm((f) => (f === next ? f : next));
    };
    fit();
    window.addEventListener('resize', fit);
    if (typeof ResizeObserver === 'undefined') return () => window.removeEventListener('resize', fit);
    const observer = new ResizeObserver(fit);
    observer.observe(document.body);
    for (const c of probes.children) observer.observe(c);
    return () => {
      window.removeEventListener('resize', fit);
      observer.disconnect();
    };
  }, [key]);
  return form;
}

/** Cases du récapitulatif ; `withCardio` faux : la case Jambes sans « +50 min cardio » (forme `compact`). */
function RecapCells({ cells, withCardio, probe }: { cells: WeeklyRecap['cells']; withCardio: boolean; probe?: 'full' | 'compact' }) {
  return (
    <ul className="recap-grid" {...(probe ? { 'data-probe-grid': probe } : {})}>
      {cells.map((c) => {
        const counted = recapCountLabel(c, withCardio);
        const count = counted ? ` (${counted})` : '';
        const when = c.recency ? ` · ${RECENCY_LABELS[c.recency]}` : '';
        return (
          <li key={c.group} className={`recap-cell recap-${c.color}`} {...(probe ? {} : { 'data-group': c.group, 'data-color': c.color })}>
            {MUSCLE_GROUP_LABELS[c.group]}
            {count && <span className="recap-count">{count}</span>}
            {when && <span className="recap-when">{when}</span>}
          </li>
        );
      })}
    </ul>
  );
}

export function WeeklyRecapBlock() {
  const { sessions, exercises, recapSettings, activities, cardioMachines } = useApp();
  // Recalculé à chaque affichage, à l'heure exacte ; l'horloge rafraîchit l'accueil chaque minute
  // (passage de minuit, mention « hier »).
  const minute = Math.floor(useNow(60_000) / 60_000);
  const recap = useMemo(
    () => weeklyRecap(sessions, exercises, Date.now(), recapSettings, activities, cardioMachines),
    [sessions, exercises, minute, recapSettings, activities, cardioMachines],
  );
  const titles = RECAP_TITLE_FORMS.map((f) => recapTitle(recap, f));
  const form = useTitleForm(`${titles.join('|')}|${recap.cells.map((c) => recapCountLabel(c)).join('|')}`);

  return (
    <section className="weekly-recap frame" aria-label="Récapitulatif de la semaine" data-testid="weekly-recap">
      <h2 className="recap-title" data-form={RECAP_TITLE_FORMS[form]}>
        {titles[form]}
      </h2>
      <RecapCells cells={recap.cells} withCardio={RECAP_TITLE_FORMS[form] !== 'compact'} />
      {/* Formes du titre et de la grille, mesurées à la largeur réelle sans prendre de place (versions 1.41.1, 1.45.0). */}
      <div className="recap-title-probes" aria-hidden="true" data-probes="">
        {titles.map((t, i) => (
          <div key={i} className="recap-title" data-probe-title="">
            {t}
          </div>
        ))}
        <RecapCells cells={recap.cells} withCardio probe="full" />
        <RecapCells cells={recap.cells} withCardio={false} probe="compact" />
      </div>
    </section>
  );
}
