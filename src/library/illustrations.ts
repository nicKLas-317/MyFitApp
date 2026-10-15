/**
 * Illustrations embarquées (§4.0.1) : dessins au trait d'Everkinetic, CC BY-SA 3.0, via Wikimedia Commons.
 * Chaque image assemble les positions de début et de fin (fichiers « 1 » et « 2 » de Commons), recadrées
 * et converties en WebP. Sources et licences : docs/illustrations.md. Un exercice absent garde son pictogramme.
 */
import tirageHorizontal from './illustrations/tirage-horizontal.webp';
import tirageHorizontalThumb from './illustrations/tirage-horizontal-vignette.webp';
import tirageVertical from './illustrations/tirage-vertical.webp';
import tirageVerticalThumb from './illustrations/tirage-vertical-vignette.webp';
import chestPress from './illustrations/chest-press.webp';
import chestPressThumb from './illustrations/chest-press-vignette.webp';
import pecDeck from './illustrations/pec-deck.webp';
import pecDeckThumb from './illustrations/pec-deck-vignette.webp';
import developpeCouche from './illustrations/developpe-couche.webp';
import developpeCoucheThumb from './illustrations/developpe-couche-vignette.webp';
import developpeEpaulesMachine from './illustrations/developpe-epaules-machine.webp';
import developpeEpaulesMachineThumb from './illustrations/developpe-epaules-machine-vignette.webp';
import elevationsLaterales from './illustrations/elevations-laterales.webp';
import elevationsLateralesThumb from './illustrations/elevations-laterales-vignette.webp';
import curlBicepsPoulieCorde from './illustrations/curl-biceps-poulie-corde.webp';
import curlBicepsPoulieCordeThumb from './illustrations/curl-biceps-poulie-corde-vignette.webp';
import curlBicepsHalteres from './illustrations/curl-biceps-halteres.webp';
import curlBicepsHalteresThumb from './illustrations/curl-biceps-halteres-vignette.webp';
import curlBicepsBancIncline from './illustrations/curl-biceps-banc-incline.webp';
import curlBicepsBancInclineThumb from './illustrations/curl-biceps-banc-incline-vignette.webp';
import extensionTricepsPoulie from './illustrations/extension-triceps-poulie.webp';
import extensionTricepsPoulieThumb from './illustrations/extension-triceps-poulie-vignette.webp';
import extensionTricepsHaltereAssis from './illustrations/extension-triceps-haltere-assis.webp';
import extensionTricepsHaltereAssisThumb from './illustrations/extension-triceps-haltere-assis-vignette.webp';
import presseACuisses from './illustrations/presse-a-cuisses.webp';
import presseACuissesThumb from './illustrations/presse-a-cuisses-vignette.webp';
import legExtension from './illustrations/leg-extension.webp';
import legExtensionThumb from './illustrations/leg-extension-vignette.webp';
import legCurl from './illustrations/leg-curl.webp';
import legCurlThumb from './illustrations/leg-curl-vignette.webp';
import curlIschios from './illustrations/curl-ischios.webp';
import curlIschiosThumb from './illustrations/curl-ischios-vignette.webp';
import ecarteCoucheHalteres from './illustrations/ecarte-couche-halteres.webp';
import ecarteCoucheHalteresThumb from './illustrations/ecarte-couche-halteres-vignette.webp';

export interface Illustration {
  src: string;
  thumb: string;
  /** Titre de l'œuvre d'origine (Wikimedia Commons). */
  title: string;
  author: string;
  license: string;
  licenseUrl: string;
  /** Pages Commons des deux fichiers d'origine (début et fin du mouvement). */
  sources: [string, string];
}

const EVERKINETIC = { author: 'Everkinetic', license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/deed.fr' } as const;

/** Illustration par exercice de la bibliothèque initiale ; ses variantes partagent la même image. */
export const ILLUSTRATIONS: Readonly<Record<string, Illustration>> = {
  'tirage-horizontal': { src: tirageHorizontal, thumb: tirageHorizontalThumb, title: 'Seated cable rows', ...EVERKINETIC, sources: ['https://commons.wikimedia.org/wiki/File:Seated_cable_rows_1.svg', 'https://commons.wikimedia.org/wiki/File:Seated_cable_rows_2.svg'] },
  'tirage-vertical': { src: tirageVertical, thumb: tirageVerticalThumb, title: 'Wide grip lat pull down', ...EVERKINETIC, sources: ['https://commons.wikimedia.org/wiki/File:Wide_grip_lat_pull_down_1.svg', 'https://commons.wikimedia.org/wiki/File:Wide_grip_lat_pull_down_2.svg'] },
  'chest-press': { src: chestPress, thumb: chestPressThumb, title: 'Machine bench press', ...EVERKINETIC, sources: ['https://commons.wikimedia.org/wiki/File:Machine_bench_press_1.svg', 'https://commons.wikimedia.org/wiki/File:Machine_bench_press_2.svg'] },
  'pec-deck': { src: pecDeck, thumb: pecDeckThumb, title: 'Butterfly machine', ...EVERKINETIC, sources: ['https://commons.wikimedia.org/wiki/File:Butterfly_machine_1.svg', 'https://commons.wikimedia.org/wiki/File:Butterfly_machine_2.svg'] },
  'developpe-couche': { src: developpeCouche, thumb: developpeCoucheThumb, title: 'Bench press', ...EVERKINETIC, sources: ['https://commons.wikimedia.org/wiki/File:Bench_press_1.svg', 'https://commons.wikimedia.org/wiki/File:Bench_press_2.svg'] },
  'developpe-epaules-machine': { src: developpeEpaulesMachine, thumb: developpeEpaulesMachineThumb, title: 'Seated shoulder press machine', ...EVERKINETIC, sources: ['https://commons.wikimedia.org/wiki/File:Seated_shoulder_press_machine_1.svg', 'https://commons.wikimedia.org/wiki/File:Seated_shoulder_press_machine_2.svg'] },
  'elevations-laterales': { src: elevationsLaterales, thumb: elevationsLateralesThumb, title: 'Lateral dumbbell raises', ...EVERKINETIC, sources: ['https://commons.wikimedia.org/wiki/File:Lateral_dumbbell_raises_1.svg', 'https://commons.wikimedia.org/wiki/File:Lateral_dumbbell_raises_2.svg'] },
  'curl-biceps-poulie-corde': { src: curlBicepsPoulieCorde, thumb: curlBicepsPoulieCordeThumb, title: 'Hammer curls with rope and cable', ...EVERKINETIC, sources: ['https://commons.wikimedia.org/wiki/File:Hammer_curls_with_rope_and_cable_1.svg', 'https://commons.wikimedia.org/wiki/File:Hammer_curls_with_rope_and_cable_2.svg'] },
  'curl-biceps-halteres': { src: curlBicepsHalteres, thumb: curlBicepsHalteresThumb, title: 'Biceps curl with dumbbell', ...EVERKINETIC, sources: ['https://commons.wikimedia.org/wiki/File:Biceps_curl_with_dumbbell_1.svg', 'https://commons.wikimedia.org/wiki/File:Biceps_curl_with_dumbbell_2.svg'] },
  'curl-biceps-banc-incline': { src: curlBicepsBancIncline, thumb: curlBicepsBancInclineThumb, title: 'Alternating incline curl with dumbbell', ...EVERKINETIC, sources: ['https://commons.wikimedia.org/wiki/File:Alternating_incline_curl_with_dumbbell_1.svg', 'https://commons.wikimedia.org/wiki/File:Alternating_incline_curl_with_dumbbell_2.svg'] },
  'extension-triceps-poulie': { src: extensionTricepsPoulie, thumb: extensionTricepsPoulieThumb, title: 'Triceps pushdown with cable', ...EVERKINETIC, sources: ['https://commons.wikimedia.org/wiki/File:Triceps_pushdown_with_cable_1.svg', 'https://commons.wikimedia.org/wiki/File:Triceps_pushdown_with_cable_2.svg'] },
  'extension-triceps-haltere-assis': { src: extensionTricepsHaltereAssis, thumb: extensionTricepsHaltereAssisThumb, title: 'Seated triceps press with dumbbell', ...EVERKINETIC, sources: ['https://commons.wikimedia.org/wiki/File:Seated_triceps_press_with_dumbbell_1.svg', 'https://commons.wikimedia.org/wiki/File:Seated_triceps_press_with_dumbbell_2.svg'] },
  'presse-a-cuisses': { src: presseACuisses, thumb: presseACuissesThumb, title: 'Leg-press', ...EVERKINETIC, sources: ['https://commons.wikimedia.org/wiki/File:Leg-press-1-1024x670.png', 'https://commons.wikimedia.org/wiki/File:Leg-press-2-1024x670.png'] },
  'leg-extension': { src: legExtension, thumb: legExtensionThumb, title: 'Leg extensions', ...EVERKINETIC, sources: ['https://commons.wikimedia.org/wiki/File:Leg_extensions_1.svg', 'https://commons.wikimedia.org/wiki/File:Leg_extensions_2.svg'] },
  'leg-curl': { src: legCurl, thumb: legCurlThumb, title: 'Seated leg curl', ...EVERKINETIC, sources: ['https://commons.wikimedia.org/wiki/File:Seated_leg_curl_1.svg', 'https://commons.wikimedia.org/wiki/File:Seated_leg_curl_2.svg'] },
  'ecarte-couche-halteres': { src: ecarteCoucheHalteres, thumb: ecarteCoucheHalteresThumb, title: 'Dumbbell flys', ...EVERKINETIC, sources: ['https://commons.wikimedia.org/wiki/File:Dumbbell_flys_1.svg', 'https://commons.wikimedia.org/wiki/File:Dumbbell_flys_2.svg'] },
  'curl-ischios': { src: curlIschios, thumb: curlIschiosThumb, title: 'Lying leg curl machine', ...EVERKINETIC, sources: ['https://commons.wikimedia.org/wiki/File:Lying_leg_curl_machine_1.svg', 'https://commons.wikimedia.org/wiki/File:Lying_leg_curl_machine_2.svg'] },
};

export function illustrationFor(exerciseId: string): Illustration | undefined {
  return ILLUSTRATIONS[exerciseId];
}
