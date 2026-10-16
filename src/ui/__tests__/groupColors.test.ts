import { describe, expect, it } from 'vitest';
import styles from '../../styles.css?raw';
import type { MuscleGroup } from '../../domain/types';
import { MUSCLE_GROUP_LABELS } from '../../library/seed';
import { colorGroupOf, GROUP_COLORS, groupColorProps } from '../groupColors';

const token = (name: string) => new RegExp(`${name}: (#[0-9a-f]{6})`).exec(styles)?.[1];
const background = token('--bg')!;

/** Contraste WCAG entre deux couleurs #rrggbb. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

describe('Couleurs fixes des groupes musculaires (§3.2)', () => {
  it('161. Une couleur par groupe, définie une seule fois : épaules jaune, pectoraux cyan, triceps bleu clair, dos violet, biceps rose, jambes blanc, abdominaux gris clair', () => {
    const hex = Object.fromEntries(Object.entries(GROUP_COLORS).map(([g, t]) => [g, token(t)]));
    expect(hex).toEqual({
      epaules: '#ffe44a',
      pectoraux: '#3ee6ee',
      triceps: '#8cc8ff',
      dos: '#c79bff',
      biceps: '#ff7ad6',
      jambes: '#f4f5f7',
      abdominaux: '#b4bcc8',
    });
    // Toutes distinctes, lisibles sur le fond noir ; le blanc et le gris clair bien séparés.
    const colors = Object.values(hex) as string[];
    expect(new Set(colors).size).toBe(7);
    for (const c of colors) expect(contrast(c, background), c).toBeGreaterThanOrEqual(7);
    expect(contrast(hex.jambes!, hex.abdominaux!)).toBeGreaterThanOrEqual(1.5);
    // Chaque groupe a sa couleur ; les sous-groupes des jambes prennent le blanc des jambes.
    for (const g of Object.keys(MUSCLE_GROUP_LABELS) as MuscleGroup[]) expect(GROUP_COLORS[colorGroupOf(g)], g).toBeDefined();
    for (const g of ['quadriceps', 'ischio-jambiers', 'mollets', 'fessiers', 'adducteurs'] as const) expect(colorGroupOf(g), g).toBe('jambes');
    expect(groupColorProps('mollets')).toEqual({ 'data-group-color': 'jambes', style: { '--group-color': 'var(--frame-white)' } });
    // Une seule règle CSS applique la couleur du groupe aux cadres ; plus aucune teinte de groupe écrite à part.
    expect(styles.match(/\[data-group-color\]\[data-frame\] \{\s*--frame-color: var\(--group-color\);\s*\}/g)).toHaveLength(1);
    expect(styles).not.toMatch(/\.picto-(dos|pectoraux|epaules|biceps|triceps|jambes|abdominaux)/);
    expect(styles).toMatch(/\.picto \{[^}]*background: var\(--group-color/);
  });
});
