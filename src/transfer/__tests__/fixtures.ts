/** Bloc de notes du §11.3. */
export const NOTES_11_3 = `Seated row horizontal
3x8x48kg =

Epaules latéral raise
3x8x9kgs ++

Biceps poulie corde
3×8x15 kgs ++

Biceps curl banc incliné 70°
3×8×10 kgs -=

Lat pulldown vertical
3×9×36 kgs -=

Triceps sur banc assis 1 haltere
3x8x14 kgs ++`;

/** Deuxième jeu d'exemple (anonymisé), avec les mêmes cas que des notes réelles. */
export const NOTES_EXEMPLE_2 = `Développé épaules
3x8x38    =
Dips assistés
3×8×27 =
Triceps sur banc 1 haltere
3x8x14 kgs ++
Chest press
3x8x47gs +=
Lat pull tirage vertical prise très large
3x8×41   =
Écarté sur banc à plat avec halteres (pectoraux)
3x8x9 =`;

/**
 * Choix faits dans l'aperçu d'import pour les noms qui n'indiquent pas le matériel
 * (exemple : « Epaules latéral raise » rattaché à la machine).
 */
export const EXAMPLE_CHOICES: Readonly<Record<string, string>> = {
  'Epaules latéral raise': 'elevations-laterales-machine',
};

/** Applique les choix d'exemple aux exercices restés sans choix dans un brouillon. */
export function withExampleChoices<T extends { exercises: { sourceName: string; choice: unknown }[] }>(draft: T): T {
  return {
    ...draft,
    exercises: draft.exercises.map((e) =>
      e.choice === null && EXAMPLE_CHOICES[e.sourceName] ? { ...e, choice: { kind: 'variant', variantId: EXAMPLE_CHOICES[e.sourceName] } } : e,
    ),
  };
}
