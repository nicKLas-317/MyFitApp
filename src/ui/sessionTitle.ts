import type { Session } from '../domain/types';
import type { VariantRef } from '../library/catalog';
import { autoSessionTitle, sessionTitle } from '../session/title';

const groupOf = (variants: ReadonlyMap<string, VariantRef>) => (variantId: string) => variants.get(variantId)?.exercise.primaryGroup;

/** Nom affiché d'une séance (version 1.32.0) : le nom donné à la main, sinon « Salle · Pectoraux · Triceps ». */
export function titleOf(session: Session, variants: ReadonlyMap<string, VariantRef>): string {
  return sessionTitle(session, groupOf(variants));
}

/** Nom calculé, même si la séance a été renommée : nom à garder pour qu'elle reprenne le nom calculé. */
export function autoTitleOf(session: Session, variants: ReadonlyMap<string, VariantRef>): string {
  return autoSessionTitle(session, groupOf(variants));
}
