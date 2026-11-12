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
import { GroupAlerts } from '../GroupAlerts';
import { WeekSuggestionCard } from '../WeekSuggestion';

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
  /** Bouton secondaire (version 1.40.0 ; lien discret avant), seulement le jour même. */
  const completeButton = completable && (
    <button type="button" className="btn big complete-session" onClick={() => void complete()}>
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
  const planNames = plan ? plan.items.map((e) => (e.kind === 'cardio' ? formatCardio(e.block) : displayName(variants.get(e.variantId)))).join(' · ') : '';

  async function startPlanned() {
    if (!plan) return;
    const available = (id: string) => {
      const ref = variants.get(id);
      return !!ref && !ref.exercise.archived && !ref.variant.archived;
    };
    await commit(startFromPlan(plan, ctxFor, available, Date.now(), newId()));
    navigate('seance');
  }

  /** Version 1.40.0 : boutons secondaires sous « Démarrer » et le choix du lieu, chacun lisible comme une action. */
  return (
    <main className="screen tab-screen home">
      {/* Titre masqué à l'écran (version 1.40.0), gardé pour le lecteur d'écran : « Démarrer » reste à l'écran. */}
      <h1 className="brand visually-hidden">MyFitApp</h1>
      <ActivityBanner />
      <WeeklyRecapBlock />
      {/* Groupe moins travaillé (version 1.38.0) : une ligne par groupe, ou une ligne de résumé à partir de 2 (1.40.0). */}
      <GroupAlerts compact />
      {active ? (
        <button type="button" className="btn primary huge" data-home-start="" onClick={() => navigate('seance')}>
          Reprendre la séance
          {/* À la maison, pas de chronomètre : la durée n'a pas d'importance. */}
          <span className="chrono-inline">{active.location === 'maison' ? 'à la maison' : formatDuration(elapsedMs(active, now))}</span>
        </button>
      ) : plan ? (
        <>
          <button type="button" className="btn primary huge" data-home-start="" onClick={() => void startPlanned()}>
            Démarrer la séance prévue
          </button>
          <button type="button" className="btn big free-session" onClick={() => void start()}>
            {home ? 'Séance libre à la maison' : 'Séance libre'}
          </button>
          {placeChoice}
        </>
      ) : (
        <>
          <button type="button" className="btn primary huge" data-home-start="" onClick={() => void start()}>
            {home ? 'Démarrer une séance à la maison' : 'Démarrer une séance'}
          </button>
          {placeChoice}
        </>
      )}
      <div className="home-actions">
        {completeButton}
        {!active && plan && (
          // Carte « Ma séance prévue » (version 1.40.0) : le cadre ouvre la préparation ; le nom d'un exercice, sa fiche
          // (version 1.48.0). Le bouton du titre couvre toute la carte (sauf les noms, au-dessus de lui).
          <div className="card action-card plan-summary">
            <span className="action-card-text">
              <button type="button" className="plan-summary-open" aria-label={`Ma séance prévue : ${planNames}`} onClick={() => navigate('seance-prevue')}>
                <span className="action-card-title">Ma séance prévue</span>
              </button>
              <span className="action-card-sub plan-names" data-testid="plan-summary">
                {plan.items.flatMap((e, i) => [
                  // Le texte du résumé reste « Chest press · Pec deck » (lecteur d'écran, recherche) ; l'écart est celui de la ligne.
                  ...(i > 0 ? [<span key={`sep-${i}`} aria-hidden="true">{' · '}</span>] : []),
                  e.kind === 'cardio' ? (
                    <span key={e.block.id}>{formatCardio(e.block)}</span>
                  ) : (
                    <a key={e.variantId} className="plan-summary-link" href={`#/exercice/${encodeURIComponent(e.variantId)}`}>
                      {displayName(variants.get(e.variantId))}
                    </a>
                  ),
                ])}
              </span>
            </span>
            <span className="action-card-chevron" aria-hidden="true">
              ›
            </span>
          </div>
        )}
        {/* Séance pour compléter la semaine (version 1.39.0) : à côté de la séance prévue, jamais à sa place. */}
        <WeekSuggestionCard />
        <ActivityEntry
          before={
            !active &&
            !plan && (
              <button type="button" className="btn prepare-plan" onClick={() => navigate('seance-prevue')}>
                Préparer ma prochaine séance
              </button>
            )
          }
        />
      </div>
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
