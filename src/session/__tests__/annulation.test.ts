import { describe, expect, it } from 'vitest';
import type { Session, SessionPlan } from '../../domain/types';
import { computeRecords } from '../../analysis/records';
import { weeklyRecap } from '../../analysis/weekly';
import { rebuildProfile } from '../../engine';
import { buildEngineSettings } from '../../library/catalog';
import { SEED_EXERCISES } from '../../library/seed';
import { currentPlan } from '../../plan/model';
import { cancelLoss } from '../ops';

const perf = (reps: number[]) => ({ variantId: 'pec-deck', weightKg: 40, targetReps: 10, plannedSets: 3, reps, feeling: 'inconnu' as const });
const block = (id: string) => ({ id, machineId: 'rameur', machine: 'Rameur', minutes: 10 });

describe('Annuler une séance en cours (version 1.27.0)', () => {
  it('261. Texte de la confirmation selon ce qui serait perdu ; une séance annulée ne laisse aucune trace, le plan reste proposé', () => {
    expect(cancelLoss({ performances: [], cardio: undefined })).toBe('Rien n’a été saisi.');
    // Un exercice ajouté sans série validée : rien n'a été saisi.
    expect(cancelLoss({ performances: [perf([])] })).toBe('Rien n’a été saisi.');
    expect(cancelLoss({ performances: [perf([10])] })).toBe('1 série sera perdue.');
    expect(cancelLoss({ performances: [perf([10, 10, 10]), { ...perf([10]), variantId: 'chest-press' }] })).toBe('4 séries seront perdues.');
    expect(cancelLoss({ performances: [], cardio: [block('c1')] })).toBe('1 cardio sera perdu.');
    expect(cancelLoss({ performances: [], cardio: [block('c1'), block('c2')] })).toBe('2 cardios seront perdus.');
    expect(cancelLoss({ performances: [perf([10, 10, 10]), { ...perf([10]), variantId: 'chest-press' }], cardio: [block('c1')] })).toBe('4 séries et 1 cardio seront perdus.');

    // La séance en cours n'entre ni dans le moteur, ni dans les records, ni dans le récapitulatif : la supprimer
    // (annulation) laisse tout identique ; démarrée depuis le plan, elle ne l'a pas consommé.
    const settings = buildEngineSettings(SEED_EXERCISES);
    const t = new Date(2026, 9, 27, 18).getTime();
    const before: Session = {
      id: 'avant', name: 'avant', date: '2026-10-26', startedAt: t - 86_400_000, endedAt: t - 86_000_000, createdAt: t - 86_400_000, updatedAt: t,
      origin: 'app', state: 'done', performances: [{ ...perf([10, 10, 10]), feeling: 'bien' }],
    };
    const plan: SessionPlan = { id: 'plan-1', createdAt: t - 1000, updatedAt: t - 1000, items: [{ kind: 'exercise', variantId: 'pec-deck' }] };
    const active: Session = {
      id: 'en-cours', name: 'en cours', date: '2026-10-27', startedAt: t, endedAt: null, createdAt: t, updatedAt: t, origin: 'app', state: 'active',
      performances: [{ ...perf([10, 10, 10]), weightKg: 45, feeling: 'tres_bien' }], cardio: [block('c1')],
      fromPlan: { planId: 'plan-1', variantIds: ['pec-deck'], cardio: [] },
    };
    const now = t + 3_600_000;
    const derived = (list: Session[]) => ({
      replay: rebuildProfile(list, settings),
      records: computeRecords(list, settings),
      recap: weeklyRecap(list, SEED_EXERCISES, now),
      plan: currentPlan(plan, list),
    });
    expect(derived([before, active])).toEqual(derived([before]));
    expect(derived([before]).plan).toEqual(plan);
  });
});
