import { useState } from 'react';
import { useBody } from '../../body/store';
import { formatKg, formatShortDay, localDate } from '../../session/format';
import { ReportBanner } from '../ReportBanner';
import { WeighInForm } from './BodyScreen';

/**
 * Onglet Progrès (§3.4) : bilans prêts en haut, puis bilan de progression, bilans de la semaine et du mois, bilan
 * par groupe musculaire et « Mon poids ». Une pesée s'enregistre directement ici, comme avant depuis l'accueil.
 */
export function Progress() {
  const body = useBody();
  const [failed, setFailed] = useState(false);
  const last = body.status === 'ready' ? body.data.weighIns.at(-1) : undefined;
  return (
    <main className="screen tab-screen progress-screen">
      <h1>Progrès</h1>
      <ReportBanner />
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
      </nav>
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
            Enregistrement impossible : réessayez.
          </p>
        )}
        <a className="btn big" href="#/poids">
          Mon poids : pesées et graphique
        </a>
      </section>
    </main>
  );
}
