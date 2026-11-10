import { describe, expect, it } from 'vitest';
import type { ActivityRecord } from '../../activities/model';
import { DEFAULT_CARDIO_MACHINES } from '../../cardio/model';
import type { Exercise, Session } from '../../domain/types';
import { rebuildProfile } from '../../engine';
import { buildEngineSettings, displayName, indexVariants } from '../../library/catalog';
import { SEED_EXERCISES } from '../../library/seed';
import { legCardioSentence } from '../../ui/ReportVisuals';
import { groupWeeklySets } from '../groups';
import { buildReport, buildReportScreen, parsePeriodKey, reportSections, lineText, type ReportInput, type ReportPeriod } from '../report';
import { DEFAULT_RECAP_SETTINGS, weeklyRecap } from '../weekly';

const LIB: Exercise[] = [...SEED_EXERCISES];
const SETTINGS = buildEngineSettings(LIB);
const VARIANTS = indexVariants(LIB);
const name = (id: string) => displayName(VARIANTS.get(id));
/** Le `d` octobre 2026 à `h` heures (heure locale). */
const oct = (d: number, h = 18) => new Date(2026, 9, d, h).getTime();
const day = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

let n = 0;
/** Séance terminée ; chaque exercice : [variante, nombre de séries], toutes à la cible ; `tapis` : minutes de tapis. */
function session(start: number, perfs: [string, number][], extra: Partial<Session> = {}, tapis = 0): Session {
  return {
    id: `r${++n}`, name: 'Séance', date: day(start), startedAt: start, endedAt: start + 3_600_000, createdAt: start, updatedAt: start,
    origin: 'app', state: 'done',
    performances: perfs.map(([variantId, sets]) => ({ variantId, weightKg: variantId === 'pompes' ? 0 : 40, reps: Array<number>(sets).fill(10), targetReps: 10, plannedSets: sets, feeling: 'bien' })),
    ...(tapis ? { cardio: [{ id: `c${n}`, machineId: 'tapis', machine: 'Tapis de marche', minutes: tapis, incline: 'neutre' as const }] } : {}),
    ...extra,
  };
}

/**
 * Octobre 2026. Semaine du 19 : lundi à la salle (chest press, dips assistés, leg extension, 50 min de tapis), le soir
 * même 2 séries de pompes à la maison, badminton (jambes, épaules). Cardio des jambes, semaine par semaine : 30 min le
 * 29 sept. + 30 min le 1er oct. (octobre : 30 min, rien) ; 50 min le 6 ; 50 min le 20 (avec le lundi : 100 min) ; 30 min
 * le 26 + 20 min le dim. 1er nov. (octobre : 30 min, rien).
 */
const SESSIONS: Session[] = [
  session(new Date(2026, 8, 29, 18).getTime(), [['leg-extension', 3]], {}, 30),
  session(oct(1), [['pec-deck', 3]], {}, 30),
  session(oct(6), [['chest-press', 3]], {}, 50),
  session(oct(19), [['chest-press', 3], ['dips-assistes', 3], ['leg-extension', 3]], {}, 50),
  session(oct(19, 21), [['pompes', 2]], { location: 'maison' }),
  session(oct(26), [['pec-deck', 3]], {}, 30),
  session(new Date(2026, 10, 1, 10).getTime(), [['leg-extension', 3]], {}, 20),
];
const BADMINTON: ActivityRecord = {
  id: 'act-badminton-2026-10-19', habitId: 'badminton', date: '2026-10-19', name: 'Badminton', start: '21:00', end: '22:30',
  groups: ['jambes', 'epaules'], status: 'done', answeredAt: oct(19, 23),
};

function build(period: ReportPeriod, now: number, sessions = SESSIONS) {
  const input: ReportInput = {
    sessions, exercises: LIB, evaluations: rebuildProfile(sessions, SETTINGS).evaluations, settings: SETTINGS,
    groups: DEFAULT_RECAP_SETTINGS.groups, weighIns: [], activities: [BADMINTON], machines: DEFAULT_CARDIO_MACHINES, now,
  };
  const report = buildReport(period, input);
  return { report, screen: buildReportScreen(report, input) };
}
const WEEK = parsePeriodKey('week', '2026-10-19')!;
const INPUT_BASE: ReportInput = {
  sessions: [], exercises: LIB, evaluations: [], settings: SETTINGS, groups: DEFAULT_RECAP_SETTINGS.groups, weighIns: [], machines: DEFAULT_CARDIO_MACHINES, now: oct(26, 9),
};
const MONTH = parsePeriodKey('month', '2026-10')!;
const sets = (s: ReturnType<typeof build>['screen']) => Object.fromEntries(s.bars.map((b) => [b.group, b.sets]));

describe('Bilans en séries (§19.7, version 1.45.0)', () => {
  it('308. Bâtons = séries du graphique (direct + indirect ÷ 2 + maison en entier) + 3 par activité + 3 par semaine de cardio des jambes ; semaine et mois ; texte du mail ; même total que le récapitulatif', () => {
    const now = oct(26, 9);
    const w = build(WEEK, now);
    // Pectoraux : chest press 3 + dips assistés 3 ÷ 2 + pompes 2 (le même jour, à la maison : plus de plafond) = 6,5.
    // Triceps : 1,5 + 3 + 1 ; épaules : 1,5 + 1 + 3 (badminton) ; jambes : 3 + 3 (badminton) + 3 (50 min de tapis).
    expect(sets(w.screen)).toEqual({ pectoraux: 6.5, dos: 0, epaules: 5.5, biceps: 0, triceps: 5.5, jambes: 9 });
    // Séries du graphique « Séries par semaine » (§19.10), plus les activités et le cardio.
    for (const b of w.screen.bars) {
      const graph = groupWeeklySets(SESSIONS, LIB, b.group, oct(25, 12)).weeks.at(-1)!;
      expect(graph.start).toBe('2026-10-19');
      const extra = (b.group === 'jambes' || b.group === 'epaules' ? 3 : 0) + (b.group === 'jambes' ? 3 : 0);
      expect(b.sets).toBe(graph.total + extra);
    }
    // Même total que le récapitulatif de la semaine (§19.6).
    const recap = weeklyRecap(SESSIONS, LIB, oct(25, 12), DEFAULT_RECAP_SETTINGS, [BADMINTON], DEFAULT_CARDIO_MACHINES);
    for (const c of recap.cells) expect(c.score).toBe(sets(w.screen)[c.group]);

    // Texte du mail : total en séries, puis le détail.
    const lines = reportSections(w.report, name).find((s) => s.title === 'Groupes travaillés')!.lines.map(lineText);
    expect(lines).toEqual([
      'Pectoraux : 6,5 séries (1 séance, +2 séries maison)',
      'Épaules : 5,5 séries (+2 indirect)',
      'Triceps : 5,5 séries (1 séance)',
      'Jambes : 9 séries (1 séance, +1 indirect, +50 min cardio)',
      'Non travaillés : Dos, Biceps',
    ]);
    expect(lines.join('\n')).not.toMatch(/1×|½/);
    expect(legCardioSentence(50)).toBe('Jambes : +3 séries pour 50 min de cardio.');

    // Mois : cardio semaine par semaine, sur la partie de chaque semaine comprise dans octobre (semaines du 5 et du 19).
    const m = build(MONTH, new Date(2026, 10, 2, 9).getTime());
    const jambes = m.report.groups.find((g) => g.group === 'jambes')!;
    expect(jambes).toMatchObject({ cardio: 100, cardioWeeks: 2 });
    // Jambes : leg extension 3 (le 19) + badminton 3 + 2 × 3 (cardio) ; pas la séance du 29 sept. ni celle du 1er nov.
    expect(sets(m.screen)).toEqual({ pectoraux: 15.5, dos: 0, epaules: 7, biceps: 0, triceps: 7, jambes: 12 });
    expect(legCardioSentence(jambes.cardio!, jambes.cardioWeeks)).toBe('Jambes : +6 séries pour le cardio, 2 semaines à 45 min ou plus (100 min).');
    expect(reportSections(m.report, name).find((s) => s.title === 'Groupes travaillés')!.lines.map(lineText)).toContain(
      'Jambes : 12 séries (1 séance, +1 indirect, +100 min cardio sur 2 semaines)',
    );

    // Contre-test : l'ancien total en séances (1 par séance directe, ½ par indirecte, maison plafonnée à ½, ½ par
    // semaine de cardio) ne donne pas ces hauteurs.
    const old = (g: (typeof w.report.groups)[number]) => g.count + g.indirect / 2 + Math.min(0.5, (g.home ?? 0) / 12) + (g.cardio ? 0.5 : 0);
    expect(w.report.groups.map((g) => [g.group, old(g)])).toEqual([
      ['pectoraux', 1 + 2 / 12], ['dos', 0], ['epaules', 1], ['biceps', 0], ['triceps', 1], ['jambes', 2],
    ]);
    for (const g of w.report.groups.filter((x) => x.sets > 0)) expect(old(g)).not.toBe(g.sets);
  });

  it('308. Groupe travaillé : des séries ou une part du détail ; groupes secondaires à la maison comptés sans parenthèse vide ; performance partielle importée seule : « 0 série (1 séance) »', () => {
    // À la maison, développé incliné 3 séries (épaules et triceps en secondaire : 1,5 chacun, sans séance ni indirect
    // dans le détail) ; à la salle, un tirage vertical importé sans répétitions (performance partielle : ni séries ni
    // bâton, mais une séance de dos et un indirect de biceps, comme le récapitulatif) ; badminton le 19.
    const partial = session(oct(20), [['tirage-vertical', 0]], { origin: 'import' });
    partial.performances[0]!.partial = true;
    const sessions = [session(oct(21), [['developpe-incline', 3]], { location: 'maison' }), partial];
    const r = build(WEEK, oct(26, 9), sessions).report;
    expect(Object.fromEntries(r.groups.map((g) => [g.group, g.sets]))).toEqual({ pectoraux: 3, dos: 0, epaules: 4.5, biceps: 0, triceps: 1.5, jambes: 3 });
    expect(reportSections(r, name).find((s) => s.title === 'Groupes travaillés')!.lines.map(lineText)).toEqual([
      'Pectoraux : 3 séries (+3 séries maison)',
      'Dos : 0 série (1 séance)',
      'Épaules : 4,5 séries (+1 indirect)',
      'Biceps : 0 série (+1 indirect)',
      'Triceps : 1,5 série',
      'Jambes : 3 séries (+1 indirect)',
    ]);
    // Sans le badminton ni le tirage : seul le développé incliné ; aucun groupe secondaire dans « Non travaillés ».
    const alone = buildReport(WEEK, { ...INPUT_BASE, sessions: [sessions[0]!], evaluations: [] });
    expect(reportSections(alone, name).find((s) => s.title === 'Groupes travaillés')!.lines.map(lineText)).toEqual([
      'Pectoraux : 3 séries (+3 séries maison)',
      'Épaules : 1,5 série',
      'Triceps : 1,5 série',
      'Non travaillés : Dos, Biceps, Jambes',
    ]);
  });
});
