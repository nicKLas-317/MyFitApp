/**
 * Écran du bilan de la semaine ou du mois (§19.7, version 1.35.0) : tuiles des séances, barres des groupes, calendrier
 * du mois, échelles de cycle des progressions. Affichage seulement : le texte du mail est inchangé. Pas de vert, d'orange
 * ni de rouge : couleurs des groupes et neutre.
 */
import type { CSSProperties, ReactNode } from 'react';
import { formatMinutes } from '../cardio/model';
import type { Exercise } from '../domain/types';
import {
  comparedTo,
  lineText,
  progressionMeta,
  type LadderStep,
  type PeriodReport,
  type ReportScreen,
  type ReportSection,
} from '../analysis/report';
import { workParts } from '../analysis/weekly';
import { MUSCLE_GROUP_LABELS } from '../library/seed';
import { formatDurationLong, localDate } from '../session/format';
import { exerciseColorProps, groupColorProps } from './groupColors';

const NB = ' ';
const plural = (n: number, one: string, many = `${one}s`) => `${n}${NB}${n > 1 ? many : one}`;
/** Nombre jamais séparé de son unité (« 1 h 41 », « 30 min », « 12 kg / haltère »). */
export function keepUnits(line: string): string {
  return line.replace(/ \/ haltère/g, `${NB}/${NB}haltère`).replace(/(\d) (min|kg|h|séances?|[a-zéû]+\.)/g, `$1${NB}$2`).replace(/(\d)\u00a0h (\d)/g, `$1${NB}h${NB}$2`);
}

/** Écart avec la période comparée : « ▲ +4 », « ▼ −13 min », « = autant ». */
function Delta({ diff, format = String }: { diff: number; format?: (n: number) => string }) {
  if (diff === 0) return <span className="kpi-delta">= autant</span>;
  return (
    <span className="kpi-delta">
      <span aria-hidden="true">{diff > 0 ? '▲' : '▼'} </span>
      {keepUnits(`${diff > 0 ? '+' : '−'}${format(Math.abs(diff))}`)}
    </span>
  );
}

function Tile({ label, value, sub, children }: { label: string; value: string | number; sub?: string; children?: ReactNode }) {
  return (
    <div className="kpi" data-testid="report-tile" data-label={label}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{typeof value === 'string' ? keepUnits(value) : value}</span>
      <span className="kpi-sub">{sub ? keepUnits(sub) : ''}</span>
      {children}
    </div>
  );
}

const MONTH = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const dayOf = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
};

/** Calendrier du mois (● salle, ○ maison, ◆ activité), au-dessus des tuiles. */
function MonthCalendar({ report, screen }: { report: PeriodReport; screen: ReportScreen }) {
  const pad = (report.period.start.getDay() + 6) % 7;
  const today = localDate(report.asOf.getTime());
  const describe = (d: ReportScreen['days'][number]) => {
    const parts = [
      ...(d.gym > 0 ? [`${plural(d.gym, 'séance')} à la salle`] : []),
      ...(d.home > 0 ? [`${plural(d.home, 'séance')} à la maison`] : []),
      ...(d.activities > 0 ? [plural(d.activities, 'activité')] : []),
    ];
    return `${MONTH.format(dayOf(d.date))} : ${parts.length > 0 ? parts.join(', ') : 'rien'}`;
  };
  return (
    <>
      <div className="cal cal-heads" aria-hidden="true">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
          <span key={i} className="cal-head">
            {d}
          </span>
        ))}
      </div>
      <ol className="cal" aria-label="Calendrier du mois" data-testid="report-calendar">
        {Array.from({ length: pad }, (_, i) => (
          <li key={`pad${i}`} className="cal-day cal-out" aria-hidden="true" />
        ))}
        {screen.days.map((d) => (
          <li key={d.date} className={`cal-day${report.inProgress && d.date > today ? ' cal-future' : ''}`} aria-label={describe(d)} data-date={d.date}>
            <span className="cal-num" aria-hidden="true">
              {dayOf(d.date).getDate()}
            </span>
            <span className="cal-marks" aria-hidden="true">
              {Array.from({ length: d.gym }, (_, i) => (
                <i key={`g${i}`} className="mk mk-gym" />
              ))}
              {Array.from({ length: d.home }, (_, i) => (
                <i key={`h${i}`} className="mk mk-home" />
              ))}
              {Array.from({ length: d.activities }, (_, i) => (
                <i key={`a${i}`} className="mk mk-act" />
              ))}
            </span>
          </li>
        ))}
      </ol>
      <p className="report-legend" aria-hidden="true">
        <span>
          <i className="mk mk-gym" />
          salle
        </span>
        <span>
          <i className="mk mk-home" />
          maison
        </span>
        <span>
          <i className="mk mk-act" />
          activité
        </span>
      </p>
    </>
  );
}

/** Séances : calendrier (mois), puis quatre tuiles comparées à la période précédente (même portion en cours). */
export function ReportSessions({ report, screen }: { report: PeriodReport; screen: ReportScreen }) {
  const { totals, previous } = report;
  const week = report.period.kind === 'week';
  const compare = !report.first;
  const gym = totals.sessionCount - (totals.homeCount ?? 0);
  const prevGym = previous.sessionCount - (previous.homeCount ?? 0);
  const known = gym - totals.unknownDuration;
  const comparable = totals.unknownDuration === 0 && previous.unknownDuration === 0;
  const minutes = (ms: number) => Math.round(ms / 60_000);
  const reference = report.first ? (week ? 'Première semaine suivie' : 'Premier mois suivi') : `Par rapport ${comparedTo(report).with}`;
  return (
    <section className="frame report-section" aria-label="Séances">
      <h3 className="section-title">Séances</h3>
      {!week && <MonthCalendar report={report} screen={screen} />}
      <p className="report-reference" data-testid="report-reference">
        {reference}
      </p>
      <div className="kpis">
        <Tile label="Séances" value={totals.sessionCount} sub={totals.homeCount ? `dont ${totals.homeCount} à la maison` : ''}>
          {compare && <Delta diff={totals.sessionCount - previous.sessionCount} />}
        </Tile>
        {(gym > 0 || prevGym > 0) && (
          <Tile
            label="Durée en salle"
            value={known > 0 || gym === 0 ? formatDurationLong(totals.durationMs) : 'inconnue'}
            sub={totals.unknownDuration > 0 ? `+ ${plural(totals.unknownDuration, 'séance sans durée', 'séances sans durée')}` : gym > 0 ? `${plural(gym, 'séance')} à la salle` : ''}
          >
            {compare && (comparable ? <Delta diff={minutes(totals.durationMs) - minutes(previous.durationMs)} format={formatMinutes} /> : <span className="kpi-sub">pas de comparaison</span>)}
          </Tile>
        )}
        {(totals.sessionCount > 0 || screen.cardio.before > 0) && (
          <Tile label="Cardio" value={screen.cardio.now > 0 ? formatMinutes(screen.cardio.now) : 'aucun'} sub={report.cardio.map((c) => `${c.machine} ${formatMinutes(c.minutes)}`).join(' · ')}>
            {compare && <Delta diff={screen.cardio.now - screen.cardio.before} format={formatMinutes} />}
          </Tile>
        )}
        {(screen.activities.now > 0 || screen.activities.before > 0) && (
          <Tile label="Activités" value={screen.activities.now > 0 ? screen.activities.now : 'aucune'} sub={report.activities.map((a) => `${a.name} ×${a.count}, ${formatMinutes(a.minutes)}`).join(' · ')}>
            {compare && <Delta diff={screen.activities.now - screen.activities.before} />}
          </Tile>
        )}
      </div>
    </section>
  );
}

/** Groupes travaillés : une barre par groupe, dans sa couleur ; ordre fixe des groupes affichés. */
export function ReportGroups({ report, screen }: { report: PeriodReport; screen: ReportScreen }) {
  const scale = Math.max(2, Math.ceil(Math.max(...screen.bars.map((b) => b.direct + b.indirect + b.home))));
  const width = (units: number): CSSProperties => ({ width: `${(100 * units) / scale}%` });
  return (
    <section className="frame report-section" aria-label="Groupes travaillés" data-scale={scale}>
      <h3 className="section-title">Groupes travaillés</h3>
      <p className="report-legend" aria-hidden="true">
        <span>
          <i className="key key-main" />
          séance
        </span>
        <span>
          <i className="key key-extra" />
          indirect (½)
        </span>
        <span>
          <i className="key key-home" />
          maison
        </span>
      </p>
      {report.groups.map((g, i) => {
        const bar = screen.bars[i]!;
        const parts = workParts(g, NB);
        const idle = parts.length === 0;
        return (
          <div key={g.group} className={`gbar${idle ? ' gbar-idle' : ''}`} data-testid="group-bar" data-group={g.group} data-idle={idle || undefined} {...(idle ? {} : groupColorProps(g.group))}>
            <span className="gbar-name">{MUSCLE_GROUP_LABELS[g.group]}</span>
            <span className="gbar-track" aria-hidden="true">
              {Array.from({ length: g.count }, (_, k) => (
                <span key={`d${k}`} className="seg seg-main" style={width(1)} />
              ))}
              {Array.from({ length: g.indirect }, (_, k) => (
                <span key={`i${k}`} className="seg seg-extra" style={width(0.5)} />
              ))}
              {bar.home > 0 && <span className="seg seg-home" style={width(bar.home)} />}
            </span>
            <span className="gbar-parts">{idle ? 'non travaillé' : parts.join(' · ')}</span>
          </div>
        );
      })}
    </section>
  );
}

function Ladder({ steps }: { steps: LadderStep[] }) {
  return (
    <ol className="ladder" aria-hidden="true" data-testid="ladder">
      {steps.map((s, i) => (
        <li key={i} className={`rung rung-${s.state}${s.weight ? ' rung-weight' : ''}`}>
          {s.label}
        </li>
      ))}
    </ol>
  );
}

/** Progressions : une carte par palier validé, à la couleur du groupe, avec l'échelle du cycle. */
export function ReportProgressions({
  report,
  screen,
  section,
  exerciseOf,
  name,
  dumbbell,
}: {
  report: PeriodReport;
  screen: ReportScreen;
  /** Lignes du mail (même ordre), lues par le lecteur d'écran. */
  section: ReportSection;
  exerciseOf: (variantId: string) => Exercise | undefined;
  name: (variantId: string) => string;
  dumbbell: (variantId: string) => boolean;
}) {
  const list = report.progressions;
  return (
    <section className="frame report-section" aria-label="Progressions">
      <h3 className="section-title">Progressions</h3>
      {list.length === 0 ? (
        <ul className="report-lines">
          <li>Aucun palier validé.</li>
        </ul>
      ) : (
        <>
          <p className="report-lead">{plural(list.length, 'palier validé', 'paliers validés')}</p>
          <p className="report-legend" aria-hidden="true">
            <span>
              <i className="key key-before" />
              avant
            </span>
            <span>
              <i className="key key-now" />
              nouvelle cible
            </span>
          </p>
          <ul className="prog-list">
            {list.map((p, i) => (
              <li key={`${p.variantId}-${p.date}-${i}`} className="frame prog-card" data-testid="report-progression" {...exerciseColorProps(exerciseOf(p.variantId))}>
                <span className="visually-hidden">{keepUnits(lineText(section.lines[i] ?? []))}</span>
                <span className="prog-name" aria-hidden="true">
                  {name(p.variantId)}
                  {p.home ? ' (maison)' : ''}
                </span>
                <span className="prog-meta" aria-hidden="true">
                  {keepUnits(progressionMeta(p, dumbbell(p.variantId)))}
                </span>
                <Ladder steps={screen.ladders[i] ?? []} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
