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

const W = 320;
const H = 150;
const M = { top: 16, right: 6, bottom: 22, left: 6 };
const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });

export function BarChart({ data, label, testId }: Props) {
  if (data.length === 0) return null;
  const max = Math.max(1, ...data.map((d) => d.main + d.extra));
  const slot = (W - M.left - M.right) / data.length;
  const width = Math.max(4, slot * 0.7);
  const h = (v: number) => (v / max) * (H - M.top - M.bottom);
  const base = H - M.bottom;
  // Libellés de l'abscisse : la première, la dernière et une sur quatre, pour rester lisible sur un téléphone.
  const shown = (i: number) => i === 0 || i === data.length - 1 || i % 4 === 0;
  return (
    <svg className="chart bar-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} data-testid={testId} data-bars={data.length}>
      <line className="chart-axis" x1={M.left} y1={base} x2={W - M.right} y2={base} />
      {data.map((d, i) => {
        const x = M.left + i * slot + (slot - width) / 2;
        const total = d.main + d.extra;
        return (
          <g key={i} data-main={d.main} data-extra={d.extra}>
            {d.main > 0 && <rect className="bar-main" x={x} y={base - h(d.main)} width={width} height={h(d.main)} rx={2} />}
            {d.extra > 0 && <rect className="bar-extra" x={x} y={base - h(total)} width={width} height={h(d.extra)} rx={2} />}
            {total > 0 && (
              <text className="chart-label" x={x + width / 2} y={base - h(total) - 4} textAnchor="middle">
                {fmt(total)}
              </text>
            )}
            {shown(i) && (
              <text className="chart-label" x={x + width / 2} y={H - 6} textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}>
                {d.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
