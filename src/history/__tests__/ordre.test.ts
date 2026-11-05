import { describe, expect, it } from 'vitest';
import type { Session } from '../../domain/types';
import { sortSessions } from '../../engine';
import { recentVariantIds } from '../../library/search';
import { compareHistory, type HistoryKey } from '../ops';

function session(id: string, date: string, startedAt: string | null, createdAt: string, variantId = 'pec-deck'): Session {
  const start = startedAt === null ? null : Date.parse(startedAt);
  return {
    id, name: id, date, startedAt: start, endedAt: start === null ? null : start + 3_600_000, createdAt: Date.parse(createdAt), updatedAt: Date.parse(createdAt),
    origin: start === null ? 'import' : 'app', state: 'done',
    performances: [{ variantId, weightKg: 30, targetReps: 8, plannedSets: 3, reps: [8, 8, 8], feeling: 'bien' }],
  };
}

describe('Ordre des séances d’un même jour (version 1.41.2)', () => {
  const morning = session('matin', '2026-10-20', '2026-10-20T08:00:00', '2026-10-20T09:00:00', 'chest-press');
  const evening = session('soir', '2026-10-20', '2026-10-20T18:00:00', '2026-10-20T19:00:00', 'leg-curl');
  // Importée sans heure, enregistrée avant les deux autres : pour le moteur, elle vient quand même en dernier.
  const imported = session('import', '2026-10-20', null, '2026-10-19T12:00:00', 'pec-deck');
  const yesterday = session('veille', '2026-10-19', '2026-10-19T20:00:00', '2026-10-19T21:00:00', 'tirage-vertical');

  it('299. L’historique suit l’ordre du moteur (§7.9) ; une activité se range à son heure, une séance sans heure en fin de journée', () => {
    const all = [imported, evening, yesterday, morning];
    const engine = sortSessions(all).map((s) => s.id);
    expect(engine).toEqual(['veille', 'matin', 'soir', 'import']);
    const keys: HistoryKey[] = all.map((s) => ({ date: s.date, session: s }));
    expect([...keys].sort(compareHistory).map((k) => ('session' in k ? k.session.id : ''))).toEqual(engine);
    // Badminton à 21 h : après la séance de 18 h, avant la séance sans heure.
    const badminton: HistoryKey = { date: '2026-10-20', time: Date.parse('2026-10-20T21:00:00') };
    const sorted = [...keys, badminton].sort(compareHistory).map((k) => ('session' in k ? k.session.id : 'badminton'));
    expect(sorted).toEqual(['veille', 'matin', 'soir', 'badminton', 'import']);
    // Une séance dont la date a été changée (heure de début gardée) reste à sa nouvelle date.
    const moved = { ...yesterday, id: 'déplacée', date: '2026-10-21' };
    expect([...keys, { date: moved.date, session: moved }].sort(compareHistory).map((k) => ('session' in k ? k.session.id : '')).at(-1)).toBe('déplacée');
  });

  it('299. Les récents suivent le même ordre : la séance sans heure d’abord, puis le soir, puis le matin', () => {
    expect(recentVariantIds([morning, imported, yesterday, evening])).toEqual(['pec-deck', 'leg-curl', 'chest-press', 'tirage-vertical']);
  });
});
