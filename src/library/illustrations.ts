/**
 * Illustrations embarquées (§4.0.1) : dessins au trait d'Everkinetic, CC BY-SA 3.0 via Wikimedia Commons, ou
 * CC BY-SA 4.0 via le dépôt everkinetic/data (mêmes dessins, publiés en données ouvertes).
 * Chaque image assemble les positions de début et de fin (fichiers « 1 » et « 2 »), recadrées
 * et converties en WebP. Sources et licences : docs/illustrations.md. Un exercice absent garde son pictogramme.
 */

/** Fichiers embarqués : `<clé>.webp` et sa vignette `<clé>-vignette.webp`. */
const FILES = import.meta.glob<string>('./illustrations/*.webp', { eager: true, import: 'default' });

export interface Illustration {
  src: string;
  thumb: string;
  /** Titre de l'œuvre d'origine. */
  title: string;
  author: string;
  license: string;
  licenseUrl: string;
  /** Pages des deux fichiers d'origine (début et fin du mouvement). */
  sources: [string, string];
  /** Où se trouvent ces fichiers. */
  origin: 'Wikimedia Commons' | 'everkinetic/data';
}

const EVERKINETIC = {
  author: 'Everkinetic',
  license: 'CC BY-SA 3.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/deed.fr',
  origin: 'Wikimedia Commons',
} as const;
/** Dépôt everkinetic/data (GitHub), qui publie les mêmes dessins sous CC BY-SA 4.0. */
const EVERKINETIC_DATA = {
  author: 'Everkinetic',
  license: 'CC BY-SA 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/deed.fr',
  origin: 'everkinetic/data',
} as const;
const COMMONS = 'https://commons.wikimedia.org/wiki/File:';
const EK_DATA = 'https://github.com/everkinetic/data/blob/main/src/images-web/';

function drawn(key: string, title: string, source: typeof EVERKINETIC | typeof EVERKINETIC_DATA, sources: [string, string]): Illustration {
  const file = (name: string) => {
    const url = FILES[`./illustrations/${name}.webp`];
    if (!url) throw new Error(`Illustration absente : ${name}.webp`);
    return url;
  };
  return { src: file(key), thumb: file(`${key}-vignette`), title, ...source, sources };
}

/**
 * Illustration par exercice de la bibliothèque initiale, ou par variante quand une variante a son propre dessin
 * (clé = identifiant de la variante : « mollets-machine--assis »). Une variante sans dessin propre reprend celui de
 * son exercice.
 */
export const ILLUSTRATIONS: Readonly<Record<string, Illustration>> = {
  // Tirage horizontal machine (appui pectoral) : aucun dessin sous licence vérifiable de cette machine → pictogramme.
  'tirage-horizontal-poulie-basse': drawn('tirage-horizontal-poulie-basse', 'Seated cable rows', EVERKINETIC, [`${COMMONS}Seated_cable_rows_1.svg`, `${COMMONS}Seated_cable_rows_2.svg`]),
  'tirage-vertical': drawn('tirage-vertical', 'Wide grip lat pull down', EVERKINETIC, [`${COMMONS}Wide_grip_lat_pull_down_1.svg`, `${COMMONS}Wide_grip_lat_pull_down_2.svg`]),
  'chest-press': drawn('chest-press', 'Machine bench press', EVERKINETIC, [`${COMMONS}Machine_bench_press_1.svg`, `${COMMONS}Machine_bench_press_2.svg`]),
  'pec-deck': drawn('pec-deck', 'Butterfly machine', EVERKINETIC, [`${COMMONS}Butterfly_machine_1.svg`, `${COMMONS}Butterfly_machine_2.svg`]),
  'developpe-couche': drawn('developpe-couche', 'Bench press', EVERKINETIC, [`${COMMONS}Bench_press_1.svg`, `${COMMONS}Bench_press_2.svg`]),
  'developpe-epaules-machine': drawn('developpe-epaules-machine', 'Seated shoulder press machine', EVERKINETIC, [`${COMMONS}Seated_shoulder_press_machine_1.svg`, `${COMMONS}Seated_shoulder_press_machine_2.svg`]),
  'elevations-laterales': drawn('elevations-laterales', 'Lateral dumbbell raises', EVERKINETIC, [`${COMMONS}Lateral_dumbbell_raises_1.svg`, `${COMMONS}Lateral_dumbbell_raises_2.svg`]),
  'curl-biceps-poulie-corde': drawn('curl-biceps-poulie-corde', 'Hammer curls with rope and cable', EVERKINETIC, [`${COMMONS}Hammer_curls_with_rope_and_cable_1.svg`, `${COMMONS}Hammer_curls_with_rope_and_cable_2.svg`]),
  'curl-biceps-halteres': drawn('curl-biceps-halteres', 'Biceps curl with dumbbell', EVERKINETIC, [`${COMMONS}Biceps_curl_with_dumbbell_1.svg`, `${COMMONS}Biceps_curl_with_dumbbell_2.svg`]),
  'curl-biceps-banc-incline': drawn('curl-biceps-banc-incline', 'Alternating incline curl with dumbbell', EVERKINETIC, [`${COMMONS}Alternating_incline_curl_with_dumbbell_1.svg`, `${COMMONS}Alternating_incline_curl_with_dumbbell_2.svg`]),
  // Ce dessin montre une barre droite : il illustre la variante « Barre » (version 8) ; la corde a le sien.
  'extension-triceps-poulie--barre': drawn('extension-triceps-poulie--barre', 'Triceps pushdown with cable', EVERKINETIC, [`${COMMONS}Triceps_pushdown_with_cable_1.svg`, `${COMMONS}Triceps_pushdown_with_cable_2.svg`]),
  'extension-triceps-haltere-assis': drawn('extension-triceps-haltere-assis', 'Seated triceps press with dumbbell', EVERKINETIC, [`${COMMONS}Seated_triceps_press_with_dumbbell_1.svg`, `${COMMONS}Seated_triceps_press_with_dumbbell_2.svg`]),
  'presse-a-cuisses': drawn('presse-a-cuisses', 'Leg-press', EVERKINETIC, [`${COMMONS}Leg-press-1-1024x670.png`, `${COMMONS}Leg-press-2-1024x670.png`]),
  'leg-extension': drawn('leg-extension', 'Leg extensions', EVERKINETIC, [`${COMMONS}Leg_extensions_1.svg`, `${COMMONS}Leg_extensions_2.svg`]),
  'leg-curl': drawn('leg-curl', 'Seated leg curl', EVERKINETIC, [`${COMMONS}Seated_leg_curl_1.svg`, `${COMMONS}Seated_leg_curl_2.svg`]),
  'ecarte-couche-halteres': drawn('ecarte-couche-halteres', 'Dumbbell flys', EVERKINETIC, [`${COMMONS}Dumbbell_flys_1.svg`, `${COMMONS}Dumbbell_flys_2.svg`]),
  'curl-ischios': drawn('curl-ischios', 'Lying leg curl machine', EVERKINETIC, [`${COMMONS}Lying_leg_curl_machine_1.svg`, `${COMMONS}Lying_leg_curl_machine_2.svg`]),
  'curl-biceps-barre-droite': drawn('curl-biceps-barre-droite', 'Wide grip standing biceps curl with barbell', EVERKINETIC, [`${COMMONS}Wide_grip_standing_biceps_curl_with_barbell_1.svg`, `${COMMONS}Wide_grip_standing_biceps_curl_with_barbell_2.svg`]),
  'mollets-machine': drawn('mollets-machine', 'Standing calf raises using machine', EVERKINETIC, [`${COMMONS}Standing_calf_raises_using_machine_1.svg`, `${COMMONS}Standing_calf_raises_using_machine_2.svg`]),
  // Commons n'a qu'une paire incohérente pour ces machines (« Thigh adductor 2.svg » décrit comme abducteur) :
  // les paires correctes viennent du dépôt everkinetic/data. Abducteurs : jambes serrées puis écartées ; adducteurs : l'inverse.
  'abducteurs-machine': drawn('abducteurs-machine', 'Thigh abductor', EVERKINETIC_DATA, [`${EK_DATA}thigh-abductor-1.png`, `${EK_DATA}thigh-abductor-2.png`]),
  'adducteurs-machine': drawn('adducteurs-machine', 'Thigh adductor', EVERKINETIC_DATA, [`${EK_DATA}thigh-adductor-1.png`, `${EK_DATA}thigh-adductor-2.png`]),
  // Version 8. Développé couché haltères, tractions assistées, pull-over à la poulie, face pull, oiseau à la machine et
  // squat kettlebell : aucun dessin fiable (le « Bench press dumbbell » d'Everkinetic montre un banc incliné) → pictogramme.
  'mollets-machine--assis': drawn('mollets-machine--assis', 'Seated calf raise using machine', EVERKINETIC, [`${COMMONS}Seated_calf_raise_using_machine_1.svg`, `${COMMONS}Seated_calf_raise_using_machine_2.svg`]),
  'extension-triceps-poulie': drawn('extension-triceps-poulie', 'Triceps pushdown with rope and cable', EVERKINETIC_DATA, [`${EK_DATA}triceps-pushdown-with-rope-and-cable-1.png`, `${EK_DATA}triceps-pushdown-with-rope-and-cable-2.png`]),
  'developpe-incline': drawn('developpe-incline', 'Incline bench press', EVERKINETIC_DATA, [`${EK_DATA}incline-bench-press-1.png`, `${EK_DATA}incline-bench-press-2.png`]),
  'developpe-incline--halteres': drawn('developpe-incline--halteres', 'Incline dumbbell press', EVERKINETIC_DATA, [`${EK_DATA}incline-dumbbell-press-1.png`, `${EK_DATA}incline-dumbbell-press-2.png`]),
  'ecarte-poulie': drawn('ecarte-poulie', 'Cable crossover', EVERKINETIC_DATA, [`${EK_DATA}cable-crossover-1.png`, `${EK_DATA}cable-crossover-2.png`]),
  'rowing-barre': drawn('rowing-barre', 'Reverse grips bent over barbell rows', EVERKINETIC_DATA, [`${EK_DATA}reverse-grips-bent-over-barbell-rows-1.png`, `${EK_DATA}reverse-grips-bent-over-barbell-rows-2.png`]),
  'lombaires-banc': drawn('lombaires-banc', 'Hyperextensions', EVERKINETIC_DATA, [`${EK_DATA}hyperextensions-1.png`, `${EK_DATA}hyperextensions-2.png`]),
  'shrugs': drawn('shrugs', 'Shoulder shrugs', EVERKINETIC_DATA, [`${EK_DATA}shoulder-shrugs-1.png`, `${EK_DATA}shoulder-shrugs-2.png`]),
  'developpe-militaire-halteres': drawn('developpe-militaire-halteres', 'Dumbbell shoulder press', EVERKINETIC_DATA, [`${EK_DATA}dumbbell-shoulder-press-1.png`, `${EK_DATA}dumbbell-shoulder-press-2.png`]),
  'oiseau--halteres': drawn('oiseau--halteres', 'Bent over rear deltoid raise with head on bench', EVERKINETIC_DATA, [`${EK_DATA}bent-over-rear-deltoid-raise-with-head-on-bench-1.png`, `${EK_DATA}bent-over-rear-deltoid-raise-with-head-on-bench-2.png`]),
  'elevations-frontales': drawn('elevations-frontales', 'Front dumbbell raise', EVERKINETIC_DATA, [`${EK_DATA}front-dumbbell-raise-1.png`, `${EK_DATA}front-dumbbell-raise-2.png`]),
  'curl-marteau': drawn('curl-marteau', 'Bicep hammer curl with dumbbell', EVERKINETIC_DATA, [`${EK_DATA}bicep-hammer-curl-with-dumbbell-1.png`, `${EK_DATA}bicep-hammer-curl-with-dumbbell-2.png`]),
  'curl-pupitre': drawn('curl-pupitre', 'Preacher curl with barbell', EVERKINETIC_DATA, [`${EK_DATA}preacher-curl-with-barbell-1.png`, `${EK_DATA}preacher-curl-with-barbell-2.png`]),
  'curl-biceps-barre-ez': drawn('curl-biceps-barre-ez', 'Ez bar curl with barbell', EVERKINETIC_DATA, [`${EK_DATA}ez-bar-curl-with-barbell-1.png`, `${EK_DATA}ez-bar-curl-with-barbell-2.png`]),
  'barre-au-front': drawn('barre-au-front', 'Lying triceps press with barbell', EVERKINETIC_DATA, [`${EK_DATA}lying-triceps-press-with-barbell-1.png`, `${EK_DATA}lying-triceps-press-with-barbell-2.png`]),
  'kickback': drawn('kickback', 'Triceps kickback with dumbbell', EVERKINETIC, [`${COMMONS}Triceps_kickback_with_dumbbell_1.svg`, `${COMMONS}Triceps_kickback_with_dumbbell_2.svg`]),
  'hack-squat': drawn('hack-squat', 'Hack squat machine', EVERKINETIC_DATA, [`${EK_DATA}hack-squat-machine-1.png`, `${EK_DATA}hack-squat-machine-2.png`]),
};

export function illustrationFor(exerciseId: string, variantId?: string): Illustration | undefined {
  return (variantId ? ILLUSTRATIONS[variantId] : undefined) ?? ILLUSTRATIONS[exerciseId];
}
