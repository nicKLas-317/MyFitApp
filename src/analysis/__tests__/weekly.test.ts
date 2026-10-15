import { describe, expect, it } from 'vitest';
import type { Session } from '../../domain/types';
import { SEED_EXERCISES } from '../../library/seed';
import { recapTitle, weekStart, weeklyRecap, type WeeklyRecap } from '../weekly';

const LIB = [...SEED_EXERCISES];
/** Heure locale : lun. 12 octobre 2026 = début de semaine. */
const at = (d: number, h = 18, m = 0) => new Date(2026, 9, d, h, m).getTime();
let n = 0;

function session(start: number, variants: string[], extra: Partial<Session> = {}): Session {
  const d = new Date(start);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return {
    id: `s${++n}`, name: 'Séance', date, startedAt: start, endedAt: start + 3_600_000, createdAt: start, updatedAt: start,
    origin: 'app', state: 'done',
    performances: variants.map((variantId) => ({ variantId, weightKg: 20, targetReps: 8, plannedSets: 3, reps: [8, 8, 8], feeling: 'bien' })),
    ...extra,
  };
}

const view = (r: WeeklyRecap) => r.cells.map((c) => [c.group, c.color, c.count, c.recency]);
const cell = (r: WeeklyRecap, g: string) => r.cells.find((c) => c.group === g)!;

describe('Récapitulatif hebdomadaire (§19.6)', () => {
  it('89. La semaine va du lundi 0 h 00 au dimanche ; l’en-tête donne les dates exactes et le nombre de séances', () => {
    expect(weekStart(new Date(at(14))).getTime()).toBe(at(12, 0));
    expect(weekStart(new Date(at(18, 23, 59))).getTime()).toBe(at(12, 0));
    expect(weekStart(new Date(at(12, 0))).getTime()).toBe(at(12, 0));
    const r = weeklyRecap([session(at(12), ['pec-deck']), session(at(14), ['leg-curl'])], LIB, at(15));
    expect(recapTitle(r).replace(/\u00a0/g, ' ')).toBe('Semaine du lun. 12 au dim. 18 oct. : 2 séances');
    expect(recapTitle(weeklyRecap([], LIB, at(29))).replace(/\u00a0/g, ' ')).toBe('Semaine du lun. 26 oct. au dim. 1 nov. : 0 séance');
    expect(recapTitle(r)).toContain('2\u00a0séances');
  });

  it('90. Une séance du lundi 0 h 00 compte dans la nouvelle semaine, celle du dimanche 23 h 30 dans l’ancienne', () => {
    const monday = session(at(19, 0, 0), ['pec-deck']);
    const sunday = session(at(18, 23, 30), ['tirage-vertical']); // se termine après minuit
    const r = weeklyRecap([monday, sunday], LIB, at(19, 12));
    expect(r.sessionCount).toBe(1);
    expect(cell(r, 'pectoraux').count).toBe(1);
    expect(cell(r, 'dos').count).toBe(0);
    expect(weeklyRecap([monday, sunday], LIB, at(18, 23, 50)).sessionCount).toBe(1);
    expect(cell(weeklyRecap([monday, sunday], LIB, at(18, 23, 50)), 'dos').count).toBe(1);
  });

  it('91. Seul le groupe principal compte, une fois par séance ; les abdominaux sont absents', () => {
    // Tirage vertical : dos (biceps en secondaire). Deux exercices de dos dans la même séance : 1 séance.
    const r = weeklyRecap([session(at(13), ['tirage-vertical', 'tirage-horizontal', 'crunch-machine'])], LIB, at(16));
    expect(cell(r, 'dos').count).toBe(1);
    expect(cell(r, 'biceps').count).toBe(0);
    expect(r.cells.map((c) => c.group).sort()).toEqual(['biceps', 'dos', 'epaules', 'jambes', 'pectoraux', 'triceps']);
  });

  it('92. Couleurs : vert = 0, orange = 1, rouge à partir du seuil (2 par défaut, réglable)', () => {
    const sessions = [session(at(12), ['pec-deck', 'leg-curl']), session(at(13), ['chest-press'])];
    const r = weeklyRecap(sessions, LIB, at(16));
    expect(cell(r, 'pectoraux')).toMatchObject({ count: 2, color: 'rouge' });
    expect(cell(r, 'jambes')).toMatchObject({ count: 1, color: 'orange' });
    expect(cell(r, 'dos')).toMatchObject({ count: 0, color: 'vert' });
    const r3 = weeklyRecap(sessions, LIB, at(16), { groups: ['pectoraux', 'dos', 'epaules', 'biceps', 'triceps', 'jambes'], redThreshold: 3 });
    expect(cell(r3, 'pectoraux').color).toBe('orange');
  });

  it('93. « aujourd’hui » ou « hier » pour un groupe travaillé il y a moins de 48 heures, même la semaine précédente', () => {
    const now = at(19, 9); // lundi matin
    const r = weeklyRecap([session(at(18, 17), ['pec-deck']), session(at(19, 7), ['leg-curl']), session(at(17, 10), ['curl-biceps-halteres'])], LIB, now);
    expect(cell(r, 'pectoraux')).toMatchObject({ count: 0, color: 'vert', recency: 'yesterday' });
    expect(cell(r, 'jambes')).toMatchObject({ count: 1, recency: 'today' });
    expect(cell(r, 'biceps').recency).toBeNull(); // avant-hier : pas de mention
  });

  it('94. Tri : vert, orange puis rouge ; à couleur égale, « hier » et « aujourd’hui » en dernier', () => {
    const now = at(16, 9);
    const r = weeklyRecap(
      [
        session(at(12), ['pec-deck', 'elevations-laterales', 'extension-triceps-poulie']),
        session(at(13), ['tirage-vertical']),
        session(at(15), ['elevations-laterales', 'extension-triceps-poulie', 'tirage-horizontal']),
        session(at(14), ['chest-press']),
      ],
      LIB,
      now,
    );
    expect(view(r)).toEqual([
      ['biceps', 'vert', 0, null],
      ['jambes', 'vert', 0, null],
      ['pectoraux', 'rouge', 2, null],
      ['dos', 'rouge', 2, 'yesterday'],
      ['epaules', 'rouge', 2, 'yesterday'],
      ['triceps', 'rouge', 2, 'yesterday'],
    ]);
  });

  it('95. Semaine vide : tous les groupes verts, « 0 séance »', () => {
    const r = weeklyRecap([session(at(9), ['pec-deck'])], LIB, at(12, 8));
    expect(r.sessionCount).toBe(0);
    expect(r.cells.every((c) => c.color === 'vert' && c.count === 0)).toBe(true);
  });

  it('96. Une séance en cours ne compte pas ; terminée, supprimée ou importée, le récapitulatif suit les séances', () => {
    const active = session(at(14), ['pec-deck'], { state: 'active', endedAt: null });
    expect(cell(weeklyRecap([active], LIB, at(14, 19)), 'pectoraux').count).toBe(0);
    const finished = { ...active, state: 'done' as const, endedAt: at(14, 19) };
    expect(cell(weeklyRecap([finished], LIB, at(14, 20)), 'pectoraux').count).toBe(1);
    expect(cell(weeklyRecap([], LIB, at(14, 20)), 'pectoraux').count).toBe(0);
    // Séance importée sans heure : comptée selon sa date.
    const imported: Session = { ...session(at(13), ['leg-curl']), startedAt: null, endedAt: null, origin: 'import' };
    expect(cell(weeklyRecap([imported], LIB, at(16)), 'jambes').count).toBe(1);
    expect(cell(weeklyRecap([{ ...imported, date: '2026-10-11' }], LIB, at(16)), 'jambes').count).toBe(0);
  });

  it('97. Les sous-groupes des jambes comptent pour « jambes » ; aucun effet sur les séances', () => {
    const custom = { ...LIB[0]!, id: 'perso-squat', primaryGroup: 'quadriceps' as const, variants: [{ id: 'perso-squat', name: 'Standard', synonyms: [], archived: false }] };
    const s = session(at(13), ['perso-squat']);
    const snapshot = structuredClone(s);
    expect(cell(weeklyRecap([s], [...LIB, custom], at(16)), 'jambes').count).toBe(1);
    expect(s).toEqual(snapshot);
  });
});
