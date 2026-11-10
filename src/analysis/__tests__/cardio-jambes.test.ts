import { describe, expect, it } from 'vitest';
import type { CardioBlock, CardioMachine, Exercise, MuscleGroup, Performance, Session } from '../../domain/types';
import { DEFAULT_CARDIO_MACHINES, machineCountsForLegs, newMachine, sanitizeCardioMachines } from '../../cardio/model';
import { rebuildProfile } from '../../engine';
import { buildEngineSettings, displayName, indexVariants } from '../../library/catalog';
import { SEED_EXERCISES } from '../../library/seed';
import { weekSuggestion } from '../../plan/suggest';
import { groupAlerts } from '../groupAlerts';
import { groupIndex, groupWeeklySets } from '../groups';
import { buildReport, buildReportScreen, parsePeriodKey, reportText, type ReportInput, type ReportPeriod } from '../report';
import { DEFAULT_RECAP_SETTINGS, LEG_CARDIO_MINUTES, RECAP_TITLE_FORMS, legCardioMinutes, recapCountLabel, recapTitle, weeklyRecap } from '../weekly';

const LIB: Exercise[] = [...SEED_EXERCISES];
const SETTINGS = buildEngineSettings(LIB);
const MACHINES = [...DEFAULT_CARDIO_MACHINES];
const NOW = new Date(2026, 9, 30, 20).getTime(); // vendredi 30 octobre 2026, semaine du lundi 26

const BLOCKS: Record<string, Omit<CardioBlock, 'id' | 'minutes'>> = {
  tapis: { machineId: 'tapis', machine: 'Tapis de marche', incline: 'neutre' },
  rameur: { machineId: 'rameur', machine: 'Rameur' },
  elliptique: { machineId: 'elliptique', machine: 'Vélo elliptique' },
  velo: { machineId: 'velo', machine: 'Vélo' },
  autre: { machineId: 'autre', machine: 'Autre' },
  marches: { machineId: 'cardio-marches', machine: 'Marches' },
};
const p = (variantId: string, weightKg = 40): Performance => ({ variantId, weightKg, targetReps: 10, plannedSets: 3, reps: [10, 10, 10], feeling: 'bien' });
/** Séance terminée le `d` (octobre, ou novembre au-delà de 31) à `h` heures, avec ses blocs de cardio [machine, minutes]. */
function session(id: string, d: number, cardio: [string, number][], performances: Performance[] = [], opts: { h?: number; home?: boolean; running?: boolean } = {}): Session {
  const t = new Date(2026, 9, d, opts.h ?? 9).getTime();
  const date = new Date(t);
  return {
    id, name: id, date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    startedAt: t, endedAt: opts.running ? null : t + 3_600_000, createdAt: t, updatedAt: t, origin: 'app', state: opts.running ? 'active' : 'done',
    performances, ...(opts.home ? { location: 'maison' as const } : {}),
    ...(cardio.length > 0 ? { cardio: cardio.map(([m, minutes], i): CardioBlock => ({ id: `${id}-c${i}`, ...BLOCKS[m]!, minutes })) } : {}),
  };
}
const recapOf = (sessions: Session[], machines: readonly CardioMachine[] = MACHINES, now = NOW) => weeklyRecap(sessions, LIB, now, DEFAULT_RECAP_SETTINGS, [], machines);
const legs = (sessions: Session[], machines: readonly CardioMachine[] = MACHINES, now = NOW) => recapOf(sessions, machines, now).cells.find((c) => c.group === 'jambes')!;

describe('Cardio pour les jambes, version 1.41.0', () => {
  it('295. Toutes les machines sauf le rameur (réglable, nouvelles machines comprises) ; à partir de 45 min dans la semaine, salle et maison confondues : jambes +3 séries (version 1.45.0), « +45 min cardio », au plus 3, sans plafond par jour ; rien en dessous', () => {
    // Réglage : coché par défaut, décoché pour le rameur ; une nouvelle machine compte ; une liste enregistrée avant la
    // version 1.41.0 (sans la case) : le rameur, même renommé, ne compte pas.
    expect(DEFAULT_CARDIO_MACHINES.map((m) => [m.id, machineCountsForLegs(m)])).toEqual([
      ['tapis', true], ['rameur', false], ['elliptique', true], ['velo', true], ['autre', true],
    ]);
    expect(machineCountsForLegs(newMachine('Marches', false, MACHINES))).toBe(true);
    const old = [{ id: 'tapis', name: 'Tapis', incline: true }, { id: 'rameur', name: 'Rameur concept 2', incline: false }];
    expect(old.map(machineCountsForLegs)).toEqual([true, false]);
    // La case est gardée à la lecture (base, sauvegarde) ; une valeur invalide est écartée (règle par défaut).
    expect(sanitizeCardioMachines([{ id: 'rameur', name: 'Rameur', incline: false, legs: true }, { id: 'tapis', name: 'Tapis', incline: true, legs: 'oui' }])).toEqual([
      { id: 'rameur', name: 'Rameur', incline: false, legs: true },
      { id: 'tapis', name: 'Tapis', incline: true },
    ]);

    // 20 min de tapis lundi + 25 min de vélo jeudi à la maison : 45 min → jambes 3 séries (orange à partir de 3,
    // version 1.45.0), « +45 min cardio ».
    const nb = '\u00a0';
    const base = [session('a', 26, [['tapis', 20]]), session('b', 29, [['velo', 25]], [], { home: true })];
    expect(legs(base)).toMatchObject({ count: 0, indirect: 0, cardio: 45, score: 3, color: 'orange', recency: null });
    expect(recapCountLabel(legs(base))).toBe(`3${nb}séries · +45${nb}min${nb}cardio`);
    expect(LEG_CARDIO_MINUTES).toBe(45);
    // 44 min : rien (ni score ni mention).
    const short = [session('a', 26, [['tapis', 20]]), session('b', 29, [['velo', 24]])];
    expect(legs(short)).toMatchObject({ score: 0 });
    expect(legs(short)).not.toHaveProperty('cardio');
    // Le rameur ne compte pas : 60 min de rameur + 30 de tapis → 30, rien ; le total réel affiché ne compte que les
    // machines prises en compte (elliptique, autre, nouvelle machine comprises).
    expect(legs([session('r', 27, [['rameur', 60], ['tapis', 30]])])).not.toHaveProperty('cardio');
    expect(legs([session('e', 27, [['rameur', 60], ['elliptique', 15], ['autre', 10], ['marches', 20]])])).toMatchObject({ cardio: 45, score: 3 });
    // Réglage changé : le rameur coché compte, le tapis décoché ne compte plus.
    const changed = MACHINES.map((m) => (m.id === 'rameur' ? { ...m, legs: true } : m.id === 'tapis' ? { ...m, legs: false } : m));
    expect(legs([session('r', 27, [['rameur', 50]])], changed)).toMatchObject({ cardio: 50 });
    expect(legs(base, changed)).not.toHaveProperty('cardio');
    // Une machine retirée de la liste depuis : règle par défaut (le tapis compte, le rameur non).
    expect(legCardioMinutes([session('a', 26, [['tapis', 20], ['rameur', 30]])], [], () => true)).toBe(20);

    // Plafond : 3 séries par semaine, quel que soit le total (200 min → 3, total réel affiché).
    expect(legs([session('a', 26, [['tapis', 100]]), session('b', 28, [['velo', 100]])])).toMatchObject({ cardio: 200, score: 3 });
    // Sans plafond par jour : leg extension à la salle (3 séries) et 50 min de tapis le même jour → 6, orange.
    const sameDay = [session('j', 28, [['tapis', 50]], [p('leg-extension')])];
    expect(legs(sameDay)).toMatchObject({ count: 1, cardio: 50, score: 6, color: 'orange', recency: null });
    expect(recapCountLabel(legs(sameDay))).toBe(`6${nb}séries · +50${nb}min${nb}cardio`);
    // Avec des séries à la maison (en entier, version 1.45.0) et une autre séance : 3 + 3 + 3 + 3 = 12, rouge.
    const all = [...sameDay, session('h', 29, [], [p('mollets-machine')], { home: true }), session('k', 27, [], [p('leg-extension')])];
    expect(legs(all)).toMatchObject({ count: 2, cardio: 50, score: 12, color: 'rouge' });

    // Semaine du lundi au dimanche : le cardio de la semaine précédente ne compte pas ; une séance en cours non plus.
    expect(legs([session('old', 25, [['tapis', 60]])])).not.toHaveProperty('cardio');
    expect(legs([session('run', 30, [['tapis', 60]], [], { running: true, h: 19 })])).not.toHaveProperty('cardio');
    // Le lundi suivant, la semaine repart de 0.
    expect(legs(base, MACHINES, new Date(2026, 10, 2, 9).getTime())).not.toHaveProperty('cardio');

    // Seules les jambes : autres groupes, en-tête et ordre de tri des autres cases inchangés.
    const chest = session('c', 27, [['tapis', 60]], [p('chest-press')]);
    const without = { ...chest, cardio: undefined };
    const cellsWith = recapOf([chest]).cells.filter((c) => c.group !== 'jambes');
    const cellsWithout = recapOf([without]).cells.filter((c) => c.group !== 'jambes');
    expect(cellsWith).toEqual(cellsWithout);
    expect(recapTitle(recapOf([chest]))).toBe('Semaine du lun. 26 oct. au dim. 1 nov. : 1 séance · 1 h 00 de cardio');
  });

  it('296. Bilans de la semaine et du mois (3 séries par semaine sur le mois, version 1.45.0), texte du mail, séance pour compléter la semaine ; aucun effet sur les séries par semaine, l’indice, l’alerte ni le moteur', () => {
    // Octobre 2026 : semaine du 5 (50 min), du 12 (30 min : rien), du 19 (tapis 40 + rameur 20 : rien), du 26 (62 min,
    // dont 20 le 1er novembre, hors du mois : 42 dans octobre, rien). Semaine du 28 sept. : 45 min le 1er octobre.
    const sessions = [
      session('s1', 1, [['tapis', 45]]),
      session('s5', 5, [['tapis', 30]], [p('chest-press')]),
      session('s7', 7, [['velo', 20]], [], { home: true }),
      session('s12', 12, [['tapis', 30]]),
      session('s19', 19, [['tapis', 40], ['rameur', 20]], [p('leg-extension')]),
      session('s26', 26, [['tapis', 42]]),
      session('n1', 32, [['velo', 20]]),
    ];
    const reportOf = (period: ReportPeriod, machines: readonly CardioMachine[] = MACHINES) => {
      const input: ReportInput = {
        sessions, exercises: LIB, evaluations: rebuildProfile(sessions, SETTINGS).evaluations, settings: SETTINGS,
        groups: DEFAULT_RECAP_SETTINGS.groups, weighIns: [], machines, now: new Date(2026, 10, 3, 9).getTime(),
      };
      const report = buildReport(period, input);
      return { report, screen: buildReportScreen(report, input), text: reportText(report, (id) => displayName(indexVariants(LIB).get(id))) };
    };
    const legsOf = (r: ReturnType<typeof reportOf>) => ({ group: r.report.groups.find((g) => g.group === 'jambes'), bar: r.screen.bars.find((b) => b.group === 'jambes') });

    // Semaine du 5 octobre : 50 min (salle et maison) → « Jambes : 3 séries (+50 min cardio) », bâton 3 ; jambes
    // travaillées.
    const w5 = reportOf(parsePeriodKey('week', '2026-10-05')!);
    expect(legsOf(w5)).toEqual({ group: { group: 'jambes', count: 0, indirect: 0, cardio: 50, sets: 3 }, bar: { group: 'jambes', sets: 3 } });
    expect(w5.text).toContain('- Jambes : 3 séries (+50 min cardio)');
    expect(w5.text).not.toMatch(/Non travaillés : [^\n]*Jambes/);
    // Semaine du 19 : 40 min (le rameur ne compte pas) → rien de plus que la séance de jambes (3 séries).
    const w19 = reportOf(parsePeriodKey('week', '2026-10-19')!);
    expect(legsOf(w19).group).toEqual({ group: 'jambes', count: 1, indirect: 0, sets: 3 });
    expect(w19.text).toContain('- Jambes : 3 séries (1 séance)\n');
    // Semaine du 26 : 62 min sur toute la semaine → 3 séries, comme le récapitulatif.
    const w26 = reportOf(parsePeriodKey('week', '2026-10-26')!);
    expect(legsOf(w26).group).toMatchObject({ cardio: 62, sets: 3 });
    expect(legsOf(w26).bar).toEqual({ group: 'jambes', sets: 3 });
    expect(legs(sessions, MACHINES, new Date(2026, 10, 1, 20).getTime())).toMatchObject({ cardio: 62, score: 3 });

    // Octobre : semaine par semaine, sur la partie de chaque semaine comprise dans le mois : le 1er (45), la semaine du
    // 5 (50) ; pas celle du 26 (42 en octobre). 95 min, 2 semaines → 6 séries, plus les 3 du leg extension : bâton 9.
    const oct = reportOf(parsePeriodKey('month', '2026-10')!);
    expect(legsOf(oct)).toEqual({
      group: { group: 'jambes', count: 1, indirect: 0, cardio: 95, cardioWeeks: 2, sets: 9 },
      bar: { group: 'jambes', sets: 9 },
    });
    expect(oct.text).toContain('- Jambes : 9 séries (1 séance, +95 min cardio sur 2 semaines)');
    // Rameur coché, tapis décoché : la semaine du 19 compte le rameur (20 min, rien), plus rien d'autre en octobre.
    const changed = MACHINES.map((m) => (m.id === 'tapis' ? { ...m, legs: false } : m));
    expect(legsOf(reportOf(parsePeriodKey('month', '2026-10')!, changed)).group).toEqual({ group: 'jambes', count: 1, indirect: 0, sets: 3 });

    // Aucun effet sur les séries par semaine, l'indice par groupe, l'alerte ni le moteur : identiques sans cardio.
    const noCardio = sessions.map((s) => ({ ...s, cardio: undefined }));
    const now = new Date(2026, 10, 3, 9).getTime();
    for (const g of ['jambes', 'pectoraux'] as MuscleGroup[]) {
      expect(groupWeeklySets(sessions, LIB, g, now)).toEqual(groupWeeklySets(noCardio, LIB, g, now));
      expect(groupIndex(sessions, LIB, SETTINGS, g)).toEqual(groupIndex(noCardio, LIB, SETTINGS, g));
    }
    expect(groupAlerts(sessions, LIB, DEFAULT_RECAP_SETTINGS.groups, now, {})).toEqual(groupAlerts(noCardio, LIB, DEFAULT_RECAP_SETTINGS.groups, now, {}));
    expect(rebuildProfile(sessions, SETTINGS).profile).toEqual(rebuildProfile(noCardio, SETTINGS).profile);
  });

  it('296 bis. Séance pour compléter la semaine : même score que le récapitulatif, échauffement compris dans « Avec cette séance »', () => {
    // Semaine du 26 : leg extension lundi (jambes 1), chest press mardi ; 40 min de tapis lundi. Jeudi 29 au matin.
    const now = new Date(2026, 9, 29, 9).getTime();
    const week = [
      session('l', 26, [['tapis', 40]], [p('leg-extension'), p('tirage-vertical'), p('developpe-epaules-machine')]),
      session('m', 27, [], [p('chest-press'), p('curl-biceps-halteres', 12), p('extension-triceps-poulie')]),
    ];
    const suggest = (sessions: Session[], redSets = DEFAULT_RECAP_SETTINGS.redSets) =>
      weekSuggestion({ sessions, exercises: LIB, settings: SETTINGS, recap: { ...DEFAULT_RECAP_SETTINGS, redSets }, machines: MACHINES, now })!;
    // L'échauffement proposé (tapis 40 min, le premier cardio de la dernière séance à la salle) porte la semaine à
    // 80 min : les jambes (3 séries + le leg extension proposé, 3 + 3 de cardio) arrivent à 9 séries, sous 10, à
    // l'objectif avec un seuil de 9 (version 1.45.0).
    const s = suggest(week);
    expect(s.cardio).toMatchObject({ machineId: 'tapis', minutes: 40 });
    expect(s.exercises.filter((e) => e.group === 'jambes').map((e) => e.variantId)).toEqual(['leg-extension']);
    expect(s.remaining).toContain('jambes');
    expect(suggest(week, 9).reached).toContain('jambes');
    // Contre-test : sans cardio à la salle, pas d'échauffement : 3 + 3 = 6, sous 9.
    const noCardio = suggest(week.map(({ cardio: _c, ...x }) => x), 9);
    expect(noCardio.cardio).toBeNull();
    expect(noCardio.remaining).toContain('jambes');
    // Avec déjà 50 min de tapis cette semaine, les jambes sont à 6 séries ; sans le tapis (décoché), à 3.
    const more = [...week.slice(0, 1).map((x) => ({ ...x, cardio: [{ ...x.cardio![0]!, minutes: 50 }] })), week[1]!];
    const score = (machines: readonly CardioMachine[]) => weeklyRecap(more, LIB, now, DEFAULT_RECAP_SETTINGS, [], machines).cells.find((c) => c.group === 'jambes')!.score;
    expect(score(MACHINES)).toBe(6);
    expect(score(MACHINES.map((m) => (m.id === 'tapis' ? { ...m, legs: false } : m)))).toBe(3);
  });

  it('298. Titre du récapitulatif raccourci (version 1.41.1) : sans « · N min de cardio », puis sans les noms de jours', () => {
    const nb = '\u00a0';
    const week = recapOf([session('a', 26, [['tapis', 50]], [p('leg-extension')]), session('b', 27, [], [p('pompes', 0)], { home: true })], MACHINES, new Date(2026, 10, 1, 20).getTime());
    // `compact` (version 1.45.0) : le titre `short` (seule la case Jambes change, sans la mention du cardio).
    expect(RECAP_TITLE_FORMS).toEqual(['full', 'noCardio', 'short', 'compact']);
    expect(recapTitle(week, 'compact')).toBe(recapTitle(week, 'short'));
    // Et la case Jambes sans « +50 min cardio » (ses 3 séries de cardio restent comptées : 3 + 3 = 6).
    const legCell = week.cells.find((c) => c.group === 'jambes')!;
    expect(recapCountLabel(legCell)).toBe(`6${nb}séries · +50${nb}min${nb}cardio`);
    expect(recapCountLabel(legCell, false)).toBe(`6${nb}séries`);
    expect(RECAP_TITLE_FORMS.slice(0, 3).map((f) => recapTitle(week, f))).toEqual([
      `Semaine du lun.${nb}26${nb}oct. au dim.${nb}1${nb}nov.${nb}: 2${nb}séances · dont${nb}1${nb}maison · 50${nb}min${nb}de cardio`,
      `Semaine du lun.${nb}26${nb}oct. au dim.${nb}1${nb}nov.${nb}: 2${nb}séances · dont${nb}1${nb}maison`,
      `Semaine du 26${nb}oct. au 1${nb}nov.${nb}: 2${nb}séances · dont${nb}1${nb}maison`,
    ]);
    // Même mois : « Semaine du 9 au 15 nov. » ; forme par défaut inchangée.
    const nov = recapOf([], MACHINES, new Date(2026, 10, 11, 12).getTime());
    expect(recapTitle(nov, 'short')).toBe(`Semaine du 9 au 15${nb}nov.${nb}: 0${nb}séance`);
    expect(recapTitle(nov)).toBe(`Semaine du lun.${nb}9 au dim.${nb}15${nb}nov.${nb}: 0${nb}séance`);
  });
});
