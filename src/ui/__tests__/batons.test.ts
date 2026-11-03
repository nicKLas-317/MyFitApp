import { describe, expect, it } from 'vitest';
import { MUSCLE_GROUP_LABELS } from '../../library/seed';
import { GROUP_SHORT_LABELS, stickLabels } from '../ReportVisuals';

describe('Bâtons des groupes travaillés, version 1.37.0', () => {
  it('287. Noms sous les bâtons : entiers s’ils tiennent, sinon courts, sinon courts sur deux rangs alternés ; noms courts de tous les groupes', () => {
    // Largeurs mesurées à 13 px (police des tests) : Pectoraux 64,8, Pecto 35,6, Jambes 47,5, Triceps 45,2…
    const full = [64.8, 24.7, 51.1, 42.7, 45.2, 47.5, 81.8];
    const short = [35.6, 24.7, 36.3, 42.7, 45.2, 47.5, 40.1];
    // Une colonne doit laisser 6 px entre deux noms voisins.
    expect(stickLabels(90, full, short)).toBe('full');
    expect(stickLabels(53.5, full, short)).toBe('short');
    // 7 groupes à 412 px (colonnes de 47 px), 360 et 320 px : deux rangs.
    expect(stickLabels(47, full, short)).toBe('staggered');
    expect(stickLabels(33.7, full, short)).toBe('staggered');
    // Six groupes (sans abdominaux) à 412 px : colonnes de 55 px, noms courts sur une ligne.
    expect(stickLabels(55, full.slice(0, 6), short.slice(0, 6))).toBe('short');
    // Un nom court pour chaque groupe, jamais plus long que le nom entier, jamais incliné ni coupé.
    for (const [g, label] of Object.entries(MUSCLE_GROUP_LABELS)) {
      const s = GROUP_SHORT_LABELS[g as keyof typeof GROUP_SHORT_LABELS];
      expect(s, g).toBeTruthy();
      expect(s.length, g).toBeLessThanOrEqual(label.length);
    }
    expect(['pectoraux', 'epaules', 'abdominaux'].map((g) => GROUP_SHORT_LABELS[g as 'pectoraux'])).toEqual(['Pecto', 'Épaul', 'Abdos']);
  });
});
