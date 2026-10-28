import { describe, expect, it } from 'vitest';
import type { Exercise, Session } from '../../domain/types';
import { buildEngineSettings, indexVariants } from '../catalog';
import { SEED_EXERCISES } from '../seed';
import { perDumbbell } from '../search';
import { formatKg, kgUnit } from '../../session/format';
import { formatRecord, formatRecordWithDate, type PersonalRecord } from '../../analysis/records';
import { GROUP_VIEW_GROUPS, groupIndex, groupWeeklySets } from '../../analysis/groups';
import { simulatedHistory } from '../../analysis/__tests__/simulation';

const LIB: Exercise[] = [...SEED_EXERCISES];
const refs = indexVariants(LIB);
const dumbbell = (id: string) => perDumbbell(refs.get(id));

describe('Charges aux haltères : poids d’un haltère (version 1.30.1)', () => {
  it('271. « kg / haltère » pour le matériel haltère(s), de l’exercice ou de sa variante ; affichage seul ; aucun calcul n’additionne des charges d’exercices différents', () => {
    // Deux haltères (« haltères ») ou un seul (« haltère ») : la charge notée est celle d'un haltère.
    for (const id of ['curl-biceps-halteres', 'elevations-laterales', 'shrugs', 'curl-marteau', 'developpe-couche-halteres', 'extension-triceps-haltere-assis', 'rowing-haltere', 'kickback']) {
      expect(dumbbell(id), id).toBe(true);
    }
    // Variante « Haltères » d'un exercice à la barre ou à la machine : haltères ; la variante standard, non.
    expect(dumbbell('developpe-incline--halteres')).toBe(true);
    expect(dumbbell('developpe-incline')).toBe(false);
    expect(dumbbell('oiseau--halteres')).toBe(true);
    expect(dumbbell('oiseau')).toBe(false);
    // Barre, machine, poulie, kettlebell, poids du corps, variante inconnue : « kg ».
    for (const id of ['developpe-couche', 'curl-biceps-barre-droite', 'pec-deck', 'elevations-laterales-machine', 'curl-biceps-poulie-corde', 'squat-kettlebell', 'pompes', 'dips-assistes', 'inconnu']) {
      expect(dumbbell(id), id).toBe(false);
    }
    // Les quatorze exercices-variantes aux haltères de la bibliothèque.
    expect(SEED_EXERCISES.flatMap((e) => e.variants.filter((v) => perDumbbell({ exercise: e, variant: v })).map((v) => v.id))).toEqual([
      'rowing-haltere', 'elevations-laterales', 'curl-biceps-halteres', 'curl-biceps-banc-incline', 'extension-triceps-haltere-assis',
      'ecarte-couche-halteres', 'developpe-incline--halteres', 'developpe-couche-halteres', 'shrugs', 'developpe-militaire-halteres',
      'oiseau--halteres', 'elevations-frontales', 'curl-marteau', 'kickback',
    ]);

    // Textes : charge, unité du champ, records.
    expect(formatKg(11.5, true)).toBe('11,5 kg / haltère');
    expect(formatKg(11.5)).toBe('11,5 kg');
    expect(kgUnit(true)).toBe('kg / haltère');
    expect(kgUnit(false)).toBe('kg');
    const record: PersonalRecord = { variantId: 'curl-biceps-halteres', sessionId: 's', date: '2026-10-16', weightKg: 12, sets: 3, reps: 9, assisted: false };
    expect(formatRecord(record, true)).toBe('3 × 9 à 12 kg / haltère');
    expect(formatRecordWithDate(record, true)).toBe('3 × 9 à 12 kg / haltère (16 oct.)');
    expect(formatRecord(record)).toBe('3 × 9 à 12 kg');
    expect(formatRecord({ ...record, weightKg: 0 }, true)).toBe('3 × 9');

    // Aucun calcul n'additionne ni ne double ces charges : noter le total des deux haltères (charges doublées) au lieu
    // d'un haltère ne change ni l'indice par groupe (chaque exercice rapporté à sa première séance), ni les séries
    // par semaine. Les charges de deux exercices ne sont jamais combinées.
    const sessions = simulatedHistory('2026-10-22');
    const doubled: Session[] = sessions.map((s) => ({
      ...s,
      performances: s.performances.map((p) => (dumbbell(p.variantId) ? { ...p, weightKg: p.weightKg * 2 } : p)),
    }));
    expect(doubled.some((s, i) => s.performances.some((p, j) => p.weightKg !== sessions[i]!.performances[j]!.weightKg))).toBe(true);
    const settings = buildEngineSettings(LIB);
    const now = new Date(2026, 9, 22, 20).getTime();
    for (const group of GROUP_VIEW_GROUPS) {
      const a = groupIndex(sessions, LIB, settings, group);
      const b = groupIndex(doubled, LIB, settings, group);
      expect(b.points.map((p) => p.date)).toEqual(a.points.map((p) => p.date));
      b.points.forEach((p, i) => expect(p.value, `${group} ${p.date}`).toBeCloseTo(a.points[i]!.value, 9));
      expect(groupWeeklySets(doubled, LIB, group, now)).toEqual(groupWeeklySets(sessions, LIB, group, now));
    }
  });
});
