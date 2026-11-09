import { Fragment, useState, type ReactNode } from 'react';
import { useApp } from '../../app/store';
import { formatMinutes, INCLINE_LABELS, INCLINES } from '../../cardio/model';
import { CARDIO_RANGES, cardioSummary, formatKm, inclinePercents, type CardioRange, type MachineSummary } from '../../cardio/summary';
import { periodContaining, periodTitle } from '../../analysis/report';
import { formatShortDate } from '../../session/format';

/** Période choisie, gardée le temps de l'ouverture de l'appli (comme le filtre de la bibliothèque). */
let lastRange: CardioRange = 'week';

const EMPTY: Record<CardioRange, string> = {
  week: 'Aucun cardio cette semaine.',
  month: 'Aucun cardio ce mois-ci.',
  all: 'Aucun cardio enregistré.',
};

/** Segments d'une ligne : chacun reste entier, la ligne passe à la ligne entre deux segments. */
function Parts({ parts }: { parts: ReactNode[] }) {
  const shown = parts.filter((p) => p !== null && p !== undefined && p !== false && p !== '');
  return (
    <>
      {shown.map((p, i) => (
        // L'espace après « · » est hors du segment : c'est là que la ligne peut se couper.
        <Fragment key={i}>
          <span className="nowrap">
            {p}
            {i < shown.length - 1 ? ' ·' : ''}
          </span>
          {i < shown.length - 1 ? ' ' : ''}
        </Fragment>
      ))}
    </>
  );
}

const percent = (part: number, total: number) => (total > 0 ? (part * 100) / total : 0);

/**
 * Carte d'une machine (version 1.44.0, maquette C) : nom et temps en grand, barre du temps proportionnelle au total de
 * la période (la même barre blanche pour toutes les machines), une ligne de détails en petit ; pour une machine à
 * inclinaison, une fine barre empilée neutre / moyenne / haute en dessous, avec sa légende.
 */
function MachineCard({ m, total }: { m: MachineSummary; total: number }) {
  const share = Math.round(percent(m.minutes, total));
  const partial = m.distance && m.distance.count < m.count;
  const inclineTotal = m.inclines ? m.inclines.neutre + m.inclines.moyenne + m.inclines.haute : 0;
  return (
    <section className="frame cardio-machine" aria-label={m.name} data-testid="cardio-machine">
      <div className="cardio-head">
        <h2 className="cardio-machine-name">{m.name}</h2>
        <strong className="cardio-machine-time nowrap" data-testid="cardio-time">
          {formatMinutes(m.minutes)}
        </strong>
      </div>
      <div className="cardio-bar" role="img" aria-label={`${share} % du temps total`} data-testid="cardio-bar">
        <span style={{ width: `${percent(m.minutes, total)}%` }} />
      </div>
      <p className="cardio-details" data-testid="cardio-details">
        <Parts
          parts={[
            `${m.count} fois`,
            `moy. ${formatMinutes(Math.round(m.minutes / m.count))}`,
            m.distance && formatKm(m.distance.km),
            m.distance && (
              <>
                moy. {formatKm(Math.round((m.distance.km / m.distance.count) * 100) / 100)}
                {partial && (
                  <span className="cardio-part" data-testid="cardio-part">
                    <span aria-hidden="true">
                      {m.distance.count}/{m.count}
                    </span>
                    <span className="visually-hidden">
                      {' '}
                      (distance notée {m.distance.count} fois sur {m.count})
                    </span>
                  </span>
                )}
              </>
            ),
          ]}
        />
      </p>
      {m.inclines && inclineTotal > 0 && (
        <>
          <div
            className="cardio-incline"
            role="img"
            aria-label={`Inclinaison : ${inclinePercents(m.inclines).map((i) => `${INCLINE_LABELS[i.incline].toLowerCase()} ${i.percent} %`).join(', ')}`}
            data-testid="cardio-incline"
          >
            {/* Un niveau sans minute n'est pas dessiné (pas de séparateur orphelin) ; largeur proportionnelle au temps,
                séparateurs de 2 px déduits (version 1.44.1). */}
            {INCLINES.filter((i) => m.inclines![i] > 0).map((i) => (
              <span key={i} className={`incline-${i}`} style={{ flexGrow: m.inclines![i] }} />
            ))}
          </div>
          <p className="cardio-legend" aria-hidden="true">
            {INCLINES.map((i) => (
              <span key={i} className="nowrap">
                <i className={`incline-${i}`} />
                {INCLINE_LABELS[i].toLowerCase()}
              </span>
            ))}
          </p>
        </>
      )}
    </section>
  );
}

/**
 * Écran « Cardio » (version 1.43.0 ; présentation en barres, version 1.44.0), onglet Progrès : temps, nombre de fois,
 * distance et inclinaison par machine, pour la semaine, le mois ou depuis le début. Simple consultation, sans objectif.
 */
export function CardioScreen() {
  const { sessions, cardioMachines } = useApp();
  const [range, setRange] = useState<CardioRange>(lastRange);
  const now = Date.now();
  const summary = cardioSummary(sessions, cardioMachines, range, now);
  const label =
    range === 'all'
      ? summary.firstDay && `Depuis le ${formatShortDate(summary.firstDay)}`
      : periodTitle(periodContaining(range, now));
  return (
    <main className="screen cardio-screen">
      <header className="simple-header">
        <a href="#/progres" className="back" aria-label="Progrès">
          ‹
        </a>
        <h1>Cardio</h1>
      </header>
      <div className="cardio-ranges" role="group" aria-label="Période">
        {CARDIO_RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            className="chip"
            aria-pressed={r.id === range}
            onClick={() => {
              lastRange = r.id;
              setRange(r.id);
            }}
          >
            {r.label}
          </button>
        ))}
      </div>
      {summary.count === 0 ? (
        <p className="muted" data-testid="cardio-empty">
          {EMPTY[range]}
        </p>
      ) : (
        <>
          <section className="frame cardio-total" aria-label="Total" data-testid="cardio-total">
            {label && <p className="cardio-period">{label}</p>}
            <p>
              <span className="nowrap">
                <strong className="cardio-total-value">{formatMinutes(summary.minutes)}</strong> ·
              </span>{' '}
              <span className="cardio-total-rest">
                <Parts parts={[`${summary.count} fois`, `${summary.machines.length} ${summary.machines.length > 1 ? 'machines' : 'machine'}`]} />
              </span>
            </p>
          </section>
          {summary.machines.map((m) => (
            <MachineCard key={m.machineId} m={m} total={summary.minutes} />
          ))}
        </>
      )}
    </main>
  );
}
