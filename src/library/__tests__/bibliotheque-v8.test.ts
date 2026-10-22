import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { weeklyRecap } from '../../analysis/weekly';
import type { Exercise, Session } from '../../domain/types';
import { rebuildProfile } from '../../engine';
import { openAppDb, Repository } from '../../storage/db';
import { buildBackup, parseJsonImport, planImport } from '../../transfer/backup';
import { draftFromNotes } from '../../transfer/draft';
import { matchExercise } from '../../transfer/match';
import { formatRecommendation } from '../../ui/labels';
import { buildEngineSettings, displayName, indexVariants } from '../catalog';
import { SEED_ADDITIONS, SEED_EXERCISES, SEED_VERSION } from '../seed';
import { buildSearchIndex, searchExercises } from '../search';
import { nameKey } from '../text';

const LIB: Exercise[] = [...SEED_EXERCISES];
const INDEX = buildSearchIndex(LIB);
const VARIANTS = indexVariants(LIB);
const ids = (q: string) => searchExercises(INDEX, q).map((r) => r.entry.variant.id);
const choiceOf = (name: string) => {
  const c = draftFromNotes(`${name}\n3x10x40kg +`, LIB, '2026-10-16').exercises[0]!.choice;
  return c?.kind === 'variant' ? c.variantId : c?.kind === 'new_variant' ? `${c.exerciseId}+${c.name}` : null;
};
const name = (variantId: string) => displayName(VARIANTS.get(variantId));
const byId = (id: string) => LIB.find((e) => e.id === id)!;

let n = 0;
function done(variantId: string, date: string, weightKg: number, reps: number[], feeling: Session['performances'][number]['feeling'] = 'bien'): Session {
  const t = new Date(`${date}T18:00:00`).getTime();
  return {
    id: `s${++n}`, name: 'Séance', date, startedAt: t, endedAt: t + 3_600_000, createdAt: t, updatedAt: t, origin: 'app', state: 'done',
    performances: [{ variantId, weightKg, targetReps: Math.max(...reps), plannedSets: reps.length, reps, feeling }],
  };
}

const V8 = SEED_ADDITIONS[8]!;

describe('Bibliothèque version 8 (§4.0)', () => {
  it('153. Mollets : machine debout par défaut, machine assise en variante distincte, avec historiques séparés', () => {
    expect(name('mollets-machine')).toBe('Mollets machine — Debout');
    expect(name('mollets-machine--assis')).toBe('Mollets machine — Assis');
    for (const q of ['mollets', 'mollets debout', 'standing calf raise', 'calf press', 'Mollets machine']) expect(choiceOf(q), q).toBe('mollets-machine');
    for (const q of ['mollets assis', 'seated calf raise', 'calf assis']) {
      expect(choiceOf(q), q).toBe('mollets-machine--assis');
      expect(ids(q), q).toEqual(['mollets-machine--assis']);
    }
    // Recherche : la machine debout d'abord, puis la machine assise.
    expect(ids('mollets')).toEqual(['mollets-machine', 'mollets-machine--assis']);
    expect(ids('mollets debout')).toEqual(['mollets-machine']);
    // Historiques séparés : deux validations debout ne font pas progresser la machine assise.
    const r = rebuildProfile(
      [done('mollets-machine', '2026-10-12', 60, [8, 8, 8]), done('mollets-machine', '2026-10-14', 60, [8, 8, 8]), done('mollets-machine--assis', '2026-10-15', 30, [8, 8, 8])],
      buildEngineSettings(LIB),
    );
    expect(formatRecommendation(r.profile.variants['mollets-machine']!.recommendation)).toBe('3 × 9');
    expect(r.profile.variants['mollets-machine--assis']).toMatchObject({ greenStreak: 1, palier: { weightKg: 30, targetReps: 8 } });
  });

  it('154. Dix-neuf exercices ajoutés, avec groupes, matériel et variantes non comparables séparées ; chaque nom et synonyme est reconnu à l’import', () => {
    expect(V8).toHaveLength(19);
    const groups = Object.fromEntries(V8.map((id) => [id, [byId(id).primaryGroup, byId(id).secondaryGroups, byId(id).equipment]]));
    expect(groups).toEqual({
      'developpe-incline': ['pectoraux', ['epaules', 'triceps'], 'barre'],
      'developpe-couche-halteres': ['pectoraux', ['triceps', 'epaules'], 'haltères'],
      'ecarte-poulie': ['pectoraux', [], 'poulie'], // épaules retirées en version 10
      'tractions-assistees': ['dos', ['biceps'], 'machine'],
      'rowing-barre': ['dos', ['biceps'], 'barre'],
      'pull-over-poulie': ['dos', [], 'poulie'],
      'lombaires-banc': ['dos', [], 'banc'],
      shrugs: ['dos', [], 'haltères'],
      'developpe-militaire-halteres': ['epaules', ['triceps'], 'haltères'],
      oiseau: ['epaules', ['dos'], 'machine'],
      'face-pull': ['epaules', ['dos'], 'poulie'],
      'elevations-frontales': ['epaules', [], 'haltères'],
      'curl-marteau': ['biceps', [], 'haltères'],
      'curl-pupitre': ['biceps', [], 'barre'],
      'curl-biceps-barre-ez': ['biceps', [], 'barre'],
      'barre-au-front': ['triceps', [], 'barre'],
      kickback: ['triceps', [], 'haltère'],
      'hack-squat': ['jambes', ['quadriceps'], 'machine'],
      'squat-kettlebell': ['jambes', ['quadriceps'], 'kettlebell'],
    });
    expect(byId('developpe-incline').variants.map((v) => name(v.id))).toEqual(['Développé incliné — Barre', 'Développé incliné — Haltères']);
    expect(byId('oiseau').variants.map((v) => name(v.id))).toEqual(['Oiseau — Machine', 'Oiseau — Haltères']);
    // Chaque nom et synonyme désigne son exercice-variante, sans hésitation.
    for (const e of LIB) {
      for (const v of e.variants) {
        const names = v.id === e.id ? [e.name, ...e.synonyms, ...v.synonyms] : v.synonyms;
        for (const q of names) {
          // Un synonyme de variante est reconnu comme un synonyme appris (« learned »), tout aussi direct.
          const m = matchExercise(q, LIB);
          expect(m.suggestion, `${q} → ${v.id}`).toBe(v.id);
          expect(['certain', 'learned'], q).toContain(m.confidence);
        }
      }
    }
    // Aucun nom ou synonyme de deux exercices-variantes différents n'a la même forme comparable.
    const keys = LIB.flatMap((e) => e.variants.flatMap((v) => (v.id === e.id ? [e.name, ...e.synonyms, ...v.synonyms] : v.synonyms).map((q) => [nameKey(q), v.id] as const)));
    for (const [key, id] of keys) expect(keys.filter(([k, other]) => k === key && other !== id), key).toEqual([]);
  });

  it('155. Lexique : « squat » → Squat kettlebell, « hack squat » → Hack squat, kettlebell / KB, jamais confondus', () => {
    for (const q of ['squat', 'goblet squat', 'squat kettlebell', 'squat KB', 'kettlebell squat', 'squat kettle bell']) {
      expect(ids(q)[0], q).toBe('squat-kettlebell');
      expect(choiceOf(q), q).toBe('squat-kettlebell');
    }
    for (const q of ['hack', 'hack squat', 'hack squat machine']) {
      expect(ids(q), q).toEqual(['hack-squat']);
      expect(choiceOf(q), q).toBe('hack-squat');
    }
    expect(ids('kb')).toEqual(['squat-kettlebell']);
    expect(ids('squat machine')).toEqual(['hack-squat']);
    for (const q of ['quadri', 'quads']) expect(ids(q).sort(), q).toEqual(['hack-squat', 'leg-extension', 'presse-a-cuisses', 'squat-kettlebell']);
    // Autres équivalences du lexique.
    expect(ids('pull up assisté')).toEqual(['tractions-assistees']);
    expect(ids('hammer curl')).toEqual(['curl-marteau']);
    expect(ids('preacher curl')).toEqual(['curl-pupitre']);
    expect(ids('larry scott')).toEqual(['curl-pupitre']);
    expect(ids('front raise')).toEqual(['elevations-frontales']);
    expect(ids('skull crusher')).toEqual(['barre-au-front']);
    expect(ids('reverse pec deck')[0]).toBe('oiseau');
    expect(choiceOf('reverse pec deck')).toBe('oiseau');
    expect(choiceOf('rear delt fly haltères')).toBe('oiseau--halteres');
    expect(ids('back extension')).toEqual(['lombaires-banc']);
    expect(ids('shrugs')).toEqual(['shrugs']);
    expect(ids('pullover')).toEqual(['pull-over-poulie']);
    // « vis-à-vis » désigne aussi la poulie : l'écarté à la poulie vient en tête.
    expect(ids('vis-à-vis')[0]).toBe('ecarte-poulie');
    expect(ids('oiseau machine')).toEqual(['oiseau']);
    expect(ids('oiseau haltères')).toEqual(['oiseau--halteres']);
  });

  it('156. Variantes et exercices voisins jamais confondus : curl barre droite / EZ, extension poulie corde / barre, incliné barre / haltères, abduction / adduction', () => {
    // Curl à la barre droite et à la barre EZ : deux exercices, deux historiques.
    for (const q of ['curl barre', 'curl barre droite', 'straight bar curl', 'barbell curl']) expect(choiceOf(q), q).toBe('curl-biceps-barre-droite');
    for (const q of ['curl barre EZ', 'curl EZ', 'EZ bar curl', 'curl à la barre EZ', 'curl biceps ez']) {
      expect(choiceOf(q), q).toBe('curl-biceps-barre-ez');
      expect(ids(q)[0], q).toBe('curl-biceps-barre-ez');
    }
    expect(ids('curl ez')).not.toContain('curl-biceps-barre-droite');
    expect(ids('curl barre droite')).toEqual(['curl-biceps-barre-droite']);
    // Extension triceps poulie : corde (variante standard) et barre.
    expect(name('extension-triceps-poulie')).toBe('Extension triceps poulie — Corde');
    expect(name('extension-triceps-poulie--barre')).toBe('Extension triceps poulie — Barre');
    for (const q of ['extension triceps poulie', 'triceps pushdown', 'extension triceps poulie corde', 'rope pushdown']) expect(choiceOf(q), q).toBe('extension-triceps-poulie');
    for (const q of ['extension triceps poulie barre', 'pushdown barre', 'bar pushdown', 'triceps pushdown barre']) {
      expect(choiceOf(q), q).toBe('extension-triceps-poulie--barre');
      expect(ids(q), q).toEqual(['extension-triceps-poulie--barre']);
    }
    expect(ids('extension triceps poulie corde')).toEqual(['extension-triceps-poulie']);
    // Développé incliné : barre (variante standard) et haltères.
    expect(choiceOf('développé incliné')).toBe('developpe-incline');
    expect(choiceOf('développé incliné haltères')).toBe('developpe-incline--halteres');
    expect(choiceOf('incline dumbbell press')).toBe('developpe-incline--halteres');
    expect(ids('développé incliné haltères')).toEqual(['developpe-incline--halteres']);
    expect(ids('développé incliné barre')).toEqual(['developpe-incline']);
    // Développé couché : la barre reste distincte des haltères, et une prise crée toujours la variante.
    expect(choiceOf('développé couché')).toBe('developpe-couche');
    expect(choiceOf('développé couché haltères')).toBe('developpe-couche-halteres');
    expect(choiceOf('Développé couché prise serrée')).toBe('developpe-couche+Prise serrée');
    // Abduction ≠ adduction, toujours.
    for (const q of ['abducteurs', 'abduction', 'hip abduction']) {
      expect(ids(q), q).toEqual(['abducteurs-machine']);
      expect(choiceOf(q), q).toBe('abducteurs-machine');
    }
    for (const q of ['adducteurs', 'adduction', 'hip adduction']) {
      expect(ids(q), q).toEqual(['adducteurs-machine']);
      expect(choiceOf(q), q).toBe('adducteurs-machine');
    }
    // « pec deck » désigne toujours le pec deck seul, pas l'oiseau (reverse pec deck).
    expect(ids('pec deck')).toEqual(['pec-deck']);
  });

  it('157. Tractions assistées : réglage « assisté », sens de la charge inversé (moins d’aide, plus d’aide)', () => {
    expect(byId('tractions-assistees').variants[0]!.config).toEqual({ assisted: true });
    const settings = buildEngineSettings(LIB);
    const twelve = [done('tractions-assistees', '2026-10-12', 30, [12, 12, 12]), done('tractions-assistees', '2026-10-14', 30, [12, 12, 12])];
    const up = rebuildProfile(twelve, settings).profile.variants['tractions-assistees']!;
    expect(up.recommendation).toEqual({ kind: 'weight_up', targetReps: 8, plannedSets: 3 });
    expect(formatRecommendation(up.recommendation, true)).toBe('Moins d’aide · 3 × 8');
    // Moins d'aide = charge plus basse : suivie à 3×8, elle valide dès la première séance verte.
    const next = rebuildProfile([...twelve, done('tractions-assistees', '2026-10-16', 25, [8, 8, 8])], settings);
    expect(next.evaluations[2]).toMatchObject({ standard: true, validation: true, greenStreak: 1 });
    // Plus d'aide sans recommandation : changement non recommandé, ne valide rien.
    const more = rebuildProfile([...twelve, done('tractions-assistees', '2026-10-16', 35, [8, 8, 8])], settings);
    expect(more.evaluations[2]).toMatchObject({ standard: false, validation: false });
    // Quatre rouges : « plus d'aide ».
    const reds = ['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12'].map((d) => done('tractions-assistees', d, 30, [8, 6, 6], 'mal'));
    const down = rebuildProfile(reds, settings).profile.variants['tractions-assistees']!;
    expect(formatRecommendation(down.recommendation, true)).toMatch(/^Plus d’aide/);
  });

  it('158. Récapitulatif hebdomadaire : chaque nouvel exercice compte dans son groupe principal (shrugs et lombaires dans « Dos »)', () => {
    const at = (i: number) => `2026-10-${String(12 + (i % 5)).padStart(2, '0')}`;
    const now = new Date('2026-10-18T20:00:00').getTime();
    for (const [i, id] of V8.entries()) {
      const recap = weeklyRecap([done(id, at(i), 20, [8, 8, 8])], LIB, now);
      const counted = recap.cells.filter((c) => c.count > 0).map((c) => c.group);
      expect(counted, id).toEqual([byId(id).primaryGroup]);
    }
    expect(byId('shrugs').primaryGroup).toBe('dos');
    expect(byId('lombaires-banc').primaryGroup).toBe('dos');
    // Les variantes comptent dans le groupe de leur exercice.
    const recap = weeklyRecap([done('mollets-machine--assis', '2026-10-13', 30, [8, 8, 8]), done('oiseau--halteres', '2026-10-13', 8, [8, 8, 8])], LIB, now);
    expect(recap.cells.filter((c) => c.count > 0).map((c) => [c.group, c.count])).toEqual(expect.arrayContaining([['jambes', 1], ['epaules', 1]]));
  });

  it('159. Installation existante (version 7) : ajouts une seule fois, variantes ajoutées sans perte, rien de recréé ; une ancienne sauvegarde ne défait rien', async () => {
    // Bibliothèque telle qu'en version 7 : sans les ajouts, mollets et extension poulie avec leur seule variante « Standard ».
    const asV7 = (e: Exercise): Exercise =>
      e.id === 'mollets-machine' || e.id === 'extension-triceps-poulie' ? { ...e, variants: [{ id: e.id, name: 'Standard', synonyms: [], archived: false }] } : e;
    const v7 = LIB.filter((e) => !V8.includes(e.id)).map(asV7);
    // Synonyme appris sur les mollets, nom personnalisé sur l'extension poulie.
    const local = v7.map((e) =>
      e.id === 'mollets-machine'
        ? { ...e, variants: [{ ...e.variants[0]!, synonyms: ['mollets de la salle'] }] }
        : e.id === 'extension-triceps-poulie'
          ? { ...e, name: 'Mon pushdown' }
          : e,
    );
    const repo = new Repository(await openAppDb(`test-v8-${Math.random()}`));
    await repo.putExercises(local);
    await repo.setMeta('seeded', true);
    await repo.setMeta('seedVersion', 7);
    const old = done('mollets-machine', '2026-10-12', 60, [8, 8, 8]);
    await repo.putSession(old);
    await repo.ensureSeed();
    const after = await repo.loadExercises();
    expect(await repo.getMeta('seedVersion')).toBe(SEED_VERSION);
    expect(after).toHaveLength(LIB.length);
    for (const id of V8) expect(after.find((e) => e.id === id), id).toEqual(byId(id));
    const mollets = after.find((e) => e.id === 'mollets-machine')!;
    expect(mollets.variants.map((v) => [v.id, v.name])).toEqual([['mollets-machine', 'Debout'], ['mollets-machine--assis', 'Assis']]);
    expect(mollets.variants[0]!.synonyms).toEqual(['mollets de la salle', 'Mollets debout', 'Standing calf raise', 'Mollets machine debout']);
    const poulie = after.find((e) => e.id === 'extension-triceps-poulie')!;
    expect(poulie.name).toBe('Mon pushdown');
    expect(poulie.variants.map((v) => [v.id, v.name])).toEqual([['extension-triceps-poulie', 'Corde'], ['extension-triceps-poulie--barre', 'Barre']]);
    // La séance faite sur la machine debout reste la même.
    expect(await repo.loadSessions()).toEqual([old]);
    // Relancer ne change rien ; un exercice supprimé n'est pas recréé.
    await repo.deleteExercise('kickback');
    await repo.ensureSeed();
    expect((await repo.loadExercises()).map((e) => e.id)).not.toContain('kickback');
    // Une sauvegarde de la version 7 ne retire ni variante ni nom de variante.
    const backup = parseJsonImport(JSON.stringify(buildBackup({ sessions: [], exercises: v7 }, 1)), LIB, '2026-10-16');
    if (backup.kind !== 'backup') throw new Error(backup.kind);
    const plan = planImport(backup.backup, { sessions: [], exercises: await repo.loadExercises() }, { mode: 'merge' });
    for (const e of plan.exercises) {
      const current = after.find((x) => x.id === e.id)!;
      for (const v of current.variants) expect(e.variants.find((x) => x.id === v.id)?.name, v.id).toBe(v.name);
    }
    repo.close();

    // Variante « Assis » déjà créée par l'utilisateur (autre identifiant) : pas de doublon.
    const custom = new Repository(await openAppDb(`test-v8-${Math.random()}`));
    await custom.putExercises(
      v7.map((e) => (e.id === 'mollets-machine' ? { ...e, variants: [...e.variants, { id: 'mollets-machine--mien', name: 'assis', synonyms: [], archived: false }] } : e)),
    );
    await custom.setMeta('seeded', true);
    await custom.setMeta('seedVersion', 7);
    await custom.ensureSeed();
    const mine = (await custom.loadExercises()).find((e) => e.id === 'mollets-machine')!;
    expect(mine.variants.map((v) => [v.id, v.name])).toEqual([['mollets-machine', 'Debout'], ['mollets-machine--mien', 'assis']]);
    custom.close();
  });
});
