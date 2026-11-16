import { describe, expect, it } from 'vitest';
import type { Exercise, Performance, Session } from '../../domain/types';
import { rebuildProfile, resolveConfig } from '../../engine';
import { buildEngineSettings } from '../../library/catalog';
import { SEED_EXERCISES } from '../../library/seed';
import { applySetsHint, dismissSetsHint, sanitizeSetsHintDismissed, setsHint, setsHintText } from '../setsHint';

let day = 0;
function session(perfs: Partial<Performance>[], opts: { location?: 'maison'; state?: 'active' } = {}): Session {
  day++;
  const date = `2026-10-${String(day).padStart(2, '0')}`;
  const start = Date.parse(`${date}T10:00:00`);
  return {
    id: `s${day}`, name: `s${day}`, date, startedAt: start, endedAt: start + 3_600_000, createdAt: start, updatedAt: start, origin: 'app',
    state: opts.state ?? 'done', ...(opts.location ? { location: opts.location } : {}),
    performances: perfs.map((p) => ({ variantId: 'crunch-sol', weightKg: 0, targetReps: 10, plannedSets: 3, reps: [10, 10, 10], feeling: 'bien', ...p })),
  };
}
const sets = (n: number, p: Partial<Performance> = {}) => ({ reps: Array.from({ length: n }, () => p.targetReps ?? 10), ...p });

const settings = buildEngineSettings(SEED_EXERCISES);

describe('Proposition d’ajuster le nombre de séries (version 1.49.0)', () => {
  it('316. 3 séances d’affilée au même nombre de séries, sous le standard : proposition ; jamais à la hausse', () => {
    day = 0;
    // Le cas de l'utilisateur : crunch au sol fait 1, 2, puis 2 séries : rien encore ; une 3ᵉ fois à 2 : « passer à 2 ? ».
    const base = [session([sets(1, { plannedSets: 1 })]), session([sets(2)]), session([sets(2)])];
    expect(setsHint(base, settings, 'crunch-sol')).toBeNull();
    const third = [...base, session([sets(2, { plannedSets: 2 })])];
    const hint = setsHint(third, settings, 'crunch-sol')!;
    expect(hint).toMatchObject({ track: 'crunch-sol', sets: 2, standard: 3, last: { id: 's4' } });
    expect(setsHintText(hint)).toBe('Tu fais souvent 2 séries : passer à 2 ?');
    expect(setsHintText({ sets: 1 })).toBe('Tu fais souvent 1 série : passer à 1 ?');
    // Une séance en cours, une performance partielle ou sans série, un autre exercice ne comptent pas.
    const noise = [
      ...third,
      session([{ variantId: 'crunch-sol', reps: [], plannedSets: 3 }]),
      session([{ variantId: 'crunch-sol', targetReps: null, plannedSets: null, reps: [], partial: true }]),
      session([sets(3, { variantId: 'pec-deck', weightKg: 30, targetReps: 8 })]),
      session([sets(3)], { state: 'active' }),
    ];
    expect(setsHint(noise, settings, 'crunch-sol')?.sets).toBe(2);
    // Une séance à 3 séries casse la série ; 2, 2, 1 : rien.
    expect(setsHint([...third, session([sets(3)])], settings, 'crunch-sol')).toBeNull();
    expect(setsHint([...third, session([sets(1)])], settings, 'crunch-sol')).toBeNull();
    // Au standard (3, 3, 3) : rien. À la hausse (pompes, 2 séries standard, faites 3 fois à 3) : rien.
    expect(setsHint([session([sets(3)]), session([sets(3)]), session([sets(3)])], settings, 'crunch-sol')).toBeNull();
    const pompes = (n: number) => session([sets(n, { variantId: 'pompes', plannedSets: n })]);
    expect(resolveConfig(settings, 'pompes').sets).toBe(2);
    expect(setsHint([pompes(3), pompes(3), pompes(3)], settings, 'pompes')).toBeNull();
    expect(setsHint([pompes(1), pompes(1), pompes(1)], settings, 'pompes')).toMatchObject({ sets: 1, standard: 2 });
  });

  it('316. Même suivi : la salle et la maison d’un exercice à charge sont séparées ; au poids du corps, un seul suivi', () => {
    day = 0;
    const curl = (n: number, home: boolean) =>
      session([sets(n, { variantId: 'curl-biceps-halteres', weightKg: 10, targetReps: 8 })], home ? { location: 'maison' } : {});
    const mixed = [curl(2, true), curl(3, false), curl(2, true), curl(2, true)];
    expect(setsHint(mixed, settings, 'curl-biceps-halteres')).toBeNull();
    expect(setsHint(mixed, settings, 'curl-biceps-halteres@maison')).toMatchObject({ sets: 2, standard: 3 });
    // Crunch au sol : salle et maison mêlées dans le même suivi.
    const crunch = [session([sets(2)], { location: 'maison' }), session([sets(2)]), session([sets(2)], { location: 'maison' })];
    expect(setsHint(crunch, settings, 'crunch-sol')?.sets).toBe(2);
  });

  it('316. « Non » : plus de proposition jusqu’à 3 nouvelles séances, toutes après le refus', () => {
    day = 0;
    const list = [session([sets(2)]), session([sets(2)]), session([sets(2)])];
    const hint = setsHint(list, settings, 'crunch-sol')!;
    const dismissed = dismissSetsHint({}, hint);
    expect(setsHint(list, settings, 'crunch-sol', dismissed['crunch-sol'])).toBeNull();
    const more = [...list, session([sets(2)]), session([sets(2)])];
    expect(setsHint(more, settings, 'crunch-sol', dismissed['crunch-sol'])).toBeNull();
    const again = [...more, session([sets(2)])];
    expect(setsHint(again, settings, 'crunch-sol', dismissed['crunch-sol'])).toMatchObject({ sets: 2, last: { id: 's6' } });
    // Mémoire de l'appareil relue : entrées mal formées écartées.
    expect(sanitizeSetsHintDismissed(JSON.parse(JSON.stringify(dismissed)))).toEqual(dismissed);
    expect(sanitizeSetsHintDismissed({ a: { id: 's1', date: '2026-10-01', startedAt: null, createdAt: 1 }, b: { id: 2 }, c: 'x' })).toEqual({
      a: { id: 's1', date: '2026-10-01', startedAt: null, createdAt: 1 },
    });
    expect(sanitizeSetsHintDismissed(null)).toEqual({});
    expect(sanitizeSetsHintDismissed([1])).toEqual({});
  });

  it('316. « Oui » : seul le nombre de séries standard change ; plage, type et historique restent, la cible ne bouge pas', () => {
    day = 0;
    const crunch = SEED_EXERCISES.find((e) => e.id === 'crunch-sol')!;
    const before = resolveConfig(settings, 'crunch-sol');
    const updated: Exercise = applySetsHint(crunch, 'crunch-sol', before, 2);
    const exercises = SEED_EXERCISES.map((e) => (e.id === 'crunch-sol' ? updated : e));
    const after = resolveConfig(buildEngineSettings(exercises), 'crunch-sol');
    expect(after).toEqual({ ...before, sets: 2 });
    // Exercice à charge avec une plage de la maison réglée : gardée.
    const curl = { ...SEED_EXERCISES.find((e) => e.id === 'curl-biceps-halteres')! };
    const custom = { ...curl, variants: curl.variants.map((v) => (v.id === curl.id ? { ...v, config: { homeMaxReps: 20 } } : v)) };
    const cfg = resolveConfig(buildEngineSettings([custom]), curl.id);
    expect(resolveConfig(buildEngineSettings([applySetsHint(custom, curl.id, cfg, 2)]), curl.id)).toEqual({ ...cfg, sets: 2 });
    // Séances à 2 séries sur 3 prévues (incomplètes) : la cible et les compteurs ne changent pas avec le nouveau standard.
    const history = [session([sets(2)]), session([sets(2)]), session([sets(2)])];
    const p1 = rebuildProfile(history, settings).profile.variants['crunch-sol'];
    const p2 = rebuildProfile(history, buildEngineSettings(exercises)).profile.variants['crunch-sol'];
    expect(p2?.palier).toEqual(p1?.palier);
    expect(p2?.recommendation.targetReps).toBe(p1?.recommendation.targetReps);
    expect(p2?.recommendation.plannedSets).toBe(2);
    expect(history.every((s) => s.performances[0]!.plannedSets === 3)).toBe(true);
  });
});
