import { useMemo, useState } from 'react';
import { useApp } from '../../app/store';
import { formatDay, localDate } from '../../session/format';
import { parseJsonImport, planImport, type Backup } from '../../transfer/backup';
import {
  draftFromNotes,
  draftProblems,
  finalizeDrafts,
  hasBlockingProblems,
  previewEvaluations,
  type DraftSession,
} from '../../transfer/draft';
import { EMPTY_BODY, planBodyImport } from '../../body/model';
import { sanitizeRecapSettings } from '../../analysis/weekly';
import { sanitizeReportSettings } from '../../analysis/report';
import { sanitizeCardioMachines, upgradeCardioMachines } from '../../cardio/model';
import { doneActivities, mergeActivities, sanitizeHabits } from '../../activities/model';
import { currentPlan, mergePlan, planExercises } from '../../plan/model';
import { useBody } from '../../body/store';
import { downloadBackup } from '../download';
import { checkImportFile } from '../../transfer/file';
import { DraftSessionEditor, ProblemList } from '../import/DraftEditor';

type Analysis =
  | { kind: 'drafts'; id: number; drafts: DraftSession[]; notes: string[] }
  | { kind: 'backup'; id: number; backup: Backup }
  | { kind: 'error'; id: number; message: string; details: string[] };

type Outcome = { kind: 'ok' | 'error'; text: string };

/** Import et export des données (§11, §12). */
export function DataScreen() {
  const { sessions, exercises, lastExportAt, markExported, generalSettings, cardioMachines, activities, plan } = useApp();
  const body = useBody();
  const [text, setText] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [counter, setCounter] = useState(0);

  async function exportNow() {
    const bodyTracking = await body.snapshot();
    const at = downloadBackup({ sessions, exercises, bodyTracking: bodyTracking ?? undefined, settings: generalSettings, activities, plan });
    const ok = await markExported(at);
    setOutcome(ok ? { kind: 'ok', text: 'Sauvegarde téléchargée.' } : { kind: 'error', text: 'Sauvegarde téléchargée, mais sa date n’a pas pu être enregistrée.' });
  }

  function analyze(content: string) {
    setOutcome(null);
    const trimmed = content.trim();
    const id = counter + 1;
    setCounter(id);
    if (!trimmed) {
      setAnalysis({ kind: 'error', id, message: 'Colle des notes de séance ou du JSON, ou choisis un fichier.', details: [] });
      return;
    }
    const today = localDate(Date.now());
    if (/^[[{]/.test(trimmed)) {
      const parsed = parseJsonImport(trimmed, exercises, today, cardioMachines);
      setAnalysis({ ...parsed, id });
    } else {
      setAnalysis({ kind: 'drafts', id, drafts: [draftFromNotes(trimmed, exercises, today, cardioMachines)], notes: [] });
    }
  }

  async function readFile(file: File | undefined) {
    if (!file) return;
    // Aucun filtre de type au choix du fichier (Android ne reconnaît pas toujours un .json reçu par mail
    // ou Drive) : le contenu est validé après lecture.
    let content: string;
    try {
      content = await file.text();
    } catch {
      setAnalysis({ kind: 'error', id: counter + 1, message: 'Impossible de lire ce fichier.', details: [] });
      return;
    }
    const check = checkImportFile(file.name, file.size, content);
    if (check) {
      setText('');
      setAnalysis({ kind: 'error', id: counter + 1, message: check, details: [`Fichier : ${file.name}`] });
      return;
    }
    setText(content);
    analyze(content);
  }

  function done(result: Outcome) {
    setOutcome(result);
    if (result.kind === 'ok') {
      setAnalysis(null);
      setText('');
    }
    window.scrollTo(0, 0);
  }

  return (
    <main className="screen data">
      <header className="simple-header">
        <a href="#/plus" className="back" aria-label="Plus">
          ‹
        </a>
        <h1>Importer / exporter</h1>
      </header>

      {outcome && (
        <p className={`banner ${outcome.kind === 'ok' ? 'info' : 'error-inline'}`} role="status">
          {outcome.text}
        </p>
      )}

      <section className="data-section frame">
        <h2>Exporter</h2>
        <p className="muted small">
          Sauvegarde complète (séances, activités, exercices, synonymes, réglages), à réimporter sur cet appareil ou un autre.{' '}
          {lastExportAt ? `Dernier export : ${formatDay(lastExportAt)}.` : 'Aucun export pour l’instant.'}
        </p>
        <button type="button" className="btn primary big" onClick={() => void exportNow()}>
          Exporter mes données
        </button>
      </section>

      <section className="data-section frame">
        <h2>Importer</h2>
        <label htmlFor="import-text">Notes de séance ou JSON</label>
        <textarea
          id="import-text"
          rows={8}
          value={text}
          spellCheck={false}
          placeholder={'Seated row horizontal\n3x8x48kg =\n\nLat pulldown\n3×9×36 kgs -='}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="row">
          <button type="button" className="btn primary" onClick={() => analyze(text)}>
            Analyser
          </button>
          <label className="btn file-btn">
            Choisir un fichier
            <input
              className="visually-hidden"
              type="file"
              accept="*/*"
              aria-label="Fichier à importer"
              onChange={(e) => {
                void readFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
        </div>
        <p className="muted small">Un bloc de notes correspond à une séance : pour plusieurs séances, importe les blocs l’un après l’autre.</p>
      </section>

      {analysis?.kind === 'error' && (
        <div className="banner error-inline" role="alert">
          <div>
            <p>{analysis.message}</p>
            {analysis.details.length > 0 && (
              <ul className="small">
                {analysis.details.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      {analysis?.kind === 'drafts' && <DraftsPreview key={analysis.id} initial={analysis.drafts} notes={analysis.notes} onDone={done} />}
      {analysis?.kind === 'backup' && <BackupPreview key={analysis.id} backup={analysis.backup} onDone={done} />}
    </main>
  );
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`;
}

/** Aperçu éditable des séances détectées (notes ou JSON simple), puis confirmation. */
function DraftsPreview({ initial, notes, onDone }: { initial: DraftSession[]; notes: string[]; onDone(outcome: Outcome): void }) {
  const { sessions, exercises, replay, importData, cardioMachines } = useApp();
  const [drafts, setDrafts] = useState(initial);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);

  const problems = useMemo(
    () => new Map(drafts.map((d) => [d.key, draftProblems(d, { sessions, exercises, profile: replay.profile })])),
    [drafts, sessions, exercises, replay],
  );
  const evaluations = useMemo(() => previewEvaluations(drafts, exercises, sessions), [drafts, exercises, sessions]);
  const blocking = [...problems.values()].flat().filter((p) => p.level === 'error');
  // Dans le récapitulatif, chaque problème est rattaché au nom lu de son exercice.
  const names = new Map(
    drafts.flatMap((d) => [
      ...d.exercises.map((e) => [e.key, e.sourceName || 'Sans nom'] as const),
      ...d.cardio.map((c) => [c.key, c.sourceName || 'Cardio'] as const),
    ]),
  );
  const blockingLabeled = blocking.map((p) => (p.exerciseKey ? { ...p, message: `${names.get(p.exerciseKey)} : ${p.message}` } : p));
  const count = drafts.reduce((n, d) => n + d.exercises.filter((e) => e.include).length, 0);
  const cardioCount = drafts.reduce((n, d) => n + d.cardio.filter((c) => c.include).length, 0);
  const cardioText = cardioCount > 0 ? `, ${plural(cardioCount, 'bloc de cardio', 'blocs de cardio')}` : '';

  async function confirm() {
    if (hasBlockingProblems(blocking)) {
      setShowErrors(true);
      return;
    }
    setBusy(true);
    const result = finalizeDrafts(drafts, exercises, sessions, Date.now());
    const ok = await importData({ sessions: result.sessions, exercises: result.exercises });
    setBusy(false);
    onDone(
      ok
        ? {
            kind: 'ok',
            text:
              drafts.length > 1
                ? `${drafts.length} séances importées.`
                : `Séance importée : ${plural(result.sessions[0]?.performances.length ?? 0, 'exercice', 'exercices')}${
                    (result.sessions[0]?.cardio?.length ?? 0) > 0
                      ? `, ${plural(result.sessions[0]!.cardio!.length, 'bloc de cardio', 'blocs de cardio')}`
                      : ''
                  }.`,
          }
        : { kind: 'error', text: 'L’import a échoué : aucune donnée n’a été modifiée. Réessaie.' },
    );
  }

  return (
    <section className="data-section preview frame" aria-label="Aperçu de l’import">
      <h2>Aperçu</h2>
      {notes.map((n, i) => (
        <p key={i} className="muted small">
          {n}
        </p>
      ))}
      {drafts.map((d) => (
        <DraftSessionEditor
          key={d.key}
          draft={d}
          problems={problems.get(d.key) ?? []}
          evaluations={evaluations.get(d.key)}
          exercises={exercises}
          machines={cardioMachines}
          onChange={(next) => setDrafts((list) => list.map((x) => (x.key === next.key ? next : x)))}
        />
      ))}
      {showErrors && blocking.length > 0 && (
        <div className="to-fix" role="alert">
          <p>À corriger avant l’import :</p>
          <ProblemList problems={blockingLabeled} />
        </div>
      )}
      <button type="button" className="btn primary big" disabled={busy} onClick={() => void confirm()}>
        {drafts.length > 1 ? `Importer les ${drafts.length} séances` : `Importer la séance (${plural(count, 'exercice', 'exercices')}${cardioText})`}
      </button>
    </section>
  );
}

/** Aperçu d'une sauvegarde MyFitApp : fusion par défaut, remplacement sur confirmation explicite. */
function BackupPreview({ backup, onDone }: { backup: Backup; onDone(outcome: Outcome): void }) {
  const {
    sessions,
    exercises,
    importData,
    markExported,
    generalSettings,
    setRecapSettings,
    setCardioMachines,
    setReportSettings,
    activities,
    setHabits,
    plan: localPlan,
  } = useApp();
  const body = useBody();
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const plan = useMemo(
    () => planImport(backup, { sessions, exercises }, { mode: 'merge', includeDuplicates }),
    [backup, sessions, exercises, includeDuplicates],
  );
  const importedBody = backup.bodyTracking ?? EMPTY_BODY;
  const bodyPlan = useMemo(() => planBodyImport(importedBody, body.data, 'merge'), [importedBody, body.data]);
  const bodyChanges = bodyPlan.weighIns.length > 0 || bodyPlan.heightCm !== undefined;
  // Activités habituelles : celles de l'appareil sont gardées, les autres ajoutées sans doublon.
  const mergedActivities = useMemo(() => mergeActivities(activities, backup.activities), [activities, backup.activities]);
  const newActivities = doneActivities(mergedActivities).length - doneActivities(activities).length;
  const activityChanges = mergedActivities.length !== activities.length;
  // Séance prévue : celle de l'appareil est gardée ; sans plan ici, celle de la sauvegarde est reprise.
  const planMerge = useMemo(
    () => mergePlan(localPlan, backup.plan, [...sessions, ...plan.sessions]),
    [localPlan, backup.plan, sessions, plan.sessions],
  );
  const exportedAt = Date.parse(backup.exportedAt);
  const failed: Outcome = { kind: 'error', text: 'L’import a échoué : aucune donnée n’a été modifiée. Réessaie.' };

  async function merge() {
    setBusy(true);
    const ok = await importData({
      sessions: plan.sessions,
      exercises: plan.exercises,
      ...(activityChanges ? { activities: mergedActivities } : {}),
      ...(planMerge.added ? { plan: planMerge.plan } : {}),
    });
    // Suivi corporel : base séparée, importé après les séances ; un échec ici n'annule pas les séances.
    const bodyOk = !ok || !bodyChanges || (await body.applyImport(bodyPlan));
    setBusy(false);
    onDone(
      ok
        ? {
            kind: bodyOk ? 'ok' : 'error',
            text: `Import terminé : ${plural(plan.sessions.length, 'séance ajoutée', 'séances ajoutées')}${
              newActivities > 0 ? `, ${plural(newActivities, 'activité ajoutée', 'activités ajoutées')}` : ''
            }${planMerge.added ? ', séance prévue ajoutée' : ''}${
              bodyPlan.weighIns.length > 0 ? `, ${plural(bodyPlan.weighIns.length, 'pesée ajoutée', 'pesées ajoutées')}` : ''
            }.${bodyOk ? '' : ' Les pesées n’ont pas pu être importées.'}`,
          }
        : failed,
    );
  }

  async function replace() {
    setBusy(true);
    // Les données actuelles sont sauvegardées avant d'être remplacées.
    const currentBody = await body.snapshot();
    await markExported(downloadBackup({ sessions, exercises, bodyTracking: currentBody ?? undefined, settings: generalSettings, activities, plan: localPlan }));
    const ok = await importData({
      sessions: backup.sessions,
      exercises: backup.exercises,
      activities: backup.activities,
      plan: currentPlan(backup.plan, backup.sessions),
      replace: true,
    });
    // Remplacement global : les réglages de la sauvegarde remplacent aussi ceux de l'appareil.
    if (ok && backup.settings.weeklyRecap !== undefined) await setRecapSettings(sanitizeRecapSettings(backup.settings.weeklyRecap));
    if (ok && backup.settings.reports !== undefined) await setReportSettings(sanitizeReportSettings(backup.settings.reports));
    if (ok && backup.settings.habits !== undefined) await setHabits(sanitizeHabits(backup.settings.habits));
    if (ok && backup.settings.cardioMachines !== undefined) {
      const version = backup.settings.cardioMachinesVersion;
      const from = typeof version === 'number' ? version : 1;
      await setCardioMachines(upgradeCardioMachines(sanitizeCardioMachines(backup.settings.cardioMachines), from));
    }
    const bodyOk = !ok || (await body.applyImport(planBodyImport(importedBody, body.data, 'replace')));
    setBusy(false);
    onDone(
      ok
        ? { kind: bodyOk ? 'ok' : 'error', text: `Données remplacées par la sauvegarde.${bodyOk ? '' : ' Les pesées n’ont pas pu être remplacées.'}` }
        : failed,
    );
  }

  return (
    <section className="data-section preview frame" aria-label="Aperçu de l’import">
      <h2>Sauvegarde MyFitApp</h2>
      <p className="muted small">
        {Number.isFinite(exportedAt) && `Exportée le ${formatDay(exportedAt)} · `}
        {plural(backup.sessions.length, 'séance', 'séances')}
        {doneActivities(backup.activities).length > 0 && ` · ${plural(doneActivities(backup.activities).length, 'activité', 'activités')}`} ·{' '}
        {plural(backup.exercises.length, 'exercice', 'exercices')}
      </p>

      {plan.blocking.length > 0 ? (
        <div className="banner error-inline" role="alert">
          <div>
            <p>Cette sauvegarde est incompatible avec les données de l’appareil : rien ne sera importé.</p>
            <ul className="small">
              {plan.blocking.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <>
          <ul className="plan">
            <li data-testid="plan-new">{plural(plan.sessions.length, 'séance à ajouter', 'séances à ajouter')}</li>
            {newActivities > 0 && <li data-testid="plan-activities">{plural(newActivities, 'activité à ajouter', 'activités à ajouter')}</li>}
            {planMerge.added && planMerge.plan && (
              <li data-testid="plan-session-plan">Séance prévue à ajouter ({plural(planExercises(planMerge.plan).length, 'exercice', 'exercices')})</li>
            )}
            {planMerge.keptLocal && <li>Séance prévue différente : celle de l’appareil est conservée</li>}
            {plan.identical.length > 0 && <li>{plural(plan.identical.length, 'séance déjà présente', 'séances déjà présentes')} (ignorées)</li>}
            {plan.exercises.length > 0 && <li>{plural(plan.exercises.length, 'exercice nouveau ou complété', 'exercices nouveaux ou complétés')}</li>}
            {plan.conflicts.length > 0 && (
              <li>
                {plural(plan.conflicts.length, 'séance modifiée depuis', 'séances modifiées depuis')} : la version de l’appareil est conservée
              </li>
            )}
            {plan.exerciseConflicts.length > 0 && (
              <li>
                Exercices modifiés des deux côtés ({plan.exerciseConflicts.map((e) => e.name).join(', ')}) : la version de l’appareil est
                conservée, synonymes et variantes ajoutés
              </li>
            )}
            {plan.skippedActive.length > 0 && <li>Séance en cours de la sauvegarde ignorée : une séance est déjà en cours ici</li>}
            {bodyPlan.weighIns.length > 0 && <li data-testid="plan-weighins">{plural(bodyPlan.weighIns.length, 'pesée à ajouter', 'pesées à ajouter')}</li>}
            {bodyPlan.heightCm !== undefined && <li>Taille : {bodyPlan.heightCm} cm</li>}
            {bodyPlan.conflicts.length > 0 && (
              <li>{plural(bodyPlan.conflicts.length, 'pesée différente', 'pesées différentes')} à la même date : la pesée de l’appareil est conservée</li>
            )}
            {bodyPlan.heightConflict && <li>Taille différente : celle de l’appareil est conservée</li>}
          </ul>
          {plan.duplicates.length > 0 && (
            <label className="check-line warn">
              <input type="checkbox" checked={includeDuplicates} onChange={(e) => setIncludeDuplicates(e.target.checked)} />
              <span>
                {plural(plan.duplicates.length, 'doublon potentiel', 'doublons potentiels')} (même date, mêmes exercices, poids et répétitions).
                Les importer quand même.
              </span>
            </label>
          )}
          {plan.sessions.length === 0 && plan.exercises.length === 0 && !bodyChanges && !activityChanges && !planMerge.added ? (
            <p className="banner info">Rien de nouveau à importer.</p>
          ) : (
            <button type="button" className="btn primary big" disabled={busy} onClick={() => void merge()}>
              Ajouter à mes données
            </button>
          )}
        </>
      )}

      <details className="replace">
        <summary>Remplacer toutes mes données par cette sauvegarde</summary>
        <p className="small">
          Toutes les séances, activités et tous les exercices de cet appareil, y compris une séance en cours et la séance prévue, seront remplacés. Une sauvegarde des
          données actuelles sera d’abord téléchargée.
        </p>
        <label className="check-line warn">
          <input type="checkbox" checked={replaceConfirmed} onChange={(e) => setReplaceConfirmed(e.target.checked)} />
          <span>Je confirme le remplacement de toutes mes données.</span>
        </label>
        {replaceConfirmed && (
          <button type="button" className="btn danger big" disabled={busy} onClick={() => void replace()}>
            Remplacer mes données
          </button>
        )}
      </details>
    </section>
  );
}
