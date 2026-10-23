import { describe, expect, it } from 'vitest';
import type { WeighIn } from '../../body/model';
import type { CardioBlock, Exercise, Feeling, Session } from '../../domain/types';
import { rebuildProfile } from '../../engine';
import { buildEngineSettings, displayName, indexVariants } from '../../library/catalog';
import { SEED_EXERCISES } from '../../library/seed';
import {
  buildReport,
  DEFAULT_REPORT_SETTINGS,
  defaultPeriod,
  mailSubject,
  mailtoUrl,
  markSeen,
  parsePeriodKey,
  pendingReports,
  periodContaining,
  periodKey,
  periodTitle,
  reportSections,
  lineText,
  reportText,
  sanitizeReportSettings,
  shiftPeriod,
  type ReportPeriod,
} from '../report';
import { DEFAULT_RECAP_SETTINGS } from '../weekly';

const LIB: Exercise[] = [...SEED_EXERCISES];
/** Adresse fictive, d'un domaine réservé aux exemples (RFC 2606). */
const ADDRESS = 'moi@example.org';
const SETTINGS = buildEngineSettings(LIB);
const VARIANTS = indexVariants(LIB);
const name = (id: string) => displayName(VARIANTS.get(id));
/** Heure locale, octobre 2026 : le lundi 19 commence la semaine du bilan. */
const at = (month: number, d: number, h = 18, m = 0) => new Date(2026, month - 1, d, h, m).getTime();
const oct = (d: number, h = 18, m = 0) => at(10, d, h, m);

interface Perf {
  v: string;
  kg: number;
  reps: number[];
  target?: number;
  feeling?: Feeling;
}
const green = (v: string, kg: number, target = 8): Perf => ({ v, kg, reps: [target, target, target], target, feeling: 'bien' });
const red = (v: string, kg: number, target = 8): Perf => ({ v, kg, reps: [target, target - 1, target - 1], target, feeling: 'bien' });

let n = 0;
function session(start: number, perfs: Perf[], extra: { minutes?: number; cardio?: Omit<CardioBlock, 'id' | 'machineId'>[]; noTime?: boolean } = {}): Session {
  const d = new Date(start);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const s: Session = {
    id: `s${++n}`, name: 'Séance', date, startedAt: extra.noTime ? null : start, endedAt: extra.noTime ? null : start + (extra.minutes ?? 60) * 60_000,
    createdAt: start, updatedAt: start, origin: extra.noTime ? 'import' : 'app', state: 'done',
    performances: perfs.map((p) => ({ variantId: p.v, weightKg: p.kg, targetReps: p.target ?? 8, plannedSets: 3, reps: p.reps, feeling: p.feeling ?? 'bien' })),
  };
  if (extra.cardio) s.cardio = extra.cardio.map((b, i) => ({ id: `c${n}-${i}`, machineId: b.machine, ...b }));
  return s;
}

function report(period: ReportPeriod, sessions: Session[], now: number, weighIns: WeighIn[] = []) {
  const replay = rebuildProfile(sessions, SETTINGS);
  return buildReport(period, { sessions, exercises: LIB, evaluations: replay.evaluations, settings: SETTINGS, groups: DEFAULT_RECAP_SETTINGS.groups, weighIns, now });
}
const linesOf = (r: ReturnType<typeof report>, title: string) => reportSections(r, name).find((s) => s.title === title)?.lines.map(lineText);
const textSections = (r: ReturnType<typeof report>) => reportSections(r, name).map((s) => ({ title: s.title, lines: s.lines.map(lineText) }));

/** Semaine précédente (12–18 oct.) : 3 séances ; semaine du bilan (19–25 oct.) : 4 séances. */
function octoberHistory(): Session[] {
  return [
    session(oct(13), [red('presse-a-cuisses', 100)]),
    session(oct(14), [red('presse-a-cuisses', 100), green('curl-biceps-halteres', 12)]),
    session(oct(15), [red('presse-a-cuisses', 100)]),
    session(oct(20), [green('leg-extension', 40, 12), green('tractions-assistees', 30, 12)], { cardio: [{ machine: 'Tapis de marche', minutes: 10, incline: 'neutre' }] }),
    session(oct(21), [red('presse-a-cuisses', 100), green('curl-biceps-halteres', 12)]),
    session(oct(23), [green('leg-extension', 40, 12)]),
    session(oct(24), [green('tractions-assistees', 30, 12), green('pec-deck', 30)], {
      cardio: [{ machine: 'Tapis de marche', minutes: 20, incline: 'neutre' }, { machine: 'Rameur', minutes: 10 }],
    }),
  ];
}
const WEIGH_INS: WeighIn[] = [
  { date: '2026-10-18', weightKg: 80.5 },
  { date: '2026-10-19', weightKg: 80.2 },
  { date: '2026-10-22', weightKg: 80 },
  { date: '2026-10-25', weightKg: 79.6 },
];
const WEEK = periodContaining('week', oct(22));

describe('Bilans de la semaine et du mois (§19.7)', () => {
  it('188. Bornes : semaine du lundi 0 h 00 au dimanche, mois calendaire, heure locale ; titres et objets', () => {
    expect(periodKey(periodContaining('week', oct(25, 23, 59)))).toBe('2026-10-19');
    expect(periodKey(periodContaining('week', oct(26, 0, 0)))).toBe('2026-10-26');
    expect(periodKey(periodContaining('month', oct(31, 23, 30)))).toBe('2026-10');
    expect(periodKey(periodContaining('month', at(11, 1, 0, 0)))).toBe('2026-11');
    // Une séance commencée dimanche 23 h 30 compte dans sa semaine ; celle du 31 à 23 h 30 dans octobre.
    const late = [session(oct(25, 23, 30), [green('pec-deck', 30)], { minutes: 90 }), session(oct(31, 23, 30), [green('pec-deck', 30)])];
    expect(report(WEEK, late, oct(26, 9)).totals.sessionCount).toBe(1);
    expect(report(periodContaining('week', oct(26)), late, oct(31, 23, 59)).totals.sessionCount).toBe(1);
    expect(report(periodContaining('month', oct(1)), late, at(11, 2)).totals.sessionCount).toBe(2);
    expect(report(periodContaining('month', at(11, 1)), late, at(11, 2)).totals.sessionCount).toBe(0);

    expect(periodTitle(WEEK)).toBe('Semaine du 19 au 25 oct. 2026');
    expect(periodTitle(periodContaining('week', oct(1)))).toBe('Semaine du 28 sept. au 4 oct. 2026');
    expect(periodTitle(periodContaining('week', at(1, 1)))).toBe('Semaine du 29 déc. 2025 au 4 janv. 2026');
    expect(periodTitle(periodContaining('month', oct(5)))).toBe('Octobre 2026');
    expect(mailSubject(WEEK)).toBe('MyFitApp — Bilan semaine du 19 au 25 oct. 2026');
    expect(mailSubject(periodContaining('month', oct(5)))).toBe('MyFitApp — Bilan octobre 2026');

    // Navigation et clés : décalage d'une période, y compris au changement d'année ; clé invalide refusée.
    expect(periodKey(shiftPeriod(WEEK, -1))).toBe('2026-10-12');
    expect(periodKey(shiftPeriod(periodContaining('month', at(1, 31)), -1))).toBe('2025-12');
    expect(periodKey(shiftPeriod(periodContaining('month', at(12, 15)), 1))).toBe('2027-01');
    expect(parsePeriodKey('week', '2026-10-19')).toEqual(WEEK);
    expect(parsePeriodKey('week', '2026-10-20')).toBeNull(); // pas un lundi
    expect(parsePeriodKey('month', '2026-13')).toBeNull();
    // Période ouverte par défaut : en cours si elle contient une séance, sinon la précédente.
    expect(periodKey(defaultPeriod('week', octoberHistory(), oct(26, 9)))).toBe('2026-10-19');
    expect(periodKey(defaultPeriod('week', octoberHistory(), oct(24, 20)))).toBe('2026-10-19');
    expect(periodKey(defaultPeriod('month', octoberHistory(), oct(26, 9)))).toBe('2026-10');
  });

  it('189. Période sans séance : rien d’inventé, comparaison et pesées seulement', () => {
    const r = report(WEEK, octoberHistory().filter((s) => s.date < '2026-10-19'), oct(26, 9), WEIGH_INS);
    expect(r.totals).toEqual({ sessionCount: 0, durationMs: 0, unknownDuration: 0 });
    expect(textSections(r)).toEqual([
      {
        title: 'Séances',
        lines: ['0 séance, −3 par rapport à la semaine précédente', 'Durée en salle : 0 min, −3 h 00 par rapport à la semaine précédente'],
      },
      { title: 'Poids', lines: ['80,2 kg le 19 oct. → 79,6 kg le 25 oct.'] },
    ]);
    const empty = report(WEEK, [], oct(26, 9));
    expect(textSections(empty)).toEqual([{ title: 'Séances', lines: ['0 séance, autant que la semaine précédente'] }]);
    // Une seule pesée : une seule valeur.
    expect(linesOf(report(WEEK, [], oct(26, 9), [{ date: '2026-10-22', weightKg: 80 }]), 'Poids')).toEqual(['80 kg le 22 oct.']);
  });

  it('190. Paliers validés de la période (+1 répétition, poids supérieur, moins d’aide), rouges et poids inférieur ; aucun effet sur le moteur', () => {
    const sessions = octoberHistory();
    const snapshot = structuredClone(sessions);
    const before = rebuildProfile(sessions, SETTINGS);
    const r = report(WEEK, sessions, oct(26, 9));
    expect(r.progressions.map((p) => [p.variantId, p.kind, p.from, p.toReps, p.assisted])).toEqual([
      ['curl-biceps-halteres', 'reps_up', { weightKg: 12, targetReps: 8 }, 9, false],
      ['leg-extension', 'weight_up', { weightKg: 40, targetReps: 12 }, 8, false],
      ['tractions-assistees', 'weight_up', { weightKg: 30, targetReps: 12 }, 8, true],
    ]);
    expect(linesOf(r, 'Progressions')).toEqual([
      'Curl biceps haltères : 3×8 → 3×9 à 12 kg (21 oct.)',
      'Leg extension : 3×12 à 40 kg validé → poids supérieur, 3×8 (23 oct.)',
      'Tractions assistées : 3×12 avec 30 kg d’aide validé → moins d’aide, 3×8 (24 oct.)',
    ]);
    // Une seule verte (pec deck) ne valide rien ; la première verte du curl, la semaine précédente, n'est pas listée.
    expect(r.progressions.map((p) => p.variantId)).not.toContain('pec-deck');
    expect(linesOf(r, 'En difficulté')).toEqual(['Presse à cuisses : 4ᵉ séance rouge de suite à 100 kg → poids inférieur recommandé (21 oct.)']);
    // La semaine précédente : trois rouges, pas encore de baisse ; la première verte du curl ne valide rien.
    const previous = report(shiftPeriod(WEEK, -1), sessions, oct(26, 9));
    // Série commencée dans la période : pas de parenthèse.
    expect(linesOf(previous, 'En difficulté')).toEqual(['Presse à cuisses : 3 séances rouges cette semaine']);
    expect(linesOf(previous, 'Progressions')).toEqual(['Aucun palier validé.']);

    // Exercice assisté : +1 répétition avec l'aide, puis « plus d'aide » après quatre rouges.
    const dips = [
      session(oct(12), [green('dips-assistes', 25)]),
      session(oct(19), [green('dips-assistes', 25)]),
      ...[20, 21, 22, 23].map((d) => session(oct(d), [red('dips-assistes', 25, 9)])),
    ];
    const assisted = report(WEEK, dips, oct(26, 9));
    expect(linesOf(assisted, 'Progressions')).toEqual(['Dips assistés : 3×8 → 3×9 avec 25 kg d’aide (19 oct.)']);
    expect(linesOf(assisted, 'En difficulté')).toEqual(['Dips assistés : 4ᵉ séance rouge de suite avec 25 kg d’aide → plus d’aide recommandée (23 oct.)']);

    // Sans baisse : rouges de la période, et série en cours quand elle a commencé avant (semaine comme mois).
    const ongoing = [
      session(oct(16), [red('presse-a-cuisses', 100)]),
      session(oct(20), [red('presse-a-cuisses', 100), red('leg-curl', 30)]),
      session(oct(22), [red('presse-a-cuisses', 100), green('leg-curl', 30)]),
    ];
    expect(linesOf(report(WEEK, ongoing, oct(26, 9)), 'En difficulté')).toEqual([
      'Presse à cuisses : 2 séances rouges cette semaine (3 de suite à 100 kg)',
      // Série interrompue par une verte : rien de plus.
      'Leg curl : 1 séance rouge cette semaine',
    ]);
    expect(linesOf(report(periodContaining('month', oct(20)), ongoing, oct(26, 9)), 'En difficulté')).toEqual([
      'Presse à cuisses : 3 séances rouges ce mois-ci',
      'Leg curl : 1 séance rouge ce mois-ci',
    ]);
    const pastSeries = [session(oct(14), [red('tractions-assistees', 30, 12)]), session(oct(19), [red('tractions-assistees', 30, 12)])];
    expect(linesOf(report(WEEK, pastSeries, oct(26, 9)), 'En difficulté')).toEqual(['Tractions assistées : 1 séance rouge cette semaine (2 de suite avec 30 kg d’aide)']);

    // Calcul pur : séances et moteur inchangés.
    expect(sessions).toEqual(snapshot);
    expect(rebuildProfile(sessions, SETTINGS)).toEqual(before);
  });

  it('191. Comparaison avec la période précédente, durée, cardio par machine, groupes directs et indirects (semaine et mois)', () => {
    const sessions = octoberHistory();
    const r = report(WEEK, sessions, oct(26, 9));
    expect(linesOf(r, 'Séances')).toEqual([
      '4 séances, +1 par rapport à la semaine précédente',
      'Durée en salle : 4 h 00, +1 h 00 par rapport à la semaine précédente',
      'Cardio : 40 min (Tapis de marche 30 min, Rameur 10 min)',
    ]);
    expect(linesOf(r, 'Groupes travaillés')).toEqual(['Pectoraux : 1×', 'Dos : 2×', 'Biceps : 1× · +2 indirect', 'Jambes : 3×', 'Non travaillés : Épaules, Triceps']);
    // Moins de séances, autant, durée plus courte, séance importée sans heure.
    const fewer = report(WEEK, [...sessions.slice(0, 3), session(oct(20), [green('pec-deck', 30)], { minutes: 25 }), session(oct(22), [green('pec-deck', 30)], { noTime: true })], oct(26, 9));
    expect(linesOf(fewer, 'Séances')!.slice(0, 2)).toEqual([
      '2 séances, −1 par rapport à la semaine précédente',
      'Durée en salle : 25 min (1 séance sans durée)',
    ]);
    const same = report(WEEK, [...sessions.slice(0, 3), ...[20, 21, 22].map((d) => session(oct(d), [green('pec-deck', 30)]))], oct(26, 9));
    expect(linesOf(same, 'Séances')!.slice(0, 3)).toEqual([
      '3 séances, autant que la semaine précédente',
      'Durée en salle : 3 h 00, autant que la semaine précédente',
      'Cardio : aucun',
    ]);
    // Mois : séances par groupe sur tout le mois, comparaison avec le mois précédent.
    const month = report(periodContaining('month', oct(1)), [session(at(9, 30), [green('pec-deck', 30)]), ...sessions], at(11, 2));
    expect(linesOf(month, 'Séances')![0]).toBe('7 séances, +6 par rapport au mois précédent');
    expect(linesOf(month, 'Groupes travaillés')).toEqual(['Pectoraux : 1×', 'Dos : 2×', 'Biceps : 2× · +2 indirect', 'Jambes : 6×', 'Non travaillés : Épaules, Triceps']);
  });

  it('237. Durées inconnues jamais comptées pour 0 min ; période en cours comparée à la même portion de la précédente ; période terminée à la précédente entière', () => {
    // Cas réel : semaine précédente avec deux séances importées sans heure (lun. 12, jeu. 15) et une de 40 min (sam. 17).
    const imported = [session(oct(12), [green('pec-deck', 30)], { noTime: true }), session(oct(15), [green('pec-deck', 30)], { noTime: true }), session(oct(17), [green('pec-deck', 30)], { minutes: 40 })];
    const current = [...imported, session(oct(20), [green('pec-deck', 30)], { minutes: 62 })];
    // Vendredi 23 en cours : comparé à lun.–ven. de la semaine dernière (12 et 15, pas le 17) ; durée sans comparaison.
    const friday = report(WEEK, current, oct(23, 12, 40));
    expect(friday.compared).toEqual({ start: new Date(2026, 9, 12), next: new Date(2026, 9, 17), partial: true });
    expect(linesOf(friday, 'Séances')).toEqual(['1 séance, −1 par rapport à lun.–ven. de la semaine dernière', 'Durée en salle : 1 h 02', 'Cardio : aucun']);
    // Le mail suit les mêmes règles.
    expect(reportText(friday, name)).toContain('\n- 1 séance, −1 par rapport à lun.–ven. de la semaine dernière\n- Durée en salle : 1 h 02\n');
    // Semaine terminée : comparée à toute la semaine précédente ; toujours pas de comparaison de durée.
    const finished = report(WEEK, current, oct(26, 9));
    expect(finished.compared).toEqual({ start: new Date(2026, 9, 12), next: new Date(2026, 9, 19), partial: false });
    expect(linesOf(finished, 'Séances')!.slice(0, 2)).toEqual(['1 séance, −2 par rapport à la semaine précédente', 'Durée en salle : 1 h 02']);
    // Séance sans durée dans la période : signalée, jamais 0 min ; toutes inconnues : « inconnue ».
    const withImport = report(WEEK, [...current, session(oct(21), [green('pec-deck', 30)], { noTime: true })], oct(23, 12, 40));
    expect(linesOf(withImport, 'Séances')!.slice(0, 2)).toEqual(['2 séances, autant que lun.–ven. de la semaine dernière', 'Durée en salle : 1 h 02 (1 séance sans durée)']);
    const allUnknown = report(WEEK, [...imported, ...[21, 22].map((d) => session(oct(d), [green('pec-deck', 30)], { noTime: true }))], oct(26, 9));
    expect(linesOf(allUnknown, 'Séances')!.slice(0, 2)).toEqual(['2 séances, −1 par rapport à la semaine précédente', 'Durée en salle : inconnue (2 séances sans durée)']);

    // Toutes les durées connues des deux côtés : durée comparée, sur la même portion ; mise en évidence.
    const known = [session(oct(13), [green('pec-deck', 30)]), session(oct(17), [green('pec-deck', 30)]), session(oct(20), [green('pec-deck', 30)], { minutes: 62 })];
    const partial = report(WEEK, known, oct(23, 12, 40));
    expect(linesOf(partial, 'Séances')!.slice(0, 2)).toEqual([
      '1 séance, autant que lun.–ven. de la semaine dernière',
      'Durée en salle : 1 h 02, +2 min par rapport à lun.–ven. de la semaine dernière',
    ]);
    expect(reportSections(partial, name)[0]!.lines[1]).toEqual(['Durée en salle : 1 h 02', ', ', { em: '+2 min par rapport à lun.–ven. de la semaine dernière' }]);
    expect(linesOf(report(WEEK, known, oct(26, 9)), 'Séances')!.slice(0, 2)).toEqual([
      '1 séance, −1 par rapport à la semaine précédente',
      'Durée en salle : 1 h 02, −58 min par rapport à la semaine précédente',
    ]);
    // Lundi : un seul jour ; dimanche : la semaine précédente entière.
    expect(linesOf(report(WEEK, [session(oct(12), [green('pec-deck', 30)]), session(oct(19), [green('pec-deck', 30)])], oct(19, 20)), 'Séances')![0]).toBe(
      '1 séance, autant que lun. de la semaine dernière',
    );
    expect(linesOf(report(WEEK, known, oct(25, 12)), 'Séances')![0]).toBe('1 séance, −1 par rapport à la semaine précédente');

    // Mois en cours : du 1er au même jour du mois dernier ; le 31 octobre est comparé à tout septembre (30 jours).
    const OCTOBER = periodContaining('month', oct(1));
    const months = [at(9, 1), at(9, 5), at(9, 20), at(9, 28), oct(1), oct(2)].map((t) => session(t, [green('pec-deck', 30)]));
    expect(linesOf(report(OCTOBER, months, oct(23, 12)), 'Séances')![0]).toBe('2 séances, −1 par rapport au 1er–23 du mois dernier');
    expect(linesOf(report(OCTOBER, months.slice(0, 5), oct(1, 20)), 'Séances')![0]).toBe('1 séance, autant que le 1er du mois dernier');
    expect(linesOf(report(OCTOBER, months, oct(31, 12)), 'Séances')![0]).toBe('2 séances, −2 par rapport au mois précédent');
    expect(linesOf(report(OCTOBER, months, at(11, 2)), 'Séances')![0]).toBe('2 séances, −2 par rapport au mois précédent');
  });

  it('192. Texte du mail : objet, titres, listes simples, sans HTML ; lien mailto prérempli', () => {
    const r = report(WEEK, octoberHistory(), oct(26, 9), WEIGH_INS);
    const text = reportText(r, name);
    expect(text).toBe(
      [
        'MyFitApp — Bilan semaine du 19 au 25 oct. 2026',
        '',
        'SÉANCES',
        '- 4 séances, +1 par rapport à la semaine précédente',
        '- Durée en salle : 4 h 00, +1 h 00 par rapport à la semaine précédente',
        '- Cardio : 40 min (Tapis de marche 30 min, Rameur 10 min)',
        '',
        'GROUPES TRAVAILLÉS',
        '- Pectoraux : 1×',
        '- Dos : 2×',
        '- Biceps : 1× · +2 indirect',
        '- Jambes : 3×',
        '- Non travaillés : Épaules, Triceps',
        '',
        'PROGRESSIONS',
        '- Curl biceps haltères : 3×8 → 3×9 à 12 kg (21 oct.)',
        '- Leg extension : 3×12 à 40 kg validé → poids supérieur, 3×8 (23 oct.)',
        '- Tractions assistées : 3×12 avec 30 kg d’aide validé → moins d’aide, 3×8 (24 oct.)',
        '',
        'RECORDS',
        '- Aucun nouveau record.',
        '',
        'EN DIFFICULTÉ',
        '- Presse à cuisses : 4ᵉ séance rouge de suite à 100 kg → poids inférieur recommandé (21 oct.)',
        '',
        'POIDS',
        '- 80,2 kg le 19 oct. → 79,6 kg le 25 oct.',
        '',
      ].join('\n'),
    );
    expect(text).not.toMatch(/<[a-z]/i);
    // Période en cours : mention en tête.
    const current = reportText(report(WEEK, octoberHistory(), oct(22, 9)), name);
    expect(current.split('\n').slice(0, 2)).toEqual(['MyFitApp — Bilan semaine du 19 au 25 oct. 2026', '(Semaine en cours, arrêtée au jeu. 22 oct.)']);
    const url = mailtoUrl(ADDRESS, mailSubject(WEEK), 'Ligne 1\nLigne 2');
    expect(url).toBe(`mailto:${ADDRESS}?subject=MyFitApp%20%E2%80%94%20Bilan%20semaine%20du%2019%20au%2025%20oct.%202026&body=Ligne%201%0D%0ALigne%202`);
    expect(mailtoUrl('', 'Objet', 'x')).toBe('mailto:?subject=Objet&body=x');
  });

  it('195. Éléments importants mis en évidence à l’écran : comparaisons, nouvelles cibles, non travaillés, rouges, baisses, pesées ; noms et nombres en texte simple', () => {
    const r = report(WEEK, octoberHistory(), oct(26, 9), WEIGH_INS);
    const emphasized = Object.fromEntries(
      reportSections(r, name).map((s) => [s.title, s.lines.flatMap((l) => l.flatMap((p) => (typeof p === 'string' ? [] : [p.em])))]),
    );
    expect(emphasized).toEqual({
      Séances: ['+1 par rapport à la semaine précédente', '+1 h 00 par rapport à la semaine précédente'],
      'Groupes travaillés': ['Non travaillés : Épaules, Triceps'],
      Progressions: ['3×8 → 3×9 à 12 kg', 'poids supérieur, 3×8', 'moins d’aide, 3×8'],
      Records: [],
      'En difficulté': ['poids inférieur recommandé'],
      Poids: ['80,2 kg', '79,6 kg'],
    });
    // Le mail reste en texte brut : aucune marque de mise en évidence.
    expect(reportText(r, name)).not.toMatch(/[*_<]/);
    // « Autant que » est aussi mis en évidence.
    const same = report(WEEK, [], oct(26, 9));
    expect(reportSections(same, name)[0]!.lines[0]).toEqual(['0 séance, ', { em: 'autant que la semaine précédente' }]);
  });

  it('193. Bandeau : à partir du lundi ou du 1er, une seule fois par période, seulement avec des séances, désactivable', () => {
    const sessions = [...octoberHistory(), session(oct(27), [green('pec-deck', 30)])];
    const keys = (now: number, seen = {}, settings = DEFAULT_REPORT_SETTINGS) => pendingReports(sessions, now, settings, seen).map((p) => `${p.kind}:${periodKey(p)}`);
    expect(keys(oct(25, 23, 59))).toEqual(['week:2026-10-12']); // dimanche soir : semaine 12–18 pas encore ouverte
    let seen = markSeen({}, shiftPeriod(WEEK, -1), oct(25, 23, 59));
    expect(keys(oct(25, 23, 59), seen)).toEqual([]);
    expect(keys(oct(26, 0, 1), seen)).toEqual(['week:2026-10-19']); // lundi : semaine écoulée
    // Ouvrir la semaine en cours, ou une semaine plus ancienne, ne retire pas le bandeau.
    expect(markSeen(seen, periodContaining('week', oct(26)), oct(26, 9))).toBe(seen);
    expect(keys(oct(26, 9), markSeen(seen, shiftPeriod(WEEK, -2), oct(26, 9)))).toEqual(['week:2026-10-19']);
    seen = markSeen(seen, WEEK, oct(26, 9));
    expect(keys(oct(26, 9), seen)).toEqual([]);
    expect(keys(oct(28, 9), seen)).toEqual([]); // une seule fois par période
    // Semaine suivante (26 oct.–1er nov.) ; mois d'octobre à partir du 1er novembre.
    expect(keys(at(11, 1, 8), seen)).toEqual(['month:2026-10']);
    expect(keys(at(11, 2, 8), seen)).toEqual(['week:2026-10-26', 'month:2026-10']);
    seen = markSeen(markSeen(seen, periodContaining('month', oct(1)), at(11, 2, 8)), periodContaining('week', oct(26)), at(11, 2, 8));
    expect(keys(at(11, 2, 8), seen)).toEqual([]);
    // Période écoulée sans séance : pas de bandeau ; réglages désactivés : pas de bandeau.
    expect(keys(at(11, 9, 8), seen)).toEqual([]);
    expect(keys(oct(26, 9), {}, { ...DEFAULT_REPORT_SETTINGS, weekBanner: false })).toEqual([]);
    expect(keys(at(11, 2, 8), {}, { ...DEFAULT_REPORT_SETTINGS, monthBanner: false })).toEqual(['week:2026-10-26']);
    // Réglages lus en base ou importés : adresse invalide écartée, valeurs par défaut sinon.
    expect(sanitizeReportSettings({ weekBanner: false, email: ` ${ADDRESS} ` })).toEqual({ weekBanner: false, monthBanner: true, email: ADDRESS });
    expect(sanitizeReportSettings({ email: 'pas une adresse' }).email).toBe('');
    expect(sanitizeReportSettings(null)).toEqual(DEFAULT_REPORT_SETTINGS);
  });
});
