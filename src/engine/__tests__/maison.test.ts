import { describe, expect, it } from 'vitest';
import type { Exercise, Performance, Session } from '../../domain/types';
import { buildReport, periodContaining, reportText } from '../../analysis/report';
import { computeRecords, formatRecord } from '../../analysis/records';
import { analyzeProgress, recentChanges } from '../../analysis/progress';
import { recapTitle, weeklyRecap } from '../../analysis/weekly';
import { groupIndex, groupWeeklySets } from '../../analysis/groups';
import { setSessionLocation } from '../../history/ops';
import { buildEngineSettings, displayName, indexVariants } from '../../library/catalog';
import { compactConfig, validateConfig } from '../../library/edit';
import { recentVariantIds } from '../../library/search';
import { SEED_EXERCISES } from '../../library/seed';
import { startSession } from '../../session/ops';
import { buildBackup, parseJsonImport, SCHEMA_VERSION } from '../../transfer/backup';
import { DEFAULT_VARIANT_CONFIG, HOME_SUFFIX, resolveConfig, trackKey, variantOfTrack } from '../config';
import { rebuildProfile } from '../replay';
import { createSessionFromTemplate } from '../session';
import { perf } from './helpers';

const LIB: Exercise[] = [...SEED_EXERCISES];
const settings = buildEngineSettings(LIB);
const CURL = 'curl-biceps-halteres';
const HOME = `${CURL}${HOME_SUFFIX}`;

/** Séance terminée le jour `d` d'octobre 2026, à 18 h, d'une heure ; `home` : à la maison. */
function done(id: string, d: number, performances: Performance[], home = false, extra: Partial<Session> = {}): Session {
  const t = new Date(2026, 9, d, 18).getTime();
  return {
    id, name: id, date: `2026-10-${String(d).padStart(2, '0')}`, startedAt: t, endedAt: t + 3_600_000, createdAt: t, updatedAt: t,
    origin: 'app', state: 'done', performances, ...(home ? { location: 'maison' as const } : {}), ...extra,
  };
}
const curl = (w: number, t: number, feeling: 'bien' | 'moyen' = 'bien') => perf(w, t, [t, t, t], feeling, { variantId: CURL });

describe('Salle et maison : deux suivis pour un exercice à charge (version 1.26.0)', () => {
  it('255. Suivi de la maison à part (plage jusqu’à 15), un seul suivi au poids du corps ; changer le lieu d’une séance recalcule les deux suivis', () => {
    // Suivis : à la maison, un exercice à charge a le sien ; au poids du corps et en secondes, un seul.
    expect(trackKey(settings, CURL, false)).toBe(CURL);
    expect(trackKey(settings, CURL, true)).toBe(HOME);
    expect(trackKey(settings, 'crunch-sol', true)).toBe('crunch-sol');
    expect(trackKey(settings, 'planche', true)).toBe('planche');
    expect(variantOfTrack(HOME)).toBe(CURL);
    // Plage de la maison : 8 à 15 par défaut, réglable ; le reste (séries, assisté) suit la variante.
    expect(resolveConfig(settings, CURL)).toEqual(DEFAULT_VARIANT_CONFIG);
    expect(resolveConfig(settings, HOME)).toEqual({ ...DEFAULT_VARIANT_CONFIG, maxReps: 15 });
    expect(resolveConfig(settings, `tractions-assistees${HOME_SUFFIX}`)).toMatchObject({ assisted: true, minReps: 8, maxReps: 15 });
    const tuned = { ...settings, overrides: { [CURL]: { homeMinReps: 10, homeMaxReps: 20 } } };
    expect(resolveConfig(tuned, HOME)).toEqual({ ...DEFAULT_VARIANT_CONFIG, minReps: 10, maxReps: 20 });
    expect(resolveConfig(tuned, CURL)).toMatchObject({ minReps: 8, maxReps: 12 });

    // Salle : 12 kg ; maison : 6 kg, intercalées. Le suivi de la salle est celui qu'il serait sans les séances maison.
    const gym = [done('g1', 1, [curl(12, 10)]), done('g2', 3, [curl(12, 10)]), done('g3', 5, [curl(12, 11)])];
    const home = [13, 13, 14, 14, 15, 15].map((t, i) => done(`h${i + 1}`, 6 + 2 * i, [curl(6, t)], true));
    const homeAt12 = [done('h0a', 2, [curl(6, 12)], true), done('h0b', 4, [curl(6, 12)], true)];
    const all = [...gym, ...homeAt12, ...home];
    const r = rebuildProfile(all, settings);
    const gymOnly = rebuildProfile(gym, settings);
    expect(r.profile.variants[CURL]).toEqual(gymOnly.profile.variants[CURL]);
    expect(r.evaluations.filter((e) => !e.home)).toEqual(gymOnly.evaluations);
    expect(r.profile.variants[CURL]).toMatchObject({ palier: { weightKg: 12, targetReps: 11 }, recommendation: { kind: 'keep' } });
    // Maison : 3×12 → 3×13 (jamais « poids supérieur » avant 15), … , deux vertes à 3×15 → poids supérieur.
    const homeEvals = r.evaluations.filter((e) => e.home);
    expect(homeEvals.map((e) => e.recommendation.kind)).toEqual(['keep', 'reps_up', 'keep', 'reps_up', 'keep', 'reps_up', 'keep', 'weight_up']);
    expect(homeEvals.every((e) => e.variantId === CURL)).toBe(true);
    expect(r.profile.variants[HOME]).toMatchObject({ variantId: CURL, palier: { weightKg: 6, targetReps: 15 }, recommendation: { kind: 'weight_up', targetReps: 8 } });

    // Poids du corps : un seul suivi, maison et salle mêlées.
    const crunch = (t: number) => perf(0, t, [t, t, t], 'bien', { variantId: 'crunch-sol' });
    const bw = rebuildProfile([done('c1', 1, [crunch(12)]), done('c2', 2, [crunch(12)], true)], settings);
    expect(bw.profile.variants['crunch-sol']?.recommendation).toEqual({ kind: 'reps_up', targetReps: 13, plannedSets: 3 });
    expect(bw.profile.variants[`crunch-sol${HOME_SUFFIX}`]).toBeUndefined();
    expect(bw.evaluations.some((e) => e.home)).toBe(false);

    // Changer le lieu d'une séance passée : elle passe d'un suivi à l'autre, les deux sont recalculés ; revenir la remet.
    const moved = all.map((s) => (s.id === 'g3' ? setSessionLocation(s, true, 99) : s));
    expect(moved.find((s) => s.id === 'g3')).toMatchObject({ location: 'maison', updatedAt: 99 });
    const after = rebuildProfile(moved, settings);
    expect(after.profile.variants[CURL]).toEqual(rebuildProfile(gym.slice(0, 2), settings).profile.variants[CURL]);
    expect(after.evaluations.find((e) => e.sessionId === 'g3')).toMatchObject({ home: true, decision: 'manual_weight' });
    const back = moved.map((s) => (s.id === 'g3' ? setSessionLocation(s, false, 100) : s));
    expect(back.find((s) => s.id === 'g3')).not.toHaveProperty('location');
    expect(rebuildProfile(back, settings).profile).toEqual(r.profile);
    expect(rebuildProfile(back, settings).evaluations).toEqual(r.evaluations);
    expect(setSessionLocation(gym[0]!, false, 5)).toBe(gym[0]);

    // Records par suivi : celui de la maison n'efface jamais celui de la salle.
    const records = computeRecords(all, settings);
    expect(formatRecord(records.current.get(CURL)!)).toBe('3 × 11 à 12 kg');
    expect(records.current.get(HOME)).toMatchObject({ home: true, weightKg: 6, reps: 15 });
    expect(records.breaks.filter((b) => !b.home).map((b) => b.sessionId)).toEqual(['g3']);

    // Bilan de progression : salle et maison classées à part ; évolutions par suivi (jamais « 12 → 6 kg »).
    const progress = analyzeProgress(r.evaluations, r.profile);
    expect(progress.map((p) => [p.variantId, p.home ?? false, p.category])).toEqual([
      [CURL, false, 'progressing'],
      [CURL, true, 'progressing'],
    ]);
    const changes = recentChanges(r.evaluations, all, 20);
    expect(changes.every((c) => c.from.weightKg === c.to.weightKg)).toBe(true);
    expect(changes.filter((c) => c.home).map((c) => `${c.from.targetReps}→${c.to.targetReps}`)).toEqual(['14→15', '13→14', '12→13']);

    // Réutiliser une séance à la maison : nouvelle séance à la maison, cible du suivi de la maison.
    const reused = createSessionFromTemplate(home[5]!, r.profile, settings, { id: 'n', name: 'n', date: '2026-10-20', now: 1 });
    expect(reused.session).toMatchObject({ location: 'maison', performances: [{ variantId: CURL, weightKg: 6, targetReps: 15 }] });
    expect(createSessionFromTemplate(gym[2]!, r.profile, settings, { id: 'm', name: 'm', date: '2026-10-20', now: 1 }).session).not.toHaveProperty('location');
    // Séance libre : à la salle par défaut, à la maison sur demande.
    expect(startSession(1, 'a')).not.toHaveProperty('location');
    expect(startSession(1, 'b', true)).toMatchObject({ location: 'maison' });
  });

  it('256. Récapitulatif « dont 1 maison », bilans sans durée à la maison, indice par groupe sans la maison, séries comptées ; récents de la maison d’abord', () => {
    const week = [
      done('g1', 19, [curl(12, 10)]),
      done('h1', 21, [curl(6, 12)], true, { startedAt: null, endedAt: null }),
      done('g2', 22, [curl(12, 10)]),
    ];
    const now = new Date(2026, 9, 23, 12).getTime();
    const recap = weeklyRecap(week, LIB, now);
    expect(recap).toMatchObject({ sessionCount: 3, homeCount: 1 });
    expect(recapTitle(recap)).toBe('Semaine du lun. 19 au dim. 25 oct. : 3 séances · dont 1 maison');
    expect(recap.cells.find((c) => c.group === 'biceps')).toMatchObject({ count: 3 });
    // Sans séance à la maison : titre inchangé.
    expect(weeklyRecap(week.filter((s) => !s.location), LIB, now)).not.toHaveProperty('homeCount');

    // Bilan : « dont 1 à la maison » ; durée en salle des séances de la salle seulement, la maison (sans heures) n'est
    // jamais « sans durée » et n'empêche pas la comparaison ; progressions de la maison nommées « (maison) ».
    const evaluations = rebuildProfile(week, settings).evaluations;
    const name = (id: string) => displayName(indexVariants(LIB).get(id));
    const report = buildReport(periodContaining('week', now), { sessions: week, exercises: LIB, evaluations, settings, groups: ['biceps'], weighIns: [], now });
    expect(report.totals).toEqual({ sessionCount: 3, homeCount: 1, durationMs: 7_200_000, unknownDuration: 0 });
    const text = reportText(report, name);
    expect(text).toContain('- 3 séances (dont 1 à la maison), +3 par rapport à lun.–ven. de la semaine dernière');
    expect(text).toContain('- Durée en salle : 2 h 00, +2 h 00 par rapport à lun.–ven. de la semaine dernière');
    expect(text).not.toContain('sans durée');
    // Une semaine à la maison seulement : pas de durée en salle.
    const homeWeek = buildReport(periodContaining('week', now), { sessions: [week[1]!], exercises: LIB, evaluations, settings, groups: ['biceps'], weighIns: [], now });
    expect(reportText(homeWeek, name)).not.toContain('Durée en salle');
    const homeProgress = [12, 12].map((t, i) => done(`p${i}`, 20 + i, [curl(6, t)], true));
    const monthText = reportText(
      buildReport(periodContaining('month', now), {
        sessions: homeProgress, exercises: LIB, evaluations: rebuildProfile(homeProgress, settings).evaluations, settings, groups: ['biceps'], weighIns: [], now,
      }),
      name,
    );
    expect(monthText).toContain('Curl biceps haltères (maison) : 3×12 → 3×13 à 6 kg (21 oct.)');

    // Par groupe (§19.10) : l'indice ignore la maison, les séries de la maison comptent en entier.
    const index = groupIndex(week, LIB, settings, 'biceps');
    expect(index.sessionCount).toBe(2);
    expect(index.points.map((p) => p.date)).toEqual(['2026-10-19', '2026-10-22']);
    const sets = groupWeeklySets(week, LIB, 'biceps', now);
    expect(sets.weeks.at(-1)).toMatchObject({ direct: 9 });

    // Récents : à la maison, ceux de la maison d'abord.
    expect(recentVariantIds([done('a', 19, [curl(12, 10)]), done('b', 20, [perf(0, 10, [10, 10, 10], 'bien', { variantId: 'crunch-sol' })], true), done('c', 21, [perf(40, 8, [8, 8, 8], 'bien', { variantId: 'pec-deck' })])], 6, true)).toEqual([
      'crunch-sol', 'pec-deck', CURL,
    ]);
  });

  it('257. Sauvegarde au format 6 : lieu gardé, plage de la maison contrôlée ; format 5 lu à la salle ; réglage de la plage enregistré', () => {
    const sessions = [done('g1', 19, [curl(12, 10)]), done('h1', 21, [curl(6, 12)], true)];
    const backup = buildBackup({ sessions, exercises: LIB }, 1);
    expect(backup.schemaVersion).toBe(6);
    expect(SCHEMA_VERSION).toBe(6);
    const parsed = parseJsonImport(JSON.stringify(backup), LIB, '2026-10-28');
    expect(parsed.kind === 'backup' && parsed.backup.sessions).toEqual(sessions);
    // Format 5 (versions 1.23.2 à 1.25.0) : pas de lieu, toutes les séances à la salle.
    const v5 = parseJsonImport(JSON.stringify({ ...backup, schemaVersion: 5, sessions: [sessions[0]] }), LIB, '2026-10-28');
    expect(v5.kind === 'backup' && v5.backup.sessions[0]).not.toHaveProperty('location');
    // Lieu inconnu, ou plage de la maison invalide : refusés.
    const bad = parseJsonImport(JSON.stringify({ ...backup, sessions: [{ ...sessions[1], location: 'jardin' }] }), LIB, '2026-10-28');
    expect(bad.kind === 'error' && bad.details).toContain('sessions[0].location invalide.');
    const range = LIB.map((e) => (e.id === CURL ? { ...e, variants: [{ ...e.variants[0]!, config: { homeMinReps: 12, homeMaxReps: 10 } }] } : e));
    expect(parseJsonImport(JSON.stringify({ ...backup, exercises: range }), LIB, '2026-10-28').kind).toBe('error');

    // Réglage : la plage de la maison n'est enregistrée que si elle diffère de celle par défaut.
    expect(compactConfig({ ...DEFAULT_VARIANT_CONFIG, homeMinReps: 8, homeMaxReps: 15 })).toBeUndefined();
    expect(compactConfig({ ...DEFAULT_VARIANT_CONFIG, homeMaxReps: 20 })).toEqual({ homeMaxReps: 20 });
    expect(compactConfig({ ...DEFAULT_VARIANT_CONFIG, minReps: 10, maxReps: 15, homeMinReps: 10, homeMaxReps: 15 })).toEqual({ minReps: 10, maxReps: 15 });
    expect(validateConfig({ ...DEFAULT_VARIANT_CONFIG, homeMinReps: 16, homeMaxReps: 15 })).toEqual(['home_range']);
    expect(validateConfig({ ...DEFAULT_VARIANT_CONFIG, homeMaxReps: 20 })).toEqual([]);
  });
});
