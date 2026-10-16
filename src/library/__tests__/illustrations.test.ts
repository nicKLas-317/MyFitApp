import { describe, expect, it } from 'vitest';
import { ILLUSTRATIONS, illustrationFor } from '../illustrations';
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

  it('chaque illustration a une licence compatible, un auteur et ses deux sources vérifiables', () => {
    // Clé : un exercice, ou une variante qui a son propre dessin (« mollets-machine--assis »).
    const seedIds = new Set(SEED_EXERCISES.flatMap((e) => [e.id, ...e.variants.map((v) => v.id)]));
    for (const [id, ill] of Object.entries(ILLUSTRATIONS)) {
      expect(seedIds.has(id), id).toBe(true);
      expect(ill.author, id).toBe('Everkinetic');
      if (ill.origin === 'Wikimedia Commons') {
        expect(ill.license, id).toBe('CC BY-SA 3.0');
        expect(ill.licenseUrl).toMatch(/^https:\/\/creativecommons\.org\/licenses\/by-sa\/3\.0\//);
        for (const source of ill.sources) expect(source, id).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
      } else {
        // Dépôt everkinetic/data, publié sous CC BY-SA 4.0.
        expect(ill.license, id).toBe('CC BY-SA 4.0');
        expect(ill.licenseUrl).toMatch(/^https:\/\/creativecommons\.org\/licenses\/by-sa\/4\.0\//);
        for (const source of ill.sources) expect(source, id).toMatch(/^https:\/\/github\.com\/everkinetic\/data\/blob\/main\/src\/images-web\/[a-z-]+-[12]\.png$/);
      }
    }
    // Abducteurs et adducteurs : deux paires distinctes, jamais la même image.
    expect(ILLUSTRATIONS['abducteurs-machine']!.sources[0]).toMatch(/thigh-abductor-1/);
    expect(ILLUSTRATIONS['adducteurs-machine']!.sources[0]).toMatch(/thigh-adductor-1/);
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
    // Version 8 : aucun dessin fiable pour ces exercices ou variantes.
    for (const id of ['developpe-couche-halteres', 'tractions-assistees', 'pull-over-poulie', 'face-pull', 'oiseau', 'squat-kettlebell']) {
      expect(ILLUSTRATIONS[id], id).toBeUndefined();
    }
    expect(Object.keys(ILLUSTRATIONS)).toHaveLength(38);
  });

  it('une variante peut avoir son propre dessin ; sinon elle reprend celui de son exercice', () => {
    // Mollets : machine debout (variante standard) et machine assise, deux dessins.
    expect(illustrationFor('mollets-machine', 'mollets-machine')?.title).toBe('Standing calf raises using machine');
    expect(illustrationFor('mollets-machine', 'mollets-machine--assis')?.title).toBe('Seated calf raise using machine');
    // Extension triceps poulie : la corde (variante standard) et la barre ont chacune leur dessin.
    expect(illustrationFor('extension-triceps-poulie', 'extension-triceps-poulie')?.title).toBe('Triceps pushdown with rope and cable');
    expect(illustrationFor('extension-triceps-poulie', 'extension-triceps-poulie--barre')?.title).toBe('Triceps pushdown with cable');
    // Oiseau : dessin pour les haltères seulement, pictogramme pour la machine.
    expect(illustrationFor('oiseau', 'oiseau')).toBeUndefined();
    expect(illustrationFor('oiseau', 'oiseau--halteres')?.title).toBe('Bent over rear deltoid raise with head on bench');
    // Une variante créée par l'utilisateur reprend le dessin de l'exercice.
    expect(illustrationFor('tirage-vertical', 'tirage-vertical--prise-serree')).toBe(ILLUSTRATIONS['tirage-vertical']);
  });
});
