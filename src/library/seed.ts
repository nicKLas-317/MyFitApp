import type { Exercise, MuscleGroup, Variant, VariantConfig } from '../domain/types';

/**
 * Bibliothèque initiale (§4.0). Les identifiants sont stables et ne doivent jamais changer :
 * l'historique y est rattaché. Chaque exercice démarre avec une variante standard dont
 * l'identifiant est celui de l'exercice ; d'autres variantes pourront être ajoutées.
 */
function exercise(
  id: string,
  name: string,
  synonyms: string[],
  primaryGroup: MuscleGroup,
  secondaryGroups: MuscleGroup[],
  equipment: string,
  config?: Partial<VariantConfig>,
): Exercise {
  return {
    id,
    name,
    synonyms,
    primaryGroup,
    secondaryGroups,
    equipment,
    archived: false,
    variants: [{ id, name: 'Standard', synonyms: [], archived: false, ...(config ? { config } : {}) }],
  };
}

/** Variantes de prise d'un exercice à prise (§4.3.1), la variante standard étant la prise moyenne. */
export function gripVariants(id: string): Variant[] {
  return [
    { id, name: 'Prise moyenne', synonyms: [], archived: false },
    { id: `${id}--prise-tres-large`, name: 'Prise très large', synonyms: [], archived: false },
    { id: `${id}--prise-serree`, name: 'Prise serrée', synonyms: [], archived: false },
  ];
}

/** Exercice à prise : trois variantes distinctes, avec chacune son historique (version 6). */
function withGrips(e: Exercise): Exercise {
  return { ...e, variants: gripVariants(e.id) };
}

export const SEED_EXERCISES: readonly Exercise[] = [
  withGrips(exercise('tirage-horizontal', 'Tirage horizontal', ['Seated row', 'Rowing assis', 'Tirage poulie basse'], 'dos', ['biceps'], 'machine')),
  withGrips(exercise('tirage-vertical', 'Tirage vertical', ['Lat pulldown', 'Tirage poitrine'], 'dos', ['biceps'], 'poulie')),
  exercise('rowing-haltere', 'Rowing haltère', ['Dumbbell row', 'Rowing un bras'], 'dos', ['biceps'], 'haltère'),
  exercise('chest-press', 'Chest press', ['Développé assis machine', 'Développé pectoraux machine'], 'pectoraux', ['triceps', 'epaules'], 'machine'),
  exercise('pec-deck', 'Pec deck', ['Butterfly', 'Pec fly', 'Écarté machine'], 'pectoraux', ['epaules'], 'machine'),
  exercise('developpe-couche', 'Développé couché', ['Bench press', 'DC'], 'pectoraux', ['triceps', 'epaules'], 'barre'),
  exercise('developpe-epaules-machine', 'Développé épaules machine', ['Shoulder press', 'Développé militaire machine'], 'epaules', ['triceps'], 'machine'),
  // Version haltères ; la version machine est un exercice distinct (historiques séparés, charges non comparables).
  exercise('elevations-laterales', 'Élévations latérales haltères', ['Lateral raise haltères', 'Dumbbell lateral raise'], 'epaules', [], 'haltères'),
  exercise('curl-biceps-poulie-corde', 'Curl biceps poulie corde', ['Cable rope curl', 'Biceps poulie corde'], 'biceps', [], 'poulie'),
  exercise('curl-biceps-halteres', 'Curl biceps haltères', ['Dumbbell curl', 'Curl haltères'], 'biceps', [], 'haltères'),
  exercise('curl-biceps-banc-incline', 'Curl biceps banc incliné', ['Incline dumbbell curl', 'Curl incliné'], 'biceps', [], 'haltères'),
  exercise('extension-triceps-poulie', 'Extension triceps poulie', ['Triceps pushdown', 'Pushdown', 'Triceps poulie haute'], 'triceps', [], 'poulie'),
  exercise('extension-triceps-haltere-assis', 'Extension triceps haltère assis', ['Overhead dumbbell extension', 'Extension nuque haltère'], 'triceps', [], 'haltère'),
  // Version 5 : quadriceps seulement (les ischio-jambiers désignent le leg curl et le curl ischios).
  exercise('presse-a-cuisses', 'Presse à cuisses', ['Leg press', 'Presse'], 'jambes', ['quadriceps'], 'machine'),
  exercise('leg-extension', 'Leg extension', ['Extension des jambes', 'Extension quadriceps'], 'jambes', ['quadriceps'], 'machine'),
  // Leg curl = version ASSISE ; la version allongée est « Curl ischios » (historiques séparés).
  exercise('leg-curl', 'Leg curl', ['Leg curl assis', 'Seated leg curl'], 'jambes', ['ischio-jambiers'], 'machine'),
  exercise('crunch-machine', 'Crunch machine', ['Abdominaux machine', 'Abdos'], 'abdominaux', [], 'machine'),
  // Version 2 de la bibliothèque initiale.
  exercise('dips-assistes', 'Dips assistés', ['Assisted dips', 'Dips machine assistée', 'Dips à la machine'], 'triceps', ['pectoraux'], 'machine', {
    assisted: true,
  }),
  exercise('ecarte-couche-halteres', 'Écarté couché haltères', ['Dumbbell fly', 'Écarté haltères', 'Écarté à plat haltères'], 'pectoraux', ['epaules'], 'haltères'),
  // Version 3.
  exercise('curl-ischios', 'Curl ischios', ['Curl ischio allongé', 'Leg curl allongé', 'Lying leg curl'], 'jambes', ['ischio-jambiers'], 'machine'),
  // Version 4.
  exercise('elevations-laterales-machine', 'Élévations latérales machine', ['Lateral raise machine', 'Machine lateral raise'], 'epaules', [], 'machine'),
];

/** Version de la bibliothèque initiale ; chaque version ajoute des exercices (jamais de suppression). */
export const SEED_VERSION = 6;

/**
 * Exercices devenus « à prise » à une version donnée : sur une base existante, leur variante standard prend le nom
 * « Prise moyenne » (si elle s'appelle encore « Standard ») et les prises manquantes sont ajoutées une seule fois.
 */
export const SEED_GRIP_EXERCISES: Readonly<Record<number, readonly string[]>> = {
  6: ['tirage-horizontal', 'tirage-vertical'],
};

/** Exercices ajoutés par chaque version, installés une seule fois sur une base existante. */
export const SEED_ADDITIONS: Readonly<Record<number, readonly string[]>> = {
  2: ['dips-assistes', 'ecarte-couche-halteres'],
  3: ['curl-ischios'],
  4: ['elevations-laterales-machine'],
};

/** Nom et synonymes d'un exercice de la bibliothèque initiale, à une version donnée. */
export interface SeedNaming {
  name: string;
  synonyms: readonly string[];
}

/**
 * Corrections de nom et de synonymes apportées par une version : appliquées à une base existante
 * seulement si l'exercice a encore exactement le nom et les synonymes d'origine (une personnalisation
 * de l'utilisateur n'est jamais écrasée). L'identifiant, et donc l'historique, ne change jamais.
 */
export const SEED_UPDATES: Readonly<Record<number, Readonly<Record<string, { from: SeedNaming; to: SeedNaming }>>>> = {
  3: {
    'leg-curl': {
      from: { name: 'Leg curl', synonyms: ['Flexion des jambes', 'Curl ischios'] },
      to: { name: 'Leg curl', synonyms: ['Leg curl assis', 'Seated leg curl'] },
    },
  },
  4: {
    'elevations-laterales': {
      from: { name: 'Élévations latérales', synonyms: ['Lateral raise', 'Latéral raise'] },
      to: { name: 'Élévations latérales haltères', synonyms: ['Lateral raise haltères', 'Dumbbell lateral raise'] },
    },
    'tirage-vertical': {
      from: { name: 'Tirage vertical', synonyms: ['Lat pulldown', 'Tirage poitrine', 'Tirage nuque'] },
      to: { name: 'Tirage vertical', synonyms: ['Lat pulldown', 'Tirage poitrine'] },
    },
  },
};

/**
 * Corrections de groupes secondaires apportées par une version : appliquées à une base existante seulement
 * si l'exercice a encore exactement les groupes d'origine (une personnalisation n'est jamais écrasée).
 */
export const SEED_GROUP_UPDATES: Readonly<Record<number, Readonly<Record<string, { from: readonly MuscleGroup[]; to: readonly MuscleGroup[] }>>>> = {
  5: {
    'presse-a-cuisses': { from: ['quadriceps', 'ischio-jambiers'], to: ['quadriceps'] },
  },
};

/** Groupes secondaires qu'un exercice de la bibliothèque initiale a portés, version actuelle comprise. */
export function seedSecondaryGroups(id: string): (readonly MuscleGroup[])[] {
  const current = SEED_EXERCISES.find((e) => e.id === id);
  if (!current) return [];
  return [current.secondaryGroups, ...Object.values(SEED_GROUP_UPDATES).flatMap((c) => (c[id] ? [c[id]!.from] : []))];
}

export function sameGroups(a: readonly MuscleGroup[], b: readonly MuscleGroup[]): boolean {
  return a.length === b.length && a.every((g, i) => g === b[i]);
}

/** Noms et synonymes qu'un exercice de la bibliothèque initiale a portés, version actuelle comprise. */
export function seedNamings(id: string): SeedNaming[] {
  const current = SEED_EXERCISES.find((e) => e.id === id);
  if (!current) return [];
  const states: SeedNaming[] = [{ name: current.name, synonyms: current.synonyms }];
  for (const changes of Object.values(SEED_UPDATES)) {
    const change = changes[id];
    if (change) states.push(change.from);
  }
  return states;
}

export function sameNaming(a: SeedNaming, b: SeedNaming): boolean {
  return a.name === b.name && a.synonyms.length === b.synonyms.length && a.synonyms.every((s, i) => s === b.synonyms[i]);
}

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  dos: 'Dos',
  pectoraux: 'Pectoraux',
  epaules: 'Épaules',
  biceps: 'Biceps',
  triceps: 'Triceps',
  jambes: 'Jambes',
  quadriceps: 'Quadriceps',
  'ischio-jambiers': 'Ischio-jambiers',
  abdominaux: 'Abdominaux',
};
