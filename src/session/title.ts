/**
 * Nom affiché d'une séance (version 1.32.0) : le lieu, puis les groupes principaux travaillés, du plus au moins de
 * séries, 3 au plus (« Salle · Pectoraux · Triceps · Jambes », « Maison · Pectoraux · Abdos ») ; « Salle · Cardio »
 * sans musculation. Calculé à l'affichage, jamais enregistré : il suit les corrections, les ajouts et le lieu. Un nom
 * donné à la main est affiché tel quel.
 */
import type { MuscleGroup, Session } from '../domain/types';
import { MUSCLE_GROUP_LABELS } from '../library/seed';
import { defaultSessionName, importedSessionName } from './format';

/** Nombre de groupes au plus dans le nom. */
export const TITLE_MAX_GROUPS = 3;

/** Sous-groupes des jambes : nommés « Jambes ». */
const PARENT_GROUP: Partial<Record<MuscleGroup, MuscleGroup>> = {
  quadriceps: 'jambes',
  'ischio-jambiers': 'jambes',
  mollets: 'jambes',
  fessiers: 'jambes',
  adducteurs: 'jambes',
};

const LABELS: Record<MuscleGroup, string> = { ...MUSCLE_GROUP_LABELS, abdominaux: 'Abdos' };

/**
 * Nom enregistré par défaut (« Séance du 12 octobre 2026 — 15 h 45 », « Séance du 12 octobre 2026 » d'une séance
 * importée) : la séance n'a pas été renommée à la main. Toutes les séances enregistrées avant la version 1.32.0
 * gardent ce nom en base.
 */
export function isDefaultSessionName(name: string): boolean {
  return /^Séance du \d{1,2}(er)? [a-zéû]+ \d{4}( — \d{1,2} h \d{2})?$/.test(name.trim());
}

/** Nom calculé : lieu, puis groupes principaux par nombre de séries décroissant (ordre de la séance à égalité). */
export function autoSessionTitle(session: Session, primaryGroupOf: (variantId: string) => MuscleGroup | undefined): string {
  const place = session.location === 'maison' ? 'Maison' : 'Salle';
  const sets = new Map<MuscleGroup, number>();
  for (const p of session.performances) {
    // Un exercice sans série ne compte pas ; une performance partielle importée (poids sans répétitions) compte.
    if (p.reps.length === 0 && !p.partial) continue;
    const group = primaryGroupOf(p.variantId);
    if (!group) continue;
    const key = PARENT_GROUP[group] ?? group;
    sets.set(key, (sets.get(key) ?? 0) + p.reps.length);
  }
  const groups = [...sets.entries()]
    .map(([group, n], i) => ({ group, n, i }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .slice(0, TITLE_MAX_GROUPS)
    .map(({ group }) => LABELS[group]);
  if (groups.length > 0) return [place, ...groups].join(' · ');
  return (session.cardio ?? []).length > 0 ? `${place} · Cardio` : place;
}

/** Nom affiché : le nom donné à la main, sinon le nom calculé. */
export function sessionTitle(session: Session, primaryGroupOf: (variantId: string) => MuscleGroup | undefined): string {
  return isDefaultSessionName(session.name) ? autoSessionTitle(session, primaryGroupOf) : session.name;
}

/** Nom par défaut à enregistrer quand la séance reprend son nom calculé. */
export function storedDefaultName(session: Session): string {
  return session.startedAt !== null ? defaultSessionName(session.startedAt) : importedSessionName(session.date);
}
