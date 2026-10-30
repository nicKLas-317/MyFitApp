import { useWidth } from './useWidth';

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
  /**
   * Amplitude minimale de l'axe autour de la ligne de référence (version 1.33.0) : 5 pour un indice, axe de 95 à 105,
   * élargi si les valeurs en sortent. Une variation minime ne remplit plus toute la hauteur.
   */
  span?: number;
}

const H = 160;
const M = { top: 16, right: 16, bottom: 24, left: 48 };
/** Écart vertical minimal entre deux étiquettes de l'axe. */
const LABEL_GAP = 16;

const toTime = (date: string) => Date.parse(`${date}T00:00:00Z`);
const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
const shortDate = (date: string) => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(toTime(date));

export function LineChart({ data, label, unit, testId, baseline, span }: Props) {
  // Dessin à l'échelle 1 (largeur réelle) : les étiquettes gardent leur taille de police, 13 px.
  const [ref, W] = useWidth<SVGSVGElement>(320);
  if (data.length === 0) return null;
  const xs = data.map((d) => toTime(d.date));
  const ys = data.map((d) => d.value);
  const [xMin, xMax] = [Math.min(...xs), Math.max(...xs)];
  let [yMin, yMax] = [Math.min(...ys, ...(baseline === undefined ? [] : [baseline])), Math.max(...ys, ...(baseline === undefined ? [] : [baseline]))];
  // Bornes de l'amplitude minimale, gardées telles quelles (et étiquetées) tant qu'aucune valeur n'en sort.
  const bounds: number[] = [];
  if (span !== undefined && baseline !== undefined) {
    const [low, high] = [baseline - span, baseline + span];
    const pad = (Math.max(yMax, high) - Math.min(yMin, low)) * 0.1;
    if (yMin >= low) bounds.push(low);
    if (yMax <= high) bounds.push(high);
    yMin = yMin >= low ? low : yMin - pad;
    yMax = yMax <= high ? high : yMax + pad;
  } else {
    if (yMin === yMax) {
      yMin -= 1;
      yMax += 1;
    }
    const pad = (yMax - yMin) * 0.1;
    yMin -= pad;
    yMax += pad;
  }
  const x = (t: number) => (xMax === xMin ? M.left + (W - M.left - M.right) / 2 : M.left + ((t - xMin) / (xMax - xMin)) * (W - M.left - M.right));
  const y = (v: number) => M.top + (1 - (v - yMin) / (yMax - yMin)) * (H - M.top - M.bottom);
  // Étiquettes de l'axe : maximum, ligne de référence, minimum ; une étiquette trop proche d'une autre déjà placée
  // n'est pas dessinée (elles se chevaucheraient).
  const yLabels: number[] = [];
  for (const v of [Math.max(...ys), ...(baseline === undefined ? [] : [baseline]), Math.min(...ys), ...bounds]) {
    if (yLabels.every((u) => Math.abs(y(u) - y(v)) >= LABEL_GAP)) yLabels.push(v);
  }
  const points = data.map((d, i) => `${x(xs[i]!).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ');
  const first = data[0]!;
  const last = data[data.length - 1]!;
  // Texte du lecteur d'écran (version 1.33.0) : pas d'espace pour une unité vide, pas de point après « 29 oct. ».
  const value = (v: number) => (unit ? `${fmt(v)} ${unit}` : fmt(v));
  const end = shortDate(last.date);
  const summary = `${label} : ${data.length} point${data.length > 1 ? 's' : ''}, de ${value(first.value)} le ${shortDate(first.date)} à ${value(last.value)} le ${end}${end.endsWith('.') ? '' : '.'}`;

  return (
    <svg ref={ref} className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} data-testid={testId} data-points={data.length} data-values={ys.map((v) => v.toFixed(2)).join(' ')}>
      <line className="chart-axis" x1={M.left} y1={H - M.bottom} x2={W - M.right} y2={H - M.bottom} />
      {baseline !== undefined && <line className="chart-baseline" x1={M.left} y1={y(baseline)} x2={W - M.right} y2={y(baseline)} />}
      {yLabels.map((v) => (
        <text key={v} className="chart-label" x={M.left - 6} y={y(v) + 4} textAnchor="end">
          {fmt(v)}
        </text>
      ))}
      <text className="chart-label" x={M.left} y={H - 6}>
        {shortDate(first.date)}
      </text>
      {data.length > 1 && (
        <text className="chart-label" x={W - M.right} y={H - 4} textAnchor="end">
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
