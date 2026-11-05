import { useMemo, type CSSProperties } from 'react';
import type { MuscleGroup } from '../domain/types';
import { useApp } from '../app/store';
import { navigate, useNow } from '../app/hooks';
import { planMatchesSuggestion, suggestionDueToday, weekSuggestion, type WeekSuggestion } from '../plan/suggest';
import { MUSCLE_GROUP_LABELS } from '../library/seed';
import { colorGroupOf, GROUP_COLORS } from './groupColors';

/**
 * Séance pour compléter la semaine (version 1.39.0, §5.15), recalculée à l'affichage : après chaque séance, et au fil
 * des heures (la veille change à minuit).
 */
export function useWeekSuggestion(): WeekSuggestion | null {
  const { sessions, exercises, settings, recapSettings, activities, cardioMachines } = useApp();
  const hour = Math.floor(useNow(60_000) / 3_600_000);
  return useMemo(
    () => weekSuggestion({ sessions, exercises, settings, recap: recapSettings, activities, machines: cardioMachines, now: Date.now() }),
    [sessions, exercises, settings, recapSettings, activities, cardioMachines, hour],
  );
}

/** Groupes de la séance proposée, dans son ordre, chacun une fois (le bonus abdos en dernier). */
export function suggestionGroups(s: WeekSuggestion): MuscleGroup[] {
  return [...new Set(s.exercises.map((e) => e.group))];
}

/**
 * Carte de l'onglet Séance (version 1.40.0 ; ligne discrète en version 1.39.0), sous la séance prévue s'il y en a
 * une : « Séance pour compléter la semaine », « D'ici dimanche · 5 exercices » (« Aujourd'hui » le dimanche, version
 * 1.40.1), puis ses groupes en pastilles de leur couleur ; toute la carte ouvre la suggestion. Rien pendant une séance, sans suggestion, ni quand la séance prévue
 * reprend déjà ses exercices.
 */
export function WeekSuggestionCard() {
  const { active, plan } = useApp();
  const suggestion = useWeekSuggestion();
  if (active || !suggestion || planMatchesSuggestion(plan, suggestion)) return null;
  const count = suggestion.exercises.length;
  return (
    <button type="button" className="card action-card" data-testid="week-suggestion" onClick={() => navigate('seance-prevue', 'suggestion')}>
      <span className="action-card-text">
        <span className="action-card-title">Séance pour compléter la semaine</span>
        <span className="action-card-sub">
          {suggestionDueToday(suggestion) ? 'Aujourd’hui' : 'D’ici dimanche'} · {count}
          {'\u00a0'}
          {count > 1 ? 'exercices' : 'exercice'}
        </span>
        <span className="group-pills">
          {suggestionGroups(suggestion).map((g) => (
            <span key={g} className="group-pill" style={{ '--group-color': `var(${GROUP_COLORS[colorGroupOf(g)]})` } as CSSProperties}>
              {MUSCLE_GROUP_LABELS[g]}
            </span>
          ))}
        </span>
      </span>
      <span className="action-card-chevron" aria-hidden="true">
        ›
      </span>
    </button>
  );
}
