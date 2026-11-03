import { useMemo } from 'react';
import type { MuscleGroup } from '../domain/types';
import { useApp } from '../app/store';
import { navigate, useNow } from '../app/hooks';
import { planMatchesSuggestion, weekSuggestion, type WeekSuggestion } from '../plan/suggest';
import { MUSCLE_GROUP_LABELS } from '../library/seed';

/**
 * Séance pour compléter la semaine (version 1.39.0, §5.15), recalculée à l'affichage : après chaque séance, et au fil
 * des heures (la veille change à minuit).
 */
export function useWeekSuggestion(): WeekSuggestion | null {
  const { sessions, exercises, settings, recapSettings, activities } = useApp();
  const hour = Math.floor(useNow(60_000) / 3_600_000);
  return useMemo(
    () => weekSuggestion({ sessions, exercises, settings, recap: recapSettings, activities, now: Date.now() }),
    [sessions, exercises, settings, recapSettings, activities, hour],
  );
}

/** Groupes de la séance proposée, dans son ordre, chacun une fois (le bonus abdos en dernier). */
export function suggestionGroups(s: WeekSuggestion): MuscleGroup[] {
  return [...new Set(s.exercises.map((e) => e.group))];
}

/**
 * Ligne discrète de l'onglet Séance, à côté de « Préparer ma prochaine séance » (ou du résumé de la séance prévue) :
 * « Séance pour compléter la semaine : Pectoraux · Jambes · Abdominaux ». Rien pendant une séance, sans suggestion,
 * ni quand la séance prévue reprend déjà ses exercices.
 */
export function WeekSuggestionLink() {
  const { active, plan } = useApp();
  const suggestion = useWeekSuggestion();
  if (active || !suggestion || planMatchesSuggestion(plan, suggestion)) return null;
  return (
    <button type="button" className="link suggest-week" data-testid="week-suggestion" onClick={() => navigate('seance-prevue', 'suggestion')}>
      <span>
        Séance pour compléter la semaine{' '}: {suggestionGroups(suggestion).map((g) => MUSCLE_GROUP_LABELS[g]).join(' · ')}
      </span>
    </button>
  );
}
