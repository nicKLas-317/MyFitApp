import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { Exercise, Session } from '../../domain/types';
import { rebuildProfile } from '../../engine';
import { buildEngineSettings, displayName, indexVariants } from '../../library/catalog';
import { SEED_EXERCISES } from '../../library/seed';
import { recapCountLabel, recapTitle, weeklyRecap, type WeeklyRecap } from '../../analysis/weekly';
import { buildReport, lineText, periodContaining, reportSections, reportText } from '../../analysis/report';
import { buildBackup, parseJsonImport, SCHEMA_VERSION } from '../../transfer/backup';
import { openAppDb, Repository } from '../../storage/db';
import {
  DEFAULT_HABITS,
  activityLabel,
  answer,
  habitErrors,
  mergeActivities,
  pendingOccurrences,
  questionText,
  sanitizeActivities,
  sanitizeHabits,
  type ActivityRecord,
  type Habit,
} from '../model';

const LIB: Exercise[] = [...SEED_EXERCISES];
const SETTINGS = buildEngineSettings(LIB);
const VARIANTS = indexVariants(LIB);
const name = (id: string) => displayName(VARIANTS.get(id));
/** Heure locale, octobre 2026 : le lundi 19 commence la semaine. */
const at = (d: number, h = 12, m = 0) => new Date(2026, 9, d, h, m).getTime();
const BADMINTON: Habit = DEFAULT_HABITS[0]!;
const nb = (text: string) => text.replace(/ /g, ' ');

let n = 0;
function session(start: number, variants: string[], cardioMinutes = 0): Session {
  const d = new Date(start);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const s: Session = {
    id: `s${++n}`, name: 'Séance', date, startedAt: start, endedAt: start + 3_600_000, createdAt: start, updatedAt: start,
    origin: 'app', state: 'done',
    performances: variants.map((variantId) => ({ variantId, weightKg: 20, targetReps: 8, plannedSets: 3, reps: [8, 8, 8], feeling: 'bien' })),
  };
  if (cardioMinutes > 0) s.cardio = [{ id: `c${n}`, machineId: 'rameur', machine: 'Rameur', minutes: cardioMinutes }];
  return s;
}

/** Badminton confirmé (« Oui ») le lundi `day`. */
const badminton = (day: string, yes = true): ActivityRecord => answer({ habit: BADMINTON, date: day }, yes, at(20));
const cell = (r: WeeklyRecap, g: string) => r.cells.find((c) => c.group === g)!;

describe('Activités habituelles hors salle', () => {
  it('196. Habitudes : badminton par défaut (lundi 21 h – 22 h 30, jambes et épaules, active) ; liste enregistrée gardée, entrées invalides écartées', () => {
    expect(sanitizeHabits(undefined)).toEqual([
      { id: 'badminton', name: 'Badminton', weekday: 1, start: '21:00', end: '22:30', groups: ['epaules', 'jambes'], enabled: true },
    ]);
    // Une liste enregistrée, même vide, n'est jamais complétée : une habitude supprimée n'est pas recréée.
    expect(sanitizeHabits([])).toEqual([]);
    const tennis: Habit = { id: 'habitude-tennis', name: 'Tennis', weekday: 3, start: '18:00', end: '19:00', groups: ['epaules'], enabled: false };
    expect(sanitizeHabits([tennis, { ...tennis, id: 'x', end: '17:00' }, { ...tennis, id: 'y', weekday: 8 }, 'n’importe quoi'])).toEqual([tennis]);
    expect(habitErrors({ ...tennis, name: ' ' })).toEqual(['empty_name']);
    expect(habitErrors({ ...tennis, end: '18:00' })).toEqual(['end_before_start']);
    expect(habitErrors({ ...tennis, start: '25:00' })).toEqual(['bad_time']);
    expect(habitErrors({ ...tennis, id: 'autre', name: 'tennis' }, [tennis, { ...tennis, id: 'autre', name: 'tennis' }])).toEqual(['duplicate_name']);
  });

  it('197. Question après l’heure de fin seulement (lundi 22 h 30), jusqu’au dimanche, puis plus rien ; aucune question pour une habitude désactivée', () => {
    const habits = [BADMINTON];
    expect(pendingOccurrences(habits, [], at(19, 21, 0))).toEqual([]);
    expect(pendingOccurrences(habits, [], at(19, 22, 29))).toEqual([]);
    const asked = pendingOccurrences(habits, [], at(19, 22, 30));
    expect(asked).toEqual([{ habit: BADMINTON, date: '2026-10-19' }]);
    expect(nb(questionText(asked[0]!))).toBe('Badminton lundi soir (21 h – 22 h 30) ?');
    // Sans réponse : toujours posée mardi, jeudi, dimanche soir…
    for (const t of [at(20, 8), at(22, 18), at(25, 23, 59)]) expect(pendingOccurrences(habits, [], t)).toEqual(asked);
    // … puis disparaît le lundi suivant, sans rien enregistrer ; ce lundi-là attend à nouveau 22 h 30.
    expect(pendingOccurrences(habits, [], at(26, 9))).toEqual([]);
    expect(pendingOccurrences(habits, [], at(26, 22, 30))).toEqual([{ habit: BADMINTON, date: '2026-10-26' }]);
    // Habitude désactivée (vacances) : aucune question.
    expect(pendingOccurrences([{ ...BADMINTON, enabled: false }], [], at(20, 8))).toEqual([]);
    // Autre jour, autre moment de la journée.
    const sat = { ...BADMINTON, id: 'habitude-velo', name: 'Vélo', weekday: 6 as const, start: '09:30', end: '11:00' };
    expect(pendingOccurrences([sat], [], at(24, 10, 59))).toEqual([]);
    expect(nb(questionText(pendingOccurrences([sat], [], at(24, 11))[0]!))).toBe('Vélo samedi matin (9 h 30 – 11 h) ?');
  });

  it('198. « Oui » enregistre l’activité à la date du lundi ; « Non » n’enregistre rien ; la question ne revient plus pour ce lundi ; supprimée, elle ne revient pas non plus', () => {
    const occurrence = pendingOccurrences([BADMINTON], [], at(20, 8))[0]!;
    const yes = answer(occurrence, true, at(20, 8));
    expect(yes).toEqual({
      id: 'act-badminton-2026-10-19', habitId: 'badminton', date: '2026-10-19', name: 'Badminton', start: '21:00', end: '22:30',
      groups: ['epaules', 'jambes'], status: 'done', answeredAt: at(20, 8),
    });
    expect(activityLabel(yes)).toBe('Badminton · 1 h 30');
    expect(pendingOccurrences([BADMINTON], [yes], at(22, 9))).toEqual([]);
    const no = answer(occurrence, false, at(20, 8));
    expect(no.status).toBe('declined');
    expect(pendingOccurrences([BADMINTON], [no], at(22, 9))).toEqual([]);
    expect(weeklyRecap([], LIB, at(20, 9), undefined, [no]).activityCount).toBe(0);
    expect(cell(weeklyRecap([], LIB, at(20, 9), undefined, [no]), 'jambes').indirect).toBe(0);
    // Supprimée de l'historique (réponse passée à « declined ») : ni comptée, ni redemandée.
    const removed = { ...yes, status: 'declined' as const };
    expect(pendingOccurrences([BADMINTON], [removed], at(22, 9))).toEqual([]);
    expect(weeklyRecap([], LIB, at(20, 9), undefined, [removed]).activityCount).toBe(0);
    // Modifier l'habitude ensuite ne change pas l'activité enregistrée.
    expect(sanitizeActivities([yes, { ...yes, id: 'bad', status: 'peut-être' }])).toEqual([yes]);
  });

  it('199. Récapitulatif : badminton lundi → jambes et épaules « +1 indirect · hier » le mardi ; en-tête « 3 séances · 1 activité · 45 min de cardio » ; au plus 1 par jour et par groupe', () => {
    const monday = [badminton('2026-10-19')];
    const tuesday = weeklyRecap([], LIB, at(20, 9), undefined, monday);
    for (const g of ['jambes', 'epaules']) {
      expect(cell(tuesday, g)).toMatchObject({ count: 0, indirect: 1, score: 0.5, color: 'vert', recency: 'yesterday' });
      expect(nb(recapCountLabel(cell(tuesday, g)))).toBe('+1 indirect');
    }
    expect(cell(tuesday, 'dos')).toMatchObject({ indirect: 0, recency: null });
    // Lundi 23 h : « aujourd'hui ».
    expect(cell(weeklyRecap([], LIB, at(19, 23), undefined, monday), 'jambes').recency).toBe('today');
    // Une activité n'est pas une séance : comptée à part dans l'en-tête.
    const week = [session(at(20, 18), ['pec-deck'], 20), session(at(21, 18), ['tirage-vertical'], 25), session(at(22, 18), ['curl-biceps-halteres'])];
    const r = weeklyRecap(week, LIB, at(23, 9), undefined, monday);
    expect(r.sessionCount).toBe(3);
    expect(nb(recapTitle(r))).toBe('Semaine du lun. 19 au dim. 25 oct. : 3 séances · 1 activité · 45 min de cardio');
    expect(nb(recapTitle(weeklyRecap(week, LIB, at(23, 9))))).toBe('Semaine du lun. 19 au dim. 25 oct. : 3 séances · 45 min de cardio');
    expect(nb(recapTitle(weeklyRecap([], LIB, at(20, 9), undefined, monday)))).toBe('Semaine du lun. 19 au dim. 25 oct. : 0 séance · 1 activité');
    // Avec une séance le même jour : jambes travaillées en direct → l'activité n'ajoute rien (1 au plus) ;
    // épaules seulement secondaires (développé couché) → ½ + ½ = 1.
    const sameDay = weeklyRecap([session(at(19, 18), ['presse-a-cuisses', 'developpe-couche'])], LIB, at(20, 9), undefined, monday);
    expect(cell(sameDay, 'jambes')).toMatchObject({ count: 1, indirect: 0, score: 1 });
    expect(cell(sameDay, 'epaules')).toMatchObject({ count: 0, indirect: 2, score: 1, color: 'orange' });
    // Deux badmintons dans la semaine (lundis 12 et 19 : semaines différentes) : seul celui de la semaine compte,
    // mais « hier » vaut aussi pour la semaine précédente.
    const prev = weeklyRecap([], LIB, at(26, 9), undefined, [badminton('2026-10-19'), badminton('2026-10-12')]);
    expect(cell(prev, 'jambes')).toMatchObject({ indirect: 0, recency: null });
    // Activité de dimanche soir, vue le lundi : « hier », semaine précédente.
    const sunday: ActivityRecord = { ...badminton('2026-10-25'), id: 'act-x', date: '2026-10-25' };
    expect(cell(weeklyRecap([], LIB, at(26, 9), undefined, [sunday]), 'jambes')).toMatchObject({ indirect: 0, recency: 'yesterday' });
  });

  it('200. Bilan de la période : « Activités : Badminton ×4, 6 h 00 », groupes indirects, texte du mail ; séances, durée et moteur inchangés', () => {
    const month = periodContaining('month', at(15));
    const lundis = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'].map((d) => badminton(d));
    const sessions = [session(at(20, 18), ['pec-deck']), session(at(22, 18), ['tirage-vertical'])];
    const input = { sessions, exercises: LIB, evaluations: rebuildProfile(sessions, SETTINGS).evaluations, settings: SETTINGS, groups: ['pectoraux', 'dos', 'epaules', 'biceps', 'triceps', 'jambes'] as const, weighIns: [], now: at(31, 9) };
    const r = buildReport(month, { ...input, groups: [...input.groups], activities: [...lundis, badminton('2026-11-02'), answer({ habit: BADMINTON, date: '2026-10-06' }, false, 0)] });
    expect(r.totals.sessionCount).toBe(2);
    expect(r.activities).toEqual([{ name: 'Badminton', count: 4, minutes: 360 }]);
    const lines = (title: string) => reportSections(r, name).find((s) => s.title === title)!.lines.map(lineText);
    expect(lines('Séances')).toContain('Activités : Badminton ×4, 6 h 00');
    // Une seule séance indirecte par semaine reste ½ : quatre lundis de badminton → +4 indirect.
    expect(lines('Groupes travaillés')).toEqual(['Pectoraux : 1×', 'Dos : 1×', 'Biceps : +1 indirect', 'Jambes : +4 indirect', 'Épaules : +4 indirect', 'Non travaillés : Triceps'].sort((a, b) => order(a) - order(b)));
    expect(reportText(r, name)).toContain('\n- Activités : Badminton ×4, 6 h 00\n');
    // Sans activité : rien de plus, séances et durée identiques.
    const without = buildReport(month, { ...input, groups: [...input.groups] });
    expect(without.totals).toEqual(r.totals);
    expect(reportText(without, name)).not.toContain('Activités');
    // Semaine sans séance mais avec du badminton : ligne des activités et groupes, rien d'autre d'inventé.
    const empty = buildReport(periodContaining('week', at(28)), { ...input, groups: [...input.groups], activities: lundis });
    expect(reportSections(empty, name).map((s) => s.title)).toEqual(['Séances', 'Groupes travaillés']);
    expect(reportSections(empty, name)[0]!.lines.map(lineText)).toEqual(['0 séance, −2 par rapport à lun.–sam. de la semaine dernière', 'Durée en salle : 0 min, −2 h 00 par rapport à lun.–sam. de la semaine dernière', 'Activités : Badminton ×1, 1 h 30']);
    // Aucun effet sur le moteur : il ne reçoit jamais les activités.
    expect(rebuildProfile(sessions, SETTINGS)).toEqual(rebuildProfile(structuredClone(sessions), SETTINGS));
  });

  it('201. Export / import : activités et habitudes dans la sauvegarde (format 4), fusion sans doublon, format 3 migré sans perte, activité invalide refusée', async () => {
    const yes = badminton('2026-10-19');
    const no = badminton('2026-10-12', false);
    const tennis: Habit = { id: 'habitude-tennis', name: 'Tennis', weekday: 3, start: '18:00', end: '19:00', groups: ['epaules'], enabled: false };
    const backup = buildBackup({ sessions: [], exercises: LIB, activities: [yes, no], settings: { habits: [BADMINTON, tennis] } }, at(25));
    expect(backup.schemaVersion).toBe(4);
    const parsed = parseJsonImport(JSON.stringify(backup), LIB, '2026-10-25');
    if (parsed.kind !== 'backup') throw new Error(parsed.kind);
    expect(parsed.backup.activities).toEqual([yes, no]);
    expect(sanitizeHabits(parsed.backup.settings.habits)).toEqual([BADMINTON, tennis]);
    // Format 3 (version antérieure) : migré, aucune activité ; les habitudes par défaut s'appliquent.
    const { activities: _a, ...v3 } = { ...backup, schemaVersion: 3, settings: {} };
    const old = parseJsonImport(JSON.stringify(v3), LIB, '2026-10-25');
    if (old.kind !== 'backup') throw new Error(old.kind);
    expect(old.backup).toMatchObject({ schemaVersion: SCHEMA_VERSION, activities: [] });
    expect(sanitizeHabits(old.backup.settings.habits)).toEqual([BADMINTON]);
    // Activité invalide : sauvegarde refusée, rien n'est importé.
    const invalid = parseJsonImport(JSON.stringify({ ...backup, activities: [{ ...yes, end: '20:00' }] }), LIB, '2026-10-25');
    expect(invalid.kind).toBe('error');
    if (invalid.kind === 'error') expect(invalid.details).toEqual(['activities[0] : heures invalides.']);
    // Fusion : la réponse de l'appareil est gardée ; une activité confirmée du même nom le même jour n'est pas doublée.
    const local = [{ ...no, status: 'done' as const }];
    const twin = { ...yes, id: 'act-autre-2026-10-19', habitId: 'autre' };
    const tue = { ...yes, id: 'act-badminton-2026-10-20', date: '2026-10-20' };
    expect(mergeActivities(local, [no, yes, twin, tue])).toEqual([...local, yes, tue]);

    // Écrites avec les séances dans une seule transaction.
    const repo = new Repository(await openAppDb('test-activites'));
    await repo.applyImport({ sessions: [session(at(20), ['pec-deck'])], exercises: [], activities: [yes, no] });
    expect(sanitizeActivities(await repo.getMeta('activities'))).toEqual([yes, no]);
    expect(await repo.loadSessions()).toHaveLength(1);
    repo.close();
  });
});

const ORDER = ['Pectoraux', 'Dos', 'Épaules', 'Biceps', 'Triceps', 'Jambes', 'Non'];
function order(line: string): number {
  return ORDER.findIndex((g) => line.startsWith(g));
}
