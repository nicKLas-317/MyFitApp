import { describe, expect, it } from 'vitest';
import { progressMarker, type ProgressMarker } from '../marker';
import { markerArrow, markerLabel } from '../../ui/labels';
import { finalState, green, orange, red } from './helpers';

const view = (m: ProgressMarker | null, assisted = false) => (m ? `${markerArrow(m)} ${markerLabel(m, assisted)}` : null);

describe('Repère de progression (§5.3.1)', () => {
  it('137. Hausse de répétitions : « ↑ +1 répétition : 3×9 (au lieu de 3×8) » ; aucun repère quand la cible ne change pas', () => {
    expect(progressMarker(undefined)).toBeNull();
    expect(progressMarker(finalState([green(45, 8)]))).toBeNull();
    expect(view(progressMarker(finalState([green(45, 8), green(45, 8)])))).toBe('↑ +1 répétition : 3×9 (au lieu de 3×8)');
    // Une fois la nouvelle cible faite, le repère disparaît.
    expect(progressMarker(finalState([green(45, 8), green(45, 8), green(45, 9)]))).toBeNull();
    expect(progressMarker(finalState([green(45, 8), green(45, 8), orange(45, 9)]))).toBeNull();
    // Recommandation refusée avec une verte (§7.11 D) : la hausse reste proposée, le repère aussi.
    expect(view(progressMarker(finalState([green(45, 8), green(45, 8), green(45, 8)])))).toBe('↑ +1 répétition : 3×9 (au lieu de 3×8)');
    expect(view(progressMarker(finalState([green(45, 11), green(45, 11)])))).toBe('↑ +1 répétition : 3×12 (au lieu de 3×11)');
    expect(markerLabel({ kind: 'reps_up', added: 2, from: { plannedSets: 3, targetReps: 8 }, to: { plannedSets: 3, targetReps: 10 } })).toBe(
      '+2 répétitions : 3×10 (au lieu de 3×8)',
    );
  });

  it('138. « ↑ Poids supérieur » et « ↓ Poids inférieur » comme aujourd’hui ; « Moins d’aide » et « Plus d’aide » pour un exercice assisté', () => {
    const up = progressMarker(finalState([green(45, 12), green(45, 12)]));
    expect(view(up)).toBe('↑ Poids supérieur');
    expect(view(up, true)).toBe('↑ Moins d’aide');
    const down = progressMarker(finalState([red(45, 10), red(45, 10), red(45, 10), red(45, 10)]));
    expect(view(down)).toBe('↓ Poids inférieur');
    expect(view(down, true)).toBe('↓ Plus d’aide');
    // Trois rouges : aucune baisse, aucun repère.
    expect(progressMarker(finalState([red(45, 10), red(45, 10), red(45, 10)]))).toBeNull();
  });
});
