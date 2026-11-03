import { describe, expect, it } from 'vitest';
import type { Exercise, Session, SessionPlan } from '../../domain/types';
import { buildEngineSettings } from '../../library/catalog';
import { SEED_EXERCISES } from '../../library/seed';
import { DEFAULT_RECAP_SETTINGS, weeklyRecap, type WeeklyRecapSettings } from '../../analysis/weekly';
import { rebuildProfile, resolveConfig, trackKey } from '../../engine';
import { finishSession, recordRemainingSets, setFeeling, type VariantContext } from '../../session/ops';
import { consumesPlan, currentPlan, sessionSteps, startFromPlan } from '../model';
import { planMatchesSuggestion, suggestionPlan, weekSuggestion, type WeekSuggestion } from '../suggest';
import { CURRENT_WEEK, daySession, weekHistory, WEEK_NOW, type DaySpec } from './completer-simulation';

const LIB: Exercise[] = [...SEED_EXERCISES];
const SETTINGS = buildEngineSettings(LIB);
const at = (m: number, d: number, h = 9, min = 0) => new Date(2026, m - 1, d, h, min).getTime();
const WITH_ABS: WeeklyRecapSettings = { ...DEFAULT_RECAP_SETTINGS, groups: [...DEFAULT_RECAP_SETTINGS.groups, 'abdominaux'] };

function suggest(sessions: Session[], now = WEEK_NOW, recap: WeeklyRecapSettings = DEFAULT_RECAP_SETTINGS): WeekSuggestion | null {
  return weekSuggestion({ sessions, exercises: LIB, settings: SETTINGS, recap, now });
}
const ids = (s: WeekSuggestion | null) => s?.exercises.map((e) => e.variantId);
const groupsOf = (s: WeekSuggestion | null, reason: string) => s?.skipped.filter((x) => x.reason === reason).map((x) => x.group);

/** Sources de l'application, hors tests. */
const APP_SOURCES = import.meta.glob<string>(['../../**/*.{ts,tsx}', '!../../**/__tests__/**'], { query: '?raw', import: 'default', eager: true });

function ctxFor(sessions: Session[]) {
  const profile = rebuildProfile(sessions, SETTINGS).profile;
  return (variantId: string): VariantContext => ({ state: profile.variants[trackKey(SETTINGS, variantId, false)], cfg: resolveConfig(SETTINGS, variantId) });
}

describe('Séance pour compléter la semaine, version 1.39.0', () => {
  it('292. Groupes sous l’objectif, sauf ceux de la salle la veille ; un exercice par groupe, le plus en retrait d’abord ; ½ manquant complété par un groupe secondaire ; 4 exercices au moins, 6 au plus ; abdos en bonus ; exercices déjà faits ; affichée dès la 1re séance à la salle de la semaine', () => {
    const sessions = weekHistory();
    // Scores du récapitulatif le jeudi 12 nov. à 9 h.
    const scores = Object.fromEntries(weeklyRecap(sessions, LIB, WEEK_NOW).cells.map((c) => [c.group, c.score]));
    expect(scores).toEqual({ pectoraux: 2, dos: 1, epaules: 1.5, biceps: 1.5, triceps: 1.5, jambes: 1 });
    const s = suggest(sessions)!;
    expect(s).toMatchObject({ day: '2026-11-12', tomorrow: false });
    // Le dos, travaillé hier à la salle, est écarté ; les jambes (1) d'abord, puis épaules, biceps, triceps (1,5) ;
    // ordre de la séance : jambes, épaules, triceps, biceps. Leg extension : pas encore fait cette semaine… comme la
    // presse : à égalité (fréquence, dernière fois), l'identifiant départage.
    expect(ids(s)).toEqual(['leg-extension', 'elevations-laterales', 'extension-triceps-poulie', 'curl-biceps-halteres']);
    expect(s.exercises.map((e) => e.group)).toEqual(['jambes', 'epaules', 'triceps', 'biceps']);
    expect(groupsOf(s, 'veille')).toEqual(['dos']);
    expect(s.covered).toEqual([]);
    expect(s.reached).toEqual(['epaules', 'biceps', 'triceps', 'jambes']);
    expect(s.remaining).toEqual(['dos']);
    // Échauffement : le premier cardio de la dernière séance à la salle qui en avait (lundi : tapis puis rameur).
    expect(s.cardio).toEqual({ id: 'echauffement', machineId: 'tapis', machine: 'Tapis de marche', incline: 'neutre', minutes: 10 });

    // Après la séance du jeudi (cardio, leg extension seulement), la suggestion est pour demain : les jambes (2) sont
    // à l'objectif ; le dos (1) a un tirage, qui complète aussi le biceps (1,5 + ½) ; 3 exercices → un 2ᵉ pour le dos.
    const thursday = [...sessions, daySession({ date: '2026-11-12', hour: 10, variants: ['leg-extension'], cardio: [['rameur', 3]] })];
    const friday = suggest(thursday, at(11, 12, 20))!;
    expect(friday).toMatchObject({ day: '2026-11-13', tomorrow: true });
    expect(ids(friday)).toEqual(['tirage-horizontal', 'tirage-vertical', 'elevations-laterales', 'extension-triceps-poulie']);
    expect(friday.exercises.map((e) => e.second)).toEqual([false, true, false, false]);
    expect(friday.covered).toEqual([{ group: 'biceps', by: 'tirage-horizontal' }]);
    expect(groupsOf(friday, 'veille')).toEqual([]);
    expect(friday.reached).toEqual(['dos', 'epaules', 'biceps', 'triceps']);
    // Le cardio de cette dernière séance : le rameur 3 min.
    expect(friday.cardio).toMatchObject({ machine: 'Rameur', minutes: 3 });
    expect(friday.cardio).not.toHaveProperty('incline');
    // Le vendredi matin, même suggestion (veille : jeudi).
    expect(ids(suggest(thursday, at(11, 13, 8)))).toEqual(ids(friday));

    // Quand l'afficher : pas le lundi avant une séance à la salle ; pas après une séance à la maison seulement ; dès la
    // 1re séance à la salle de la semaine (pour demain si elle est d'aujourd'hui).
    const past = weekHistory([]);
    expect(suggest(past, at(11, 9, 9))).toBeNull();
    expect(suggest([...past, daySession({ date: '2026-11-09', hour: 8, variants: ['crunch-sol'], home: true })], at(11, 9, 12))).toBeNull();
    const monday = suggest(weekHistory(CURRENT_WEEK.slice(0, 1)), at(11, 9, 20))!;
    expect(monday).toMatchObject({ day: '2026-11-10', tomorrow: true });
    // Lundi : pectoraux, triceps, épaules faits (écartés pour demain) → dos, biceps, jambes (0), un exercice chacun (le
    // biceps à 0 a le sien : un tirage n'apporte que ½) ; 3 exercices → un 2ᵉ pour le dos, premier dans l'ordre.
    expect(ids(monday)).toEqual(['tirage-horizontal', 'tirage-vertical', 'leg-extension', 'curl-biceps-halteres']);
    expect(groupsOf(monday, 'veille')).toEqual(['pectoraux', 'epaules', 'triceps']);
    expect(monday.reached).toEqual([]);
    // Le dimanche après une séance à la salle, la séance proposée tomberait la semaine suivante : rien.
    expect(suggest(weekHistory([...CURRENT_WEEK, { date: '2026-11-15', hour: 10, variants: ['pec-deck'] }]), at(11, 15, 12))).toBeNull();
    // Le dimanche matin, sans séance ce jour-là : pour aujourd'hui.
    expect(suggest(sessions, at(11, 15, 9))).toMatchObject({ day: '2026-11-15', tomorrow: false });
    // Tous les groupes à l'objectif : rien.
    const full = weekHistory([...CURRENT_WEEK, { date: '2026-11-12', hour: 8, variants: ['pec-deck', 'tirage-horizontal', 'leg-extension', 'elevations-laterales', 'extension-triceps-poulie'] }]);
    expect(suggest(full, at(11, 13, 9))).toBeNull();
    // Une séance en cours ne compte pas.
    const active = thursday.map((x) => (x.date === '2026-11-12' ? { ...x, state: 'active' as const, endedAt: null } : x));
    expect(ids(suggest(active, at(11, 12, 10, 30)))).toEqual(ids(s));

    // ½ manquant : complété par le groupe secondaire d'un exercice proposé (biceps 1 + ½ maison = 1,5 ; tirage → ½).
    const homeCurl: DaySpec = { date: '2026-11-11', hour: 8, variants: ['curl-biceps-halteres', 'curl-biceps-poulie-corde'], home: true };
    const covered = suggest(weekHistory([CURRENT_WEEK[0]!, { date: '2026-11-10', variants: ['presse-a-cuisses', 'curl-biceps-halteres'] }, homeCurl]))!;
    // La maison n'écarte rien (curls à la maison hier) ; dos 0, puis pectoraux, épaules, triceps, jambes 1 ; biceps 1,5.
    // Pectoraux : chest press et pec deck à égalité (faits lundi, aussi souvent), l'identifiant départage ; jambes :
    // la presse, faite cette semaine, passe après le leg extension.
    expect(ids(covered)).toEqual(['chest-press', 'tirage-horizontal', 'leg-extension', 'elevations-laterales', 'extension-triceps-poulie']);
    expect(covered.covered).toEqual([{ group: 'biceps', by: 'tirage-horizontal' }]);
    expect(covered.remaining).toEqual(['dos']);
    // Un groupe secondaire travaillé la veille à la salle fait passer l'exercice après les autres : triceps faits hier,
    // le pec deck (sans groupe secondaire) passe avant le chest press (triceps et épaules en secondaire).
    const eve = suggest(weekHistory([{ date: '2026-11-09', variants: ['extension-triceps-poulie'] }]), at(11, 10, 9))!;
    expect(groupsOf(eve, 'veille')).toEqual(['triceps']);
    expect(ids(eve)?.[0]).toBe('pec-deck');

    // 6 exercices au plus (sous-groupe des jambes affiché à part) : le moins en retrait n'a pas de place.
    const seven: WeeklyRecapSettings = { ...DEFAULT_RECAP_SETTINGS, groups: [...DEFAULT_RECAP_SETTINGS.groups, 'mollets'] };
    // Lundi : cardio seul à la salle (aucun groupe) ; mardi, les 7 groupes à 0.
    const cardioOnly: DaySpec = { date: '2026-11-09', variants: [], cardio: [['tapis', 20]] };
    const crowded = suggest(weekHistory([cardioOnly]), at(11, 10, 9), seven)!;
    expect(crowded.exercises).toHaveLength(6);
    expect(groupsOf(crowded, 'place')).toEqual(['mollets']);

    // Abdos (au récapitulatif) : un exercice en bonus, en fin de séance, hors des 6 ; au poids du corps, déjà fait à
    // la maison suffit ; travaillés à la salle la veille : écartés.
    const abs = suggest(weekHistory([cardioOnly]), at(11, 10, 9), WITH_ABS)!;
    expect(abs.exercises).toHaveLength(7);
    expect(abs.exercises.at(-1)).toEqual({ variantId: 'crunch-sol', group: 'abdominaux', second: false, bonus: true });
    expect(abs.exercises.filter((e) => !e.bonus)).toHaveLength(6);
    const absEve = suggest(weekHistory([{ date: '2026-11-09', variants: ['crunch-sol'] }]), at(11, 10, 9), WITH_ABS)!;
    expect(absEve.exercises.some((e) => e.bonus)).toBe(false);
    expect(groupsOf(absEve, 'veille')).toEqual(['abdominaux']);

    // Exercices déjà faits : à la salle dans les 6 dernières semaines ; à charge fait seulement à la maison, ou il y a
    // plus de 6 semaines : jamais proposé ; archivé : jamais proposé.
    const onlyHome = [daySession({ date: '2026-11-09', variants: ['pec-deck'] }), daySession({ date: '2026-11-07', hour: 10, variants: ['curl-biceps-halteres'], home: true })];
    expect(suggest(onlyHome, at(11, 10, 9))).toBeNull();
    const old = suggest(
      [daySession({ date: '2026-09-21', variants: ['curl-biceps-halteres'] }), daySession({ date: '2026-11-02', variants: ['tirage-vertical'] }), daySession({ date: '2026-11-09', variants: ['pec-deck'] })],
      at(11, 10, 9),
    )!;
    expect(ids(old)).toEqual(['tirage-vertical']);
    expect(groupsOf(old, 'aucun')).toEqual(['epaules', 'biceps', 'triceps', 'jambes']);
    const archived = LIB.map((e) => (e.id === 'leg-extension' ? { ...e, archived: true } : e));
    expect(weekSuggestion({ sessions, exercises: archived, settings: SETTINGS, recap: DEFAULT_RECAP_SETTINGS, now: WEEK_NOW })!.exercises[0]!.variantId).toBe('presse-a-cuisses');

    // Pas de cardio à la salle : pas d'échauffement.
    expect(suggest(sessions.map(({ cardio: _c, ...x }) => x))!.cardio).toBeNull();

    // Données simulées jamais chargées par l'application.
    expect(Object.keys(APP_SOURCES).length).toBeGreaterThan(50);
    expect(Object.entries(APP_SOURCES).filter(([, source]) => source.includes('completer-simulation')).map(([file]) => file)).toEqual([]);
  });

  it('293. « Démarrer cette séance » : déroulée comme une séance prévue (échauffement en tête), sans toucher à la séance prévue ; « En faire ma séance prévue » : le plan, modifiable ; la ligne de l’accueil disparaît quand le plan la reprend', () => {
    const sessions = weekHistory();
    const s = suggest(sessions)!;
    let n = 0;
    const newId = () => `id-${++n}`;
    const plan = suggestionPlan(s, WEEK_NOW, newId);
    expect(plan.items.map((i) => (i.kind === 'cardio' ? `cardio:${i.block.machine}` : i.variantId))).toEqual([
      'cardio:Tapis de marche', 'leg-extension', 'elevations-laterales', 'extension-triceps-poulie', 'curl-biceps-halteres',
    ]);
    // Le bloc reçoit un nouvel identifiant (copié, jamais celui d'une séance passée).
    expect(plan.items[0]).toMatchObject({ kind: 'cardio', block: { id: 'id-2', minutes: 10, incline: 'neutre' } });
    expect(planMatchesSuggestion(plan, s)).toBe(true);
    expect(planMatchesSuggestion({ ...plan, items: plan.items.slice(0, -1) }, s)).toBe(false);
    expect(planMatchesSuggestion(null, s)).toBe(false);

    // Une séance prévue déjà préparée : jamais remplacée ni consommée par la séance démarrée depuis la suggestion.
    const mine: SessionPlan = { id: 'mon-plan', createdAt: at(11, 11, 20), updatedAt: at(11, 11, 20), items: [{ kind: 'exercise', variantId: 'pec-deck' }] };
    const ctx = ctxFor(sessions);
    const started = startFromPlan(suggestionPlan(s, WEEK_NOW, newId), ctx, () => true, WEEK_NOW, 'seance-suggeree');
    expect(started.fromPlan?.planId).not.toBe(mine.id);
    // Comme une séance prévue : l'échauffement en tête, puis les exercices, charge et cible du moteur.
    expect(sessionSteps(started).map((st) => (st.kind === 'cardio' ? `cardio:${st.pending}` : st.key))).toEqual([
      'cardio:true', 'leg-extension', 'elevations-laterales', 'extension-triceps-poulie', 'curl-biceps-halteres',
    ]);
    expect(started.performances[0]).toMatchObject({ variantId: 'leg-extension', weightKg: 40, plannedSets: 3, reps: [] });
    expect(started.location).toBeUndefined();
    let done = recordRemainingSets(started, 'leg-extension', WEEK_NOW + 60_000);
    done = setFeeling(done, 'leg-extension', 'bien', WEEK_NOW + 70_000);
    const { session: finished } = finishSession(done, WEEK_NOW + 3_600_000);
    expect(consumesPlan(finished, mine.id)).toBe(false);
    expect(currentPlan(mine, [...sessions, finished])).toBe(mine);
  });
});
