import { describe, expect, it } from 'vitest';
import type { Exercise, Session } from '../../domain/types';
import { rebuildProfile } from '../../engine';
import { buildEngineSettings, displayName, indexVariants } from '../../library/catalog';
import { SEED_EXERCISES } from '../../library/seed';
import { correctPerformance } from '../../history/ops';
import { beatsRecord, computeRecords, countsForRecord, formatRecord, formatRecordWithDate, recordKeys } from '../records';
import { buildReport, lineText, periodContaining, reportSections, reportText } from '../report';
import { DEFAULT_RECAP_SETTINGS } from '../weekly';

const LIB: Exercise[] = [...SEED_EXERCISES];
const SETTINGS = buildEngineSettings(LIB);
const VARIANTS = indexVariants(LIB);
const name = (id: string) => displayName(VARIANTS.get(id));
/** Heure locale, octobre 2026. */
const at = (d: number, h = 18) => new Date(2026, 9, d, h).getTime();
const CURL = 'curl-biceps-barre-droite';
const TRACTIONS = 'tractions-assistees';

let n = 0;
/** `reps` : répétitions faites ; la cible est la meilleure série sauf `target`. */
function session(d: number, perfs: [string, number, number[], number?][], state: Session['state'] = 'done'): Session {
  const start = at(d);
  return {
    id: `r${++n}`, name: 'Séance', date: `2026-10-${String(d).padStart(2, '0')}`, startedAt: start, endedAt: state === 'done' ? start + 3_600_000 : null,
    createdAt: start, updatedAt: start, origin: 'app', state,
    performances: perfs.map(([variantId, weightKg, reps, target]) => ({
      variantId, weightKg, reps, targetReps: target ?? Math.max(...reps), plannedSets: 3, feeling: 'bien',
    })),
  };
}

describe('Records personnels', () => {
  it('203. Charge plus élevée → record ; même charge, plus de répétitions → record ; une série sous la cible ou une égalité → pas de record', () => {
    const sessions = [
      session(5, [[CURL, 18, [8, 8, 8]]]),
      session(7, [[CURL, 20, [8, 8, 8]]]), // charge plus élevée
      session(9, [[CURL, 20, [9, 9, 9]]]), // même charge, plus de répétitions
      session(12, [[CURL, 22, [10, 10, 9]]]), // une série sous la cible : rien
      session(14, [[CURL, 20, [9, 9, 9]]]), // égalité : le record reste celui du 9
      session(16, [[CURL, 20, [8, 8], 8]]), // séance incomplète (2 séries sur 3) : rien
    ];
    const r = computeRecords(sessions, SETTINGS);
    expect(r.current.get(CURL)).toMatchObject({ date: '2026-10-09', weightKg: 20, sets: 3, reps: 9, assisted: false });
    expect(r.breaks.map((b) => [b.date, b.weightKg, b.reps, b.previous.weightKg, b.previous.reps])).toEqual([
      ['2026-10-07', 20, 8, 18, 8],
      ['2026-10-09', 20, 9, 20, 8],
    ]);
    expect(countsForRecord(sessions[3]!.performances[0]!)).toBe(false);
    expect(formatRecord(r.current.get(CURL)!)).toBe('3 × 9 à 20 kg');
    expect(formatRecordWithDate(r.current.get(CURL)!)).toBe('3 × 9 à 20 kg (9 oct.)');
    // Plus de répétitions avec une charge plus basse : pas de record (la charge passe d'abord).
    const lighter = computeRecords([...sessions, session(20, [[CURL, 18, [12, 12, 12]]])], SETTINGS);
    expect(lighter.current.get(CURL)!.date).toBe('2026-10-09');
  });

  it('204. Exercice assisté : l’aide la plus basse est le record, puis les répétitions ; plus d’aide ne bat jamais le record', () => {
    const sessions = [
      session(5, [[TRACTIONS, 30, [12, 12, 12]]]),
      session(7, [[TRACTIONS, 25, [8, 8, 8]]]), // moins d'aide : record
      session(9, [[TRACTIONS, 35, [12, 12, 12]]]), // plus d'aide : rien
      session(12, [[TRACTIONS, 25, [9, 9, 9]]]), // même aide, plus de répétitions : record
    ];
    const r = computeRecords(sessions, SETTINGS);
    expect(r.breaks.map((b) => [b.date, b.weightKg, b.reps])).toEqual([
      ['2026-10-07', 25, 8],
      ['2026-10-12', 25, 9],
    ]);
    expect(formatRecord(r.current.get(TRACTIONS)!)).toBe('3 × 9 avec 25 kg d’aide');
    expect(beatsRecord(session(20, [[TRACTIONS, 20, [8, 8, 8]]]).performances[0]!, r.current.get(TRACTIONS), true)).toBe(true);
    expect(beatsRecord(session(20, [[TRACTIONS, 30, [12, 12, 12]]]).performances[0]!, r.current.get(TRACTIONS), true)).toBe(false);
  });

  it('205. La toute première performance devient le record sans être célébrée ; pendant la séance, « Nouveau record » seulement si un record existait et qu’il est battu', () => {
    const first = [session(5, [[CURL, 20, [8, 8, 7]]]), session(7, [[CURL, 18, [8, 8, 8]]])];
    const r = computeRecords(first, SETTINGS);
    // La première qui compte (le 7 : le 5 a une série sous la cible) devient le record, sans être un record battu.
    expect(r.current.get(CURL)).toMatchObject({ date: '2026-10-07', weightKg: 18 });
    expect(r.breaks).toEqual([]);
    expect(recordKeys(r).size).toBe(0);
    // Séance en cours : comparée au record des séances terminées, sans compter elle-même.
    const active = session(9, [[CURL, 20, [8, 8, 8]], ['pec-deck', 40, [8, 8, 8]]], 'active');
    expect(computeRecords([...first, active], SETTINGS).current.get(CURL)!.date).toBe('2026-10-07');
    expect(beatsRecord(active.performances[0]!, r.current.get(CURL), false)).toBe(true);
    // Exercice jamais réalisé : pas de « Nouveau record » pour sa première fois.
    expect(beatsRecord(active.performances[1]!, r.current.get('pec-deck'), false)).toBe(false);
    // Séries pas encore toutes faites : pas encore de record.
    expect(beatsRecord({ ...active.performances[0]!, reps: [8, 8] }, r.current.get(CURL), false)).toBe(false);
  });

  it('206. Rétroactif et recalculé : séance passée corrigée ou supprimée, ordre chronologique des imports ; moteur inchangé ; ni cardio ni activités', () => {
    const a = session(5, [[CURL, 18, [8, 8, 8]]]);
    const b = session(9, [[CURL, 20, [8, 8, 8]]]);
    const imported = { ...session(7, [[CURL, 19, [8, 8, 8]]]), origin: 'import' as const, startedAt: null, endedAt: null };
    // L'import d'une séance plus ancienne est rejoué à sa place : 18 → 19 → 20.
    const all = [b, a, imported];
    expect(computeRecords(all, SETTINGS).breaks.map((x) => [x.date, x.weightKg])).toEqual([
      ['2026-10-07', 19],
      ['2026-10-09', 20],
    ]);
    // Correction d'une séance passée : le 9 n'a plus toutes ses séries à la cible, le record redevient celui du 7.
    const corrected = correctPerformance(b, CURL, { reps: [8, 8, 6] }, at(10)).session;
    const after = computeRecords([a, imported, corrected], SETTINGS);
    expect(after.current.get(CURL)).toMatchObject({ date: '2026-10-07', weightKg: 19 });
    // Suppression : recalculé de même.
    expect(computeRecords([a, b], SETTINGS).breaks.map((x) => x.date)).toEqual(['2026-10-09']);
    // Le moteur ne lit jamais les records : profil identique.
    expect(rebuildProfile(all, SETTINGS)).toEqual(rebuildProfile(structuredClone(all), SETTINGS));
    // Une séance de cardio seul n'a pas de record.
    const cardio = { ...session(11, []), cardio: [{ id: 'c', machineId: 'rameur', machine: 'Rameur', minutes: 20 }] };
    expect(computeRecords([cardio], SETTINGS).current.size).toBe(0);
  });

  it('207. Bilan de la période : section « Records » (« 👑 Curl biceps barre droite : 3 × 9 à 20 kg »), dernier record de chaque exercice, première fois exclue, texte du mail', () => {
    const sessions = [
      session(12, [[CURL, 18, [8, 8, 8]], [TRACTIONS, 30, [12, 12, 12]]]),
      session(19, [[CURL, 20, [8, 8, 8]], ['pec-deck', 40, [8, 8, 8]]]),
      session(21, [[CURL, 20, [9, 9, 9]]]),
      session(23, [[TRACTIONS, 25, [8, 8, 8]]]),
    ];
    const report = buildReport(periodContaining('week', at(20)), {
      sessions, exercises: LIB, evaluations: rebuildProfile(sessions, SETTINGS).evaluations, settings: SETTINGS,
      groups: DEFAULT_RECAP_SETTINGS.groups, weighIns: [], now: at(26, 9),
    });
    const section = reportSections(report, name).find((s) => s.title === 'Records')!;
    expect(section.lines.map(lineText)).toEqual(['👑 Curl biceps barre droite : 3 × 9 à 20 kg', '👑 Tractions assistées : 3 × 8 avec 25 kg d’aide']);
    expect(section.lines[0]).toEqual(['👑 Curl biceps barre droite : ', { em: '3 × 9 à 20 kg' }]);
    expect(reportText(report, name)).toContain('\n\nRECORDS\n- 👑 Curl biceps barre droite : 3 × 9 à 20 kg\n- 👑 Tractions assistées : 3 × 8 avec 25 kg d’aide\n');
    // Semaine précédente : les premières fois seulement, rien de célébré.
    const previous = buildReport(periodContaining('week', at(13)), {
      sessions, exercises: LIB, evaluations: rebuildProfile(sessions, SETTINGS).evaluations, settings: SETTINGS,
      groups: DEFAULT_RECAP_SETTINGS.groups, weighIns: [], now: at(26, 9),
    });
    expect(reportSections(previous, name).find((s) => s.title === 'Records')!.lines.map(lineText)).toEqual(['Aucun nouveau record.']);
  });
});
