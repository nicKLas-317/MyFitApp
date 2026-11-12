import { useState } from 'react';
import { useBody } from '../../body/store';
import { coachWeekLabel } from '../../analysis/coach';
import { formatKg, formatShortDay, localDate } from '../../session/format';
import { ReportBanner } from '../ReportBanner';
import { GroupAlerts } from '../GroupAlerts';
import { useCoachExport } from '../coachExport';
import { WeighInForm } from './BodyScreen';

/**
 * Onglet Progrès (§3.4) : bilans prêts en haut, puis bilan de progression, bilans de la semaine et du mois, bilan
 * par groupe musculaire, « Cardio » (version 1.43.0), « Partager pour le coach » (version 1.46.0) et « Mon poids ».
 * Une pesée s'enregistre directement ici, comme avant depuis l'accueil.
 */
export function Progress() {
  const body = useBody();
  const [failed, setFailed] = useState(false);
  const last = body.status === 'ready' ? body.data.weighIns.at(-1) : undefined;
  return (
    <main className="screen tab-screen progress-screen">
      <h1>Progrès</h1>
      <ReportBanner />
      {/* Les mêmes alertes que l'onglet Séance : la pastille de l'onglet y mène. */}
      <GroupAlerts />
      <nav className="hub-links" aria-label="Bilans">
        <a className="btn big" href="#/bilan">
          Bilan de progression
        </a>
        <a className="btn big" href="#/bilan-periode">
          Bilan de la semaine / du mois
        </a>
        <a className="btn big" href="#/bilan-groupes">
          Par groupe musculaire
        </a>
        {/* Récapitulatif du cardio par machine (version 1.43.0), juste sous « Par groupe musculaire » (version 1.43.1). */}
        <a className="btn big" href="#/cardio">
          Cardio
        </a>
      </nav>
      <CoachShare />
      <section className="frame hub-weight" aria-label="Mon poids">
        <h2 className="section-title">Mon poids</h2>
        {last && (
          <p className="muted" data-testid="last-weigh-in">
            Dernière pesée : {formatKg(last.weightKg)} ({formatShortDay(last.date)})
          </p>
        )}
        {body.status === 'ready' && (
          <WeighInForm
            today={localDate(Date.now())}
            submitLabel="Enregistrer la pesée"
            existing={body.data.weighIns}
            onSubmit={async (w) => {
              const ok = await body.saveWeighIn(w);
              setFailed(!ok);
              return ok;
            }}
          />
        )}
        {failed && (
          <p className="field-error" role="alert">
            Enregistrement impossible : réessaie.
          </p>
        )}
        <a className="btn big" href="#/poids">
          Mon poids : pesées et graphique
        </a>
      </section>
    </main>
  );
}

/**
 * « Partager pour le coach » (version 1.46.0, §19.13) : la dernière semaine terminée, quel que soit le bilan affiché,
 * dans un fichier JSON à donner à un assistant ; partage natif d'Android avec le fichier, sinon téléchargement.
 * Proposé seulement quand une séance a été terminée avant la semaine en cours. Même export que le rappel du bandeau du
 * bilan de la semaine (version 1.47.0).
 */
function CoachShare() {
  const coach = useCoachExport();
  const [message, setMessage] = useState<string | null>(null);
  if (!coach.available) return null;

  async function share() {
    const result = await coach.share();
    setMessage(result === 'shared' ? 'Fichier partagé.' : result === 'downloaded' ? `Fichier téléchargé : ${coach.fileName}.` : null);
  }

  return (
    <div className="coach-share">
      <button type="button" className="btn big coach-button" onClick={() => void share()}>
        <span>Partager pour le coach</span>
        <span className="coach-week" data-testid="coach-week">
          {coachWeekLabel(coach.period)}
        </span>
      </button>
      {message && (
        <p className="small muted" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
