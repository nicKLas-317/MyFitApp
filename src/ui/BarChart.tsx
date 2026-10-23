import { useWidth } from './useWidth';

/**
 * Barres empilées minimales en SVG (§19.10) : une barre par semaine, la part principale en plein et la part
 * indirecte en plus clair au-dessus. Couleur du groupe (`--group-color`), jamais une couleur de statut.
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
  testId?: string;
}

const H = 168;
const M = { top: 24, right: 8, bottom: 24, left: 8 };
/** Largeur minimale d'une colonne pour écrire le total de chaque barre ; en dessous, une barre sur deux. */
const TOTAL_SLOT = 28;
const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });

export function BarChart({ data, label, testId }: Props) {
  // Dessin à l'échelle 1 (largeur réelle) : les étiquettes gardent leur taille de police, 13 px.
  const [ref, W] = useWidth<SVGSVGElement>(320);
  if (data.length === 0) return null;
  const max = Math.max(1, ...data.map((d) => d.main + d.extra));
  const slot = (W - M.left - M.right) / data.length;
  const width = Math.max(4, slot * 0.7);
  const h = (v: number) => (v / max) * (H - M.top - M.bottom);
  const base = H - M.bottom;
  // Libellés de l'abscisse : la première, la dernière et une sur quatre, pour rester lisible sur un téléphone.
  const shown = (i: number) => i === 0 || i === data.length - 1 || i % 4 === 0;
  // Totaux au-dessus des barres : tous si la place le permet, sinon un sur deux (et le dernier), sans chevauchement.
  const totalShown = (i: number) => slot >= TOTAL_SLOT || i % 2 === (data.length - 1) % 2;
  return (
    <svg ref={ref} className="chart bar-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} data-testid={testId} data-bars={data.length}>
      <line className="chart-axis" x1={M.left} y1={base} x2={W - M.right} y2={base} />
      {data.map((d, i) => {
        const x = M.left + i * slot + (slot - width) / 2;
        const total = d.main + d.extra;
        return (
          <g key={i} data-main={d.main} data-extra={d.extra}>
            {d.main > 0 && <rect className="bar-main" x={x} y={base - h(d.main)} width={width} height={h(d.main)} rx={2} />}
            {d.extra > 0 && <rect className="bar-extra" x={x} y={base - h(total)} width={width} height={h(d.extra)} rx={2} />}
            {total > 0 && totalShown(i) && (
              <text className="chart-label" x={x + width / 2} y={base - h(total) - 4} textAnchor="middle">
                {fmt(total)}
              </text>
            )}
            {shown(i) && (
              <text className="chart-label" x={x + width / 2} y={H - 4} textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}>
                {d.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
