/**
 * Export complet et import JSON (§11.9, §11.10).
 * - schemaVersion 7 : format natif complet, restauré tel quel après validation stricte (blocs de cardio dans les séances,
 *   activités habituelles hors salle et leurs réponses, séance prévue en un seul ordre, musculation et cardio mêlés,
 *   lieu des séances : `location` « maison », absent = salle ; séance complétée le jour même : `pauseMs`, et `locked`
 *   tant qu'elle est en cours ; éléments remis à plus tard : `later`, pendant la séance seulement, version 1.29.0).
 * - schemaVersion 6 : identique, sans séance complétée ; lu tel quel.
 * - schemaVersion 5 : identique, sans lieu (toutes les séances sont à la salle) ; lu tel quel.
 * - schemaVersion 4 : séance prévue en deux listes (exercices, puis cardio), versions 1.23.0 et 1.23.1 ; migrée sans perte.
 * - schemaVersion 3 : format natif antérieur aux activités habituelles, migré sans perte (aucune activité).
 * - schemaVersion 2 : format natif antérieur au cardio, migré sans perte (les séances n'ont simplement pas de cardio).
 * - schemaVersion 1 : format simple (ex. `docs/exemples/seance-exemple-1.json`), adapté en brouillons à vérifier.
 * - Autre JSON : structure détectée si possible, sinon erreur détaillée. Jamais d'échec silencieux.
 * Aucune fonction de ce module n'écrit : l'import passe par un plan appliqué en une seule transaction.
 */
import type { CardioMachine, Exercise } from '../domain/types';
import { DEFAULT_CARDIO_MACHINES } from '../cardio/model';
import { redefineSeedExercises } from '../library/seed';
import { EMPTY_BODY, type BodyTracking } from '../body/model';
import type { ActivityRecord } from '../activities/model';
import type { SessionPlan, Session } from '../domain/types';
import { migratePlan } from '../plan/model';
import { localDate } from '../session/format';
import type { DraftSession } from './draft';
import { fixPlusEqualFeelings } from './feelings';
import { APP_ID, FIRST_NATIVE_VERSION, SCHEMA_VERSION, type Backup } from './backupFormat';
import { validateBackup } from './backupValidate';
import { isInt, isObj, type Obj } from './jsonGuards';
import { findSessions, readSession } from './simpleJson';

export { EMPTY_BODY, type BodyTracking };
// Version 1.55.1 : format, validation, lecture d'un JSON simple, plan d'import et rappel de sauvegarde dans leurs modules.
export { APP_ID, SCHEMA_VERSION, type Backup };

export function buildBackup(
  data: {
    sessions: readonly Session[];
    exercises: readonly Exercise[];
    bodyTracking?: BodyTracking;
    settings?: Record<string, unknown>;
    activities?: readonly ActivityRecord[];
    plan?: SessionPlan | null;
  },
  now: number,
): Backup {
  return {
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date(now).toISOString(),
    sessions: [...data.sessions],
    exercises: [...data.exercises],
    settings: { ...data.settings },
    bodyTracking: data.bodyTracking ?? EMPTY_BODY,
    activities: [...(data.activities ?? [])],
    plan: data.plan ?? null,
  };
}

export function backupFileName(now: number): string {
  return `myfitapp-sauvegarde-${localDate(now)}.json`;
}

// ——— Lecture ————————————————————————————————————————————————————

export type ParsedImport =
  | { kind: 'backup'; backup: Backup }
  | { kind: 'drafts'; drafts: DraftSession[]; format: 'simple' | 'detected'; notes: string[] }
  | { kind: 'error'; message: string; details: string[] };


/**
 * Migre une sauvegarde native validée vers le format actuel.
 * 2 → 3 : ajout du cardio, champ facultatif des séances ; rien d'autre ne change.
 * 3 → 4 : ajout des activités habituelles (aucune dans une sauvegarde antérieure).
 * 4 sans `plan` (avant la version 1.23.0) : aucune séance prévue.
 * 4 → 5 : la séance prévue passe en un seul ordre (`items`), la musculation d'abord puis le cardio, comme elle était
 * affichée ; identifiant, dates, exercices et blocs inchangés.
 * Toutes versions : une performance « += » enregistrée avec un autre ressenti que Moyen est corrigée (§7.3).
 */
export function migrateBackup(data: Obj): Backup {
  const backup = data as unknown as Backup;
  const fixed = new Map(fixPlusEqualFeelings(backup.sessions).map((s) => [s.id, s]));
  return {
    ...backup,
    // Une sauvegarde antérieure à la bibliothèque version 9 reçoit le tirage horizontal machine (appui pectoral).
    exercises: redefineSeedExercises(backup.exercises),
    sessions: backup.sessions.map((s) => fixed.get(s.id) ?? s),
    activities: backup.activities ?? [],
    plan: migratePlan(backup.plan),
    schemaVersion: SCHEMA_VERSION,
  };
}

/**
 * Analyse un contenu JSON collé ou chargé. `exercises` : bibliothèque locale (rapprochement des noms) ;
 * `machines` : machines de cardio des réglages (rapprochement du cardio d'un JSON simple).
 */
export function parseJsonImport(
  text: string,
  exercises: readonly Exercise[],
  today: string,
  machines: readonly CardioMachine[] = DEFAULT_CARDIO_MACHINES,
): ParsedImport {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return {
      kind: 'error',
      message: 'Le contenu n’est pas un JSON valide. Aucune donnée n’a été modifiée.',
      details: [error instanceof Error ? error.message : String(error)],
    };
  }

  if (isObj(data) && 'schemaVersion' in data) {
    const version = data.schemaVersion;
    if (!isInt(version) || version < 1) {
      return { kind: 'error', message: 'Version de format illisible.', details: [`schemaVersion : ${JSON.stringify(version)}`] };
    }
    if (version > SCHEMA_VERSION) {
      return {
        kind: 'error',
        message: `Ce fichier vient d’une version plus récente de MyFitApp (format ${version}). Mets l’application à jour avant de l’importer.`,
        details: [],
      };
    }
    if (version >= FIRST_NATIVE_VERSION) {
      const errors = validateBackup(data);
      if (errors.length > 0) {
        return { kind: 'error', message: 'Sauvegarde MyFitApp invalide : rien n’a été importé.', details: errors.slice(0, 20) };
      }
      return { kind: 'backup', backup: migrateBackup(data) };
    }
  }

  // Format simple (version 1) ou structure inconnue : adaptation en brouillons à vérifier.
  const simple = isObj(data) && data.schemaVersion === 1;
  const rawSessions = findSessions(data);
  if (!rawSessions || rawSessions.length === 0) {
    return {
      kind: 'error',
      message: 'Structure JSON non reconnue : aucune séance trouvée. Aucune donnée n’a été modifiée.',
      details: [
        'Attendu : une sauvegarde MyFitApp, ou une liste de séances comportant chacune une date et une liste d’exercices (nom, poids, répétitions).',
      ],
    };
  }
  const notes: string[] = [];
  const drafts: DraftSession[] = [];
  rawSessions.forEach((raw, i) => {
    const result = readSession(raw, i, exercises, today, machines);
    if (typeof result === 'string') notes.push(result);
    else drafts.push(result);
  });
  if (drafts.length === 0) {
    return { kind: 'error', message: 'Aucune séance exploitable dans ce JSON.', details: notes };
  }
  notes.unshift(
    simple
      ? `Format simple (version 1) : ${drafts.length} séance${drafts.length > 1 ? 's' : ''} à vérifier avant l’import.`
      : `Format inconnu : ${drafts.length} séance${drafts.length > 1 ? 's' : ''} détectée${drafts.length > 1 ? 's' : ''} automatiquement. Vérifie l’interprétation.`,
  );
  return { kind: 'drafts', drafts, format: simple ? 'simple' : 'detected', notes };
}
