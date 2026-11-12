import { describe, expect, it } from 'vitest';
import type { ActivityRecord } from '../../activities/model';
import { DEFAULT_HABITS } from '../../activities/model';
import { DEFAULT_CARDIO_MACHINES } from '../../cardio/model';
import type { Exercise, MuscleGroup, Session } from '../../domain/types';
import { rebuildProfile } from '../../engine';
import { buildEngineSettings, displayName, indexVariants } from '../../library/catalog';
import { MUSCLE_GROUP_LABELS, SEED_EXERCISES } from '../../library/seed';
import { perDumbbell } from '../../library/search';
import { weekSuggestion } from '../../plan/suggest';
import {
  buildCoachExport,
  coachExportText,
  coachFileName,
  coachJson,
  coachShareTitle,
  coachWeek,
  coachWeekLabel,
  hasCoachWeek,
  sanitizeCoachSent,
  type CoachInput,
} from '../coach';
import { groupAlert } from '../groupAlerts';
import { groupIndex } from '../groups';
import { buildReport, DEFAULT_REPORT_SETTINGS, reportText, sanitizeReportSettings } from '../report';
import { buildBackup, parseJsonImport } from '../../transfer/backup';
import { DEFAULT_RECAP_SETTINGS, weeklyRecap } from '../weekly';
import { alertHistory, ALERT_NOW } from './alertes-simulation';
import { simulatedHistory } from './simulation';

/**
 * Export « coach » (version 1.46.0, §19.13) : la dernière semaine terminée, complète, arrêtée au dimanche soir ; mêmes
 * chiffres que l'appli (récapitulatif, bilan, moteur, indice, alertes, séance pour compléter la semaine).
 */
const LIB: Exercise[] = [...SEED_EXERCISES];
const SETTINGS = buildEngineSettings(LIB);
const GROUPS: MuscleGroup[] = ['pectoraux', 'dos', 'epaules', 'biceps', 'triceps', 'jambes', 'abdominaux'];
const RECAP = { ...DEFAULT_RECAP_SETTINGS, groups: GROUPS };
/** Lundi 26 octobre 2026, 9 h : la semaine exportée est celle du 19 au 25 octobre. */
const NOW = new Date(2026, 9, 26, 9).getTime();
const at = (d: number, h: number) => new Date(2026, 9, d, h).getTime();

const BADMINTON: ActivityRecord = {
  id: 'act-badminton-2026-10-19', habitId: 'badminton', date: '2026-10-19', name: 'Badminton', start: '21:00', end: '22:30', groups: ['jambes', 'epaules'], status: 'done', answeredAt: at(19, 23),
};

function plain(id: string, day: number, hour: number, extra: Partial<Session>): Session {
  return {
    id, name: 'Séance du test', date: `2026-10-${day}`, startedAt: at(day, hour), endedAt: at(day, hour) + 30 * 60_000, createdAt: at(day, hour), updatedAt: at(day, hour),
    origin: 'app', state: 'done', performances: [], ...extra,
  };
}

/**
 * Données simulées (§19.10) jusqu'au 22 octobre, plus, dans la semaine du 19 : le pec deck du lundi rouge (8-5-5,
 * « très mal »), le curl du jeudi à une charge plus légère sans recommandation (séance de départ), 50 min de tapis le
 * jeudi, une séance à la maison le mercredi, une séance importée le vendredi avec une performance partielle, le
 * badminton du lundi. Et une séance le lundi 26 au matin, après la semaine exportée.
 */
function history(): Session[] {
  const sessions = simulatedHistory().map((s) => {
    if (s.id === 'sim-2026-10-19') {
      return { ...s, performances: s.performances.map((p) => (p.variantId === 'pec-deck' ? { ...p, reps: [p.targetReps!, p.targetReps! - 3, p.targetReps! - 3], feeling: 'tres_mal' as const } : p)) };
    }
    if (s.id === 'sim-2026-10-22') {
      return {
        ...s,
        performances: s.performances.map((p) => (p.variantId === 'curl-biceps-halteres' ? { ...p, weightKg: p.weightKg - 2 } : p)),
        cardio: [{ id: 'tapis-22', machineId: 'tapis', machine: 'Tapis de marche', incline: 'haute' as const, minutes: 50, distanceKm: 3.2 }],
      };
    }
    return s;
  });
  return [
    ...sessions,
    plain('maison-21', 21, 10, {
      location: 'maison',
      performances: [
        { variantId: 'curl-biceps-halteres', weightKg: 6, targetReps: 12, plannedSets: 3, reps: [12, 12, 12], feeling: 'bien' },
        { variantId: 'planche', weightKg: 0, targetReps: 30, plannedSets: 3, reps: [30, 30, 30], feeling: 'tres_bien' },
      ],
    }),
    plain('import-23', 23, 0, {
      origin: 'import', startedAt: null, endedAt: null,
      performances: [{ variantId: 'rowing-haltere', weightKg: 20, targetReps: null, plannedSets: null, reps: [], feeling: 'inconnu', partial: true }],
    }),
    plain('apres-26', 26, 8, { performances: [{ variantId: 'pec-deck', weightKg: 80, targetReps: 8, plannedSets: 3, reps: [8, 8, 8], feeling: 'bien' }] }),
  ];
}

function input(sessions: Session[] = history(), extra: Partial<CoachInput> = {}): CoachInput {
  return {
    sessions, exercises: LIB, settings: SETTINGS, recap: RECAP, activities: [BADMINTON], habits: [...DEFAULT_HABITS], machines: [...DEFAULT_CARDIO_MACHINES],
    weighIns: [{ date: '2026-10-01', weightKg: 80 }, { date: '2026-10-20', weightKg: 79.4 }, { date: '2026-10-27', weightKg: 79 }], heightCm: 178, ignoredAlerts: {},
    appVersion: '1.46.0', now: NOW, ...extra,
  };
}

/** Toutes les clés de l'export, à toute profondeur. */
function keys(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const v of value) keys(v, out);
  else if (value !== null && typeof value === 'object') for (const [k, v] of Object.entries(value)) (out.add(k), keys(v, out));
  return out;
}

describe('Export pour le coach (version 1.46.0)', () => {
  it('310. Semaine exportée, nom du fichier, libellé ; contenu complet, arrêté au dimanche soir, mêmes chiffres que l’appli ; JSON compact relu à l’identique', () => {
    // La dernière semaine terminée, quel que soit le jour : lundi 16 novembre → du 9 au 15 ; dimanche 15 au soir → du 2 au 8.
    const week = coachWeek(new Date(2026, 10, 16, 9).getTime());
    expect(coachFileName(week)).toBe('myfitapp-coach-2026-11-09.txt');
    expect(coachWeekLabel(week)).toBe('Semaine du 9 au 15 nov.');
    expect(coachShareTitle(week)).toBe('MyFitApp — données pour le coach, semaine du 9 au 15 nov. 2026');
    expect(coachFileName(coachWeek(new Date(2026, 10, 15, 23, 30).getTime()))).toBe('myfitapp-coach-2026-11-02.txt');
    expect(coachWeekLabel(coachWeek(new Date(2026, 10, 3).getTime()))).toBe('Semaine du 26 oct. au 1 nov.');
    expect(coachWeekLabel(coachWeek(new Date(2027, 0, 5).getTime()))).toBe('Semaine du 28 déc. 2026 au 3 janv. 2027');
    // Bouton proposé seulement avec une séance terminée avant la semaine en cours.
    expect(hasCoachWeek([], NOW)).toBe(false);
    expect(hasCoachWeek(history().filter((s) => s.id === 'apres-26'), NOW)).toBe(false);
    expect(hasCoachWeek(history(), NOW)).toBe(true);

    const data = buildCoachExport(input());
    expect(Object.keys(data)).toEqual(['export', 'version_format', 'version_appli', 'genere_le', 'periode', 'regles', 'contexte', 'semaine', 'recapitulatif', 'exercices', 'tendance', 'signaux']);
    expect(data.periode).toMatchObject({ titre: 'Semaine du 19 au 25 oct. 2026', du: '2026-10-19', au: '2026-10-25' });
    expect(data.genere_le).toBe('2026-10-26 09:00');
    // Aucun identifiant interne.
    const allKeys = keys(data);
    for (const k of ['id', 'variantId', 'sessionId', 'machineId', 'habitId']) expect(allKeys.has(k), k).toBe(false);
    const text = coachExportText(input());
    for (const id of ['sim-2026-10-19', 'maison-21', 'pec-deck', 'curl-biceps-halteres', 'act-badminton']) expect(text, id).not.toContain(id);
    // JSON compact (une performance par ligne), relu à l'identique.
    expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(data)));
    expect(text.split('\n').some((l) => l.trim().startsWith('{ "exercice": "Pec deck"'))).toBe(true);
    expect(text.length).toBeLessThan(JSON.stringify(data, null, 2).length / 1.3);

    // Règles : le seuil du rouge réglé.
    expect(data.regles.join(' ')).toContain('rouge à partir de 10 séries');
    expect(buildCoachExport(input(undefined, { recap: { ...RECAP, redSets: 12 } })).regles.join(' ')).toContain('rouge à partir de 12 séries');

    // Contexte.
    expect(data.contexte).toMatchObject({
      premiere_seance: '2026-06-01', seances_au_total: { salle: 34, maison: 1 }, semaines_suivies: 21, seuil_rouge_series: 10, taille_cm: 178,
      habitudes: [{ nom: 'Badminton', jour: 'lundi', debut: '21:00', fin: '22:30', groupes: ['Épaules', 'Jambes'], active: true }],
      dernieres_pesees: [{ date: '2026-10-01', kg: 80 }, { date: '2026-10-20', kg: 79.4 }],
    });

    // Semaine en détail : séances dans l'ordre, la séance du lundi 26 absente.
    const { seances } = data.semaine;
    expect(seances.map((s) => [s.date, s.jour, s.lieu])).toEqual([
      ['2026-10-19', 'lundi', 'salle'], ['2026-10-21', 'mercredi', 'maison'], ['2026-10-22', 'jeudi', 'salle'], ['2026-10-23', 'vendredi', 'salle'],
    ]);
    expect(seances[0]).toMatchObject({ debut: '18:00', duree_min: 75, nom: 'Salle · Pectoraux · Épaules · Triceps' });
    expect(seances[1]).not.toHaveProperty('debut');
    expect(seances[1]).not.toHaveProperty('duree_min');
    expect(seances[3]).toMatchObject({ importee: true });
    expect(seances[3]).not.toHaveProperty('duree_min');
    const perf = (i: number, name: string) => seances[i]!.exercices.find((e) => e.exercice === name)!;
    expect(perf(0, 'Pec deck')).toMatchObject({ groupe: 'Pectoraux', type: 'charge', series_prevues: 3, ressenti: 'très mal', statut: 'rouge', valide: false, seance_de_depart: false });
    expect(perf(0, 'Pec deck').series).toEqual([perf(0, 'Pec deck').cible, perf(0, 'Pec deck').cible! - 3, perf(0, 'Pec deck').cible! - 3]);
    expect(perf(0, 'Dips assistés')).toMatchObject({ type: 'assisté', groupes_secondaires: ['Pectoraux'] });
    expect(perf(0, 'Dips assistés')).toHaveProperty('aide_kg');
    expect(perf(0, 'Dips assistés')).not.toHaveProperty('charge_kg');
    expect(perf(2, 'Curl biceps haltères')).toMatchObject({ type: 'haltères', seance_de_depart: true, valide: false });
    expect(perf(2, 'Curl biceps haltères')).toHaveProperty('charge_kg_par_haltere');
    expect(perf(1, 'Curl biceps haltères')).toMatchObject({ charge_kg_par_haltere: 6, series: [12, 12, 12], statut: 'vert' });
    expect(perf(1, 'Planche')).toMatchObject({ type: 'durée', cible: 30, series: [30, 30, 30] });
    expect(perf(1, 'Planche')).not.toHaveProperty('charge_kg');
    expect(perf(3, 'Rowing haltère')).toMatchObject({ partielle: true, statut: null, series: [] });
    expect(seances[2]!.cardio).toEqual([{ machine: 'Tapis de marche', minutes: 50, distance_km: 3.2, inclinaison: 'haute' }]);
    expect(data.semaine.activites).toEqual([{ date: '2026-10-19', jour: 'lundi', nom: 'Badminton', duree_min: 90, groupes: ['Jambes', 'Épaules'] }]);
    expect(data.semaine.pesees).toEqual([{ date: '2026-10-20', kg: 79.4 }]);

    // Récapitulatif : le score et la couleur de l'accueil le dimanche soir, détaillés ; texte du bilan identique au mail
    // (calculé par l'appli avec toutes les séances, celle du lundi 26 comprise).
    const sunday = new Date(2026, 9, 25, 23, 59).getTime();
    const recap = weeklyRecap(history(), LIB, sunday, RECAP, [BADMINTON], DEFAULT_CARDIO_MACHINES);
    for (const g of data.recapitulatif.groupes) {
      const cell = recap.cells.find((c) => MUSCLE_GROUP_LABELS[c.group] === g.groupe)!;
      expect(g.total_series, g.groupe).toBe(cell.score);
      expect(g.couleur, g.groupe).toBe(cell.color);
      expect(g.directes + g.indirectes + g.activites + g.cardio_jambes, g.groupe).toBe(g.total_series);
    }
    expect(data.recapitulatif.groupes.find((g) => g.groupe === 'Jambes')).toMatchObject({ activites: 3, activites_noms: ['Badminton'], cardio_jambes: 3, cardio_jambes_min: 50 });
    expect(data.recapitulatif.groupes.find((g) => g.groupe === 'Biceps')).toMatchObject({ dont_maison: 3 });
    expect(data.recapitulatif.seances).toEqual({ salle: 3, maison: 1 });
    const replay = rebuildProfile(history(), SETTINGS);
    const refs = indexVariants(LIB);
    const mail = reportText(
      buildReport(coachWeek(NOW), { sessions: history(), exercises: LIB, evaluations: replay.evaluations, settings: SETTINGS, groups: GROUPS, weighIns: input().weighIns, activities: [BADMINTON], machines: DEFAULT_CARDIO_MACHINES, now: NOW }),
      (id) => displayName(refs.get(id)),
      (id) => perDumbbell(refs.get(id)),
    );
    expect(data.recapitulatif.texte_du_bilan.join('\n')).toBe(mail);

    // Arrêté au dimanche soir : la séance du lundi 26 ne change rien.
    const without = buildCoachExport(input(history().filter((s) => s.id !== 'apres-26')));
    expect(JSON.stringify(without)).toBe(JSON.stringify(data));

    // Exercices des 8 dernières semaines, par suivi : le pec deck rouge, son palier conservé, sa série de rouges.
    type Followed = (typeof data.exercices)[number] & { palier: { cible: number; charge_kg: number }; prochaine_cible: string };
    const followed = (name: string) => data.exercices.find((e) => e.exercice === name) as Followed;
    const pec = followed('Pec deck');
    expect(pec).toMatchObject({ lieu: 'salle', plage: '8 à 12 répétitions', series_standard: 3, recommandation: 'garder le palier', vertes_consecutives: 0, serie_de_rouges_en_cours: 1 });
    expect(pec.dernieres_performances).toHaveLength(5);
    expect(pec.dernieres_performances.at(-1)).toMatchObject({ date: '2026-10-19', lieu: 'salle', statut: 'rouge', ressenti: 'très mal' });
    expect(pec.dernieres_performances.map((p) => p.date)).toEqual([...pec.dernieres_performances.map((p) => p.date)].sort());
    expect(pec.prochaine_cible).toBe(`3 × ${pec.palier.cible} à ${String(pec.palier.charge_kg).replace('.', ',')} kg`);
    const curls = data.exercices.filter((e) => e.exercice === 'Curl biceps haltères');
    expect(curls.map((e) => e.lieu)).toEqual(['salle', 'maison']);
    expect(curls[1]).toMatchObject({ plage: '8 à 15 répétitions', palier: { charge_kg_par_haltere: 6, cible: 12 } });
    expect(data.exercices.find((e) => e.exercice === 'Planche')).toMatchObject({ lieu: 'salle et maison (un seul suivi)', plage: '20 à 60 s', prochaine_cible: '3 × 30 s' });
    expect(followed('Dips assistés').prochaine_cible).toMatch(/^(3 × \d+ avec [\d,]+ kg d’aide|moins d’aide, puis 3 × 8)$/);
    // Le développé épaules (en régression depuis août) n'est plus fait : il reste listé s'il a été fait dans les 8 semaines.
    expect(data.exercices.every((e) => e.dernieres_performances.some((p) => p.date >= '2026-08-31'))).toBe(true);

    // Tendance : 8 semaines, la dernière est la semaine exportée ; séries = score du récapitulatif ; indice = celui du
    // bilan par groupe, arrêté à la fin de chaque semaine.
    const weeks = data.tendance.semaines;
    expect(weeks.map((w) => w.du)).toEqual(['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19']);
    expect(weeks.at(-1)!.series).toEqual(Object.fromEntries(data.recapitulatif.groupes.map((g) => [g.groupe, g.total_series])));
    expect(weeks.at(-1)).toMatchObject({ seances_salle: 3, seances_maison: 1, cardio_min: { 'Tapis de marche': 50 }, activites: { Badminton: 1 } });
    expect(weeks[3]).toMatchObject({ seances_salle: 0, seances_maison: 0 });
    const index = groupIndex(history().filter((s) => s.id !== 'apres-26'), LIB, SETTINGS, 'pectoraux', input().weighIns.slice(0, 2));
    expect(weeks.at(-1)!.indice.Pectoraux).toBe(Math.round(index.points.at(-1)!.value * 10) / 10);
    expect(weeks.at(-1)!.indice).not.toHaveProperty('Abdominaux');
    expect(data.tendance.indice_seuil_atteint).toEqual(['Pectoraux', 'Dos', 'Épaules', 'Biceps', 'Triceps', 'Jambes']);

    // Signaux : la séance pour compléter la semaine telle que proposée le dimanche soir ; le pec deck en difficulté.
    const suggestion = weekSuggestion({ sessions: history().filter((s) => s.id !== 'apres-26'), exercises: LIB, settings: SETTINGS, recap: RECAP, activities: [BADMINTON], machines: DEFAULT_CARDIO_MACHINES, now: new Date(2026, 9, 26).getTime() - 1 });
    expect(data.signaux.seance_pour_completer.proposee_pour).toBe(suggestion?.day ?? null);
    if (suggestion) expect('exercices' in data.signaux.seance_pour_completer && data.signaux.seance_pour_completer.exercices.map((e) => e.exercice)).toEqual(suggestion.exercises.map((e) => displayName(refs.get(e.variantId))));
    // Le pec deck rouge, et les deux exercices d'épaules en régression des données simulées.
    expect(data.signaux.en_difficulte_cette_semaine).toEqual([
      'Pec deck : 1 séance rouge cette semaine',
      'Développé épaules machine : 1 séance rouge cette semaine (série en cours : 5 rouges à 27,5 kg)',
      'Élévations latérales haltères : 1 séance rouge cette semaine (série en cours : 5 rouges à 7 kg / haltère)',
    ]);
    expect(data.signaux.series_de_rouges_en_cours).toEqual(['Développé épaules machine : série en cours de 5 rouges à 27,5 kg', 'Élévations latérales haltères : série en cours de 5 rouges à 7 kg / haltère']);
    expect(data.signaux.records_battus.every((l) => l.startsWith('👑 '))).toBe(true);
  });

  it('310. Alertes « groupe moins travaillé » de la semaine exportée, ignorées signalées ; aucune séance proposée : la raison', () => {
    // Données des alertes (§19.11) : le dos sous sa moyenne les 2 dernières semaines terminées.
    const sessions = alertHistory();
    const now = ALERT_NOW;
    const data = buildCoachExport(input(sessions, { now, activities: [] }));
    const expected = GROUPS.map((g) => groupAlert(sessions, LIB, g, coachWeek(now).next.getTime())).filter((a) => a !== null);
    expect(expected.map((a) => a.group)).toContain('dos');
    expect(data.signaux.alertes_groupe_moins_travaille.map((a) => a.groupe)).toEqual(expected.map((a) => MUSCLE_GROUP_LABELS[a.group]));
    const dos = data.signaux.alertes_groupe_moins_travaille.find((a) => a.groupe === 'Dos')!;
    expect(dos.texte).toMatch(/^Dos : 3 séries par semaine depuis 2 semaines \(ta moyenne : 5,3\)$/);
    expect(dos).not.toHaveProperty('ignoree_sur_l_appareil');
    const week = expected.find((a) => a.group === 'dos')!.week;
    expect(buildCoachExport(input(sessions, { now, activities: [], ignoredAlerts: { dos: week } })).signaux.alertes_groupe_moins_travaille.find((a) => a.groupe === 'Dos')).toMatchObject({ ignoree_sur_l_appareil: true });

    // Semaine sans séance à la salle : pas de séance proposée, et pourquoi.
    const empty = buildCoachExport(input(simulatedHistory('2026-10-15'), { activities: [] }));
    expect(empty.semaine.seances).toEqual([]);
    expect(empty.signaux.seance_pour_completer).toEqual({ proposee_pour: null, raison: 'aucune séance à la salle cette semaine' });
    // Séance à la salle le dimanche : la séance proposée tomberait la semaine suivante.
    const sundayGym: Session = { ...history()[0]!, id: 'dimanche', date: '2026-10-25', startedAt: at(25, 10), endedAt: at(25, 11), createdAt: at(25, 10), updatedAt: at(25, 10) };
    expect(buildCoachExport(input([...history(), sundayGym])).signaux.seance_pour_completer).toEqual({
      proposee_pour: null,
      raison: 'séance à la salle le dimanche : la séance proposée tomberait la semaine suivante',
    });
  });

  it('310. JSON compact : une ligne tant que ça tient, une performance sur une ligne, relu à l’identique', () => {
    const value = { a: [1, 2, 3], b: { c: 'texte', d: null }, e: [{ f: 1 }, { g: [true, false] }], long: Array.from({ length: 40 }, (_, i) => i) };
    expect(JSON.parse(coachJson(value))).toEqual(value);
    expect(coachJson({ a: 1, b: [1, 2] })).toBe('{ "a": 1, "b": [1, 2] }');
    const perf = { exercice: 'Tirage horizontal machine (appui pectoral)', variante: 'Prise moyenne', groupe: 'Dos', groupes_secondaires: ['Biceps'], type: 'charge', charge_kg: 52, cible: 9, series: [9, 9, 9], ressenti: 'bien', statut: 'vert' };
    expect(coachJson({ exercices: [perf] }).split('\n')).toHaveLength(5);
    expect(coachJson({ exercices: [perf] }).split('\n')[2]!.trim()).toBe(`${coachJson(perf)}`);
  });

  it('312. Rappel dans le bandeau : réglage « Rappel de l’export coach » coché par défaut, gardé dans la sauvegarde ; semaine envoyée mémorisée sur l’appareil seulement', () => {
    // Réglage : coché par défaut, et pour une sauvegarde antérieure (sans le champ) ou une valeur invalide.
    expect(DEFAULT_REPORT_SETTINGS.coachReminder).toBe(true);
    expect(sanitizeReportSettings(undefined).coachReminder).toBe(true);
    expect(sanitizeReportSettings({ weekBanner: true, monthBanner: true, email: '' }).coachReminder).toBe(true);
    expect(sanitizeReportSettings({ coachReminder: 'non' }).coachReminder).toBe(true);
    expect(sanitizeReportSettings({ coachReminder: false })).toEqual({ ...DEFAULT_REPORT_SETTINGS, coachReminder: false });
    // Dans la sauvegarde (réglages des bilans), relu à l'identique ; la semaine envoyée n'y est pas.
    const backup = buildBackup({ sessions: [], exercises: LIB, settings: { reports: { ...DEFAULT_REPORT_SETTINGS, coachReminder: false } } }, NOW);
    const text = JSON.stringify(backup);
    expect(text).not.toContain('coachSent');
    const parsed = parseJsonImport(text, SEED_EXERCISES, '2026-10-26');
    if (parsed.kind !== 'backup') throw new Error('sauvegarde illisible');
    expect(sanitizeReportSettings(parsed.backup.settings.reports).coachReminder).toBe(false);
    // Semaine envoyée : un lundi valide, sinon rien.
    expect(sanitizeCoachSent('2026-11-09')).toBe('2026-11-09');
    for (const bad of ['2026-11-10', '2026-11', 42, null, undefined, {}]) expect(sanitizeCoachSent(bad), String(bad)).toBeNull();
  });
});
