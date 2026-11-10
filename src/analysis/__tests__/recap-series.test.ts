import { describe, expect, it } from 'vitest';
import type { CardioBlock, Exercise, MuscleGroup, Session } from '../../domain/types';
import type { ActivityRecord } from '../../activities/model';
import { SEED_EXERCISES } from '../../library/seed';
import { buildBackup, parseJsonImport } from '../../transfer/backup';
import { groupWeeklySets } from '../groups';
import {
  DEFAULT_RECAP_SETTINGS,
  recapColor,
  recapCountLabel,
  sanitizeRecapSettings,
  weeklyRecap,
  type RecapCell,
  type RecapColor,
  type WeeklyRecap,
} from '../weekly';
import { simulatedHistory } from './simulation';

/**
 * Récapitulatif de l'accueil en séries (version 1.45.0, §19.6) : score = séries du graphique « Séries par semaine »
 * (§19.10), + 3 par activité confirmée et par groupe, + 3 pour 45 min de cardio des jambes ; vert sous 3, orange
 * jusqu'au seuil du rouge (10 par défaut, réglable de 6 à 20), rouge à partir du seuil.
 */
const LIB: Exercise[] = [...SEED_EXERCISES];
const ALL: MuscleGroup[] = ['pectoraux', 'dos', 'epaules', 'biceps', 'triceps', 'jambes', 'abdominaux'];
/** Heure locale : lun. 12 octobre 2026 = début de semaine. */
const at = (d: number, h = 18, m = 0) => new Date(2026, 9, d, h, m).getTime();
let n = 0;

function session(start: number, variants: string[], extra: Partial<Session> = {}, sets = 3): Session {
  const d = new Date(start);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return {
    id: `r${++n}`, name: 'Séance', date, startedAt: start, endedAt: start + 3_600_000, createdAt: start, updatedAt: start,
    origin: 'app', state: 'done',
    performances: variants.map((variantId) => ({ variantId, weightKg: 20, targetReps: 8, plannedSets: sets, reps: Array(sets).fill(8), feeling: 'bien' })),
    ...extra,
  };
}

/** Activité confirmée le jour `d` d'octobre 2026, de 21 h à 22 h 30. */
function activity(name: string, d: number, groups: MuscleGroup[]): ActivityRecord {
  const date = `2026-10-${String(d).padStart(2, '0')}`;
  return { id: `act-${name}-${date}`, habitId: name.toLowerCase(), date, name, start: '21:00', end: '22:30', groups, status: 'done', answeredAt: at(d, 23) };
}

const tapis = (minutes: number): CardioBlock => ({ id: `c${++n}`, machineId: 'tapis', machine: 'Tapis de marche', incline: 'neutre', minutes });
const cell = (r: WeeklyRecap, g: string) => r.cells.find((c) => c.group === g)!;
const label = (c: RecapCell) => recapCountLabel(c).replace(/ /g, ' ');
/** Ancien score, en séances (avant la version 1.45.0), pour les contre-tests : 1 par séance directe, ½ par indirecte. */
const oldColor = (c: RecapCell): RecapColor => {
  const score = c.count + c.indirect / 2;
  return score < 1 ? 'vert' : score >= 2 ? 'rouge' : 'orange';
};

describe('Récapitulatif en séries (version 1.45.0)', () => {
  it('306. Score = séries du graphique « Séries par semaine » ; activités +3, cardio des jambes +3 ; maison en entier ; couleurs aux bornes ; libellés ; tri inchangé', () => {
    // Données simulées (une séance sur trois à la maison), chaque semaine et chaque groupe : exactement les séries du
    // graphique (directes + indirectes ÷ 2, salle et maison).
    const history = simulatedHistory().map((s, i) => (i % 3 === 2 ? { ...s, location: 'maison' as const } : s));
    expect(history.some((s) => s.location === 'maison')).toBe(true);
    let compared = 0;
    for (let monday = new Date(2026, 5, 1); monday.getTime() <= at(19); monday.setDate(monday.getDate() + 7)) {
      const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6, 20).getTime();
      const recap = weeklyRecap(history, LIB, sunday, { ...DEFAULT_RECAP_SETTINGS, groups: ALL });
      for (const g of ALL) {
        expect(cell(recap, g).score, `${g}, semaine du ${monday.toDateString()}`).toBe(groupWeeklySets(history, LIB, g, sunday).weeks.at(-1)!.total);
        compared++;
      }
    }
    expect(compared).toBe(21 * ALL.length);

    // Activité confirmée : 3 séries par groupe sollicité ; deux le même jour : 6, sans plafond par jour.
    const badminton = activity('Badminton', 12, ['jambes', 'epaules']);
    const one = weeklyRecap([], LIB, at(13, 9), undefined, [badminton]);
    expect(cell(one, 'jambes')).toMatchObject({ score: 3, color: 'orange', activities: ['Badminton'] });
    expect(cell(one, 'epaules')).toMatchObject({ score: 3, color: 'orange' });
    expect(cell(one, 'dos')).toMatchObject({ score: 0, activities: [] });
    const futsal = activity('Futsal', 12, ['jambes']);
    expect(cell(weeklyRecap([], LIB, at(13, 9), undefined, [badminton, futsal]), 'jambes')).toMatchObject({ score: 6, activities: ['Badminton', 'Futsal'] });
    // Le jour d'une séance où le groupe est principal, l'activité compte aussi (plus de plafond de 1 par jour).
    const legDay = session(at(12, 9), ['presse-a-cuisses']);
    expect(cell(weeklyRecap([legDay], LIB, at(13, 9), undefined, [badminton]), 'jambes')).toMatchObject({ score: 6, count: 1 });

    // Cardio des jambes : 45 min dans la semaine → +3 ; 44 min : rien ; au plus 3 par semaine.
    const cardio = (minutes: number[]) => minutes.map((m, i) => session(at(12 + i, 8), [], { cardio: [tapis(m)] }));
    expect(cell(weeklyRecap(cardio([20, 25]), LIB, at(16)), 'jambes')).toMatchObject({ score: 3, cardio: 45, color: 'orange' });
    expect(cell(weeklyRecap(cardio([20, 24]), LIB, at(16)), 'jambes')).toMatchObject({ score: 0, color: 'vert' });
    expect(cell(weeklyRecap(cardio([20, 24]), LIB, at(16)), 'jambes')).not.toHaveProperty('cardio');
    expect(cell(weeklyRecap(cardio([90, 90, 90]), LIB, at(16)), 'jambes')).toMatchObject({ score: 3, cardio: 270 });

    // Maison en entier : 3 séries de curl à la maison = 3 séries à la salle.
    const curlHome = session(at(13), ['curl-biceps-halteres'], { location: 'maison' });
    const curlGym = session(at(13), ['curl-biceps-halteres']);
    expect(cell(weeklyRecap([curlHome], LIB, at(16)), 'biceps').score).toBe(cell(weeklyRecap([curlGym], LIB, at(16)), 'biceps').score);
    expect(cell(weeklyRecap([curlHome], LIB, at(16)), 'biceps')).toMatchObject({ score: 3, home: 3, color: 'orange' });

    // Couleurs aux bornes : vert sous 3, orange de 3 au seuil exclu, rouge à partir du seuil.
    expect([2.5, 3, 9.5, 10].map((s) => recapColor(s, 10))).toEqual(['vert', 'orange', 'orange', 'rouge']);
    expect([2.5, 3, 5.5, 6].map((s) => recapColor(s, 6))).toEqual(['vert', 'orange', 'orange', 'rouge']);
    expect([2.5, 3, 19.5, 20].map((s) => recapColor(s, 20))).toEqual(['vert', 'orange', 'orange', 'rouge']);
    // Dans le récapitulatif : 2 séries vert, 3 orange, 10 rouge (par défaut).
    expect(cell(weeklyRecap([session(at(13), ['pec-deck'], {}, 2)], LIB, at(16)), 'pectoraux').color).toBe('vert');
    expect(cell(weeklyRecap([session(at(13), ['pec-deck'])], LIB, at(16)), 'pectoraux').color).toBe('orange');
    const ten = [session(at(12), ['pec-deck', 'chest-press', 'ecarte-couche-halteres']), session(at(13), ['ecarte-poulie'], {}, 1)];
    expect(cell(weeklyRecap(ten, LIB, at(16)), 'pectoraux')).toMatchObject({ score: 10, color: 'rouge' });
    expect(cell(weeklyRecap(ten, LIB, at(16), { ...DEFAULT_RECAP_SETTINGS, redSets: 11 }), 'pectoraux').color).toBe('orange');

    // Libellés (le composant ajoute « (…) » et « · hier ») : séries, puis activités, puis cardio des jambes.
    const legs = session(at(12), ['presse-a-cuisses', 'leg-extension', 'leg-curl', 'mollets-machine', 'adducteurs-machine']);
    expect(label(cell(weeklyRecap([legs], LIB, at(16)), 'jambes'))).toBe('15 séries');
    expect(label(cell(weeklyRecap([session(at(13), ['tractions-assistees'])], LIB, at(16)), 'biceps'))).toBe('1,5 série');
    const curlBad = weeklyRecap([session(at(13), ['tirage-vertical'])], LIB, at(16), undefined, [activity('Badminton', 12, ['biceps'])]);
    expect(label(cell(curlBad, 'biceps'))).toBe('4,5 séries · badminton');
    const many = [activity('Badminton', 12, ['jambes']), activity('Futsal', 13, ['jambes']), activity('Badminton', 14, ['jambes'])];
    expect(label(cell(weeklyRecap([], LIB, at(16), undefined, many), 'jambes'))).toBe('9 séries · badminton ×2 · futsal');
    const legsCardio = session(at(12), ['presse-a-cuisses', 'leg-extension', 'leg-curl'], { cardio: [tapis(50)] });
    expect(label(cell(weeklyRecap([legsCardio], LIB, at(16)), 'jambes'))).toBe('12 séries · +50 min cardio');
    expect(label(cell(weeklyRecap([], LIB, at(16)), 'jambes'))).toBe('');
    // Espaces insécables : un libellé ne se coupe jamais au milieu (« 15 séries », « +50 min cardio »).
    expect(recapCountLabel(cell(weeklyRecap([legsCardio], LIB, at(16)), 'jambes'))).toBe('12 séries · +50 min cardio');

    // Tri inchangé : couleur, puis « hier » / « aujourd'hui » en dernier, puis score croissant, puis l'ordre des groupes.
    const sorted = weeklyRecap(
      [session(at(12), ['pec-deck', 'chest-press', 'developpe-couche', 'ecarte-poulie']), session(at(13), ['curl-biceps-halteres']), session(at(15), ['tirage-vertical'])],
      LIB,
      at(16, 9),
    );
    expect(sorted.cells.map((c) => [c.group, c.color, c.score, c.recency])).toEqual([
      ['jambes', 'vert', 0, null],
      ['epaules', 'orange', 3, null],
      ['triceps', 'orange', 3, null],
      ['dos', 'orange', 3, 'yesterday'],
      ['biceps', 'orange', 4.5, 'yesterday'],
      ['pectoraux', 'rouge', 12, null],
    ]);

    // Grosse séance de jambes (4 exercices de 3 séries) : 12 séries, rouge ; avant, 1 séance : orange (contre-test).
    const big = cell(weeklyRecap([session(at(12), ['presse-a-cuisses', 'leg-extension', 'leg-curl', 'mollets-machine'])], LIB, at(16)), 'jambes');
    expect(big).toMatchObject({ score: 12, color: 'rouge', count: 1 });
    expect(oldColor(big)).toBe('orange');
    // Deux curls de 3 séries sur deux jours : 6 séries, orange ; avant, 2 séances : rouge (contre-test).
    const curls = cell(weeklyRecap([session(at(12), ['curl-biceps-halteres']), session(at(14), ['curl-marteau'])], LIB, at(16)), 'biceps');
    expect(curls).toMatchObject({ score: 6, color: 'orange', count: 2 });
    expect(oldColor(curls)).toBe('rouge');
  });

  it('307. Seuil du rouge en séries : ancien réglage en séances converti (2 → 10, 3 → 15, 4 et plus → 20), 6 à 20 gardé, sinon 10 ; sauvegarde ancienne restaurée convertie, export en séries', () => {
    const groups = DEFAULT_RECAP_SETTINGS.groups;
    expect(DEFAULT_RECAP_SETTINGS.redSets).toBe(10);
    expect(sanitizeRecapSettings({ groups, redThreshold: 2 })).toEqual({ groups, redSets: 10 });
    expect(sanitizeRecapSettings({ groups, redThreshold: 3 })).toEqual({ groups, redSets: 15 });
    expect(sanitizeRecapSettings({ groups, redThreshold: 4 })).toEqual({ groups, redSets: 20 });
    expect(sanitizeRecapSettings({ groups, redThreshold: 7 })).toEqual({ groups, redSets: 20 });
    expect(sanitizeRecapSettings({ groups, redSets: 6 })).toEqual({ groups, redSets: 6 });
    expect(sanitizeRecapSettings({ groups, redSets: 20 })).toEqual({ groups, redSets: 20 });
    // Hors de 6 à 20, ou invalide : 10 par défaut.
    for (const redSets of [5, 21, 7.5, '10', null]) expect(sanitizeRecapSettings({ groups, redSets }).redSets, String(redSets)).toBe(10);
    for (const redThreshold of [1, 8, 2.5, 'x']) expect(sanitizeRecapSettings({ groups, redThreshold }).redSets, String(redThreshold)).toBe(10);
    // Un seuil en séries valide l'emporte sur un ancien seuil resté à côté.
    expect(sanitizeRecapSettings({ groups, redSets: 8, redThreshold: 4 })).toEqual({ groups, redSets: 8 });
    expect(sanitizeRecapSettings(undefined)).toEqual(DEFAULT_RECAP_SETTINGS);
    expect(sanitizeRecapSettings({ groups: ['dos'], redThreshold: 3 })).toEqual({ groups: ['dos'], redSets: 15 });

    // Sauvegarde ancienne (format 7, seuil en séances) : lue telle quelle, restaurée avec le seuil converti
    // (l'écran Importer / exporter passe le réglage par `sanitizeRecapSettings`).
    const old = buildBackup({ sessions: [], exercises: LIB, settings: { weeklyRecap: { groups: ['pectoraux', 'dos'], redThreshold: 2 } } }, at(12));
    expect(old.schemaVersion).toBe(7);
    const parsed = parseJsonImport(JSON.stringify(old), LIB, '2026-10-12');
    if (parsed.kind !== 'backup') throw new Error(parsed.kind);
    expect(sanitizeRecapSettings(parsed.backup.settings.weeklyRecap)).toEqual({ groups: ['pectoraux', 'dos'], redSets: 10 });

    // Export : le seuil en séries, plus de `redThreshold`.
    const exported = JSON.parse(JSON.stringify(buildBackup({ sessions: [], exercises: LIB, settings: { weeklyRecap: sanitizeRecapSettings({ groups, redThreshold: 3 }) } }, at(12))));
    expect(exported.settings.weeklyRecap).toEqual({ groups, redSets: 15 });
    expect(exported.settings.weeklyRecap).not.toHaveProperty('redThreshold');
    const again = parseJsonImport(JSON.stringify(exported), LIB, '2026-10-12');
    if (again.kind !== 'backup') throw new Error(again.kind);
    expect(sanitizeRecapSettings(again.backup.settings.weeklyRecap)).toEqual({ groups, redSets: 15 });
  });
});
