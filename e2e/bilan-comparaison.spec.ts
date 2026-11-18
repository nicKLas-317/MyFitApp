import { expect, test, type Page } from '@playwright/test';
import type { Session } from '../src/domain/types';
import { reloadAfterWrites, writeSessions } from './helpers';

const day = (m: number, d: number) => `2026-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Séance terminée le `d` du mois `m` (0 = janvier) à midi, de `minutes` (sans heure : importée), un chest press de 3 séries. */
function session(m: number, d: number, minutes: number | null, extra: Partial<Session> = {}): Session {
  const t = new Date(2026, m, d, 12).getTime();
  return {
    id: `c-${day(m, d)}`, name: 'Séance', date: day(m, d), origin: minutes === null ? 'import' : 'app', state: 'done',
    startedAt: minutes === null ? null : t, endedAt: minutes === null ? null : t + minutes * 60_000, createdAt: t, updatedAt: t,
    performances: [{ variantId: 'chest-press', weightKg: 40, reps: [10, 10, 10], targetReps: 10, plannedSets: 3, feeling: 'bien' }],
    ...extra,
  };
}

// Le cas de l'utilisateur (17 novembre 2026) : en octobre, deux séances importées sans heure (12 et 15), une de 40 min
// (16) et un futsal (21) ; en novembre, une séance de 45 min (3) et le badminton (16).
const SESSIONS: Session[] = [
  session(9, 12, null),
  session(9, 15, null),
  session(9, 16, 40, { cardio: [{ id: 'c1', machineId: 'velo-elliptique', machine: 'Vélo elliptique', minutes: 11 }] }),
  session(10, 3, 45, { cardio: [{ id: 'c2', machineId: 'tapis', machine: 'Tapis de marche', incline: 'neutre', minutes: 16 }] }),
];
const activity = (habit: string, name: string, m: number, d: number, start: string, end: string) => ({
  id: `act-${habit}-${day(m, d)}`, habitId: habit, date: day(m, d), name, start, end, groups: ['jambes'], status: 'done', answeredAt: 0,
});
const FUTSAL = activity('habitude-futsal', 'Futsal', 9, 21, '21:00', '22:00');
const BADMINTON = activity('badminton', 'Badminton', 10, 16, '21:00', '22:30');

function writeActivities(page: Page, activities: object[]): Promise<void> {
  return page.evaluate(
    (list) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('myfitapp');
        open.onsuccess = () => {
          const tx = open.result.transaction('meta', 'readwrite');
          tx.objectStore('meta').put(list, 'activities');
          tx.oncomplete = () => (open.result.close(), resolve());
          tx.onerror = () => reject(tx.error);
        };
      }),
    activities,
  );
}

const tile = (page: Page, label: string) => page.getByRole('region', { name: 'Séances' }).locator(`[data-testid="report-tile"][data-label="${label}"]`);

test.describe('Bilans : comparaison avec la période précédente entière, version 1.50.0', () => {
  test('318. Mois en cours comparé à tout le mois dernier : badminton ×1 contre futsal ×1 « = autant », durée comparée malgré les séances importées sans durée, « Par rapport au mois dernier » ; semaine en cours, « Par rapport à la semaine dernière »', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-17T14:42:00'));
    await page.goto('./');
    await writeSessions(page, SESSIONS);
    await writeActivities(page, [FUTSAL, BADMINTON]);
    await reloadAfterWrites(page);

    await page.goto('./#/bilan-periode/mois/2026-11');
    await expect(page.locator('.report-heading')).toContainText('Mois en cours');
    await expect(page.getByTestId('report-reference')).toHaveText('Par rapport au mois dernier');
    // Activités : 1 en novembre, 1 sur tout octobre (le futsal du 21) : « = autant », plus « +1 ».
    await expect(tile(page, 'Activités')).toHaveText(/^Activités1Badminton ×1, 1\sh\s30= autant$/);
    // Durée : 45 min contre 40 min connues (les deux séances importées comptent pour 0) ; plus de « pas de comparaison ».
    await expect(tile(page, 'Durée en salle')).toHaveText(/^Durée en salle45\smin1\sséance\sà\sla\ssalle▲ \+5\smin$/);
    await expect(page.getByText('pas de comparaison')).toHaveCount(0);
    await expect(tile(page, 'Séances')).toHaveText(/^Séances1▼ −2$/);
    await expect(tile(page, 'Cardio')).toContainText('▲ +5 min');
    // Le mail suit les mêmes règles.
    await expect(page.getByTestId('report-text')).toContainText(
      '- 1 séance, −2 par rapport au mois dernier\n- Durée en salle : 45 min, +5 min par rapport au mois dernier\n',
    );
    for (const width of [412, 360, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${width}px`).toBe(true);
    }
    await page.setViewportSize({ width: 412, height: 915 });
    await test.info().attach('bilan-novembre', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

    // Une 2ᵉ activité en novembre : « +1 ».
    await writeActivities(page, [FUTSAL, activity('badminton', 'Badminton', 10, 9, '21:00', '22:30'), BADMINTON]);
    await reloadAfterWrites(page);
    await expect(tile(page, 'Activités')).toHaveText(/^Activités2Badminton ×2, 3\sh\s00▲ \+1$/);

    // Semaine en cours (mardi 17) : comparée à toute la semaine du 9 au 15 (le badminton du 9).
    await page.goto('./#/bilan-periode/semaine/2026-11-16');
    await expect(page.getByTestId('report-reference')).toHaveText('Par rapport à la semaine dernière');
    await expect(tile(page, 'Activités')).toHaveText(/^Activités1Badminton ×1, 1\sh\s30= autant$/);
  });
});
