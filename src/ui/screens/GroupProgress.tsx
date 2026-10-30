import { useMemo } from 'react';
import { useApp } from '../../app/store';
import { useBody } from '../../body/store';
import { navigateReplace, useNow } from '../../app/hooks';
import type { WeighIn } from '../../body/model';
import type { MuscleGroup } from '../../domain/types';
import { GROUP_VIEW_GROUPS, type GroupSets, groupIndex, groupWeeklySets, notEnoughForIndex, notEnoughForSets, SETS_ONLY_GROUPS, SETS_WEEKS } from '../../analysis/groups';
import { displayName } from '../../library/catalog';
import { MUSCLE_GROUP_LABELS } from '../../library/seed';
import { formatShortDay } from '../../session/format';
import { BarChart } from '../BarChart';
import { ErrorBoundary } from '../ErrorBoundary';
import { groupColorProps } from '../groupColors';
import { LineChart } from '../LineChart';

export function groupOfSegment(segment: string | undefined): MuscleGroup {
  return GROUP_VIEW_GROUPS.find((g) => g === segment) ?? 'pectoraux';
}

const EMPTY: readonly WeighIn[] = [];

const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });

/**
 * Texte du lecteur d'écran des séries par semaine (version 1.34.0) : les valeurs, la moyenne, puis l'explication complète
 * que la légende visible abrège.
 */
function setsSummary(label: string, sets: GroupSets): string {
  const group = label.toLowerCase();
  const weeks = sets.weeks.map((w, i) => `semaine du ${formatShortDay(w.start)} ${fmt(w.total)}${i === sets.weeks.length - 1 ? ' (en cours)' : ''}`);
  const average = sets.average === null ? '' : ` Moyenne : ${fmt(sets.average)}, semaine en cours exclue.`;
  return (
    `Séries par semaine ${group} : ${weeks.join(', ')}.${average} Depuis ta première séance, ${SETS_WEEKS} semaines au plus, du lundi au dimanche ; ` +
    `en plein, les séries des exercices dont c’est le groupe principal ; en clair, les séries indirectes, comptées pour moitié ; ` +
    `en pointillés, la moyenne par semaine.`
  );
}

/**
 * Bilan par groupe musculaire (§19.10), vue secondaire du bilan : indice de progression (base 100) et séries par
 * semaine du groupe choisi, dans la couleur du groupe. En dessous des seuils, un message à la place du graphique.
 */
export function GroupProgress({ group }: { group: MuscleGroup }) {
  const { sessions, exercises, settings, variants } = useApp();
  const body = useBody();
  const weighIns = body.status === 'ready' ? body.data.weighIns : EMPTY;
  const now = useNow(60_000);
  const week = Math.floor(now / 3_600_000);
  const index = useMemo(() => groupIndex(sessions, exercises, settings, group, weighIns), [sessions, exercises, settings, group, weighIns]);
  const sets = useMemo(() => groupWeeklySets(sessions, exercises, group, Date.now()), [sessions, exercises, group, week]);
  const label = MUSCLE_GROUP_LABELS[group];
  const last = index.points.at(-1);

  return (
    <main className="screen group-progress">
      <header className="simple-header">
        <a href="#/progres" className="back" aria-label="Progrès">
          ‹
        </a>
        <h1>Par groupe musculaire</h1>
      </header>
      <div className="group-picker" role="group" aria-label="Groupe musculaire">
        {GROUP_VIEW_GROUPS.map((g) => (
          <button key={g} type="button" className="chip" aria-pressed={g === group} onClick={() => navigateReplace('bilan-groupes', g)}>
            {MUSCLE_GROUP_LABELS[g]}
          </button>
        ))}
      </div>

      <ErrorBoundary fallback={<p className="muted small">Graphiques indisponibles.</p>}>
        {/* Abdominaux (version 1.33.0) : exercices sans charge, pas d'indice ; seulement les séries par semaine. */}
        {SETS_ONLY_GROUPS.includes(group) ? (
          <p className="muted" data-testid="index-none">
            Pas d’indice de progression pour les {label.toLowerCase()} : il se calcule sur la charge, et ces exercices se font sans charge (poids du
            corps, durée).
          </p>
        ) : (
          <section className="frame group-chart" aria-label="Indice de progression" {...groupColorProps(group)}>
            <h2 className="section-title">Indice de progression</h2>
            <p className="muted small">
              Force estimée de chaque exercice (formule d’Epley, série la moins bonne), base 100 à sa première séance ; moyenne des exercices du
              groupe.
            </p>
            {index.enough ? (
              <>
                <p className="group-figure" data-testid="index-last">
                  {label} : <strong>{fmt(last!.value)}</strong>
                </p>
                <LineChart data={index.points} label={`Indice de progression ${label.toLowerCase()}`} unit="" baseline={100} span={5} testId="chart-index" />
                <p className="muted small" data-testid="index-exercises">
                  {index.variantIds.map((id) => displayName(variants.get(id))).join(' · ')}
                </p>
                {index.assistedMethod && (
                  <p className="muted small" data-testid="index-assisted">
                    {index.assistedMethod === 'bodyWeight'
                      ? 'Exercices assistés : charge réelle = poids du corps (interpolé entre les pesées de « Mon poids ») − aide.'
                      : 'Exercices assistés : sans pesée dans « Mon poids », la baisse de l’aide compte comme une hausse de charge.'}
                  </p>
                )}
              </>
            ) : (
              <p className="group-not-enough" data-testid="index-not-enough">
                {notEnoughForIndex(index)}
              </p>
            )}
          </section>
        )}

        <section className="frame group-chart" aria-label="Séries par semaine" {...groupColorProps(group)}>
          <h2 className="section-title">Séries par semaine</h2>
          {sets.enough ? (
            <>
              <p className="muted small" data-testid="sets-legend">
                {/* Espaces insécables : ni « : » ni « · » en début de ligne. */}
                {'Plein\u00a0: direct\u00a0· Clair\u00a0: indirect (÷\u00a02)\u00a0· Pointillés\u00a0: moyenne'}
              </p>
              <BarChart
                data={sets.weeks.map((w) => ({ label: formatShortDay(w.start), main: w.direct, extra: w.indirect / 2 }))}
                label={setsSummary(label, sets)}
                average={sets.average}
                current
                testId="chart-sets"
              />
            </>
          ) : (
            <p className="group-not-enough" data-testid="sets-not-enough">
              {notEnoughForSets(sets)}
            </p>
          )}
        </section>
      </ErrorBoundary>
    </main>
  );
}
