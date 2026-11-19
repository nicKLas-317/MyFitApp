/**
 * Export « coach » (§19.13, version 1.55.0) : la bibliothèque, tous les exercices disponibles dans l'appli (bibliothèque
 * et exercices personnalisés, archivés exclus), même jamais faits, pour qu'un coach puisse proposer un exercice de la
 * liste. Une ligne par exercice, groupée par groupe principal : variantes, type, groupes secondaires, sous-groupes et
 * articulations avec leurs poids (les mêmes que les calculs de l'appli), et « déjà fait ». Format compact : poids en
 * texte (« dos largeur 1, biceps brachial ½ »), pour qu'un exercice tienne sur une ligne. Calcul pur.
 */
import { MAIN_GROUPS, parentGroup } from '../domain/muscleGroups';
import type { Exercise, Performance, Session } from '../domain/types';
import { resolveConfig, type EngineSettings } from '../engine';
import { variantLabel, type VariantRef } from '../library/catalog';
import { SEED_EXERCISES } from '../library/seed';
import { groupLabel, typeOf } from './coachFormat';
import { exerciseJoints, JOINT_LABELS, JOINTS } from './jointAlerts';
import { groupOfSubGroup, SUB_GROUPS, subGroupWeights, type SubGroup, type SubGroupWeights } from './subGroups';

const SEED_IDS = new Set(SEED_EXERCISES.map((e) => e.id));

/** Poids d'une série : « 1 », « ½ », « ¼ », sinon deux décimales au plus (répartition égale : « 0,33 »). */
export function weightText(w: number): string {
  if (w === 0.5) return '½';
  if (w === 0.25) return '¼';
  return String(Math.round(w * 100) / 100).replace('.', ',');
}

/** Nom d'un sous-groupe dans l'export : « dos largeur », « biceps brachial » ; les sous-groupes des jambes seuls. */
export function subGroupName(sub: SubGroup): string {
  const group = groupOfSubGroup(sub);
  const info = SUB_GROUPS[group]!.find((s) => s.id === sub)!;
  return group === 'jambes' ? info.label.toLowerCase() : `${groupLabel(group).toLowerCase()} ${info.short}`;
}

/**
 * « dos épaisseur 1, épaules arrière ½, biceps brachial ½ » : le groupe principal d'abord, puis l'ordre des groupes ;
 * dans un groupe, la partie visée avant les autres (« biceps brachial 1, biceps longue ½ »), puis l'ordre des parties.
 */
export function subGroupsText(weights: SubGroupWeights, primary: string): string {
  const groupRank = (sub: SubGroup) => {
    const g = groupOfSubGroup(sub);
    return g === primary ? -1 : MAIN_GROUPS.indexOf(g);
  };
  const subRank = (sub: SubGroup) => SUB_GROUPS[groupOfSubGroup(sub)]!.findIndex((s) => s.id === sub);
  return (Object.entries(weights) as [SubGroup, number][])
    .filter(([, w]) => w > 0)
    .sort(([a, wa], [b, wb]) => groupRank(a) - groupRank(b) || wb - wa || subRank(a) - subRank(b))
    .map(([sub, w]) => `${subGroupName(sub)} ${weightText(w)}`)
    .join(', ');
}

/** « épaule 1, coude ½ », ou « aucune ». */
export function jointsText(exercise: Exercise): string {
  const weights = exerciseJoints(exercise);
  const parts = JOINTS.filter((j) => (weights[j] ?? 0) > 0).map((j) => `${JOINT_LABELS[j].toLowerCase()} ${weightText(weights[j]!)}`);
  return parts.length > 0 ? parts.join(', ') : 'aucune';
}

/** Une valeur par variante : la même pour toutes, sinon « Barre : … ; Haltères : … ». */
function perVariant(values: { label: string; value: string }[], separator: string): string {
  if (new Set(values.map((v) => v.value)).size <= 1) return values[0]?.value ?? '';
  return values.map((v) => `${v.label}${separator}${v.value}`).join(' ; ');
}

/** Exercices-variantes faits au moins une fois (séance terminée, performance avec séries ou partielle). */
function doneVariants(sessions: readonly Session[]): Set<string> {
  const done = new Set<string>();
  const counts = (p: Performance) => p.reps.length > 0 || p.partial === true;
  for (const s of sessions) if (s.state === 'done') for (const p of s.performances) if (counts(p)) done.add(p.variantId);
  return done;
}

/**
 * La bibliothèque, par groupe principal (ordre des groupes, puis nom) : `sessions` sont les séances déjà arrêtées à la
 * fin de la semaine exportée.
 */
export function coachLibrary(exercises: readonly Exercise[], settings: EngineSettings, sessions: readonly Session[]) {
  const done = doneVariants(sessions);
  const out: Record<string, object[]> = {};
  const sorted = exercises
    .filter((e) => !e.archived && e.variants.some((v) => !v.archived))
    .sort((a, b) => {
      const ga = MAIN_GROUPS.indexOf(parentGroup(a.primaryGroup));
      const gb = MAIN_GROUPS.indexOf(parentGroup(b.primaryGroup));
      return (ga < 0 ? MAIN_GROUPS.length : ga) - (gb < 0 ? MAIN_GROUPS.length : gb) || a.name.localeCompare(b.name, 'fr');
    });
  for (const e of sorted) {
    const variants = e.variants.filter((v) => !v.archived);
    const refs: VariantRef[] = variants.map((variant) => ({ exercise: e, variant }));
    const labels = refs.map((r) => variantLabel(r));
    const label = (i: number) => labels[i] ?? 'Standard';
    const primary = parentGroup(e.primaryGroup);
    const secondary = [...new Set(e.secondaryGroups)].filter((g) => g !== e.primaryGroup).map(groupLabel);
    const named = labels.some((l) => l !== null);
    const madeIdx = variants.map((v, i) => (done.has(v.id) ? i : -1)).filter((i) => i >= 0);
    const entry = {
      nom: e.name,
      ...(primary !== e.primaryGroup ? { groupe: groupLabel(e.primaryGroup) } : {}),
      ...(SEED_IDS.has(e.id) ? {} : { personnalise: true }),
      ...(secondary.length > 0 ? { secondaires: secondary } : {}),
      type: perVariant(refs.map((r, i) => ({ label: label(i), value: typeOf(resolveConfig(settings, r.variant.id), r) })), ' : '),
      sous_groupes: perVariant(variants.map((v, i) => ({ label: label(i), value: subGroupsText(subGroupWeights(e, v), primary) })), ' : '),
      articulations: jointsText(e),
      deja_fait: madeIdx.length > 0,
      ...(named ? { variantes: labels.map((_, i) => label(i)) } : {}),
      ...(named && madeIdx.length > 0 && madeIdx.length < variants.length ? { variantes_faites: madeIdx.map(label) } : {}),
    };
    (out[groupLabel(primary)] ??= []).push(entry);
  }
  return out;
}
