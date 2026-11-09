import { Fragment, useState } from 'react';
import { useApp } from '../../app/store';
import { formatMinutes, INCLINE_LABELS } from '../../cardio/model';
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
function Parts({ parts }: { parts: (string | null | false)[] }) {
  const shown = parts.filter((p): p is string => !!p);
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

function MachineCard({ m }: { m: MachineSummary }) {
  const average = formatMinutes(Math.round(m.minutes / m.count));
  return (
    <section className="frame cardio-machine" aria-label={m.name} data-testid="cardio-machine">
      <h2 className="cardio-machine-name">{m.name}</h2>
      <p data-testid="cardio-time">
        <Parts parts={[formatMinutes(m.minutes), `${m.count} fois`, `moyenne ${average}`]} />
      </p>
      {m.distance && (
        <p data-testid="cardio-distance">
          <Parts
            parts={[
              `Distance : ${formatKm(m.distance.km)}`,
              `moyenne ${formatKm(Math.round((m.distance.km / m.distance.count) * 100) / 100)}`,
              m.distance.count < m.count && `sur ${m.distance.count} fois sur ${m.count}`,
            ]}
          />
        </p>
      )}
      {m.inclines && (
        <p data-testid="cardio-inclines">
          <Parts parts={inclinePercents(m.inclines).map((i, k) => `${k === 0 ? 'Inclinaison : ' : ''}${INCLINE_LABELS[i.incline].toLowerCase()} ${i.percent} %`)} />
        </p>
      )}
    </section>
  );
}

/**
 * Écran « Cardio » (version 1.43.0), dernière entrée de l'onglet Progrès : temps, nombre de fois, distance et
 * inclinaison par machine, pour la semaine, le mois ou depuis le début. Simple consultation, sans objectif.
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
            {label && <p className="muted small">{label}</p>}
            <p>
              <span className="nowrap">
                <strong className="cardio-total-value">{formatMinutes(summary.minutes)}</strong> ·
              </span>{' '}
              <Parts parts={[`${summary.count} fois`, `${summary.machines.length} ${summary.machines.length > 1 ? 'machines' : 'machine'}`]} />
            </p>
          </section>
          {summary.machines.map((m) => (
            <MachineCard key={m.machineId} m={m} />
          ))}
        </>
      )}
    </main>
  );
}
