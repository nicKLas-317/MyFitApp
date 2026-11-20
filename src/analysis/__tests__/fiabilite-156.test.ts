import { describe, expect, it } from 'vitest';
import { DEFAULT_HABITS } from '../../activities/model';
import { DEFAULT_CARDIO_MACHINES } from '../../cardio/model';
import type { Exercise, MuscleGroup, Session } from '../../domain/types';
import { rebuildProfile } from '../../engine';
import { buildEngineSettings, displayName, indexVariants } from '../../library/catalog';
import { SEED_EXERCISES } from '../../library/seed';
import { suggestionAbsence, weekSuggestion } from '../../plan/suggest';
import { daySession, PAST_WEEKS, weekHistory, type DaySpec } from '../../plan/__tests__/completer-simulation';
import { backupReminderDelay, BACKUP_REMINDER_MS, needsBackupReminder, UNPROTECTED_REMINDER_MS } from '../../transfer/backupReminder';
import { buildCoachExport, type CoachInput } from '../coach';
import { buildReport, reportText } from '../report';
import { periodContaining } from '../reportPeriod';
import { progressionMeta } from '../reportScreen';
import { deduceSubGroups } from '../subGroups';
import { alertSetsMax, DEFAULT_RECAP_SETTINGS, groupWork, sanitizeRecapSettings } from '../weekly';

/** Version 1.56.0 : fiabilité et bugs de l'audit du 20 novembre 2026. */
const LIB: Exercise[] = [...SEED_EXERCISES];
const SETTINGS = buildEngineSettings(LIB);
const DAY = 24 * 60 * 60 * 1000;
const ALL6 = ['chest-press', 'tirage-vertical', 'elevations-laterales', 'curl-biceps-halteres', 'extension-triceps-poulie', 'presse-a-cuisses'];

describe('Fiabilité (version 1.56.0)', () => {
  it('329. Rappel de sauvegarde : 14 jours avec le stockage persistant (ou son état pas encore connu), 7 jours sans', () => {
    expect(BACKUP_REMINDER_MS).toBe(14 * DAY);
    expect(UNPROTECTED_REMINDER_MS).toBe(7 * DAY);
    expect(backupReminderDelay('granted')).toBe(BACKUP_REMINDER_MS);
    expect(backupReminderDelay(null)).toBe(BACKUP_REMINDER_MS);
    expect(backupReminderDelay('denied')).toBe(UNPROTECTED_REMINDER_MS);
    expect(backupReminderDelay('unsupported')).toBe(UNPROTECTED_REMINDER_MS);
    const done = (at: number): Session => ({ ...daySession({ date: '2026-11-02', variants: ['pec-deck'] }), id: `s${at}`, createdAt: at, updatedAt: at });
    const exportAt = 10 * DAY;
    const sessions = [done(DAY), done(12 * DAY)];
    // Séance terminée après le dernier export : 8 jours plus tard, rappel sans stockage persistant, pas avec.
    expect(needsBackupReminder(sessions, exportAt, exportAt + 8 * DAY, backupReminderDelay('denied'))).toBe(true);
    expect(needsBackupReminder(sessions, exportAt, exportAt + 8 * DAY, backupReminderDelay('granted'))).toBe(false);
    expect(needsBackupReminder(sessions, exportAt, exportAt + 7 * DAY - 1, backupReminderDelay('denied'))).toBe(false);
    // Rien de nouveau depuis l'export : jamais de rappel (choix signalé à l'utilisateur).
    expect(needsBackupReminder([done(DAY)], exportAt, exportAt + 30 * DAY, backupReminderDelay('denied'))).toBe(false);
    // Contre-test : sans délai donné, la règle d'avant (14 jours).
    expect(needsBackupReminder(sessions, exportAt, exportAt + 8 * DAY)).toBe(false);
  });

  it('331. Séance pour compléter la semaine : la raison de son absence, dans l’export pour le coach', () => {
    const input = (current: DaySpec[], now: number) => ({ sessions: weekHistory(current), exercises: LIB, settings: SETTINGS, recap: DEFAULT_RECAP_SETTINGS, now });
    // Mercredi 11 nov., tous les groupes à 3 séries ; jeudi 12 à 9 h, tous sous l'objectif mais travaillés la veille.
    const wednesday: DaySpec[] = [{ date: '2026-11-11', variants: ALL6 }];
    const thursday = new Date(2026, 10, 12, 9).getTime();
    expect(weekSuggestion(input(wednesday, thursday))).toBeNull();
    const absence = suggestionAbsence(input(wednesday, thursday));
    expect(absence).toMatchObject({ reason: 'ecartes' });
    expect(absence && 'skipped' in absence ? absence.skipped.map((x) => [x.group, x.reason]) : []).toEqual(
      (['pectoraux', 'dos', 'epaules', 'biceps', 'triceps', 'jambes'] as MuscleGroup[]).map((g) => [g, 'veille']),
    );
    // Les autres raisons.
    expect(suggestionAbsence(input([{ date: '2026-11-11', hour: 10, variants: ['crunch-sol'], home: true }], thursday))).toEqual({ reason: 'aucune_salle' });
    expect(suggestionAbsence(input([{ date: '2026-11-15', variants: ALL6 }], new Date(2026, 10, 15, 20).getTime()))).toEqual({ reason: 'semaine_suivante' });
    const full: DaySpec[] = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12'].map((date) => ({ date, variants: ALL6 }));
    expect(suggestionAbsence(input(full, new Date(2026, 10, 14, 9).getTime()))).toEqual({ reason: 'objectif' });
    // Une séance proposée : pas d'absence.
    expect(suggestionAbsence(input(wednesday, new Date(2026, 10, 13, 9).getTime()))).toBeNull();

    // Export pour le coach du lundi 16 : séance à la salle le samedi 14, tout écarté le dimanche (avant : « tous les
    // groupes du récapitulatif à l’objectif », faux).
    const coachInput: CoachInput = {
      sessions: weekHistory([{ date: '2026-11-14', hour: 10, variants: ALL6 }], PAST_WEEKS), exercises: LIB, settings: SETTINGS, recap: DEFAULT_RECAP_SETTINGS,
      activities: [], habits: [...DEFAULT_HABITS], machines: [...DEFAULT_CARDIO_MACHINES], weighIns: [], heightCm: null, ignoredAlerts: {}, appVersion: '1.56.0',
      now: new Date(2026, 10, 16, 9).getTime(),
    };
    const coach = buildCoachExport(coachInput).signaux.seance_pour_completer;
    expect(coach).toMatchObject({ proposee_pour: null, raison: 'des groupes sont encore sous l’objectif, mais aucun exercice ne peut être proposé pour eux' });
    expect((coach as { ecartes?: unknown[] }).ecartes).toHaveLength(6);
    expect(JSON.stringify(coach)).not.toContain('à l’objectif (hors abdominaux)');
  });

  it('332. Sous-groupes déduits : un sous-groupe des jambes déclaré en secondaire compte pour lui-même, pas pour les quadriceps', () => {
    const ex = (name: string, primaryGroup: MuscleGroup, secondaryGroups: MuscleGroup[]) => ({ name, primaryGroup, secondaryGroups });
    // Soulevé de terre (dos ; ischio-jambiers, fessiers) : ischio-jambiers ½, fessiers ½, pas de quadriceps.
    const deadlift = deduceSubGroups(ex('Soulevé de terre', 'dos', ['ischio-jambiers', 'fessiers']));
    expect(deadlift['ischio-jambiers']).toBe(0.5);
    expect(deadlift.fessiers).toBe(0.5);
    expect(deadlift.quadriceps).toBeUndefined();
    // Un mot-clé l'emporte, comme pour le groupe principal (« jambes tendues » : ischio-jambiers).
    expect(deduceSubGroups(ex('Rowing jambes tendues', 'dos', ['fessiers']))).toMatchObject({ 'ischio-jambiers': 0.5 });
    // « jambes » en secondaire, sans sous-groupe ni mot-clé : la règle des groupes secondaires (quadriceps ½), inchangée.
    expect(deduceSubGroups(ex('Machine Technogym 9', 'dos', ['jambes'])).quadriceps).toBe(0.5);
    // Groupe principal « jambes » : inchangé (sous-groupes en secondaire, 1 chacun).
    expect(deduceSubGroups(ex('Machine Technogym 7', 'jambes', ['ischio-jambiers', 'fessiers']))).toMatchObject({ 'ischio-jambiers': 1, fessiers: 1 });
  });

  it('333. Seuil de l’alerte « moins travaillé » toujours sous le seuil du rouge', () => {
    expect(alertSetsMax(10)).toBe(9);
    expect(alertSetsMax(8)).toBe(7);
    expect(alertSetsMax(6)).toBe(5);
    const groups = DEFAULT_RECAP_SETTINGS.groups;
    // Réglage lu ou importé : ramené sous le rouge.
    expect(sanitizeRecapSettings({ groups, redSets: 6, alertSets: 9 })).toEqual({ groups, redSets: 6, alertSets: 5 });
    expect(sanitizeRecapSettings({ groups, redSets: 8, alertSets: 9 })).toEqual({ groups, redSets: 8, alertSets: 7 });
    expect(sanitizeRecapSettings({ groups, redSets: 12, alertSets: 9 })).toEqual({ groups, redSets: 12, alertSets: 9 });
    expect(sanitizeRecapSettings({ groups, redSets: 6 })).toEqual({ groups, redSets: 6, alertSets: 5 });
  });

  it('334. Performance partielle importée à la maison : une séance du groupe dans le bilan, pas « Non travaillés »', () => {
    const home: Session = {
      ...daySession({ date: '2026-11-03', variants: [], home: true }),
      origin: 'import',
      performances: [{ variantId: 'tirage-vertical', weightKg: 40, targetReps: null, plannedSets: null, reps: [], feeling: 'inconnu', partial: true }],
    };
    const week = periodContaining('week', new Date(2026, 10, 9, 9).getTime());
    const prev = { ...week, start: new Date(2026, 10, 2), next: new Date(2026, 10, 9) };
    const inPrev = (t: number) => t >= prev.start.getTime() && t < prev.next.getTime();
    expect(groupWork([home], LIB, DEFAULT_RECAP_SETTINGS.groups, inPrev).counts.get('dos')).toBe(1);
    const report = buildReport(prev, {
      sessions: [home], exercises: LIB, evaluations: rebuildProfile([home], SETTINGS).evaluations, settings: SETTINGS, groups: DEFAULT_RECAP_SETTINGS.groups, weighIns: [],
      now: new Date(2026, 10, 9, 9).getTime(),
    });
    const refs = indexVariants(LIB);
    const text = reportText(report, (id) => displayName(refs.get(id)));
    expect(text).toContain('- Dos : 0 série (1 séance)');
    expect(text).toMatch(/Non travaillés : Pectoraux, Épaules, Biceps, Triceps, Jambes\b/);
  });

  it('336. Export pour le coach : noms courts des sous-groupes (ceux du mail) ; « déjà fait » aussi par une variante archivée', () => {
    const lib = LIB.map((e) => (e.id === 'tirage-vertical' ? { ...e, variants: e.variants.map((v) => (v.id === 'tirage-vertical' ? { ...v, archived: true } : v)) } : e));
    const input: CoachInput = {
      sessions: weekHistory(), exercises: lib, settings: buildEngineSettings(lib), recap: DEFAULT_RECAP_SETTINGS,
      activities: [], habits: [...DEFAULT_HABITS], machines: [...DEFAULT_CARDIO_MACHINES], weighIns: [], heightCm: null, ignoredAlerts: {}, appVersion: '1.56.0',
      now: new Date(2026, 10, 16, 9).getTime(),
    };
    const data = buildCoachExport(input);
    expect(Object.keys(data.recapitulatif.sous_groupes['Biceps'] as object)).toEqual(['longue', 'courte', 'brachial']);
    expect(Object.keys(data.recapitulatif.sous_groupes['Triceps'] as object)).toEqual(['longue', 'latérale', 'médiale']);
    expect(Object.keys(data.recapitulatif.sous_groupes_4_semaines['Biceps'] as object)).toEqual(['longue', 'courte', 'brachial']);
    // Le tirage vertical n'a été fait qu'en prise moyenne, variante archivée ici : déjà fait.
    const tirage = Object.values(data.bibliotheque).flat().find((e) => (e as { nom: string }).nom === 'Tirage vertical') as Record<string, unknown>;
    expect(tirage).toMatchObject({ deja_fait: true, variantes: ['Prise très large', 'Prise serrée'] });
    expect(tirage).not.toHaveProperty('variantes_faites');
  });

  it('337. Bilan : la date d’un palier validé est dite en clair (« validé le »)', () => {
    const p = { variantId: 'chest-press', date: '2026-11-04', sets: 3, from: { weightKg: 73, targetReps: 8 }, to: { weightKg: 73, targetReps: 9 }, assisted: false, seconds: false, home: false, weightUp: false };
    expect(progressionMeta(p as unknown as Parameters<typeof progressionMeta>[0])).toBe('3 séries · à 73 kg · validé le 4 nov.');
  });
});
