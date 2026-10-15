import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ENGINE_SETTINGS, rebuildProfile } from '../../engine';
import { green, history } from '../../engine/__tests__/helpers';
import { SEED_EXERCISES } from '../../library/seed';
import { openAppDb, Repository } from '../../storage/db';
import { buildBackup, parseJsonImport, planImport } from '../../transfer/backup';
import { BodyRepository, openBodyDb } from '../db';
import { availablePeriods, EMPTY_BODY, inPeriod, parseHeight, parseWeighIn, planBodyImport, type WeighIn } from '../model';

const TODAY = '2026-10-15';
let n = 0;
const fresh = () => `test-body-${++n}`;

describe('Mon poids (§20)', () => {
  it('52. Une pesée invalide est refusée sans affecter les séances', async () => {
    expect(parseWeighIn('2026-10-15', '78,4', TODAY)).toEqual({ value: { date: '2026-10-15', weightKg: 78.4 } });
    expect(parseWeighIn('2026-10-15', 'abc', TODAY)).toEqual({ errors: ['invalid_weight'] });
    expect(parseWeighIn('2026-10-15', '0', TODAY)).toEqual({ errors: ['invalid_weight'] });
    expect(parseWeighIn('2026-10-15', '784', TODAY)).toEqual({ errors: ['out_of_range'] });
    expect(parseWeighIn('2026-10-16', '78', TODAY)).toEqual({ errors: ['future_date'] });
    expect(parseWeighIn('2026-02-30', '78', TODAY)).toEqual({ errors: ['invalid_date'] });

    // Bases séparées : une pesée écrite ou refusée ne touche jamais aux séances.
    const name = fresh();
    const training = new Repository(await openAppDb(name));
    const sessions = history([green(45, 8)]);
    await training.applyImport({ sessions, exercises: [] });
    const body = new BodyRepository(await openBodyDb(`${name}-corps`));
    await body.putWeighIn({ date: '2026-10-15', weightKg: 78.4 });
    await expect(body.putWeighIn({ weightKg: 70 } as unknown as WeighIn)).rejects.toThrow();
    expect(await training.loadSessions()).toEqual(sessions);
    expect((await body.load()).weighIns).toEqual([{ date: '2026-10-15', weightKg: 78.4 }]);
    training.close();
    body.close();
  });

  it('53. L’absence de données corporelles n’a aucun effet sur les séances', async () => {
    const sessions = history([green(45, 8), green(45, 8)]);
    const before = rebuildProfile(sessions, DEFAULT_ENGINE_SETTINGS);
    const backup = buildBackup({ sessions, exercises: [...SEED_EXERCISES] }, 1);
    expect(backup.bodyTracking).toEqual(EMPTY_BODY);
    const parsed = parseJsonImport(JSON.stringify(backup), [...SEED_EXERCISES], TODAY);
    if (parsed.kind !== 'backup') throw new Error(parsed.kind);
    const plan = planImport(parsed.backup, { sessions: [], exercises: [...SEED_EXERCISES] }, { mode: 'merge' });
    expect(rebuildProfile(plan.sessions, DEFAULT_ENGINE_SETTINGS)).toEqual(before);
    expect(planBodyImport(parsed.backup.bodyTracking, EMPTY_BODY, 'merge')).toMatchObject({ weighIns: [], heightCm: undefined });
  });

  it('une seule pesée par date ; correction de date et suppression', async () => {
    const body = new BodyRepository(await openBodyDb(fresh()));
    await body.putWeighIn({ date: '2026-10-01', weightKg: 80 });
    await body.putWeighIn({ date: '2026-10-01', weightKg: 79.5 });
    await body.putWeighIn({ date: '2026-10-02', weightKg: 79.5 }, '2026-10-01');
    expect((await body.load()).weighIns).toEqual([{ date: '2026-10-02', weightKg: 79.5 }]);
    await body.deleteWeighIn('2026-10-02');
    await body.setHeight(180);
    expect(await body.load()).toEqual({ heightCm: 180, weighIns: [] });
    body.close();
  });

  it('taille : vide ou plausible', () => {
    expect(parseHeight('')).toEqual({ value: null });
    expect(parseHeight('178')).toEqual({ value: 178 });
    expect(parseHeight('1,78')).toEqual({ error: true });
  });

  it('périodes proposées selon les données disponibles', () => {
    const w = (date: string): WeighIn => ({ date, weightKg: 80 });
    expect(availablePeriods([], TODAY).map((p) => p.key)).toEqual(['1m']);
    expect(availablePeriods([w('2026-10-01')], TODAY).map((p) => p.key)).toEqual(['1m']);
    expect(availablePeriods([w('2026-08-01')], TODAY).map((p) => p.key)).toEqual(['1m', '3m']);
    expect(availablePeriods([w('2025-09-01')], TODAY).map((p) => p.key)).toEqual(['1m', '3m', '6m', '1a']);
    expect(inPeriod([w('2026-08-01'), w('2026-10-01'), w('2026-09-20')], TODAY, 1).map((x) => x.date)).toEqual(['2026-09-20', '2026-10-01']);
  });

  it('43. Export puis import : taille et pesées identiques, sans doublon ; fusion sans rien écraser', async () => {
    const source = new BodyRepository(await openBodyDb(fresh()));
    await source.setHeight(178);
    for (const w of [{ date: '2026-09-01', weightKg: 80.2 }, { date: '2026-10-01', weightKg: 79.1 }]) await source.putWeighIn(w);
    const backup = buildBackup({ sessions: [], exercises: [...SEED_EXERCISES], bodyTracking: await source.load() }, 1);
    const parsed = parseJsonImport(JSON.stringify(backup), [...SEED_EXERCISES], TODAY);
    if (parsed.kind !== 'backup') throw new Error(parsed.kind);

    const target = new BodyRepository(await openBodyDb(fresh()));
    await target.applyImport(planBodyImport(parsed.backup.bodyTracking, await target.load(), 'merge'));
    expect(await target.load()).toEqual(await source.load());
    // Réimport : rien de nouveau.
    const again = planBodyImport(parsed.backup.bodyTracking, await target.load(), 'merge');
    expect(again).toMatchObject({ weighIns: [], conflicts: [], heightCm: undefined });

    // Pesée différente à la même date et autre taille : l'appareil est conservé, l'écart signalé.
    const other = { heightCm: 180, weighIns: [{ date: '2026-10-01', weightKg: 85 }, { date: '2026-10-10', weightKg: 79 }] };
    const merge = planBodyImport(other, await target.load(), 'merge');
    expect(merge).toMatchObject({ heightCm: undefined, heightConflict: true, weighIns: [{ date: '2026-10-10', weightKg: 79 }], conflicts: [{ date: '2026-10-01', weightKg: 85 }] });
    await target.applyImport(merge);
    expect((await target.load()).weighIns.find((w) => w.date === '2026-10-01')?.weightKg).toBe(79.1);
    // Remplacement : uniquement sur demande explicite.
    await target.applyImport(planBodyImport(other, await target.load(), 'replace'));
    expect(await target.load()).toEqual({ heightCm: 180, weighIns: other.weighIns });
    source.close();
    target.close();
  });

  it('une sauvegarde aux pesées invalides est refusée', () => {
    const backup = buildBackup({ sessions: [], exercises: [], bodyTracking: { heightCm: 178, weighIns: [{ date: '2026-10-01', weightKg: -3 }] } }, 1);
    expect(parseJsonImport(JSON.stringify(backup), [], TODAY).kind).toBe('error');
    const dup = buildBackup({ sessions: [], exercises: [], bodyTracking: { heightCm: null, weighIns: [{ date: '2026-10-01', weightKg: 80 }, { date: '2026-10-01', weightKg: 81 }] } }, 1);
    expect(parseJsonImport(JSON.stringify(dup), [], TODAY).kind).toBe('error');
  });
});
