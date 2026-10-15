import { describe, expect, it } from 'vitest';

describe('Fuseau horaire des tests', () => {
  it('101. Les tests s’exécutent à l’heure de Paris (heure d’été en octobre, d’hiver en janvier)', () => {
    expect(new Date(2026, 9, 12, 12).getTimezoneOffset()).toBe(-120);
    expect(new Date(2026, 0, 12, 12).getTimezoneOffset()).toBe(-60);
  });
});
