import type { Exercise } from '../domain/types';
import { ExercisePicto } from './Pictogram';

/**
 * Vignette et nom d'un exercice d'une séance prévue ou de la suggestion (version 1.48.0) : un appui ouvre sa fiche, et
 * le retour ramène exactement où l'on était (position, suivie par la navigation, et saisie en cours, `useEntryMemory`). Seule cette zone ouvre la
 * fiche : les autres appuis de la carte (menu, flèches, cible) ne changent pas. 48 px de haut au moins.
 */
export function SheetLink({ variantId, exercise, name, className = '' }: { variantId: string; exercise?: Exercise; name: string; className?: string }) {
  return (
    <a className={`sheet-link${className ? ` ${className}` : ''}`} href={`#/exercice/${encodeURIComponent(variantId)}`}>
      {exercise && <ExercisePicto exercise={exercise} variantId={variantId} />}
      <strong>{name}</strong>
    </a>
  );
}
