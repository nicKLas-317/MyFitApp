import { describe, expect, it } from 'vitest';
import type { CardioBlock, Exercise, MuscleGroup, Performance, Session } from '../../domain/types';
import { DEFAULT_VARIANT_CONFIG, rebuildProfile } from '../../engine';
import { buildEngineSettings } from '../../library/catalog';
import { SEED_EXERCISES } from '../../library/seed';
import { addCardio } from '../../cardio/model';
import { correctPerformance, removePastPerformance, searchSessions, setSessionLocation } from '../../history/ops';
import { buildBackup, parseJsonImport } from '../../transfer/backup';
import { defaultSessionName, importedSessionName } from '../format';
import { addExercise, finishSession, recordRemainingSets, renameSession, reopenSession, startSession, type VariantContext } from '../ops';
import { autoSessionTitle, isDefaultSessionName, sessionTitle } from '../title';

const LIB: Exercise[] = [...SEED_EXERCISES];
const settings = buildEngineSettings(LIB);
const GROUPS = new Map<string, MuscleGroup>(LIB.flatMap((e) => e.variants.map((v) => [v.id, e.primaryGroup] as const)));
const groupOf = (id: string) => (id === 'perso-quadri' ? 'quadriceps' : GROUPS.get(id));
const title = (s: Session) => sessionTitle(s, groupOf);
const auto = (s: Session) => autoSessionTitle(s, groupOf);
const T = new Date(2026, 9, 19, 17, 5).getTime();
const TAPIS: CardioBlock = { id: 'tapis', machineId: 'tapis', machine: 'Tapis de marche', minutes: 15, incline: 'neutre' };

const perf = (variantId: string, sets: number, extra: Partial<Performance> = {}): Performance => ({
  variantId, weightKg: 20, targetReps: 10, plannedSets: 3, reps: Array<number>(sets).fill(10), feeling: 'bien', ...extra,
});
function done(performances: Performance[], extra: Partial<Session> = {}): Session {
  return {
    id: 's', name: defaultSessionName(T), date: '2026-10-19', startedAt: T, endedAt: T + 3_600_000, createdAt: T, updatedAt: T, origin: 'app', state: 'done',
    performances, ...extra,
  };
}

describe('Nom de séance calculé (version 1.32.0)', () => {
  it('278. Lieu puis groupes principaux, du plus au moins de séries, 3 au plus ; « Abdos », sous-groupes en « Jambes », cardio seul « Salle · Cardio » ; nom donné à la main gardé ; suit corrections, lieu et complément, sans rien réécrire ; moteur identique', () => {
    // Le nom enregistré par défaut, à la création ou à l'import, désigne une séance non renommée.
    expect(isDefaultSessionName(defaultSessionName(T))).toBe(true);
    expect(isDefaultSessionName(defaultSessionName(new Date(2026, 7, 1, 9, 0).getTime()))).toBe(true);
    expect(isDefaultSessionName(importedSessionName('2026-10-19'))).toBe(true);
    for (const n of ['Haut du corps', 'Séance du matin', 'Pectoraux et dos', 'Séance du 19 octobre 2026 avec Paul']) expect(isDefaultSessionName(n), n).toBe(false);

    // Du plus au moins de séries : jambes 6 (presse 3 + leg extension 3), pectoraux 4, triceps 2.
    const salle = done([perf('pec-deck', 2), perf('chest-press', 2), perf('extension-triceps-poulie', 2), perf('presse-a-cuisses', 3), perf('leg-extension', 3)]);
    expect(title(salle)).toBe('Salle · Jambes · Pectoraux · Triceps');
    // Égalité : ordre de la séance. Les groupes secondaires ne comptent pas (développé incliné : pectoraux seul).
    expect(title(done([perf('developpe-incline', 3), perf('extension-triceps-poulie', 3), perf('leg-curl', 3)]))).toBe('Salle · Pectoraux · Triceps · Jambes');
    expect(title(done([perf('tractions-assistees', 3)]))).toBe('Salle · Dos');
    // 3 groupes au plus : le quatrième (le moins de séries) n'est pas nommé.
    expect(title(done([perf('pec-deck', 3), perf('tirage-vertical', 3), perf('curl-biceps-halteres', 2), perf('extension-triceps-poulie', 1)]))).toBe('Salle · Pectoraux · Dos · Biceps');
    // Maison ; abdominaux : « Abdos » ; pompes (2 séries) : pectoraux.
    expect(title(done([perf('pompes', 2, { weightKg: 0 }), perf('crunch-sol', 3, { weightKg: 0 }), perf('developpe-incline--halteres', 3)], { location: 'maison' }))).toBe('Maison · Pectoraux · Abdos');
    // Sous-groupe des jambes (exercice personnalisé) : « Jambes », additionné aux jambes.
    expect(title(done([perf('perso-quadri', 2), perf('pec-deck', 3), perf('leg-curl', 2)]))).toBe('Salle · Jambes · Pectoraux');
    // Sans musculation : « Salle · Cardio », « Maison · Cardio » ; un exercice sans série ne compte pas.
    expect(title(done([], { cardio: [TAPIS] }))).toBe('Salle · Cardio');
    expect(title(done([perf('pec-deck', 0)], { cardio: [TAPIS], location: 'maison' }))).toBe('Maison · Cardio');
    expect(title(done([perf('pec-deck', 0), perf('leg-curl', 3)]))).toBe('Salle · Jambes');
    // Séance importée : nom par défaut sans heure ; une performance partielle (poids sans répétitions) compte.
    const imported = done([perf('pec-deck', 0, { partial: true, reps: [] })], { name: importedSessionName('2026-10-19'), origin: 'import', startedAt: null, endedAt: null });
    expect(title(imported)).toBe('Salle · Pectoraux');
    // Séance qui démarre : rien de fait, le lieu seul ; il se complète au fil des séries.
    const started = startSession(T, 'en-cours');
    expect(title(started)).toBe('Salle');
    const ctx: VariantContext = { state: undefined, cfg: DEFAULT_VARIANT_CONFIG };
    let live = addExercise(started, 'pec-deck', ctx, T, 30).session;
    expect(title(live)).toBe('Salle');
    live = recordRemainingSets(live, 'pec-deck', T + 60_000);
    expect(title(live)).toBe('Salle · Pectoraux');

    // Nom donné à la main : affiché tel quel, quel que soit le contenu.
    expect(title({ ...salle, name: 'Haut du corps' })).toBe('Haut du corps');

    // Le nom suit la séance, sans que le nom enregistré change : correction, retrait, lieu, complément.
    const fixed = correctPerformance(salle, 'presse-a-cuisses', { reps: [10] }, T).session;
    expect(title(fixed)).toBe('Salle · Pectoraux · Jambes · Triceps');
    expect(title(removePastPerformance(salle, 'leg-extension', T))).toBe('Salle · Pectoraux · Jambes · Triceps');
    const home = setSessionLocation(salle, true, T);
    expect(title(home)).toBe('Maison · Jambes · Pectoraux · Triceps');
    expect(title(setSessionLocation(home, false, T))).toBe(title(salle));
    const reopened = reopenSession(done([perf('pec-deck', 3)]), T + 7_200_000);
    const added = recordRemainingSets(addExercise(reopened, 'curl-biceps-halteres', ctx, T + 7_200_000, 12).session, 'curl-biceps-halteres', T + 7_300_000);
    expect(title(finishSession(added, T + 7_400_000).session)).toBe('Salle · Pectoraux · Biceps');
    expect(addCardio(done([]), TAPIS, T).name).toBe(defaultSessionName(T));
    for (const s of [fixed, home, added]) expect(s.name).toBe(defaultSessionName(T));

    // Renommer : un nom libre est gardé ; vide, ou identique au nom calculé, la séance reprend son nom calculé.
    const named = renameSession(salle, '  Haut du corps ', T, auto(salle));
    expect(named.name).toBe('Haut du corps');
    expect(renameSession(salle, auto(salle), T, auto(salle))).toBe(salle);
    expect(renameSession(named, auto(named), T, auto(named)).name).toBe(defaultSessionName(T));
    expect(renameSession(named, '  ', T, auto(named)).name).toBe(defaultSessionName(T));
    expect(renameSession({ ...imported, name: 'Ancienne' }, '', T, auto(imported)).name).toBe(importedSessionName('2026-10-19'));

    // Recherche : par le nom affiché, et par la date d'une séance non renommée.
    const others = [salle, { ...named, id: 'n' }, { ...done([perf('tirage-vertical', 3)]), id: 'd' }];
    const find = (q: string) => searchSessions(others, q, title).map((s) => s.id);
    expect(find('pectoraux')).toEqual(['s']);
    expect(find('salle dos')).toEqual(['d']);
    expect(find('haut du corps')).toEqual(['n']);
    expect(find('19 octobre').sort()).toEqual(['d', 's']);

    // Affichage seulement : moteur et sauvegarde identiques, le nom enregistré ne change pas.
    const sessions = [salle, { ...salle, id: 's2', name: 'Haut du corps', date: '2026-10-21' }];
    expect(rebuildProfile(sessions, settings)).toEqual(rebuildProfile(sessions.map((s) => ({ ...s, name: 'x' })), settings));
    const parsed = parseJsonImport(JSON.stringify(buildBackup({ sessions, exercises: LIB }, 1)), LIB, '2026-10-28');
    expect(parsed.kind === 'backup' && parsed.backup.sessions.map((s) => s.name)).toEqual([defaultSessionName(T), 'Haut du corps']);
  });
});
