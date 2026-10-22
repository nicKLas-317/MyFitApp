/**
 * Graphique d'évolution minimal en SVG (§19.2, §20) : une courbe dans le temps, sans dépendance.
 * Secondaire : il n'intervient jamais dans la saisie.
 */
export interface ChartDatum {
  /** Date YYYY-MM-DD. */
  date: string;
  value: number;
}

interface Props {
  data: readonly ChartDatum[];
  /** Libellé accessible : « Évolution de la charge ». */
  label: string;
  unit: string;
  testId?: string;
  /** Ligne de référence horizontale (ex. 100 pour un indice en base 100). */
  baseline?: number;
}

const W = 320;
const H = 140;
const M = { top: 12, right: 12, bottom: 22, left: 40 };

const toTime = (date: string) => Date.parse(`${date}T00:00:00Z`);
const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
const shortDate = (date: string) => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(toTime(date));

export function LineChart({ data, label, unit, testId, baseline }: Props) {
  if (data.length === 0) return null;
  const xs = data.map((d) => toTime(d.date));
  const ys = data.map((d) => d.value);
  const [xMin, xMax] = [Math.min(...xs), Math.max(...xs)];
  let [yMin, yMax] = [Math.min(...ys, ...(baseline === undefined ? [] : [baseline])), Math.max(...ys, ...(baseline === undefined ? [] : [baseline]))];
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const pad = (yMax - yMin) * 0.1;
  yMin -= pad;
  yMax += pad;
  const x = (t: number) => (xMax === xMin ? M.left + (W - M.left - M.right) / 2 : M.left + ((t - xMin) / (xMax - xMin)) * (W - M.left - M.right));
  const y = (v: number) => M.top + (1 - (v - yMin) / (yMax - yMin)) * (H - M.top - M.bottom);
  const points = data.map((d, i) => `${x(xs[i]!).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ');
  const first = data[0]!;
  const last = data[data.length - 1]!;
  const summary = `${label} : ${data.length} point${data.length > 1 ? 's' : ''}, de ${fmt(first.value)} ${unit} le ${shortDate(first.date)} à ${fmt(last.value)} ${unit} le ${shortDate(last.date)}.`;

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} data-testid={testId} data-points={data.length}>
      <line className="chart-axis" x1={M.left} y1={H - M.bottom} x2={W - M.right} y2={H - M.bottom} />
      {baseline !== undefined && (
        <>
          <line className="chart-baseline" x1={M.left} y1={y(baseline)} x2={W - M.right} y2={y(baseline)} />
          {baseline !== Math.max(...ys) && baseline !== Math.min(...ys) && (
            <text className="chart-label" x={M.left - 6} y={y(baseline) + 4} textAnchor="end">
              {fmt(baseline)}
            </text>
          )}
        </>
      )}
      <text className="chart-label" x={M.left - 6} y={y(Math.max(...ys)) + 4} textAnchor="end">
        {fmt(Math.max(...ys))}
      </text>
      {Math.min(...ys) !== Math.max(...ys) && (
        <text className="chart-label" x={M.left - 6} y={y(Math.min(...ys)) + 4} textAnchor="end">
          {fmt(Math.min(...ys))}
        </text>
      )}
      <text className="chart-label" x={M.left} y={H - 6}>
        {shortDate(first.date)}
      </text>
      {data.length > 1 && (
        <text className="chart-label" x={W - M.right} y={H - 6} textAnchor="end">
          {shortDate(last.date)}
        </text>
      )}
      {data.length > 1 && <polyline className="chart-line" points={points} />}
      {data.map((d, i) => (
        <circle key={`${d.date}-${i}`} className="chart-dot" cx={x(xs[i]!)} cy={y(d.value)} r={3} />
      ))}
    </svg>
  );
}
