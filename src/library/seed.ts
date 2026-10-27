import type { Exercise, MuscleGroup, Variant, VariantConfig } from '../domain/types';
import { normalizeName } from './text';

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

/** Variante de la bibliothèque initiale autre que la variante standard (identifiant `<exercice>--<suffixe>`). */
interface SeedVariant {
  suffix: string;
  name: string;
  synonyms: string[];
}

/**
 * Exercice à variantes non comparables en charge (version 8) : la variante standard prend un nom (« Debout »,
 * « Barre »…) et ses synonymes, les autres variantes ont chacune leur historique.
 */
function withVariants(e: Exercise, standard: { name: string; synonyms: string[] }, others: SeedVariant[]): Exercise {
  const [first, ...rest] = e.variants;
  return {
    ...e,
    variants: [
      { ...first!, name: standard.name, synonyms: [...standard.synonyms] },
      ...rest,
      ...others.map((v) => ({ id: `${e.id}--${v.suffix}`, name: v.name, synonyms: [...v.synonyms], archived: false })),
    ],
  };
}

/** Variantes standard nommées et variantes ajoutées par la version 8, aussi installées sur une base existante. */
const MOLLETS_VARIANTS = {
  standard: { name: 'Debout', synonyms: ['Mollets debout', 'Standing calf raise', 'Mollets machine debout'] },
  others: [{ suffix: 'assis', name: 'Assis', synonyms: ['Mollets assis', 'Seated calf raise', 'Calf assis', 'Mollets machine assis'] }],
};
const TRICEPS_POULIE_VARIANTS = {
  standard: { name: 'Corde', synonyms: ['Extension triceps poulie corde', 'Rope pushdown', 'Triceps pushdown corde'] },
  others: [{ suffix: 'barre', name: 'Barre', synonyms: ['Extension triceps poulie barre', 'Triceps pushdown barre', 'Bar pushdown', 'Pushdown barre'] }],
};

/**
 * Version 9 : le « Tirage horizontal » est la machine de rowing assis avec appui pectoral (pile de poids, poignées sur
 * bras articulés) ; le tirage à la poulie basse devient un exercice distinct.
 */
const TIRAGE_HORIZONTAL_MACHINE: SeedNaming = {
  name: 'Tirage horizontal machine (appui pectoral)',
  synonyms: [
    'Tirage horizontal', 'Tirage horizontal machine', 'Rowing machine', 'Rowing assis machine',
    'Seated row', 'Seated row machine', 'Chest supported row', 'Machine row',
  ],
};

export const SEED_EXERCISES: readonly Exercise[] = [
  withGrips(exercise('tirage-horizontal', TIRAGE_HORIZONTAL_MACHINE.name, [...TIRAGE_HORIZONTAL_MACHINE.synonyms], 'dos', ['biceps'], 'machine')),
  withGrips(exercise('tirage-vertical', 'Tirage vertical', ['Lat pulldown', 'Tirage poitrine'], 'dos', ['biceps'], 'poulie')),
  exercise('rowing-haltere', 'Rowing haltère', ['Dumbbell row', 'Rowing un bras'], 'dos', ['biceps'], 'haltère'),
  exercise('chest-press', 'Chest press', ['Développé assis machine', 'Développé pectoraux machine'], 'pectoraux', ['triceps', 'epaules'], 'machine'),
  exercise('pec-deck', 'Pec deck', ['Butterfly', 'Pec fly', 'Écarté machine'], 'pectoraux', [], 'machine'),
  exercise('developpe-couche', 'Développé couché', ['Bench press', 'DC'], 'pectoraux', ['triceps', 'epaules'], 'barre'),
  exercise('developpe-epaules-machine', 'Développé épaules machine', ['Shoulder press', 'Développé militaire machine'], 'epaules', ['triceps'], 'machine'),
  // Version haltères ; la version machine est un exercice distinct (historiques séparés, charges non comparables).
  exercise('elevations-laterales', 'Élévations latérales haltères', ['Lateral raise haltères', 'Dumbbell lateral raise'], 'epaules', [], 'haltères'),
  exercise('curl-biceps-poulie-corde', 'Curl biceps poulie corde', ['Cable rope curl', 'Biceps poulie corde'], 'biceps', [], 'poulie'),
  exercise('curl-biceps-halteres', 'Curl biceps haltères', ['Dumbbell curl', 'Curl haltères'], 'biceps', [], 'haltères'),
  exercise('curl-biceps-banc-incline', 'Curl biceps banc incliné', ['Incline dumbbell curl', 'Curl incliné'], 'biceps', [], 'haltères'),
  // Version 8 : variante standard « Corde », variante « Barre » distincte (charges non comparables).
  withVariants(
    exercise('extension-triceps-poulie', 'Extension triceps poulie', ['Triceps pushdown', 'Pushdown', 'Triceps poulie haute'], 'triceps', [], 'poulie'),
    TRICEPS_POULIE_VARIANTS.standard,
    TRICEPS_POULIE_VARIANTS.others,
  ),
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
  exercise('ecarte-couche-halteres', 'Écarté couché haltères', ['Dumbbell fly', 'Écarté haltères', 'Écarté à plat haltères'], 'pectoraux', [], 'haltères'),
  // Version 3.
  exercise('curl-ischios', 'Curl ischios', ['Curl ischio allongé', 'Leg curl allongé', 'Lying leg curl'], 'jambes', ['ischio-jambiers'], 'machine'),
  // Version 4.
  exercise('elevations-laterales-machine', 'Élévations latérales machine', ['Lateral raise machine', 'Machine lateral raise'], 'epaules', [], 'machine'),
  // Version 7. Curl à la barre droite : distinct des curls aux haltères et à la poulie (historiques séparés).
  exercise('curl-biceps-barre-droite', 'Curl biceps barre droite', ['Curl barre', 'Curl barre droite', 'Curl à la barre', 'Barbell curl', 'Straight bar curl'], 'biceps', [], 'barre'),
  // Version 8 : machine debout par défaut, machine assise en variante distincte.
  withVariants(
    exercise('mollets-machine', 'Mollets machine', ['Mollets', 'Calf press', 'Calf raise', 'Extension mollets', 'Presse mollets', 'Machine à mollets'], 'jambes', ['mollets'], 'machine'),
    MOLLETS_VARIANTS.standard,
    MOLLETS_VARIANTS.others,
  ),
  // Abduction (on écarte les jambes) et adduction (on les ramène) : deux machines distinctes, jamais confondues.
  exercise('abducteurs-machine', 'Abducteurs machine', ['Abducteurs', 'Abduction', 'Machine abducteurs', 'Hip abduction', 'Abductor machine', 'Fessiers machine'], 'jambes', ['fessiers'], 'machine'),
  exercise('adducteurs-machine', 'Adducteurs machine', ['Adducteurs', 'Adduction', 'Machine adducteurs', 'Hip adduction', 'Adductor machine'], 'jambes', ['adducteurs'], 'machine'),
  // Version 8. Pectoraux.
  withVariants(
    exercise('developpe-incline', 'Développé incliné', ['Incline bench press', 'Développé incliné barre', 'Incline barbell press'], 'pectoraux', ['epaules', 'triceps'], 'barre'),
    { name: 'Barre', synonyms: [] },
    [{ suffix: 'halteres', name: 'Haltères', synonyms: ['Développé incliné haltères', 'Incline dumbbell press'] }],
  ),
  exercise('developpe-couche-halteres', 'Développé couché haltères', ['Dumbbell bench press', 'DC haltères', 'Développé couché aux haltères'], 'pectoraux', ['triceps', 'epaules'], 'haltères'),
  exercise('ecarte-poulie', 'Écarté à la poulie', ['Écarté poulie', 'Vis-à-vis', 'Écarté vis-à-vis', 'Cable crossover', 'Cable fly'], 'pectoraux', [], 'poulie'),
  // Dos. Tractions assistées : la charge saisie est une aide (§7.12), comme les dips assistés.
  exercise('tractions-assistees', 'Tractions assistées', ['Traction assistée', 'Assisted pull-up', 'Tractions machine assistée', 'Assisted chin-up'], 'dos', ['biceps'], 'machine', {
    assisted: true,
  }),
  exercise('rowing-barre', 'Rowing barre', ['Barbell row', 'Rowing buste penché', 'Bent over row', 'Bent-over barbell row'], 'dos', ['biceps'], 'barre'),
  exercise('pull-over-poulie', 'Pull-over à la poulie', ['Pull-over poulie', 'Pullover poulie', 'Cable pullover'], 'dos', [], 'poulie'),
  exercise('lombaires-banc', 'Lombaires au banc', ['Lombaires', 'Extension lombaires', 'Back extension', 'Hyperextension', 'Banc à lombaires'], 'dos', [], 'banc'),
  exercise('shrugs', 'Shrugs', ['Shrug', 'Haussements d’épaules', 'Shrugs haltères', 'Dumbbell shrug'], 'dos', [], 'haltères'),
  // Épaules. Oiseau : machine (reverse pec deck) et haltères, charges non comparables.
  exercise('developpe-militaire-halteres', 'Développé militaire haltères', ['Développé épaules haltères', 'Dumbbell shoulder press'], 'epaules', ['triceps'], 'haltères'),
  withVariants(
    exercise('oiseau', 'Oiseau', ['Rear delt fly machine', 'Oiseau machine'], 'epaules', ['dos'], 'machine'),
    { name: 'Machine', synonyms: [] },
    [{ suffix: 'halteres', name: 'Haltères', synonyms: ['Oiseau haltères', 'Oiseau buste penché', 'Rear delt fly haltères', 'Bent-over reverse fly'] }],
  ),
  exercise('face-pull', 'Face pull', ['Tirage visage', 'Face pull corde', 'Rope face pull'], 'epaules', ['dos'], 'poulie'),
  exercise('elevations-frontales', 'Élévations frontales', ['Front raise', 'Élévations frontales haltères', 'Dumbbell front raise', 'Élévations avant'], 'epaules', [], 'haltères'),
  // Biceps. Le curl à la barre EZ est distinct du curl à la barre droite (historiques séparés).
  exercise('curl-marteau', 'Curl marteau', ['Hammer curl', 'Curl marteau haltères', 'Dumbbell hammer curl'], 'biceps', [], 'haltères'),
  exercise('curl-pupitre', 'Curl pupitre', ['Larry Scott', 'Curl Larry Scott', 'Preacher curl', 'Curl au pupitre'], 'biceps', [], 'barre'),
  exercise('curl-biceps-barre-ez', 'Curl biceps barre EZ', ['Curl barre EZ', 'Curl EZ', 'EZ bar curl', 'Curl à la barre EZ'], 'biceps', [], 'barre'),
  // Triceps.
  exercise('barre-au-front', 'Barre au front', ['Skull crusher', 'Skullcrusher', 'Barre front', 'Lying triceps extension'], 'triceps', [], 'barre'),
  exercise('kickback', 'Kickback', ['Kickback haltère', 'Triceps kickback', 'Kick back triceps', 'Extension triceps buste penché'], 'triceps', [], 'haltère'),
  // Jambes : sous-groupe quadriceps. « squat » seul désigne le squat kettlebell (goblet squat).
  exercise('hack-squat', 'Hack squat', ['Hack', 'Hack squat machine'], 'jambes', ['quadriceps'], 'machine'),
  exercise('squat-kettlebell', 'Squat kettlebell', ['Squat', 'Goblet squat', 'Squat KB', 'Squat gobelet', 'Kettlebell squat'], 'jambes', ['quadriceps'], 'kettlebell'),
  withGrips(
    exercise('tirage-horizontal-poulie-basse', 'Tirage horizontal poulie basse', ['Tirage poulie basse', 'Rowing poulie basse', 'Seated cable row', 'Cable row', 'Low row', 'Tirage horizontal poulie'], 'dos', ['biceps'], 'poulie'),
  ),
  // Version 11. Abdominaux au poids du corps : pas de charge, progression par les répétitions (10 à 40).
  // « crunch » seul désigne le crunch au sol ; le crunch machine reste l'exercice à charge de la salle.
  exercise('crunch-sol', 'Crunch au sol', ['Crunch', 'Crunch classique', 'Floor crunch', 'Crunch sol'], 'abdominaux', [], 'poids du corps', {
    bodyweight: true,
  }),
  // Répétitions comptées au total, autant à droite qu'à gauche.
  exercise('crunch-oblique-touche-talons', 'Crunch oblique touche talons', ['Heel touches', 'Heel touch', 'Touche talons', 'Touche-talons', 'Crunch oblique', 'Alternate heel touch'], 'abdominaux', [], 'poids du corps', {
    bodyweight: true,
  }),
  exercise('releves-jambes-allonge', 'Relevés de jambes allongé', ['Relevés de jambes', 'Relevé de jambes', 'Relevés de jambes au sol', 'Lying leg raise', 'Leg raise'], 'abdominaux', [], 'poids du corps', {
    bodyweight: true,
  }),
];

/** Version de la bibliothèque initiale ; chaque version ajoute des exercices (jamais de suppression). */
export const SEED_VERSION = 11;

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
  7: ['curl-biceps-barre-droite', 'mollets-machine', 'abducteurs-machine', 'adducteurs-machine'],
  8: [
    'developpe-incline', 'developpe-couche-halteres', 'ecarte-poulie',
    'tractions-assistees', 'rowing-barre', 'pull-over-poulie', 'lombaires-banc', 'shrugs',
    'developpe-militaire-halteres', 'oiseau', 'face-pull', 'elevations-frontales',
    'curl-marteau', 'curl-pupitre', 'curl-biceps-barre-ez',
    'barre-au-front', 'kickback',
    'hack-squat', 'squat-kettlebell',
  ],
  9: ['tirage-horizontal-poulie-basse'],
  11: ['crunch-sol', 'crunch-oblique-touche-talons', 'releves-jambes-allonge'],
};

/**
 * Variantes apportées par une version à un exercice existant : sur une base existante, la variante standard prend son
 * nom (si elle s'appelle encore « Standard ») et les synonymes de ce nom ; chaque variante ajoutée l'est une seule fois,
 * sauf si une variante du même nom existe déjà (créée par l'utilisateur ou un import). Rien n'est supprimé.
 */
export const SEED_VARIANT_UPDATES: Readonly<
  Record<number, Readonly<Record<string, { standard: { name: string; synonyms: readonly string[] }; others: readonly SeedVariant[] }>>>
> = {
  8: {
    'mollets-machine': MOLLETS_VARIANTS,
    'extension-triceps-poulie': TRICEPS_POULIE_VARIANTS,
  },
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
 * Avec `redefine`, l'exercice change de nature : la correction s'applique toujours (voir `redefineSeedExercise`).
 */
export const SEED_UPDATES: Readonly<Record<number, Readonly<Record<string, SeedUpdate>>>> = {
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
  9: {
    'tirage-horizontal': {
      from: { name: 'Tirage horizontal', synonyms: ['Seated row', 'Rowing assis', 'Tirage poulie basse'] },
      to: TIRAGE_HORIZONTAL_MACHINE,
      redefine: true,
    },
  },
};

export interface SeedUpdate {
  from: SeedNaming;
  to: SeedNaming;
  /** L'exercice change de nature (version 9) : corrigé même s'il a été personnalisé. */
  redefine?: boolean;
}

/**
 * Exercice redéfini par une version (version 9 : tirage horizontal → machine à appui pectoral). Les synonymes
 * d'origine sont remplacés par les nouveaux, ceux ajoutés par l'utilisateur sont gardés ; le nom n'est remplacé que
 * s'il est encore l'ancien nom de la bibliothèque. Variantes, synonymes appris et identifiants ne changent pas.
 */
export function redefineSeedExercise(exercise: Exercise, { from, to }: SeedUpdate): Exercise {
  const key = normalizeName;
  const replaced = new Set([...from.synonyms, ...to.synonyms, to.name].map(key));
  const added = exercise.synonyms.filter((s) => !replaced.has(key(s)));
  const name = exercise.name === from.name ? to.name : exercise.name;
  return { ...exercise, name, synonyms: [...to.synonyms.filter((s) => key(s) !== key(name)), ...added] };
}

/** Applique les redéfinitions de la bibliothèque (version 9) aux exercices concernés ; les autres sont inchangés. */
export function redefineSeedExercises(exercises: readonly Exercise[]): Exercise[] {
  return exercises.map((e) => {
    let next = e;
    for (const changes of Object.values(SEED_UPDATES)) {
      const change = changes[e.id];
      if (change?.redefine) next = redefineSeedExercise(next, change);
    }
    return next;
  });
}

/**
 * Corrections de groupes secondaires apportées par une version : appliquées à une base existante seulement
 * si l'exercice a encore exactement les groupes d'origine (une personnalisation n'est jamais écrasée).
 */
export const SEED_GROUP_UPDATES: Readonly<Record<number, Readonly<Record<string, { from: readonly MuscleGroup[]; to: readonly MuscleGroup[] }>>>> = {
  5: {
    'presse-a-cuisses': { from: ['quadriceps', 'ischio-jambiers'], to: ['quadriceps'] },
  },
  // Version 10 : un groupe secondaire doit être réellement sollicité (il compte ½ dans le récapitulatif, §19.6).
  // Les écartés isolent les pectoraux : l'avant de l'épaule n'y travaille que peu.
  10: {
    'pec-deck': { from: ['epaules'], to: [] },
    'ecarte-couche-halteres': { from: ['epaules'], to: [] },
    'ecarte-poulie': { from: ['epaules'], to: [] },
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
  mollets: 'Mollets',
  fessiers: 'Fessiers',
  adducteurs: 'Adducteurs',
  abdominaux: 'Abdominaux',
};
