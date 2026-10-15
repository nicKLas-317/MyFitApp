import type { Exercise, MuscleGroup, VariantConfig } from '../domain/types';

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

export const SEED_EXERCISES: readonly Exercise[] = [
  exercise('tirage-horizontal', 'Tirage horizontal', ['Seated row', 'Rowing assis', 'Tirage poulie basse'], 'dos', ['biceps'], 'machine'),
  exercise('tirage-vertical', 'Tirage vertical', ['Lat pulldown', 'Tirage poitrine', 'Tirage nuque'], 'dos', ['biceps'], 'poulie'),
  exercise('rowing-haltere', 'Rowing haltère', ['Dumbbell row', 'Rowing un bras'], 'dos', ['biceps'], 'haltère'),
  exercise('chest-press', 'Chest press', ['Développé assis machine', 'Développé pectoraux machine'], 'pectoraux', ['triceps', 'epaules'], 'machine'),
  exercise('pec-deck', 'Pec deck', ['Butterfly', 'Pec fly', 'Écarté machine'], 'pectoraux', ['epaules'], 'machine'),
  exercise('developpe-couche', 'Développé couché', ['Bench press', 'DC'], 'pectoraux', ['triceps', 'epaules'], 'barre'),
  exercise('developpe-epaules-machine', 'Développé épaules machine', ['Shoulder press', 'Développé militaire machine'], 'epaules', ['triceps'], 'machine'),
  exercise('elevations-laterales', 'Élévations latérales', ['Lateral raise', 'Latéral raise'], 'epaules', [], 'haltères'),
  exercise('curl-biceps-poulie-corde', 'Curl biceps poulie corde', ['Cable rope curl', 'Biceps poulie corde'], 'biceps', [], 'poulie'),
  exercise('curl-biceps-halteres', 'Curl biceps haltères', ['Dumbbell curl', 'Curl haltères'], 'biceps', [], 'haltères'),
  exercise('curl-biceps-banc-incline', 'Curl biceps banc incliné', ['Incline dumbbell curl', 'Curl incliné'], 'biceps', [], 'haltères'),
  exercise('extension-triceps-poulie', 'Extension triceps poulie', ['Triceps pushdown', 'Pushdown', 'Triceps poulie haute'], 'triceps', [], 'poulie'),
  exercise('extension-triceps-haltere-assis', 'Extension triceps haltère assis', ['Overhead dumbbell extension', 'Extension nuque haltère'], 'triceps', [], 'haltère'),
  exercise('presse-a-cuisses', 'Presse à cuisses', ['Leg press', 'Presse'], 'jambes', ['quadriceps', 'ischio-jambiers'], 'machine'),
  exercise('leg-extension', 'Leg extension', ['Extension des jambes', 'Extension quadriceps'], 'jambes', ['quadriceps'], 'machine'),
  exercise('leg-curl', 'Leg curl', ['Flexion des jambes', 'Curl ischios'], 'jambes', ['ischio-jambiers'], 'machine'),
  exercise('crunch-machine', 'Crunch machine', ['Abdominaux machine', 'Abdos'], 'abdominaux', [], 'machine'),
  // Version 2 de la bibliothèque initiale.
  exercise('dips-assistes', 'Dips assistés', ['Assisted dips', 'Dips machine assistée', 'Dips à la machine'], 'triceps', ['pectoraux'], 'machine', {
    assisted: true,
  }),
  exercise('ecarte-couche-halteres', 'Écarté couché haltères', ['Dumbbell fly', 'Écarté haltères', 'Écarté à plat haltères'], 'pectoraux', ['epaules'], 'haltères'),
];

/** Version de la bibliothèque initiale ; chaque version ajoute des exercices (jamais de suppression). */
export const SEED_VERSION = 2;

/** Exercices ajoutés par chaque version, installés une seule fois sur une base existante. */
export const SEED_ADDITIONS: Readonly<Record<number, readonly string[]>> = {
  2: ['dips-assistes', 'ecarte-couche-halteres'],
};

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
