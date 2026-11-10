import { expect, test } from '@playwright/test';
import type { Session } from '../src/domain/types';
import { readSessions, reloadAfterWrites, waitForWrites, writeSessions } from './helpers';

test.describe('Changer la date d’une séance passée (version 1.41.4)', () => {
  test('301. Du dimanche au lundi suivant depuis le détail : heures au nouveau jour, séance comptée dans la nouvelle semaine', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-28T12:00:00'));
    await page.goto('./');
    await expect(page.getByTestId('weekly-recap')).toBeVisible();
    const start = Date.parse('2026-10-25T18:00:00');
    const sunday: Session = {
      id: 'dimanche', name: 'Séance du 25 octobre 2026 — 18 h 00', date: '2026-10-25', startedAt: start, endedAt: start + 3_600_000, createdAt: start, updatedAt: start,
      origin: 'app', state: 'done', performances: [{ variantId: 'pec-deck', weightKg: 35, targetReps: 8, plannedSets: 3, reps: [8, 8, 8], feeling: 'bien' }],
    };
    await writeSessions(page, [sunday]);
    await reloadAfterWrites(page);
    const recap = page.getByTestId('weekly-recap');
    await expect(recap.getByRole('heading')).toHaveText(/: 0\sséance$/);

    // Détail : la date passe au lundi 26 ; l'en-tête garde les heures, au nouveau jour.
    await page.goto('./#/historique/dimanche');
    await page.getByLabel('Date de la séance').fill('2026-10-26');
    await expect(page.locator('main p.muted').first()).toHaveText('26 octobre 2026 · 18 h 00 – 19 h 00 · 1 h 00 · saisie dans l’application');
    await waitForWrites(page);
    const [saved] = await readSessions(page);
    expect(saved).toMatchObject({ date: '2026-10-26', startedAt: Date.parse('2026-10-26T18:00:00'), endedAt: Date.parse('2026-10-26T19:00:00'), name: 'Séance du 26 octobre 2026 — 18 h 00' });

    // Accueil : la séance compte dans la semaine du 26 (avant la version 1.41.4, elle restait dans l'ancienne semaine).
    await page.goto('./');
    await expect(recap.getByRole('heading')).toHaveText(/: 1\sséance$/);
    await expect(recap.locator('[data-group="pectoraux"]')).toHaveText('Pectoraux (3 séries)');
    // Bilan de la semaine du 26 : une séance ; recherche dans l'historique par la nouvelle date.
    await page.goto('./#/bilan-periode/semaine/2026-10-26');
    await expect(page.getByTestId('report-text')).toContainText('1 séance');
    await page.goto('./#/historique');
    await page.getByRole('searchbox').fill('26 octobre');
    await expect(page.locator('.history-line')).toHaveCount(1);
  });
});
