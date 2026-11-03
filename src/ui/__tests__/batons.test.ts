import { describe, expect, it } from 'vitest';
import { MUSCLE_GROUP_LABELS } from '../../library/seed';
import { GROUP_SHORT_LABELS, stickLabels } from '../ReportVisuals';

describe('Bâtons des groupes travaillés, versions 1.37.0 et 1.37.1', () => {
  it('287. Noms sous les bâtons sur une ligne : entiers s’ils tiennent, sinon trois lettres ; deux rangs alternés seulement si même les trois lettres ne tiennent pas', () => {
    // Largeurs mesurées à 13 px (police des tests) : Pectoraux 64,8, Abdominaux 81,8… ; Pec 22,5, Abd 25,4…
    const full = [64.8, 24.7, 51.1, 42.7, 45.2, 47.5, 81.8];
    const short = [22.5, 24.7, 24.4, 19.7, 15.0, 24.5, 25.4];
    const large = (w: number[]) => w.map((x) => x * 1.15);
    // 6 px au moins entre deux noms voisins.
    expect(stickLabels(90, full, short)).toBe('full');
    // Sept groupes à 412, 360 et 320 px (colonnes de 46,9, 39,4 et 33,7 px) : trois lettres sur une ligne.
    expect(stickLabels(46.9, full, short)).toBe('short');
    expect(stickLabels(39.4, full, short)).toBe('short');
    expect(stickLabels(33.7, full, short)).toBe('short');
    // Texte agrandi à 115 % : une ligne à 360 px, deux rangs seulement à 320 px (dernier recours).
    expect(stickLabels(39.4, large(full), large(short))).toBe('short');
    expect(stickLabels(33.7, large(full), large(short))).toBe('staggered');
    // Six groupes à 320 px avec le texte agrandi (colonnes de 39,3 px) : toujours une ligne.
    expect(stickLabels(39.3, large(full.slice(0, 6)), large(short.slice(0, 6)))).toBe('short');
    // Trois lettres pour chaque groupe, sous-groupes des jambes compris.
    expect(Object.keys(GROUP_SHORT_LABELS).sort()).toEqual(Object.keys(MUSCLE_GROUP_LABELS).sort());
    for (const s of Object.values(GROUP_SHORT_LABELS)) expect(s).toHaveLength(3);
    expect(['pectoraux', 'dos', 'epaules', 'biceps', 'triceps', 'jambes', 'abdominaux'].map((g) => GROUP_SHORT_LABELS[g as 'pectoraux'])).toEqual(['Pec', 'Dos', 'Épa', 'Bic', 'Tri', 'Jam', 'Abd']);
  });
});
