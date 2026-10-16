import { describe, expect, it } from 'vitest';
import type { Exercise } from '../../domain/types';
import { addVariant, updateVariant } from '../edit';
import { buildSearchIndex, equipmentKey, recentVariantIds, searchExercises } from '../search';
import { SEED_EXERCISES } from '../seed';

const LIB: Exercise[] = [...SEED_EXERCISES];
const index = buildSearchIndex(LIB);
const ids = (query: string, lib = index) => searchExercises(lib, query).map((r) => r.entry.variant.id);

describe('Recherche par nom d’exercice ou de machine (§4.1 A)', () => {
  it('47. « chest press » et « pec deck » trouvent d’abord la bonne machine', () => {
    expect(ids('chest press')[0]).toBe('chest-press');
    expect(ids('pec deck')).toEqual(['pec-deck']);
    expect(ids('seated row')[0]).toBe('tirage-horizontal');
    expect(ids('lat pulldown')[0]).toBe('tirage-vertical');
    expect(ids('tirage vertical')[0]).toBe('tirage-vertical');
  });

  it('plusieurs machines correspondantes donnent plusieurs résultats distincts', () => {
    const curls = ids('curl biceps');
    expect(curls.slice(0, 4).sort()).toEqual(['curl-biceps-banc-incline', 'curl-biceps-barre-droite', 'curl-biceps-halteres', 'curl-biceps-poulie-corde']);
    expect(ids('biceps poulie corde')[0]).toBe('curl-biceps-poulie-corde');
    expect(ids('press')).toEqual(expect.arrayContaining(['chest-press', 'developpe-couche', 'developpe-epaules-machine', 'presse-a-cuisses']));
  });

  it('correspondance partielle, sans majuscules ni accents, tolérant pluriels et petites fautes', () => {
    expect(ids('lat pull')[0]).toBe('tirage-vertical');
    expect(ids('pulldown')[0]).toBe('tirage-vertical');
    expect(ids('pull down')[0]).toBe('tirage-vertical');
    expect(ids('ELEVATION LATERALE')[0]).toBe('elevations-laterales');
    expect(ids('élévations latérales')[0]).toBe('elevations-laterales');
    expect(ids('dévelopé couché')[0]).toBe('developpe-couche');
    expect(ids('tri')).toEqual(expect.arrayContaining(['extension-triceps-poulie', 'extension-triceps-haltere-assis']));
    expect(ids('xyzzy')).toEqual([]);
  });

  it('49. Les synonymes français et anglais donnent des résultats pertinents', () => {
    expect(ids('butterfly')[0]).toBe('pec-deck');
    expect(ids('développé assis machine')[0]).toBe('chest-press');
    expect(ids('dumbbell row')[0]).toBe('rowing-haltere');
    expect(ids('bench press')[0]).toBe('developpe-couche');
    expect(ids('leg press')[0]).toBe('presse-a-cuisses');
    expect(ids('triceps pushdown')[0]).toBe('extension-triceps-poulie');
    expect(ids('shoulder press')[0]).toBe('developpe-epaules-machine');
  });
});

describe('Recherche par groupe musculaire (§4.1 B)', () => {
  it('48. « dos » propose les exercices du dos, même sans « dos » dans leur nom', () => {
    // Les deux tirages ont trois prises, chacune une variante (§4.3.1).
    const dos = ['rowing-haltere', 'tirage-horizontal', 'tirage-horizontal--prise-serree', 'tirage-horizontal--prise-tres-large', 'tirage-vertical', 'tirage-vertical--prise-serree', 'tirage-vertical--prise-tres-large'];
    expect(ids('dos').sort()).toEqual(dos);
    expect(ids('back').sort()).toEqual(dos);
  });

  it('le groupe principal passe avant les groupes secondaires', () => {
    const biceps = searchExercises(index, 'biceps');
    const primary = biceps.filter((r) => r.entry.exercise.primaryGroup === 'biceps').map((r) => r.entry.variant.id);
    expect(primary).toHaveLength(4);
    expect(biceps.slice(0, 4).map((r) => r.entry.variant.id).sort()).toEqual([...primary].sort());
    // Les tirages (biceps en secondaire) suivent, signalés comme tels.
    const tirage = biceps.find((r) => r.entry.variant.id === 'tirage-vertical');
    expect(tirage?.via).toBe('secondary');
  });

  it('chaque groupe du brief est reconnu, avec ses variantes d’écriture', () => {
    expect(ids('pectoraux')).toEqual(expect.arrayContaining(['chest-press', 'pec-deck', 'developpe-couche']));
    expect(ids('pecs')).toEqual(expect.arrayContaining(['chest-press', 'pec-deck', 'developpe-couche']));
    expect(ids('epaules').slice(0, 2).sort()).toEqual(['developpe-epaules-machine', 'elevations-laterales']);
    expect(ids('triceps').slice(0, 2).sort()).toEqual(['extension-triceps-haltere-assis', 'extension-triceps-poulie']);
    expect(ids('jambes').sort()).toEqual(['abducteurs-machine', 'adducteurs-machine', 'curl-ischios', 'leg-curl', 'leg-extension', 'mollets-machine', 'presse-a-cuisses']);
    expect(ids('abdos')).toEqual(['crunch-machine']);
    expect(ids('abdominaux')).toEqual(['crunch-machine']);
    // Lexique (§4.2.1) : les ischio-jambiers et les quadriceps sont des sous-groupes des jambes.
    expect(ids('ischios').sort()).toEqual(['curl-ischios', 'leg-curl']);
    expect(ids('quadri').sort()).toEqual(['leg-extension', 'presse-a-cuisses']);
  });

  it('recherche par matériel, combinable avec un groupe', () => {
    expect(ids('poulie')).toEqual(expect.arrayContaining(['curl-biceps-poulie-corde', 'extension-triceps-poulie', 'tirage-vertical']));
    expect(ids('dos haltère')).toEqual(['rowing-haltere']);
    expect(equipmentKey('haltère')).toBe(equipmentKey('Haltères'));
  });
});

describe('Variantes, archives et récents', () => {
  it('une variante est un résultat distinct, retrouvé par son nom', () => {
    const { exercise } = addVariant(LIB.find((e) => e.id === 'curl-biceps-banc-incline')!, '70°', LIB);
    const lib = LIB.map((e) => (e.id === exercise.id ? exercise : e));
    const found = ids('curl incliné', buildSearchIndex(lib));
    expect(found.slice(0, 2).sort()).toEqual(['curl-biceps-banc-incline', 'curl-biceps-banc-incline--70']);
    expect(ids('incliné 70', buildSearchIndex(lib))[0]).toBe('curl-biceps-banc-incline--70');
  });

  it('les exercices et variantes archivés sont masqués de la recherche', () => {
    const lib = LIB.map((e) => (e.id === 'pec-deck' ? { ...e, archived: true } : e));
    expect(ids('pec deck', buildSearchIndex(lib))).toEqual([]);
    expect(ids('pec deck', buildSearchIndex(lib, { includeArchived: true }))).toEqual(['pec-deck']);
    const withVariant = addVariant(LIB.find((e) => e.id === 'leg-curl')!, 'Assis', LIB);
    const archivedVariant = updateVariant(withVariant.exercise, withVariant.variantId, { archived: true });
    expect(ids('leg curl assis', buildSearchIndex(LIB.map((e) => (e.id === 'leg-curl' ? archivedVariant : e))))).not.toContain(withVariant.variantId);
  });

  it('les favoris passent devant à score égal', () => {
    const lib = LIB.map((e) => (e.id === 'tirage-vertical' ? updateVariant(e, e.id, { favorite: true }) : e));
    expect(ids('dos', buildSearchIndex(lib))[0]).toBe('tirage-vertical');
  });

  it('les exercices récents suivent l’ordre de dernière utilisation', () => {
    const s = (id: string, date: string, variants: string[]) => ({
      id, name: id, date, startedAt: null, endedAt: null, createdAt: 0, updatedAt: 0, origin: 'app' as const, state: 'done' as const,
      performances: variants.map((variantId) => ({ variantId, weightKg: 10, targetReps: 8, plannedSets: 3, reps: [8, 8, 8], feeling: 'bien' as const })),
    });
    expect(recentVariantIds([s('a', '2026-10-01', ['leg-curl', 'pec-deck']), s('b', '2026-10-05', ['chest-press', 'leg-curl'])])).toEqual([
      'chest-press',
      'leg-curl',
      'pec-deck',
    ]);
  });
});
