import { useState } from 'react';
import { useApp } from '../../app/store';
import { navigate, useNow } from '../../app/hooks';
import { completableSession, completeLabel, elapsedMs, newId, reopenSession, startSession } from '../../session/ops';
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
  // Lieu de la séance libre (version 1.26.0) : toujours la salle par défaut, jamais mémorisé.
  const [home, setHome] = useState(false);

  async function exportNow() {
    const bodyTracking = (await body.snapshot()) ?? undefined;
    await markExported(downloadBackup({ sessions, exercises, bodyTracking, settings: generalSettings, activities, plan }));
  }

  async function start() {
    const session = startSession(Date.now(), newId(), home);
    await commit(session);
    navigate('seance');
  }

  /**
   * Compléter la dernière séance terminée du jour (version 1.28.0) : lien discret sous le choix du lieu ; la séance
   * se rouvre, à son lieu, ce qui était fait restant fermé.
   */
  const completable = active ? undefined : completableSession(sessions, now);
  async function complete() {
    if (!completable) return;
    if (await commit(reopenSession(completable, Date.now()))) navigate('seance');
  }
  const completeLink = completable && (
    <button type="button" className="link complete-session" onClick={() => void complete()}>
      {completeLabel(completable)}
    </button>
  );

  /** Choix du lieu, sous le bouton de la séance libre : Salle (par défaut) ou Maison. */
  const placeChoice = (
    <div className="place-choice" role="group" aria-label="Lieu de la séance libre">
      {(['Salle', 'Maison'] as const).map((label) => (
        <button key={label} type="button" className="chip" aria-pressed={home === (label === 'Maison')} onClick={() => setHome(label === 'Maison')}>
          {label}
        </button>
      ))}
    </div>
  );

  /**
   * Séance prévue (§5.9) : exercices dans l'ordre du plan, charge et cible recalculées par le moteur maintenant ;
   * toujours à la salle.
   */
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
          {/* À la maison, pas de chronomètre : la durée n'a pas d'importance. */}
          <span className="chrono-inline">{active.location === 'maison' ? 'à la maison' : formatDuration(elapsedMs(active, now))}</span>
        </button>
      ) : plan ? (
        <>
          <button type="button" className="btn primary huge" onClick={() => void startPlanned()}>
            Démarrer la séance prévue
          </button>
          <button type="button" className="btn big free-session" onClick={() => void start()}>
            {home ? 'Séance libre à la maison' : 'Séance libre'}
          </button>
          {placeChoice}
          {completeLink}
          <section className="card plan-summary" aria-label="Séance prévue">
            <p className="plan-names" data-testid="plan-summary">
              {plan.items.map((e) => (e.kind === 'cardio' ? formatCardio(e.block) : displayName(variants.get(e.variantId)))).join(' · ')}
            </p>
            <button type="button" className="link" onClick={() => navigate('seance-prevue')}>
              Modifier ma séance prévue
            </button>
          </section>
        </>
      ) : (
        <>
          <button type="button" className="btn primary huge" onClick={() => void start()}>
            {home ? 'Démarrer une séance à la maison' : 'Démarrer une séance'}
          </button>
          {placeChoice}
          {completeLink}
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
