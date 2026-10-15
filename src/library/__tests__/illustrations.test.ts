import { describe, expect, it } from 'vitest';
import { ILLUSTRATIONS } from '../illustrations';
import { SEED_EXERCISES } from '../seed';

/** Fichiers embarqués, lus en données (data URI base64) pour en mesurer la taille réelle. */
const FILES = import.meta.glob<string>('../illustrations/*.webp', { query: '?inline', import: 'default', eager: true });

function byteSize(dataUri: string): number {
  const base64 = dataUri.slice(dataUri.indexOf(',') + 1);
  return Math.floor((base64.length * 3) / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
}

describe('Illustrations embarquées (§4.0.1)', () => {
  it('chaque fichier est un WebP de moins de 50 Ko', () => {
    const entries = Object.entries(FILES);
    expect(entries.length).toBeGreaterThan(0);
    for (const [path, data] of entries) {
      expect(data.startsWith('data:image/webp'), path).toBe(true);
      expect(byteSize(data), path).toBeLessThan(50 * 1024);
    }
  });

  it('chaque illustration a une licence compatible, un auteur et ses deux sources Wikimedia Commons', () => {
    const seedIds = new Set(SEED_EXERCISES.map((e) => e.id));
    for (const [id, ill] of Object.entries(ILLUSTRATIONS)) {
      expect(seedIds.has(id), id).toBe(true);
      expect(ill.license, id).toBe('CC BY-SA 3.0');
      expect(ill.author, id).toBe('Everkinetic');
      expect(ill.licenseUrl).toMatch(/^https:\/\/creativecommons\.org\/licenses\/by-sa\/3\.0\//);
      for (const source of ill.sources) expect(source, id).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    }
  });

  it('aucun fichier orphelin : chaque image et vignette est référencée', () => {
    const referenced = new Set(Object.keys(ILLUSTRATIONS).flatMap((id) => [`${id}.webp`, `${id}-vignette.webp`]));
    const files = Object.keys(FILES).map((p) => p.split('/').pop()!);
    expect(files.sort()).toEqual([...referenced].sort());
  });

  it('les exercices sans illustration vérifiable gardent leur pictogramme', () => {
    expect(ILLUSTRATIONS['rowing-haltere']).toBeUndefined();
    expect(ILLUSTRATIONS['crunch-machine']).toBeUndefined();
    // Dips assistés : les dessins disponibles montrent des dips au poids du corps, sans machine d'assistance.
    expect(ILLUSTRATIONS['dips-assistes']).toBeUndefined();
    expect(Object.keys(ILLUSTRATIONS)).toHaveLength(16);
  });
});
