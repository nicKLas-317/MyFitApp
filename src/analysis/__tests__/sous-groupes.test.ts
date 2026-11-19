import { describe, expect, it } from 'vitest';
import { DEFAULT_HABITS, type ActivityRecord } from '../../activities/model';
import { DEFAULT_CARDIO_MACHINES } from '../../cardio/model';
import { MAIN_GROUPS, parentGroup } from '../../domain/muscleGroups';
import type { Exercise, MuscleGroup, Performance, Session } from '../../domain/types';
import { rebuildProfile } from '../../engine';
import { buildEngineSettings, displayName, indexVariants } from '../../library/catalog';
import { SEED_EXERCISES } from '../../library/seed';
import { buildCoachExport } from '../coach';
import { buildReport, reportText } from '../report';
import { parsePeriodKey } from '../reportPeriod';
import {
  deduceSubGroups, EXERCISE_SUB_GROUPS, groupOfSubGroup, recentSubGroups, SUB_GROUPS, subGroupSets, subGroupWeights, type SubGroup, type SubGroupWeights,
} from '../subGroups';
import { DEFAULT_RECAP_SETTINGS } from '../weekly';

/** Sous-groupes musculaires (§19.15, version 1.54.0). */
const LIB: Exercise[] = [...SEED_EXERCISES];
const SETTINGS = buildEngineSettings(LIB);
const VARIANTS = indexVariants(LIB);
const name = (id: string) => displayName(VARIANTS.get(id));
const H = 0.5;
const of = (id: string) => subGroupWeights(LIB.find((e) => e.id === id)!);
const custom = (exerciseName: string, primaryGroup: MuscleGroup, secondaryGroups: MuscleGroup[] = []) => deduceSubGroups({ name: exerciseName, primaryGroup, secondaryGroups });
const groupsOf = (weights: SubGroupWeights) => new Set((Object.keys(weights) as SubGroup[]).map(groupOfSubGroup));
/**
 * Épaules hors des groupes de l'exercice (exceptions validées) : arrière d'épaule ½ des tirages horizontaux et rowings ;
 * épaule avant ½ des dips (la bibliothèque n'a que les pectoraux en secondaire ; l'utilisateur y a ajouté les épaules).
 */
const SHOULDER_EXCEPTIONS = ['tirage-horizontal', 'tirage-horizontal-poulie-basse', 'rowing-barre', 'rowing-haltere', 'dips-assistes'];

const at = (m: number, d: number, h = 18) => new Date(2026, m - 1, d, h).getTime();
const iso = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
let n = 0;
function perf(variantId: string, sets = 3, extra: Partial<Performance> = {}): Performance {
  return { variantId, weightKg: variantId.startsWith('pompes') || variantId === 'planche' ? 0 : 20, targetReps: 10, plannedSets: sets, reps: Array<number>(sets).fill(10), feeling: 'bien', ...extra };
}
function session(start: number, perfs: Performance[], extra: Partial<Session> = {}): Session {
  return {
    id: `sg${++n}`, name: 'Séance', date: iso(start), startedAt: start, endedAt: start + 3_600_000, createdAt: start, updatedAt: start,
    origin: 'app', state: 'done', performances: perfs, ...extra,
  };
}

describe('Sous-groupes musculaires (§19.15, version 1.54.0)', () => {
  it('324. Correspondance validée : chaque exercice de la bibliothèque a la sienne, dans ses groupes (sauf les épaules des tirages horizontaux, rowings et dips) ; chaque groupe secondaire a son sous-groupe ; exercices personnalisés de l’utilisateur', () => {
    // Sept groupes, leurs sous-groupes dans l'ordre d'affichage.
    expect(Object.fromEntries(MAIN_GROUPS.map((g) => [g, SUB_GROUPS[g]!.map((s) => s.short)]))).toEqual({
      pectoraux: ['haut', 'milieu', 'bas'],
      dos: ['largeur', 'épaisseur', 'lombaires'],
      epaules: ['avant', 'côté', 'arrière'],
      biceps: ['longue', 'courte', 'brachial'],
      triceps: ['longue', 'latérale', 'médiale'],
      jambes: ['quadriceps', 'ischio-jambiers', 'fessiers', 'adducteurs', 'mollets'],
      abdominaux: ['grand droit', 'obliques', 'transverse'],
    });
    // Couverture : chaque exercice de la bibliothèque a sa correspondance.
    const library = SEED_EXERCISES.map((e) => e.id);
    expect(library.filter((id) => !EXERCISE_SUB_GROUPS[id])).toEqual([]);
    for (const e of SEED_EXERCISES) {
      const weights = EXERCISE_SUB_GROUPS[e.id]!;
      const groups = groupsOf(weights);
      const own = new Set([e.primaryGroup, ...e.secondaryGroups].map(parentGroup));
      // Au moins un sous-groupe du groupe principal ; poids de 1 ou ½.
      expect(groups.has(parentGroup(e.primaryGroup)), e.id).toBe(true);
      for (const v of Object.values(weights)) expect([1, H], e.id).toContain(v);
      // Seulement des groupes de l'exercice, sauf l'exception validée.
      const outside = [...groups].filter((g) => !own.has(g));
      expect(outside, e.id).toEqual(SHOULDER_EXCEPTIONS.includes(e.id) ? ['epaules'] : []);
      // Chaque groupe secondaire (d'un autre groupe principal) reçoit ½ à un sous-groupe.
      for (const g of own) if (g !== parentGroup(e.primaryGroup)) expect(groups.has(g), `${e.id} ${g}`).toBe(true);
    }
    // Valeurs validées par l'utilisateur.
    expect(of('developpe-incline')).toEqual({ 'pec-haut': 1, 'tri-laterale': H, 'ep-avant': H });
    expect(of('chest-press')).toEqual({ 'pec-milieu': 1, 'tri-laterale': H, 'ep-avant': H });
    expect(of('pec-deck')).toEqual({ 'pec-milieu': 1 });
    expect(of('dips-assistes')).toEqual({ 'tri-laterale': H, 'tri-mediale': H, 'pec-bas': H, 'ep-avant': H });
    expect(of('ecarte-poulie')).toEqual({ 'pec-bas': 1 });
    expect(of('tirage-vertical')).toEqual({ 'dos-largeur': 1, 'bi-brachial': H });
    expect(of('tirage-horizontal')).toEqual({ 'dos-epaisseur': 1, 'ep-arriere': H, 'bi-brachial': H });
    expect(of('rowing-haltere')).toEqual({ 'dos-largeur': H, 'dos-epaisseur': H, 'ep-arriere': H, 'bi-brachial': H });
    expect(of('developpe-epaules-machine')).toEqual({ 'ep-avant': 1, 'ep-cote': H, 'tri-laterale': H });
    expect(of('oiseau')).toEqual({ 'ep-arriere': 1, 'dos-epaisseur': H });
    expect(of('curl-biceps-banc-incline')).toEqual({ 'bi-longue': 1 });
    expect(of('curl-pupitre')).toEqual({ 'bi-courte': 1 });
    expect(of('curl-marteau')).toEqual({ 'bi-brachial': 1, 'bi-longue': H });
    expect(of('curl-biceps-poulie-corde')).toEqual({ 'bi-brachial': 1, 'bi-longue': H });
    expect(of('curl-biceps-barre-ez')).toEqual({ 'bi-longue': H, 'bi-courte': H });
    expect(of('extension-triceps-haltere-assis')).toEqual({ 'tri-longue': 1 });
    expect(of('extension-triceps-poulie')).toEqual({ 'tri-laterale': 1, 'tri-mediale': H });
    expect(of('kickback')).toEqual({ 'tri-longue': H, 'tri-laterale': H });
    expect(of('presse-a-cuisses')).toEqual({ quadriceps: 1, fessiers: H });
    expect(of('squat-kettlebell')).toEqual({ quadriceps: 1, fessiers: H, adducteurs: H });
    expect(of('chaise')).toEqual({ quadriceps: 1, 'abdo-transverse': H });
    expect(of('crunch-oblique-touche-talons')).toEqual({ 'abdo-obliques': 1 });
    expect(of('planche')).toEqual({ 'abdo-transverse': 1, 'abdo-droit': H });
    // Groupes d'un exercice de la bibliothèque personnalisés : sa correspondance gardée.
    expect(subGroupWeights({ id: 'pec-deck', name: 'Mon pec deck', primaryGroup: 'pectoraux', secondaryGroups: ['epaules'] })).toEqual({ 'pec-milieu': 1 });
    // Les cinq exercices personnalisés de l'utilisateur : leur correspondance exacte.
    expect(EXERCISE_SUB_GROUPS['perso-ecarte-lateral-poulie']).toEqual({ 'ep-cote': 1 });
    expect(EXERCISE_SUB_GROUPS['perso-lat-pulldown-machine']).toEqual({ 'dos-largeur': 1 });
    expect(EXERCISE_SUB_GROUPS['perso-curl-bras-barre-prise-inversee']).toEqual({ 'bi-brachial': 1 });
    expect(EXERCISE_SUB_GROUPS['perso-curl-goblet']).toEqual({ 'bi-longue': H, 'bi-courte': H });
    expect(EXERCISE_SUB_GROUPS['perso-roue']).toEqual({ 'abdo-droit': 1, 'abdo-transverse': H });
  });

  it('325. Exercice personnalisé : mots-clés du nom (noms inventés), puis ses groupes, puis répartition égale ; groupes secondaires ; jamais vide', () => {
    // Épaules.
    expect(custom('Élévations latérales câble', 'epaules')).toEqual({ 'ep-cote': 1 });
    expect(custom('Oiseau à la poulie', 'epaules', ['dos'])).toEqual({ 'ep-arriere': 1, 'dos-epaisseur': H });
    expect(custom('Face pull corde', 'epaules')).toEqual({ 'ep-arriere': 1 });
    expect(custom('Développé Arnold', 'epaules', ['triceps'])).toEqual({ 'ep-avant': 1, 'ep-cote': H, 'tri-laterale': H });
    expect(custom('Élévations frontales disque', 'epaules')).toEqual({ 'ep-avant': 1 });
    // Pectoraux : le sens de l'écarté ; « décliné » ; groupes secondaires par leurs mots-clés, sinon la règle.
    expect(custom('Écarté poulie de haut en bas', 'pectoraux')).toEqual({ 'pec-bas': 1 });
    expect(custom('Écarté poulie de bas en haut', 'pectoraux')).toEqual({ 'pec-haut': 1 });
    expect(custom('Développé incliné machine', 'pectoraux', ['triceps'])).toEqual({ 'pec-haut': 1, 'tri-laterale': H });
    expect(custom('Développé décliné', 'pectoraux', ['triceps', 'epaules'])).toEqual({ 'pec-bas': 1, 'tri-laterale': H, 'ep-avant': H, 'ep-cote': 0.25 });
    expect(custom('Butterfly unilatéral', 'pectoraux')).toEqual({ 'pec-milieu': 1 });
    // Dos.
    expect(custom('Tirage poitrine prise neutre', 'dos', ['biceps'])).toEqual({ 'dos-epaisseur': 1, 'bi-brachial': H });
    expect(custom('Pulldown bras tendus', 'dos')).toEqual({ 'dos-largeur': 1 });
    expect(custom('Hyperextension 45°', 'dos')).toEqual({ 'dos-lombaires': 1 });
    expect(custom('T-bar row', 'dos', ['biceps'])).toEqual({ 'dos-epaisseur': 1, 'bi-brachial': H });
    // Biceps : un mot-clé précis l'emporte sur « curl » seul.
    expect(custom('Curl concentration', 'biceps')).toEqual({ 'bi-courte': 1 });
    expect(custom('Curl Zottman', 'biceps')).toEqual({ 'bi-brachial': 1 });
    expect(custom('Curl inversé poulie basse', 'biceps')).toEqual({ 'bi-brachial': 1 });
    expect(custom('Curl incliné poulie', 'biceps')).toEqual({ 'bi-longue': 1 });
    expect(custom('Curl biceps', 'biceps')).toEqual({ 'bi-longue': H, 'bi-courte': H });
    // Triceps.
    expect(custom('Extension au-dessus de la tête à la poulie', 'triceps')).toEqual({ 'tri-longue': 1 });
    expect(custom('Overhead extension', 'triceps')).toEqual({ 'tri-longue': 1 });
    expect(custom('Pushdown corde', 'triceps')).toEqual({ 'tri-laterale': 1, 'tri-mediale': H });
    expect(custom('Dips sur banc', 'triceps', ['pectoraux'])).toEqual({ 'tri-laterale': H, 'tri-mediale': H, 'pec-bas': H });
    // Jambes : « mollets » arrête les autres règles ; plusieurs sous-groupes ; groupes de l'exercice en repli.
    expect(custom('Mollets à la presse', 'jambes')).toEqual({ mollets: 1 });
    expect(custom('Squat sumo', 'jambes')).toEqual({ adducteurs: 1, quadriceps: 1 });
    expect(custom('Hip thrust', 'jambes')).toEqual({ fessiers: 1 });
    expect(custom('Soulevé de terre jambes tendues', 'jambes')).toEqual({ 'ischio-jambiers': 1 });
    expect(custom('Fentes bulgares', 'jambes')).toEqual({ quadriceps: 1 });
    expect(custom('Leg press unilatéral', 'jambes')).toEqual({ quadriceps: 1 });
    expect(custom('Machine du coin', 'jambes', ['ischio-jambiers'])).toEqual({ 'ischio-jambiers': 1 });
    expect(custom('Machine du coin', 'quadriceps', ['fessiers'])).toEqual({ quadriceps: 1, fessiers: H });
    // Abdominaux : « oblique » arrête les autres règles.
    expect(custom('Crunch oblique', 'abdominaux')).toEqual({ 'abdo-obliques': 1 });
    expect(custom('Gainage latéral', 'abdominaux')).toEqual({ 'abdo-obliques': 1 });
    expect(custom('Gainage sur ballon', 'abdominaux')).toEqual({ 'abdo-transverse': 1, 'abdo-droit': H });
    expect(custom('Ab wheel', 'abdominaux')).toEqual({ 'abdo-droit': 1, 'abdo-transverse': H });
    expect(custom('Relevés de genoux suspendu', 'abdominaux')).toEqual({ 'abdo-droit': 1 });
    // Aucun mot-clé : répartition égale entre les sous-groupes du groupe principal.
    expect(custom('Machine Technogym 7', 'epaules')).toEqual({ 'ep-avant': 1 / 3, 'ep-cote': 1 / 3, 'ep-arriere': 1 / 3 });
    expect(custom('Machine Technogym 7', 'jambes')).toEqual({ quadriceps: 0.2, 'ischio-jambiers': 0.2, fessiers: 0.2, adducteurs: 0.2, mollets: 0.2 });
    // Le nom de la variante compte aussi.
    expect(subGroupWeights({ id: 'perso-x', name: 'Élévations', primaryGroup: 'epaules', secondaryGroups: [] }, { name: 'Arrière' })).toEqual({ 'ep-arriere': 1 });
    // Jamais vide, et seulement dans les groupes de l'exercice : chaque groupe, avec des noms sans mot-clé ou ambigus.
    for (const g of [...MAIN_GROUPS, 'quadriceps', 'mollets'] as MuscleGroup[]) {
      for (const label of ['Truc', 'Exercice maison', 'Haut bas avant arrière', 'Curl presse oblique']) {
        const weights = custom(label, g, ['biceps']);
        expect(Object.keys(weights).length, `${label} ${g}`).toBeGreaterThan(0);
        expect([...groupsOf(weights)].every((x) => x === parentGroup(g) || x === 'biceps'), `${label} ${g}`).toBe(true);
      }
    }
  });

  it('326. Séries par sous-groupe : salle et maison pareil, ni activités ni cardio, performances partielles ignorées ; 4 dernières semaines terminées ; une ligne par groupe travaillé dans le bilan et le mail ; export coach', () => {
    // Semaine du 2 nov. : chest press et curl marteau à la salle, élévations latérales à la maison, badminton, 50 min de
    // tapis, un curl pupitre partiel ; semaine du 9 nov. : tirage horizontal ; semaine en cours (16 nov.) : leg extension.
    const sessions = [
      session(at(10, 12), [perf('pec-deck')]),
      session(at(11, 2), [perf('chest-press'), perf('curl-marteau'), perf('curl-pupitre', 0, { reps: [], partial: true })], {
        cardio: [{ id: 'c1', machineId: 'tapis', machine: 'Tapis de marche', minutes: 50, incline: 'neutre' }],
      }),
      session(at(11, 4), [perf('elevations-laterales', 2)], { location: 'maison' }),
      session(at(11, 9), [perf('tirage-horizontal')]),
      session(at(11, 16), [perf('leg-extension')]),
    ];
    const badminton: ActivityRecord = { id: 'act-badminton-2026-11-02', habitId: 'badminton', date: '2026-11-02', name: 'Badminton', start: '21:00', end: '22:30', groups: ['epaules', 'jambes'], status: 'done', answeredAt: 0 };
    const week = (from: number, to: number) => (t: number) => t >= from && t < to;
    const nov2 = subGroupSets(sessions, LIB, week(at(11, 2, 0), at(11, 9, 0)));
    expect(Object.fromEntries(nov2)).toEqual({ 'pec-milieu': 3, 'tri-laterale': 1.5, 'ep-avant': 1.5, 'bi-brachial': 3, 'bi-longue': 1.5, 'ep-cote': 2 });

    // « Par groupe musculaire », mercredi 18 nov. : les semaines du 19 oct. au 15 nov., pas la semaine en cours.
    const recent = (g: MuscleGroup) => recentSubGroups(sessions, LIB, g, at(11, 18, 12));
    expect(recent('epaules').rows.map((r) => [r.id, r.sets])).toEqual([['ep-avant', 1.5], ['ep-cote', 2], ['ep-arriere', 1.5]]);
    expect(recent('jambes').rows.every((r) => r.sets === 0)).toBe(true);
    expect(recent('pectoraux').rows.map((r) => r.sets)).toEqual([0, 3, 0]);
    expect([recent('dos').from, recent('dos').to].map((d) => d.getTime())).toEqual([at(10, 19, 0), at(11, 16, 0) - 1]);
    // La semaine du 12 oct. sort de la fenêtre le lundi 16 nov. ; le dimanche 15 au soir, elle y est encore.
    expect(recentSubGroups(sessions, LIB, 'pectoraux', at(11, 15, 23)).rows.map((r) => r.sets)).toEqual([0, 6, 0]);

    // Bilan de la semaine du 2 nov. : une ligne par groupe travaillé (ni dos ni jambes cette semaine : omis), zéros
    // compris, aussi dans le mail ; tous les groupes dans les données du bilan (export coach).
    const profile = rebuildProfile(sessions, SETTINGS);
    const report = (key: string, kind: 'week' | 'month', groups = DEFAULT_RECAP_SETTINGS.groups) =>
      buildReport(parsePeriodKey(kind, key)!, {
        sessions, exercises: LIB, evaluations: profile.evaluations, settings: SETTINGS, groups, weighIns: [], activities: [badminton], machines: DEFAULT_CARDIO_MACHINES, now: at(11, 18, 12),
      });
    const lines = (text: string) => {
      const all = text.split('\n');
      const i = all.indexOf('SOUS-GROUPES');
      return i < 0 ? [] : all.slice(i + 1, all.indexOf('', i));
    };
    expect(lines(reportText(report('2026-11-02', 'week'), name))).toEqual([
      '- Pectoraux : haut 0, milieu 3, bas 0',
      '- Épaules : avant 1,5, côté 2, arrière 0',
      '- Biceps : longue 1,5, courte 0, brachial 3',
      '- Triceps : longue 0, latérale 1,5, médiale 0',
    ]);
    expect(report('2026-11-02', 'week').subGroups.map((g) => g.group)).toEqual(['pectoraux', 'dos', 'epaules', 'biceps', 'triceps', 'jambes']);
    // Abdominaux au récapitulatif, et un sous-groupe des jambes : un groupe principal une fois ; semaine du 16 nov. (leg
    // extension seul) : les jambes seules.
    expect(report('2026-11-16', 'week', ['pectoraux', 'abdominaux', 'quadriceps', 'jambes']).subGroups.map((g) => g.group)).toEqual(['pectoraux', 'abdominaux', 'jambes']);
    expect(lines(reportText(report('2026-11-16', 'week', ['pectoraux', 'abdominaux', 'quadriceps', 'jambes']), name))).toEqual([
      '- Jambes : quadriceps 3, ischio-jambiers 0, fessiers 0, adducteurs 0, mollets 0',
    ]);
    // Mois de novembre (en cours) : toute la période.
    expect(lines(reportText(report('2026-11', 'month'), name))[2]).toBe('- Épaules : avant 1,5, côté 2, arrière 1,5');
    // Semaine sans séance (activité seule) : pas de section.
    const idle = buildReport(parsePeriodKey('week', '2026-10-26')!, {
      sessions, exercises: LIB, evaluations: profile.evaluations, settings: SETTINGS, groups: DEFAULT_RECAP_SETTINGS.groups, weighIns: [],
      activities: [{ ...badminton, id: 'act-b-26', date: '2026-10-26' }], machines: DEFAULT_CARDIO_MACHINES, now: at(11, 18, 12),
    });
    expect(lines(reportText(idle, name))).toEqual([]);

    // Export coach (lundi 9 nov. : semaine du 2 au 8) : la semaine et les 4 semaines terminées.
    const coach = buildCoachExport({
      sessions, exercises: LIB, settings: SETTINGS, recap: DEFAULT_RECAP_SETTINGS, activities: [badminton], habits: DEFAULT_HABITS, machines: DEFAULT_CARDIO_MACHINES,
      weighIns: [], heightCm: null, ignoredAlerts: {}, appVersion: 'test', now: at(11, 9, 9),
    });
    expect(coach.recapitulatif.sous_groupes['Épaules']).toEqual({ avant: 1.5, côté: 2, arrière: 0 });
    expect(coach.recapitulatif.sous_groupes['Biceps']).toEqual({ 'longue portion': 1.5, 'courte portion': 0, 'brachial / avant-bras': 3 });
    expect(coach.recapitulatif.sous_groupes_4_semaines['Pectoraux']).toEqual({ haut: 0, milieu: 6, bas: 0 });
    expect(coach.recapitulatif.texte_du_bilan).toContain('- Épaules : avant 1,5, côté 2, arrière 0');
    expect(coach.regles.some((r) => r.startsWith('Sous-groupes'))).toBe(true);
  });
});
