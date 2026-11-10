/**
 * Écran du bilan de la semaine ou du mois (§19.7, version 1.35.0) : tuiles des séances, bâtons des groupes (en séries,
 * version 1.45.0), calendrier du mois, échelles de cycle des progressions. Affichage seulement : le texte du mail est
 * à part (`reportText`). Pas de vert, d'orange ni de rouge : couleurs des groupes et neutre.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { formatMinutes } from '../cardio/model';
import type { Exercise, MuscleGroup } from '../domain/types';
import {
  comparedTo,
  lineText,
  progressionMeta,
  type LadderStep,
  type PeriodReport,
  type ReportScreen,
  type ReportSection,
} from '../analysis/report';
import { LEG_CARDIO_MINUTES, LEG_CARDIO_SETS, setsLabel } from '../analysis/weekly';
import { MUSCLE_GROUP_LABELS } from '../library/seed';
import { parseIsoDay } from '../domain/calendar';
import { formatDecimal, formatDurationLong, localDate, plural as pluralWith } from '../session/format';
import { exerciseColorProps, groupColorProps } from './groupColors';

const NB = ' ';
const plural = (n: number, one: string, many = `${one}s`) => pluralWith(n, one, many, NB);
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
    return `${MONTH.format(parseIsoDay(d.date))} : ${parts.length > 0 ? parts.join(', ') : 'rien'}`;
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
              {parseIsoDay(d.date).getDate()}
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

/** Noms courts des groupes sous les bâtons (version 1.37.1) : trois lettres, quand le nom entier ne tient pas. */
export const GROUP_SHORT_LABELS: Readonly<Record<MuscleGroup, string>> = {
  pectoraux: 'Pec',
  dos: 'Dos',
  epaules: 'Épa',
  biceps: 'Bic',
  triceps: 'Tri',
  jambes: 'Jam',
  quadriceps: 'Qua',
  'ischio-jambiers': 'Isc',
  mollets: 'Mol',
  fessiers: 'Fes',
  adducteurs: 'Add',
  abdominaux: 'Abd',
};

/** Disposition des noms sous les bâtons : entiers sur une ligne, courts sur une ligne, ou courts sur deux rangs alternés. */
export type StickLabels = 'full' | 'short' | 'staggered';

/** Écart minimal entre deux noms voisins, en px. */
const LABEL_GAP = 6;

/**
 * Première disposition où chaque nom tient, toujours sur une ligne si possible (version 1.37.1) : le nom entier, sinon
 * les trois lettres ; deux rangs alternés (jamais inclinés) seulement en dernier recours, si même les trois lettres ne
 * tiennent pas (320 px avec le texte agrandi). Sur une ligne, un nom dispose de la largeur de sa colonne. `full` et `short` : largeur de chaque nom, en px, à la taille affichée.
 */
export function stickLabels(column: number, full: readonly number[], short: readonly number[]): StickLabels {
  const fits = (widths: readonly number[], room: number) => widths.every((w) => w + LABEL_GAP <= room);
  if (fits(full, column)) return 'full';
  if (fits(short, column)) return 'short';
  return 'staggered';
}

/**
 * Groupes travaillés (version 1.37.0) : un diagramme en bâtons verticaux au-dessus d'un petit tableau. Un bâton par
 * groupe affiché au récapitulatif, dans son ordre (fixe), à la couleur du groupe ; hauteur = total en séries (version
 * 1.45.0), comme le récapitulatif : séries du graphique « Séries par semaine » (directes, indirectes ÷ 2, maison en
 * entier), 3 par activité confirmée, 3 par semaine à 45 min de cardio pour les jambes ; le plus travaillé occupe toute
 * la hauteur ; pas de valeur au-dessus. Groupe non travaillé : bâton vide, nom en gris. Tableau : sous le nom de chaque
 * groupe, son total (« 6,5 séries », en petit gris, version 1.45.0), puis Séances / Indirect / Maison (séries), case vide
 * pour zéro ; en-têtes abrégés à 320 px. Cardio des jambes : compris dans le bâton et donné par une phrase sous le
 * tableau (« Jambes : +3 séries pour 62 min de cardio. »).
 */
export function ReportGroups({ report, screen }: { report: PeriodReport; screen: ReportScreen }) {
  const totals = screen.bars.map((b) => b.sets);
  const max = Math.max(...totals);
  const chartRef = useRef<HTMLDivElement>(null);
  const [labels, setLabels] = useState<StickLabels>('staggered');
  const groups = report.groups.map((g) => g.group);
  const key = groups.join(',');
  // Noms mesurés à la taille réellement affichée : refait quand la largeur change (écran tourné) ou la taille du texte
  // (texte agrandi du téléphone), suivie par la hauteur d'un nom.
  useLayoutEffect(() => {
    const el = chartRef.current;
    const label = el?.querySelector('.groups-stick-label');
    const ctx = document.createElement('canvas').getContext('2d');
    if (!el || !label || !ctx) return;
    const measure = () => {
      const style = getComputedStyle(label);
      ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const widths = (names: string[]) => names.map((n) => ctx.measureText(n).width);
      setLabels(stickLabels(el.getBoundingClientRect().width / groups.length, widths(groups.map((g) => MUSCLE_GROUP_LABELS[g])), widths(groups.map((g) => GROUP_SHORT_LABELS[g]))));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    observer.observe(label);
    return () => observer.disconnect();
  }, [key]);
  const summary = `Total par groupe, en séries : ${report.groups
    .map((g, i) => `${MUSCLE_GROUP_LABELS[g.group].toLowerCase()} ${formatDecimal(totals[i]!)}`)
    .join(', ')}.`;
  const head = (long: ReactNode, short: string, label: string) => (
    <th scope="col" aria-label={label}>
      <span className="groups-long" aria-hidden="true">
        {long}
      </span>
      <span className="groups-short" aria-hidden="true">
        {short}
      </span>
    </th>
  );
  // Zéro : case vide, lue « 0 » par le lecteur d'écran.
  const cell = (n: number, col: string) => (
    <td className="groups-num" data-col={col}>
      {n > 0 ? n : <span className="visually-hidden">0</span>}
    </td>
  );
  const idleOf = (g: PeriodReport['groups'][number]) => g.count === 0 && g.indirect === 0 && !g.home && !g.cardio && g.sets === 0;
  const legs = report.groups.find((g) => g.cardio);
  return (
    <section className="frame report-section" aria-label="Groupes travaillés">
      <h3 className="section-title">Groupes travaillés</h3>
      <div ref={chartRef} className={`groups-sticks groups-labels-${labels}`} role="img" aria-label={summary} data-testid="groups-chart" data-labels={labels}>
        {report.groups.map((g, i) => {
          const idle = idleOf(g);
          return (
            <div key={g.group} className={`groups-stick${idle ? ' groups-idle' : ''}`} data-group={g.group} data-total={totals[i]} {...(idle ? {} : groupColorProps(g.group))}>
              <span className="groups-stick-track">
                <span style={{ height: `${max > 0 ? (100 * totals[i]!) / max : 0}%` }} />
              </span>
              {/* Deux rangs alternés : un nom sur deux descend d'une ligne ; la première, vide, garde sa hauteur. */}
              {labels === 'staggered' && i % 2 === 1 && (
                <span className="groups-stick-label groups-stick-spacer" aria-hidden="true">
                  {GROUP_SHORT_LABELS[g.group]}
                </span>
              )}
              <span className="groups-stick-label">{labels === 'full' ? MUSCLE_GROUP_LABELS[g.group] : GROUP_SHORT_LABELS[g.group]}</span>
            </div>
          );
        })}
      </div>
      <table className="groups-table">
        <thead>
          <tr>
            <th scope="col" className="groups-name">
              Groupe
            </th>
            {head('Séances', 'Séan.', 'Séances')}
            {head('Indirect', 'Ind.', 'Indirect')}
            {head(
              <>
                Maison
                <br />
                (séries)
              </>,
              'Mais.',
              'Maison (séries)',
            )}
          </tr>
        </thead>
        <tbody>
          {report.groups.map((g) => {
            const idle = idleOf(g);
            return (
              <tr key={g.group} data-testid="group-row" data-group={g.group} data-idle={idle || undefined} className={idle ? 'groups-idle' : undefined}>
                <th scope="row" className="groups-name">
                  {MUSCLE_GROUP_LABELS[g.group]}
                  {g.sets > 0 && (
                    <span className="groups-sets" data-testid="group-sets">
                      {setsLabel(g.sets, NB)}
                    </span>
                  )}
                </th>
                {cell(g.count, 'seances')}
                {cell(g.indirect, 'indirect')}
                {cell(g.home ?? 0, 'maison')}
              </tr>
            );
          })}
        </tbody>
      </table>
      {legs?.cardio && <p className="groups-cardio" data-testid="groups-cardio">{legCardioSentence(legs.cardio, legs.cardioWeeks)}</p>}
    </section>
  );
}

/**
 * Cardio des jambes sous le tableau (version 1.45.0 : 3 séries par semaine à 45 min ou plus) : « Jambes : +3 séries pour
 * 62 min de cardio. » (semaine), « Jambes : +6 séries pour le cardio, 2 semaines à 45 min ou plus (95 min). » (mois).
 */
export function legCardioSentence(minutes: number, weeks?: number): string {
  const nb = '\u00a0';
  if (!weeks) return `Jambes${nb}: +${setsLabel(LEG_CARDIO_SETS, nb)} pour ${minutes}${nb}min de cardio.`;
  return `Jambes${nb}: +${setsLabel(LEG_CARDIO_SETS * weeks, nb)} pour le cardio, ${weeks}${nb}semaine${weeks > 1 ? 's' : ''} à ${LEG_CARDIO_MINUTES}${nb}min ou plus (${minutes}${nb}min).`;
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
