import { useLayoutEffect, useMemo, useState } from 'react';
import { useApp } from '../app/store';
import { useNow } from '../app/hooks';
import { RECAP_TITLE_FORMS, recapCountLabel, recapTitle, weeklyRecap } from '../analysis/weekly';
import { MUSCLE_GROUP_LABELS } from '../library/seed';

const RECENCY_LABELS = { today: 'aujourd’hui', yesterday: 'hier' } as const;

/**
 * Récapitulatif de la semaine en haut de l'accueil (§19.6) : un coup d'œil pour choisir les groupes à travailler.
 * Recalculé à chaque affichage à partir des séances enregistrées ; rien d'autre que la grille.
 */
/**
 * Titre raccourci seulement quand il le faut (version 1.41.1) : la forme la plus complète qui laisse le bouton
 * « Démarrer » (`data-home-start`) entièrement au-dessus de la barre d'onglets, page en haut ; sinon la plus courte.
 * Chaque forme est mesurée à la largeur et à la taille de texte réelles (sondes invisibles, sans hauteur) : le choix ne
 * dépend pas de la forme affichée, donc il ne bascule jamais d'une forme à l'autre. Refait quand la page change de
 * taille (contenu de l'accueil, écran tourné) ou quand la taille du texte change.
 */
function useTitleForm(titles: string[]): number {
  const [form, setForm] = useState(0);
  const key = titles.join('|');
  useLayoutEffect(() => {
    const probes = document.querySelector<HTMLElement>('[data-probes]');
    if (!probes) return;
    const fit = () => {
      const start = document.querySelector('[data-home-start]');
      const title = probes.parentElement?.querySelector('h2.recap-title');
      if (!start || !title) return;
      const nav = document.querySelector('.tab-bar');
      const limit = nav ? nav.getBoundingClientRect().top : window.innerHeight;
      const heights = [...probes.children].map((c) => c.getBoundingClientRect().height);
      // Bas de « Démarrer », page en haut, sans le titre affiché.
      const base = start.getBoundingClientRect().bottom + window.scrollY - title.getBoundingClientRect().height;
      const found = heights.findIndex((h) => base + h <= limit);
      const next = found === -1 ? heights.length - 1 : found;
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
  const form = useTitleForm(titles);

  return (
    <section className="weekly-recap frame" aria-label="Récapitulatif de la semaine" data-testid="weekly-recap">
      <h2 className="recap-title" data-form={RECAP_TITLE_FORMS[form]}>
        {titles[form]}
      </h2>
      {/* Formes du titre, mesurées à la largeur réelle sans prendre de place (version 1.41.1). */}
      <div className="recap-title-probes" aria-hidden="true" data-probes="">
        {titles.map((t, i) => (
          <div key={i} className="recap-title">
            {t}
          </div>
        ))}
      </div>
      <ul className="recap-grid">
        {recap.cells.map((c) => {
          const label = MUSCLE_GROUP_LABELS[c.group];
          const counted = recapCountLabel(c);
          const count = counted ? ` (${counted})` : '';
          const when = c.recency ? ` · ${RECENCY_LABELS[c.recency]}` : '';
          return (
            <li key={c.group} className={`recap-cell recap-${c.color}`} data-group={c.group} data-color={c.color}>
              {label}
              {count && <span className="recap-count">{count}</span>}
              {when && <span className="recap-when">{when}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
