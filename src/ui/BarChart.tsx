import { useWidth } from './useWidth';

/**
 * Barres empilées minimales en SVG (§19.10) : une barre par semaine, la part principale en plein et la part
 * indirecte en plus clair au-dessus. Couleur du groupe (`--group-color`), jamais une couleur de statut.
 * Moyenne (version 1.34.0) : ligne horizontale en pointillés, étiquetée dans une bande au-dessus des barres (un trait
 * pointillé puis « Moyenne : 9,2 »), pour ne jamais recouvrir une barre ni un total. Ordre de dessin : barres, moyenne,
 * puis étiquettes, détourées de la couleur du fond : la ligne s'interrompt sous un total qu'elle traverse.
 * Semaine en cours (`current`, la dernière barre) : plus transparente, avec un contour, et « en cours » sous la date.
 */
export interface BarDatum {
  /** Libellé court de l'abscisse (« 5 oct. »). */
  label: string;
  /** Part pleine. */
  main: number;
  /** Part claire, empilée au-dessus. */
  extra: number;
}

interface Props {
  data: readonly BarDatum[];
  /** Libellé accessible. */
  label: string;
  /** Moyenne à tracer en pointillés ; aucune ligne sans elle. */
  average?: number | null;
  /** La dernière barre est la semaine en cours (pas encore terminée). */
  current?: boolean;
  testId?: string;
}

const H = 168;
const M = { top: 24, right: 8, bottom: 24, left: 8 };
/** Bande de l'étiquette de la moyenne, au-dessus des totaux. */
const LEGEND = 20;
/** Ligne « en cours » sous la date de la semaine en cours. */
const LINE = 16;
/** Largeur minimale d'une colonne pour écrire le total de chaque barre ; en dessous, une barre sur deux. */
const TOTAL_SLOT = 28;
const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });

export function BarChart({ data, label, average = null, current = false, testId }: Props) {
  // Dessin à l'échelle 1 (largeur réelle) : les étiquettes gardent leur taille de police, 13 px.
  const [ref, W] = useWidth<SVGSVGElement>(320);
  if (data.length === 0) return null;
  const top = average === null ? 0 : LEGEND;
  const bottom = M.bottom + (current ? LINE : 0);
  const height = H + top + (current ? LINE : 0);
  const max = Math.max(1, average ?? 0, ...data.map((d) => d.main + d.extra));
  const slot = (W - M.left - M.right) / data.length;
  // Peu de semaines (début de l'historique, version 1.34.0) : barres plafonnées à 32 px, centrées dans leur colonne.
  const width = Math.min(32, Math.max(4, slot * 0.7));
  const h = (v: number) => (v / max) * (H - M.top - M.bottom);
  const base = height - bottom;
  // Libellés de l'abscisse : la première, la dernière et une sur quatre, pour rester lisible sur un téléphone ; avec
  // peu de semaines (colonnes d'au moins 64 px), toutes, centrées sous leur barre.
  const roomy = slot >= 64;
  const shown = (i: number) => roomy || i === 0 || i === data.length - 1 || i % 4 === 0;
  const anchor = (i: number) => (roomy ? 'middle' : i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle');
  // Totaux au-dessus des barres : tous si la place le permet, sinon un sur deux (et le dernier), sans chevauchement.
  const totalShown = (i: number) => slot >= TOTAL_SLOT || i % 2 === (data.length - 1) % 2;
  const xOf = (i: number) => M.left + i * slot + (slot - width) / 2;
  return (
    <svg
      ref={ref}
      className="chart bar-chart"
      viewBox={`0 0 ${W} ${height}`}
      role="img"
      aria-label={label}
      data-testid={testId}
      data-bars={data.length}
      data-average={average === null ? undefined : average.toFixed(2)}
    >
      <line className="chart-axis" x1={M.left} y1={base} x2={W - M.right} y2={base} />
      {data.map((d, i) => {
        const x = xOf(i);
        const total = d.main + d.extra;
        const now = current && i === data.length - 1;
        return (
          <g key={i} data-main={d.main} data-extra={d.extra} data-current={now || undefined}>
            {d.main > 0 && <rect className={`bar-main${now ? ' bar-current' : ''}`} x={x} y={base - h(d.main)} width={width} height={h(d.main)} rx={2} />}
            {d.extra > 0 && <rect className={`bar-extra${now ? ' bar-current' : ''}`} x={x} y={base - h(total)} width={width} height={h(d.extra)} rx={2} />}
            {now && total > 0 && <rect className="bar-outline" x={x + 0.75} y={base - h(total) + 0.75} width={width - 1.5} height={h(total) - 1.5} rx={2} />}
          </g>
        );
      })}
      {average !== null && (
        <g data-testid="chart-average">
          <line className="chart-baseline" x1={M.left} y1={base - h(average)} x2={W - M.right} y2={base - h(average)} />
          <line className="chart-baseline" x1={M.left} y1={LEGEND / 2} x2={M.left + 16} y2={LEGEND / 2} />
          <text className="chart-label" x={M.left + 22} y={LEGEND / 2 + 4}>
            Moyenne : {fmt(average)}
          </text>
        </g>
      )}
      {data.map((d, i) => {
        const x = xOf(i) + width / 2;
        const total = d.main + d.extra;
        const now = current && i === data.length - 1;
        return (
          <g key={i} data-labels={i}>
            {total > 0 && totalShown(i) && (
              <text className="chart-label chart-halo" x={x} y={base - h(total) - 4} textAnchor="middle" data-total>
                {fmt(total)}
              </text>
            )}
            {shown(i) && (
              <text className="chart-label" x={x} y={base + M.bottom - 4} textAnchor={anchor(i)} data-date>
                {d.label}
              </text>
            )}
            {now && (
              <text className="chart-label" x={x} y={height - 4} textAnchor={anchor(i)} data-testid="bar-current">
                en cours
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
