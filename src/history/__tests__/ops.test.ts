import { describe, expect, it } from 'vitest';
import type { Session } from '../../domain/types';
import { DEFAULT_ENGINE_SETTINGS, rebuildProfile } from '../../engine';
import { green, history, orange, perf, V } from '../../engine/__tests__/helpers';
import { correctPerformance, removePastPerformance, searchSessions, setSessionDate } from '../ops';

const S = DEFAULT_ENGINE_SETTINGS;
const named = (sessions: Session[], names: string[]) => sessions.map((s, i) => ({ ...s, name: names[i]! }));

describe('Historique des séances (§10)', () => {
  it('liste les séances terminées de la plus récente à la plus ancienne et recherche par nom', () => {
    const sessions = named(history([green(45, 8), green(45, 8), green(45, 9)]), ['Haut du corps', 'Pectoraux et dos', 'Haut du corps lourd']);
    const active: Session = { ...sessions[0]!, id: 'active', state: 'active', name: 'Haut du corps en cours' };
    expect(searchSessions([...sessions, active], '').map((s) => s.id)).toEqual(['s3', 's2', 's1']);
    expect(searchSessions(sessions, 'haut corps').map((s) => s.id)).toEqual(['s3', 's1']);
    expect(searchSessions(sessions, 'PECTORAUX').map((s) => s.id)).toEqual(['s2']);
    expect(searchSessions(sessions, 'jambes')).toEqual([]);
  });

  it('27. Corriger une séance passée recalcule les recommandations', () => {
    const sessions = history([green(45, 8), green(45, 8)]);
    expect(rebuildProfile(sessions, S).profile.variants[V]?.recommendation.kind).toBe('reps_up');
    const { session, errors } = correctPerformance(sessions[1]!, V, { reps: [8, 8, 7] }, 10);
    expect(errors).toEqual([]);
    const corrected = [sessions[0]!, session];
    const profile = rebuildProfile(corrected, S).profile.variants[V]!;
    expect(profile.lastStatus).toBe('orange');
    expect(profile.recommendation.kind).toBe('keep');
    expect(sessions[1]!.performances[0]!.reps).toEqual([8, 8, 8]); // l'original n'est pas modifié
  });

  it('une correction incohérente est refusée et laisse la séance intacte', () => {
    const [s] = history([green(45, 8)]);
    expect(correctPerformance(s!, V, { reps: [9, 8, 8] }, 1)).toEqual({ session: s, errors: ['reps_above_target'] });
    expect(correctPerformance(s!, V, { weightKg: 0 }, 1).errors).toContain('invalid_weight');
    expect(correctPerformance(s!, V, { reps: [] }, 1).errors).toContain('no_sets');
    expect(correctPerformance(s!, 'inconnu', { reps: [8] }, 1).errors).toEqual(['not_found']);
  });

  it('un ressenti corrigé remplace le symbole importé ; une autre correction le conserve', () => {
    const [s] = history([{ ...perf(52, 8, [8, 8, 8], 'moyen'), feelingSymbol: '+=' }]);
    expect(correctPerformance(s!, V, { weightKg: 50 }, 1).session.performances[0]?.feelingSymbol).toBe('+=');
    expect(correctPerformance(s!, V, { feeling: 'bien' }, 1).session.performances[0]).not.toHaveProperty('feelingSymbol');
  });

  it('60. Retirer un exercice ou supprimer une séance passée recalcule le profil', () => {
    const sessions = history([green(45, 8), orange(45, 8), green(45, 8)]);
    expect(rebuildProfile(sessions, S).profile.variants[V]?.greenStreak).toBe(1);
    const emptied = removePastPerformance(sessions[1]!, V, 5);
    expect(emptied.performances).toEqual([]);
    expect(rebuildProfile([sessions[0]!, emptied, sessions[2]!], S).profile.variants[V]?.recommendation.kind).toBe('reps_up');
    expect(rebuildProfile(sessions.filter((s) => s.id !== 's2'), S).profile.variants[V]?.recommendation.kind).toBe('reps_up');
  });

  it('changer la date d’une séance la rejoue à sa nouvelle place chronologique', () => {
    const sessions = history([orange(45, 8), green(45, 8), green(45, 8)]);
    expect(rebuildProfile(sessions, S).profile.variants[V]?.recommendation.kind).toBe('reps_up');
    // La séance orange déplacée après les deux vertes remet le compteur à 0.
    const moved = setSessionDate(sessions[0]!, '2026-02-01', 3);
    expect(rebuildProfile([moved, sessions[1]!, sessions[2]!], S).profile.variants[V]?.recommendation.kind).toBe('keep');
    expect(() => setSessionDate(sessions[0]!, '2026-13-01', 3)).toThrow();
  });
});
