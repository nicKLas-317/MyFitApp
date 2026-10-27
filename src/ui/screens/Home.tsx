import { useApp } from '../../app/store';
import { navigate, useNow } from '../../app/hooks';
import { elapsedMs, newId, startSession } from '../../session/ops';
import { displayName } from '../../library/catalog';
import { formatCardio } from '../../cardio/model';
import { startFromPlan } from '../../plan/model';
import { formatDuration } from '../../session/format';
import { needsBackupReminder } from '../../transfer/backup';
import { useBody } from '../../body/store';
import { downloadBackup } from '../download';
import { ActivityBanner } from '../ActivityBanner';
import { ActivityEntry } from '../ActivityEntry';
import { WeeklyRecapBlock } from '../WeeklyRecap';

export function Home() {
  const { active, commit, sessions, exercises, variants, ctxFor, plan, lastExportAt, markExported, generalSettings, activities } = useApp();
  const now = useNow();
  const remind = needsBackupReminder(sessions, lastExportAt, now);
  const body = useBody();

  async function exportNow() {
    const bodyTracking = (await body.snapshot()) ?? undefined;
    await markExported(downloadBackup({ sessions, exercises, bodyTracking, settings: generalSettings, activities, plan }));
  }

  async function start() {
    const session = startSession(Date.now());
    await commit(session);
    navigate('seance');
  }

  /** Séance prévue (§5.9) : exercices dans l'ordre du plan, charge et cible recalculées par le moteur maintenant. */
  async function startPlanned() {
    if (!plan) return;
    const available = (id: string) => {
      const ref = variants.get(id);
      return !!ref && !ref.exercise.archived && !ref.variant.archived;
    };
    await commit(startFromPlan(plan, ctxFor, available, Date.now(), newId()));
    navigate('seance');
  }

  return (
    <main className="screen tab-screen home">
      <h1 className="brand">MyFitApp</h1>
      <ActivityBanner />
      <WeeklyRecapBlock />
      {active ? (
        <button type="button" className="btn primary huge" onClick={() => navigate('seance')}>
          Reprendre la séance
          <span className="chrono-inline">{formatDuration(elapsedMs(active, now))}</span>
        </button>
      ) : plan ? (
        <>
          <button type="button" className="btn primary huge" onClick={() => void startPlanned()}>
            Démarrer la séance prévue
          </button>
          <button type="button" className="btn big free-session" onClick={() => void start()}>
            Séance libre
          </button>
          <section className="card plan-summary" aria-label="Séance prévue">
            <p className="plan-names" data-testid="plan-summary">
              {[...plan.exercises.map((e) => displayName(variants.get(e.variantId))), ...plan.cardio.map(formatCardio)].join(' · ')}
            </p>
            <button type="button" className="link" onClick={() => navigate('seance-prevue')}>
              Modifier ma séance prévue
            </button>
          </section>
        </>
      ) : (
        <>
          <button type="button" className="btn primary huge" onClick={() => void start()}>
            Démarrer une séance
          </button>
          <button type="button" className="link prepare-plan" onClick={() => navigate('seance-prevue')}>
            Préparer ma prochaine séance
          </button>
        </>
      )}
      <ActivityEntry />
      {remind && (
        <div className="banner info reminder" role="status">
          <span>{lastExportAt ? 'Aucune sauvegarde depuis plus de 14 jours.' : 'Pense à sauvegarder tes séances.'}</span>
          <button type="button" className="btn" onClick={() => void exportNow()}>
            Exporter
          </button>
        </div>
      )}
    </main>
  );
}
