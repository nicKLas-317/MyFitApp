import { describe, expect, it } from 'vitest';
import { findNotation, parseNotes } from '../notes';
import { readFeelingSymbol } from '../feelings';
import { NOTES_11_3 } from './fixtures';

const TODAY = '2026-10-15';


describe('Lecture des notes en texte brut (§11.3, §11.4)', () => {
  it('33. Le bloc du §11.3 donne exactement six exercices, avec séries, répétitions, poids et ressentis corrects', () => {
    const parsed = parseNotes(NOTES_11_3, TODAY);
    expect(parsed.title).toBeNull();
    expect(parsed.date).toBeNull();
    expect(parsed.entries.map((e) => [e.sourceName, e.plannedSets, e.targetReps, e.reps, e.weightKg, e.feeling])).toEqual([
      ['Seated row horizontal', 3, 8, [8, 8, 8], 48, 'moyen'],
      ['Epaules latéral raise', 3, 8, [8, 8, 8], 9, 'tres_bien'],
      ['Biceps poulie corde', 3, 8, [8, 8, 8], 15, 'tres_bien'],
      ['Biceps curl banc incliné 70°', 3, 8, [8, 8, 8], 10, 'mal'],
      ['Lat pulldown vertical', 3, 9, [9, 9, 9], 36, 'mal'],
      ['Triceps sur banc assis 1 haltere', 3, 8, [8, 8, 8], 14, 'tres_bien'],
    ]);
    expect(parsed.entries.every((e) => e.issues.length === 0)).toBe(true);
  });

  it('34. Les variantes x / ×, les espaces, les décimales et les unités kg / kgs sont reconnues', () => {
    const cases: [string, number, number, number][] = [
      ['3x8x52kg', 3, 8, 52],
      ['3×8×52 kgs', 3, 8, 52],
      ['3 x 8 x 52,5 kg', 3, 8, 52.5],
      ['3X10X52.5KG', 3, 10, 52.5],
      ['4 × 12 × 7,25 kgs', 4, 12, 7.25],
      ['3 séries de 8 à 52 kg', 3, 8, 52],
      ['3 series de 9 a 40 kgs', 3, 9, 40],
      ['3x8x52', 3, 8, 52],
    ];
    for (const [line, sets, target, weight] of cases) {
      const n = findNotation(line);
      expect(n, line).not.toBeNull();
      expect([n!.plannedSets, n!.targetReps, n!.weightKg], line).toEqual([sets, target, weight]);
      expect(n!.reps, line).toEqual(Array.from({ length: sets }, () => target));
    }
  });

  it('34. Les répétitions détaillées sont lues série par série, la cible déduite est signalée', () => {
    const parsed = parseNotes('Leg curl\n8-8-7 x 52kg +', TODAY);
    expect(parsed.entries[0]).toMatchObject({ plannedSets: 3, targetReps: 8, reps: [8, 8, 7], weightKg: 52, feeling: 'bien' });
    expect(parsed.entries[0]!.issues).toContain('target_inferred');
    const withSets = parseNotes('Leg curl\n3x10-9-9x40kg', TODAY).entries[0]!;
    expect(withSets).toMatchObject({ plannedSets: 3, targetReps: 10, reps: [10, 9, 9], weightKg: 40, feeling: 'inconnu' });
  });

  it('35. Les symboles ++, +, =, -= et -- sont convertis selon le §7.3 ; un symbole inconnu est signalé', () => {
    const feelings = ['++', '+', '=', '-=', '--'].map((s) => parseNotes(`Leg curl\n3x8x40kg ${s}`, TODAY).entries[0]!.feeling);
    expect(feelings).toEqual(['tres_bien', 'bien', 'moyen', 'mal', 'tres_mal']);
    expect(readFeelingSymbol(' - = ')).toEqual({ kind: 'known', symbol: '-=', feeling: 'mal' });

    const unknown = parseNotes('Leg curl\n3x8x40kg +-', TODAY).entries[0]!;
    expect(unknown.feeling).toBe('inconnu');
    expect(unknown.feelingSymbol).toBe('+-');
    expect(unknown.issues).toContain('unknown_symbol');
    const absent = parseNotes('Leg curl\n3x8x40kg', TODAY).entries[0]!;
    expect(absent.feeling).toBe('inconnu');
    expect(absent.feelingSymbol).toBeNull();
    expect(absent.issues).toEqual([]);
  });

  it('40. Les informations manquantes ne sont pas inventées', () => {
    const parsed = parseNotes('Presse\n120kg\n\nLeg extension\n3x10\n\nCrunch\nfait 3 séries mais je sais plus\n\nPec deck', TODAY);
    const [presse, legExt, crunch, pec] = parsed.entries;
    expect(presse).toMatchObject({ weightKg: 120, reps: null, targetReps: null, plannedSets: null, feeling: 'inconnu' });
    expect(presse!.issues).toEqual(['weight_only']);
    expect(legExt).toMatchObject({ weightKg: null, plannedSets: 3, targetReps: 10 });
    expect(legExt!.issues).toEqual(['missing_weight']);
    expect(crunch).toMatchObject({ weightKg: null, reps: null });
    expect(crunch!.issues).toEqual(['ambiguous_format']);
    expect(pec).toMatchObject({ sourceName: 'Pec deck', weightKg: null, reps: null });
    expect(pec!.issues).toEqual(['no_notation']);
  });

  it('une date présente dans le texte est proposée, un titre est reconnu', () => {
    const parsed = parseNotes('Haut du corps\n12/10/2026\n\nSeated row\n3x8x52kg ++', TODAY);
    expect(parsed.date).toBe('2026-10-12');
    expect(parsed.dateYearAssumed).toBe(false);
    expect(parsed.title).toBe('Haut du corps');
    expect(parsed.entries).toHaveLength(1);

    const noYear = parseNotes('Séance du 3 octobre\nSeated row\n3x8x52kg', TODAY);
    expect(noYear.date).toBe('2026-10-03');
    expect(noYear.dateYearAssumed).toBe(true);
    // Une date future sans année est rapportée à l'année précédente.
    expect(parseNotes('20 décembre\nLeg curl\n3x8x40kg', TODAY).date).toBe('2025-12-20');
  });

  it('un nom séparé de sa notation par une ligne vide ne crée qu’une entrée', () => {
    const parsed = parseNotes('Seated row\n\n3x8x52kg ++\n\nLeg curl\n\n3x8x40kg', TODAY);
    expect(parsed.title).toBeNull();
    expect(parsed.entries.map((e) => [e.sourceName, e.weightKg])).toEqual([
      ['Seated row', 52],
      ['Leg curl', 40],
    ]);
  });

  it('un titre collé au premier exercice est séparé du nom', () => {
    const parsed = parseNotes('Haut du corps\nSeated row\n3x8x52kg ++', TODAY);
    expect(parsed.title).toBe('Haut du corps');
    expect(parsed.entries[0]!.sourceName).toBe('Seated row');
  });

  it('le nom peut figurer sur la même ligne que la notation', () => {
    const parsed = parseNotes('Leg curl : 3x8x40kg ++\nLeg extension 3 x 9 x 35 kg =', TODAY);
    expect(parsed.entries.map((e) => [e.sourceName, e.weightKg, e.feeling])).toEqual([
      ['Leg curl', 40, 'tres_bien'],
      ['Leg extension', 35, 'moyen'],
    ]);
  });
});
