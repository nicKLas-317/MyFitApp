import { describe, expect, it } from 'vitest';
import type { Exercise, Session } from '../../domain/types';
import { buildEngineSettings, indexVariants } from '../catalog';
import { SEED_EXERCISES } from '../seed';
import { perDumbbell } from '../search';
import { formatKg, kgUnit } from '../../session/format';
import { formatRecord, formatRecordWithDate, type PersonalRecord } from '../../analysis/records';
import { buildReport, lineText, periodContaining, reportSections, reportText } from '../../analysis/report';
import { DEFAULT_RECAP_SETTINGS } from '../../analysis/weekly';
import { changeText } from '../../ui/labels';
import { displayName } from '../catalog';
import { rebuildProfile } from '../../engine';
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

  it('273. Bilans de la semaine et du mois, texte du mail et dernières évolutions en « kg / haltère » (version 1.30.2) ; « kg » pour les autres exercices', () => {
    const at = (d: number) => new Date(2026, 9, d, 18).getTime();
    const session = (d: number, perfs: [string, number, number[]][]): Session => ({
      id: `s${d}`, name: `s${d}`, date: `2026-10-${String(d).padStart(2, '0')}`, startedAt: at(d), endedAt: at(d) + 1_800_000, createdAt: at(d), updatedAt: at(d),
      origin: 'app', state: 'done',
      performances: perfs.map(([variantId, weightKg, reps]) => ({ variantId, weightKg, targetReps: Math.max(...reps), plannedSets: 3, reps, feeling: 'bien' })),
    });
    const red = [8, 6, 6];
    // Curl aux haltères : deux vertes à 3 × 8 (+1 rép. le 19), record battu le 21 ; élévations latérales : quatrième
    // rouge de suite le 23 ; pec deck (machine) : +1 rép. le 19.
    const sessions = [
      session(12, [['curl-biceps-halteres', 12, [8, 8, 8]], ['elevations-laterales', 6, red], ['pec-deck', 40, [8, 8, 8]]]),
      session(19, [['curl-biceps-halteres', 12, [8, 8, 8]], ['elevations-laterales', 6, red], ['pec-deck', 40, [8, 8, 8]]]),
      session(21, [['curl-biceps-halteres', 12, [9, 9, 9]], ['elevations-laterales', 6, red]]),
      session(23, [['elevations-laterales', 6, red]]),
    ];
    const settings = buildEngineSettings(LIB);
    const report = buildReport(periodContaining('week', at(20)), {
      sessions, exercises: LIB, evaluations: rebuildProfile(sessions, settings).evaluations, settings,
      groups: DEFAULT_RECAP_SETTINGS.groups, weighIns: [], now: at(26),
    });
    const name = (id: string) => displayName(refs.get(id));
    const lines = (title: string) => reportSections(report, name, dumbbell).find((s) => s.title === title)!.lines.map(lineText);
    expect(lines('Progressions')).toEqual(['Curl biceps haltères : 3×8 → 3×9 à 12 kg / haltère (19 oct.)', 'Pec deck : 3×8 → 3×9 à 40 kg (19 oct.)']);
    expect(lines('Records')).toEqual(['👑 Curl biceps haltères : 3 × 9 à 12 kg / haltère']);
    expect(lines('En difficulté')).toEqual(['Élévations latérales haltères : 4ᵉ séance rouge de suite à 6 kg / haltère → poids inférieur recommandé (23 oct.)']);
    // Série de rouges commencée avant la période, sans baisse : « (3 de suite à 6 kg / haltère) ».
    const before = buildReport(periodContaining('week', at(20)), {
      sessions: sessions.slice(0, 3), exercises: LIB, evaluations: rebuildProfile(sessions.slice(0, 3), settings).evaluations, settings,
      groups: DEFAULT_RECAP_SETTINGS.groups, weighIns: [], now: at(22),
    });
    expect(reportSections(before, name, dumbbell).find((s) => s.title === 'En difficulté')!.lines.map(lineText)).toEqual([
      'Élévations latérales haltères : 2 séances rouges cette semaine (3 de suite à 6 kg / haltère)',
    ]);
    // Texte du mail : la même chose.
    const text = reportText(report, name, dumbbell);
    expect(text).toContain('\n- Curl biceps haltères : 3×8 → 3×9 à 12 kg / haltère (19 oct.)\n- Pec deck : 3×8 → 3×9 à 40 kg (19 oct.)\n');
    expect(text).toContain('\n- 👑 Curl biceps haltères : 3 × 9 à 12 kg / haltère\n');
    expect(text).toContain('à 6 kg / haltère → poids inférieur recommandé');
    // Sans l'information, « kg » (comportement des versions antérieures).
    expect(reportText(report, name)).not.toContain('haltère :');
    expect(reportText(report, name)).not.toContain('kg / haltère');

    // Dernières évolutions (une ligne, forme courte) : « 11,5 → 12,5 kg/haltère, 12 → 8 rép. ».
    const palier = (weightKg: number, targetReps: number) => ({ weightKg, targetReps });
    expect(changeText({ from: palier(11.5, 12), to: palier(12.5, 8) }, false, true)).toBe('11,5 → 12,5 kg/haltère, 12 → 8 rép.');
    expect(changeText({ from: palier(12, 9), to: palier(10, 9) }, false, true)).toBe('12 → 10 kg/haltère');
    expect(changeText({ from: palier(12, 8), to: palier(12, 9) }, false, true)).toBe('8 → 9 rép.');
    expect(changeText({ from: palier(40, 12), to: palier(45, 8) })).toBe('40 → 45 kg, 12 → 8 rép.');
  });
});
