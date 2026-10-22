import { describe, expect, it } from 'vitest';
import type { Exercise, Session } from '../../domain/types';
import { rebuildProfile } from '../../engine';
import { buildEngineSettings } from '../../library/catalog';
import { SEED_EXERCISES } from '../../library/seed';
import { analyzeProgress } from '../progress';
import { DEFAULT_RECAP_SETTINGS, recapCountLabel, weeklyRecap, type WeeklyRecap } from '../weekly';

const LIB: Exercise[] = [...SEED_EXERCISES];
/** Heure locale : lun. 12 octobre 2026 = début de semaine. */
const at = (d: number, h = 18, m = 0) => new Date(2026, 9, d, h, m).getTime();
let n = 0;

function session(start: number, variants: string[]): Session {
  const d = new Date(start);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return {
    id: `s${++n}`, name: 'Séance', date, startedAt: start, endedAt: start + 3_600_000, createdAt: start, updatedAt: start,
    origin: 'app', state: 'done',
    performances: variants.map((variantId) => ({ variantId, weightKg: 20, targetReps: 8, plannedSets: 3, reps: [8, 8, 8], feeling: 'bien' })),
  };
}

const cell = (r: WeeklyRecap, g: string) => r.cells.find((c) => c.group === g)!;
/** Texte d'une case tel qu'affiché, espaces insécables remplacés. */
const label = (r: WeeklyRecap, g: string) => recapCountLabel(cell(r, g)).replace(/ /g, ' ');

describe('Récapitulatif hebdomadaire : groupes secondaires (§19.6)', () => {
  it('179. Tractions assistées : dos 1 (direct), biceps ½ (indirect) ; affichage sans fraction', () => {
    const r = weeklyRecap([session(at(13), ['tractions-assistees'])], LIB, at(16));
    expect(cell(r, 'dos')).toMatchObject({ count: 1, indirect: 0, score: 1, color: 'orange' });
    expect(cell(r, 'biceps')).toMatchObject({ count: 0, indirect: 1, score: 0.5, color: 'orange' });
    expect(label(r, 'dos')).toBe('1×');
    expect(label(r, 'biceps')).toBe('+1 indirect');
    expect(cell(r, 'pectoraux')).toMatchObject({ score: 0, color: 'vert' });
    expect(recapCountLabel(cell(r, 'pectoraux'))).toBe('');
  });

  it('180. Curl le lundi + tractions le jeudi : biceps 1,5 → orange, « 1× · +1 indirect » ; un demi-point de plus → rouge', () => {
    const r = weeklyRecap([session(at(12), ['curl-biceps-halteres']), session(at(15), ['tractions-assistees'])], LIB, at(18, 9));
    expect(cell(r, 'biceps')).toMatchObject({ count: 1, indirect: 1, score: 1.5, color: 'orange' });
    expect(label(r, 'biceps')).toBe('1× · +1 indirect');
    // Seuil rouge (2 par défaut) atteint par le score : 1 + ½ + ½.
    const more = weeklyRecap([session(at(12), ['curl-biceps-halteres']), session(at(15), ['tractions-assistees']), session(at(16), ['tirage-vertical'])], LIB, at(18, 9));
    expect(cell(more, 'biceps')).toMatchObject({ score: 2, color: 'rouge' });
    expect(label(more, 'biceps')).toBe('1× · +2 indirect');
  });

  it('181. Deux séances indirectes seulement : score 1 → orange, « +2 indirect » ; quatre → rouge ; seuil réglable', () => {
    const two = [session(at(12), ['tirage-vertical']), session(at(14), ['tractions-assistees'])];
    const r = weeklyRecap(two, LIB, at(18, 9));
    expect(cell(r, 'biceps')).toMatchObject({ count: 0, indirect: 2, score: 1, color: 'orange' });
    expect(label(r, 'biceps')).toBe('+2 indirect');
    const four = [...two, session(at(15), ['rowing-haltere']), session(at(16), ['rowing-barre'])];
    expect(cell(weeklyRecap(four, LIB, at(18, 9)), 'biceps')).toMatchObject({ score: 2, color: 'rouge' });
    expect(cell(weeklyRecap(four, LIB, at(18, 9), { ...DEFAULT_RECAP_SETTINGS, redThreshold: 3 }), 'biceps').color).toBe('orange');
  });

  it('182. Groupe à la fois principal et secondaire dans la même séance : 1 ; deux exercices indirects dans la même séance : ½', () => {
    const r = weeklyRecap([session(at(13), ['curl-biceps-halteres', 'tractions-assistees'])], LIB, at(16));
    expect(cell(r, 'biceps')).toMatchObject({ count: 1, indirect: 0, score: 1 });
    const both = weeklyRecap([session(at(13), ['tirage-vertical', 'tractions-assistees', 'rowing-haltere'])], LIB, at(16));
    expect(cell(both, 'biceps')).toMatchObject({ count: 0, indirect: 1, score: 0.5 });
    // Dips assistés + développé couché : triceps principal d'un côté, secondaire de l'autre → 1 ; pectoraux idem → 1.
    const press = weeklyRecap([session(at(13), ['dips-assistes', 'developpe-couche'])], LIB, at(16));
    expect(cell(press, 'triceps')).toMatchObject({ count: 1, indirect: 0 });
    expect(cell(press, 'pectoraux')).toMatchObject({ count: 1, indirect: 0 });
    expect(cell(press, 'epaules')).toMatchObject({ count: 0, indirect: 1, score: 0.5 });
  });

  it('183. « hier » et « aujourd’hui » s’appliquent au travail indirect, même la semaine précédente', () => {
    const r = weeklyRecap([session(at(15, 18), ['tractions-assistees'])], LIB, at(16, 9));
    expect(cell(r, 'biceps')).toMatchObject({ color: 'orange', recency: 'yesterday' });
    const today = weeklyRecap([session(at(16, 7), ['developpe-couche'])], LIB, at(16, 9));
    expect(cell(today, 'triceps').recency).toBe('today');
    expect(cell(today, 'epaules').recency).toBe('today');
    // Dimanche soir, consulté lundi matin : nouvelle semaine, score 0 (vert), mais « hier ».
    const monday = weeklyRecap([session(at(18, 17), ['tractions-assistees'])], LIB, at(19, 9));
    expect(cell(monday, 'biceps')).toMatchObject({ score: 0, color: 'vert', recency: 'yesterday' });
  });

  it('184. Tri inchangé sur le score ; seuls les groupes affichés comptent ; aucun effet sur le moteur ni sur le bilan', () => {
    const r = weeklyRecap([session(at(12), ['tractions-assistees']), session(at(13), ['developpe-couche', 'crunch-machine'])], LIB, at(16, 9));
    expect(r.cells.map((c) => [c.group, c.color, c.score])).toEqual([
      ['jambes', 'vert', 0],
      ['pectoraux', 'orange', 1],
      ['dos', 'orange', 1],
      ['epaules', 'orange', 0.5],
      ['biceps', 'orange', 0.5],
      ['triceps', 'orange', 0.5],
    ]);
    // Sous-groupe secondaire des jambes : compté dans « Jambes » ; abdominaux jamais comptés.
    const custom: Exercise = {
      ...LIB[0]!, id: 'perso-rameur', name: 'Rameur lesté', primaryGroup: 'dos', secondaryGroups: ['quadriceps', 'abdominaux'],
      variants: [{ id: 'perso-rameur', name: 'Standard', synonyms: [], archived: false }],
    };
    const legs = weeklyRecap([session(at(13), ['perso-rameur'])], [...LIB, custom], at(16));
    expect(cell(legs, 'jambes')).toMatchObject({ count: 0, indirect: 1, score: 0.5 });
    expect(legs.cells.map((c) => c.group)).not.toContain('abdominaux');
    // Quadriceps affiché lui-même : il compte pour lui, plus pour « Jambes ».
    const shown = weeklyRecap([session(at(13), ['perso-rameur'])], [...LIB, custom], at(16), { ...DEFAULT_RECAP_SETTINGS, groups: ['dos', 'jambes', 'quadriceps'] });
    expect(cell(shown, 'quadriceps')).toMatchObject({ indirect: 1 });
    expect(cell(shown, 'jambes')).toMatchObject({ score: 0 });

    // Moteur et bilan ne lisent pas les groupes : résultats identiques sans aucun groupe secondaire.
    const sessions = [session(at(12), ['tractions-assistees']), session(at(14), ['tractions-assistees']), session(at(15), ['developpe-couche'])];
    const bare = LIB.map((e) => ({ ...e, secondaryGroups: [] }));
    const withGroups = rebuildProfile(sessions, buildEngineSettings(LIB));
    const without = rebuildProfile(sessions, buildEngineSettings(bare));
    expect(withGroups).toEqual(without);
    expect(analyzeProgress(withGroups.evaluations, withGroups.profile)).toEqual(analyzeProgress(without.evaluations, without.profile));
  });
});
