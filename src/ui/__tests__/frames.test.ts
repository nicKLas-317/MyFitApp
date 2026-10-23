import { describe, expect, it } from 'vitest';
import styles from '../../styles.css?raw';
import { FRAME_SELECTOR, markFrames } from '../frames';

/** Teinte (°) et saturation (%) d'une couleur #rrggbb. */
function hsl(hex: string): [number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s * 100];
}

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

const background = /--bg: (#[0-9a-f]{6})/.exec(styles)?.[1] ?? '';
const palette = [1, 2, 3, 4, 5].map((i) => new RegExp(`--frame-${i}: (#[0-9a-f]{6})`).exec(styles)?.[1]);

describe('Cadres de section (§3.1)', () => {
  it('143. Un seul style de cadre, gris neutre par défaut, sur les quatre côtés ; plus d’alternance « arc-en-ciel »', () => {
    // Les cinq couleurs vives restent celles des groupes musculaires (§3.2) : jamais vert, orange ni rouge.
    expect(palette.every(Boolean)).toBe(true);
    for (const hex of palette as string[]) {
      const [h, s] = hsl(hex);
      expect(s, hex).toBeGreaterThanOrEqual(70); // vive
      expect(contrast(hex, background), `${hex} bien visible sur le fond`).toBeGreaterThanOrEqual(7); // claire sur fond noir
      expect(h >= 70 && h <= 165, `${hex} n'est pas vert`).toBe(false);
      expect(h >= 15 && h <= 45, `${hex} n'est pas orange`).toBe(false);
      expect(h >= 345 || h < 15, `${hex} n'est pas rouge`).toBe(false);
    }
    expect(new Set(palette.map((hex) => Math.round(hsl(hex!)[0] / 25))).size).toBe(5);
    // Une seule règle de bordure, sur les quatre côtés, neutre par défaut ; aucune couleur par rang d'affichage.
    expect(
      styles.match(/\[data-frame\] \{\s*--frame-color: var\(--frame-neutral\);\s*border: var\(--frame-width\) solid var\(--frame-color\);\s*border-radius: var\(--radius\);/g),
    ).toHaveLength(1);
    expect(styles).not.toMatch(/\[data-frame='\d'\]/);
    expect(styles).not.toMatch(/data-neutral-frames/);
    expect(styles).not.toMatch(/border-left(-width|-color|-style)?:/);
  });

  it('144. Les cadres sont tous marqués du même attribut ; la liste des cadres est unique', () => {
    const els = Array.from({ length: 7 }, () => ({ dataset: {} as Record<string, string> }));
    const root = { querySelectorAll: (selector: string) => (selector === FRAME_SELECTOR ? els : []) } as unknown as ParentNode;
    markFrames(root);
    expect(els.map((e) => e.dataset.frame)).toEqual(Array(7).fill(''));
    for (const cls of ['.frame', '.card', '.pick-item', '.history-item', '.chart', '.confirm-box', '.menu-panel', '.bottom-sheet']) expect(FRAME_SELECTOR).toContain(cls);
    // Pastilles de statut et cases du récapitulatif hebdomadaire : jamais des cadres.
    expect(FRAME_SELECTOR).not.toMatch(/status|recap-cell/);
  });
});
