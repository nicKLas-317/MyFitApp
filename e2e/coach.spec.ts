import { expect, test, type Page } from '@playwright/test';
import { simulatedHistory } from '../src/analysis/__tests__/simulation';
import type { Session } from '../src/domain/types';
import { reloadAfterWrites, writeSessions } from './helpers';

type Shared = { name: string; type: string; title: string; text: string };

/**
 * Partage natif simulé (Web Share API avec fichier) : `shareMode` choisit le comportement du navigateur — fichier
 * accepté, fichier refusé par `canShare` (téléchargement), ou partage annulé par l'utilisateur. Le contenu d'un
 * fichier téléchargé est relevé quand l'appli crée son adresse (`URL.createObjectURL`).
 */
async function mockShare(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { shared: Shared[]; shareMode: 'share' | 'refuse' | 'abort'; downloads: Promise<string>[] };
    w.shared = [];
    w.shareMode = 'share';
    // Contenu des fichiers téléchargés, lu au moment où l'appli crée leur adresse.
    w.downloads = [];
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob: Blob) => (w.downloads.push(blob.text()), create(blob));
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: (data: { files?: File[] }) => w.shareMode !== 'refuse' && (data.files?.length ?? 0) > 0 });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: { files: File[]; title: string }) => {
        if (w.shareMode === 'abort') throw new DOMException('Partage annulé', 'AbortError');
        const file = data.files[0]!;
        w.shared.push({ name: file.name, type: file.type, title: data.title, text: await file.text() });
      },
    });
  });
}

const shared = (page: Page) => page.evaluate(() => (window as unknown as { shared: Shared[] }).shared);
const setMode = (page: Page, mode: 'share' | 'refuse' | 'abort') => page.evaluate((m) => ((window as unknown as { shareMode: string }).shareMode = m), mode);

/** Données simulées jusqu'au jeudi 22 octobre 2026, plus une séance le lundi 26 au matin (semaine en cours). */
function sessions(): Session[] {
  const start = new Date('2026-10-26T08:00:00').getTime();
  return [
    ...simulatedHistory('2026-10-22'),
    {
      id: 'lundi-26', name: 'Séance', date: '2026-10-26', startedAt: start, endedAt: start + 1_800_000, createdAt: start, updatedAt: start, origin: 'app', state: 'done',
      performances: [{ variantId: 'pec-deck', weightKg: 80, targetReps: 8, plannedSets: 3, reps: [8, 8, 8], feeling: 'bien' }],
    },
  ];
}

test.describe('Partager pour le coach (version 1.46.0)', () => {
  test('311. Onglet Progrès : « Partager pour le coach » exporte la dernière semaine terminée (partage du fichier, sinon téléchargement) ; rien sans séance passée', async ({ page }) => {
    await mockShare(page);
    // Base vide : pas de bouton (jamais de bouton inactif).
    await page.clock.setFixedTime(new Date('2026-10-26T09:30:00'));
    await page.goto('./#/progres');
    await expect(page.getByRole('heading', { name: 'Progrès' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Partager pour le coach/ })).toHaveCount(0);
    // Une séance de la semaine en cours seulement : toujours rien.
    await writeSessions(page, sessions().slice(-1));
    await reloadAfterWrites(page);
    await expect(page.getByRole('heading', { name: 'Progrès' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Partager pour le coach/ })).toHaveCount(0);

    await writeSessions(page, sessions());
    await reloadAfterWrites(page);
    const button = page.getByRole('button', { name: /^Partager pour le coach/ });
    await expect(button).toBeVisible();
    await expect(page.getByTestId('coach-week')).toHaveText('Semaine du 19 au 25 oct.');
    // Sous les bilans, au-dessus de « Mon poids » ; bouton secondaire, la semaine en 13 px sous le libellé.
    const layout = await page.evaluate(() => {
      const cardio = [...document.querySelectorAll('main a')].find((a) => a.textContent === 'Cardio')!.getBoundingClientRect();
      const weight = document.querySelector('section[aria-label="Mon poids"]')!.getBoundingClientRect();
      const b = document.querySelector('.coach-button')!;
      const week = b.querySelector('.coach-week')!;
      const label = b.firstElementChild!;
      return {
        between: cardio.bottom <= b.getBoundingClientRect().top && b.getBoundingClientRect().bottom <= weight.top,
        height: b.getBoundingClientRect().height,
        weekSize: getComputedStyle(week).fontSize,
        below: week.getBoundingClientRect().top >= label.getBoundingClientRect().bottom - 0.5,
        primary: b.classList.contains('primary'),
      };
    });
    expect(layout).toEqual({ between: true, height: expect.any(Number), weekSize: '13px', below: true, primary: false });
    expect(layout.height).toBeGreaterThanOrEqual(56);

    // Partage natif avec le fichier.
    await button.click();
    await expect(page.locator('.coach-share').getByRole('status')).toHaveText('Fichier partagé.');
    const [file] = await shared(page);
    expect(file).toMatchObject({ name: 'myfitapp-coach-2026-10-19.json', type: 'application/json', title: 'MyFitApp — données pour le coach, semaine du 19 au 25 oct. 2026' });
    const data = JSON.parse(file!.text);
    expect(data.periode).toMatchObject({ du: '2026-10-19', au: '2026-10-25' });
    expect(data.version_appli).toMatch(/^\d+\.\d+\.\d+$/);
    // La semaine exportée seulement (pas la séance du lundi 26), une performance par ligne, aucun identifiant interne.
    expect(data.semaine.seances.map((s: { date: string }) => s.date)).toEqual(['2026-10-19', '2026-10-22']);
    expect(data.semaine.seances[0].exercices[0]).toMatchObject({ exercice: 'Chest press', groupe: 'Pectoraux', type: 'charge', series_prevues: 3, seance_de_depart: false });
    expect(file!.text).not.toContain('pec-deck');
    expect(file!.text).not.toContain('"variantId"');
    expect(file!.text.split('\n').filter((l) => l.trim().startsWith('{ "exercice": ')).length).toBeGreaterThanOrEqual(10);
    expect(data.tendance.semaines).toHaveLength(8);
    expect(data.exercices.length).toBeGreaterThan(5);

    // Le texte du bilan est celui du mail de la semaine (écran « Bilan de la période »).
    await page.goto('./#/bilan-periode/semaine/2026-10-19');
    const mail = await page.getByTestId('report-text').textContent();
    expect(data.recapitulatif.texte_du_bilan.join('\n')).toBe(mail);
    // Quel que soit le bilan affiché : la semaine en cours ouverte, le bouton exporte toujours la dernière terminée.
    await page.goto('./#/bilan-periode/semaine/2026-10-26');
    await page.goto('./#/progres');
    await expect(page.getByTestId('coach-week')).toHaveText('Semaine du 19 au 25 oct.');

    // Partage annulé : rien d'autre (ni téléchargement, ni message).
    await setMode(page, 'abort');
    let downloaded = false;
    page.on('download', () => (downloaded = true));
    await button.click();
    await page.waitForTimeout(300);
    expect(downloaded).toBe(false);
    await expect(page.locator('.coach-share').getByRole('status')).toHaveCount(0);

    // Fichier refusé par le navigateur : téléchargement, même nom, même contenu.
    await setMode(page, 'refuse');
    const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
    expect(download.suggestedFilename()).toBe('myfitapp-coach-2026-10-19.json');
    const text = await page.evaluate(() => (window as unknown as { downloads: Promise<string>[] }).downloads.at(-1)!);
    expect({ ...JSON.parse(text), genere_le: null }).toEqual({ ...data, genere_le: null });
    await expect(page.locator('.coach-share').getByRole('status')).toHaveText('Fichier téléchargé : myfitapp-coach-2026-10-19.json.');

    // Le dimanche soir, la semaine en cours n'est pas terminée : c'est la précédente qui est exportée.
    await page.clock.setFixedTime(new Date('2026-10-25T20:00:00'));
    await page.reload();
    await expect(page.getByTestId('coach-week')).toHaveText('Semaine du 12 au 18 oct.');
    await setMode(page, 'share');
    await page.getByRole('button', { name: /^Partager pour le coach/ }).click();
    await expect.poll(async () => (await shared(page)).at(-1)?.name).toBe('myfitapp-coach-2026-10-12.json');
  });
});
