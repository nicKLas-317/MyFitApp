import { describe, expect, it } from 'vitest';
import { changeText } from '../labels';

describe('Bilan de progression : dernières évolutions (§19.3, version 1.21.0)', () => {
  it('234. Une évolution en quelques mots, pour tenir sur une ligne', () => {
    expect(changeText({ from: { weightKg: 40, targetReps: 8 }, to: { weightKg: 40, targetReps: 9 } })).toBe('8 → 9 rép.');
    expect(changeText({ from: { weightKg: 40, targetReps: 12 }, to: { weightKg: 45, targetReps: 8 } })).toBe('40 → 45 kg, 12 → 8 rép.');
    expect(changeText({ from: { weightKg: 30, targetReps: 10 }, to: { weightKg: 27.5, targetReps: 10 } })).toBe('30 → 27,5 kg');
  });
});
