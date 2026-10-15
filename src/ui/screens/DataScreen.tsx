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
import { downloadBackup } from '../download';
import { DraftSessionEditor, ProblemList } from '../import/DraftEditor';

type Analysis =
  | { kind: 'drafts'; id: number; drafts: DraftSession[]; notes: string[] }
  | { kind: 'backup'; id: number; backup: Backup }
  | { kind: 'error'; id: number; message: string; details: string[] };

type Outcome = { kind: 'ok' | 'error'; text: string };

/** Import et export des données (§11, §12). */
export function DataScreen() {
  const { sessions, exercises, lastExportAt, markExported } = useApp();
  const [text, setText] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [counter, setCounter] = useState(0);

  async function exportNow() {
    const at = downloadBackup({ sessions, exercises });
    const ok = await markExported(at);
    setOutcome(ok ? { kind: 'ok', text: 'Sauvegarde téléchargée.' } : { kind: 'error', text: 'Sauvegarde téléchargée, mais sa date n’a pas pu être enregistrée.' });
  }

  function analyze(content: string) {
    setOutcome(null);
    const trimmed = content.trim();
    const id = counter + 1;
    setCounter(id);
    if (!trimmed) {
      setAnalysis({ kind: 'error', id, message: 'Collez des notes de séance ou du JSON, ou choisissez un fichier.', details: [] });
      return;
    }
    const today = localDate(Date.now());
    if (/^[[{]/.test(trimmed)) {
      const parsed = parseJsonImport(trimmed, exercises, today);
      setAnalysis({ ...parsed, id });
    } else {
      setAnalysis({ kind: 'drafts', id, drafts: [draftFromNotes(trimmed, exercises, today)], notes: [] });
    }
  }

  async function readFile(file: File | undefined) {
    if (!file) return;
    try {
      const content = await file.text();
      setText(content);
      analyze(content);
    } catch {
      setAnalysis({ kind: 'error', id: counter + 1, message: 'Impossible de lire ce fichier.', details: [] });
    }
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
        <a href="#/" className="back" aria-label="Accueil">
          ‹
        </a>
        <h1>Données</h1>
      </header>

      {outcome && (
        <p className={`banner ${outcome.kind === 'ok' ? 'info' : 'error-inline'}`} role="status">
          {outcome.text}
        </p>
      )}

      <section className="data-section">
        <h2>Exporter</h2>
        <p className="muted small">
          Sauvegarde complète (séances, exercices, synonymes, réglages), à réimporter sur cet appareil ou un autre.{' '}
          {lastExportAt ? `Dernier export : ${formatDay(lastExportAt)}.` : 'Aucun export pour l’instant.'}
        </p>
        <button type="button" className="btn primary big" onClick={() => void exportNow()}>
          Exporter mes données
        </button>
      </section>

      <section className="data-section">
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
              accept=".json,application/json,text/plain"
              aria-label="Fichier à importer"
              onChange={(e) => {
                void readFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
        </div>
        <p className="muted small">Un bloc de notes correspond à une séance : pour plusieurs séances, importez les blocs l’un après l’autre.</p>
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
  const { sessions, exercises, replay, importData } = useApp();
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
  const names = new Map(drafts.flatMap((d) => d.exercises.map((e) => [e.key, e.sourceName || 'Sans nom'] as const)));
  const blockingLabeled = blocking.map((p) => (p.exerciseKey ? { ...p, message: `${names.get(p.exerciseKey)} : ${p.message}` } : p));
  const count = drafts.reduce((n, d) => n + d.exercises.filter((e) => e.include).length, 0);

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
                : `Séance importée : ${plural(result.sessions[0]?.performances.length ?? 0, 'exercice', 'exercices')}.`,
          }
        : { kind: 'error', text: 'L’import a échoué : aucune donnée n’a été modifiée. Réessayez.' },
    );
  }

  return (
    <section className="data-section preview" aria-label="Aperçu de l’import">
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
        {drafts.length > 1 ? `Importer les ${drafts.length} séances` : `Importer la séance (${plural(count, 'exercice', 'exercices')})`}
      </button>
    </section>
  );
}

/** Aperçu d'une sauvegarde MyFitApp : fusion par défaut, remplacement sur confirmation explicite. */
function BackupPreview({ backup, onDone }: { backup: Backup; onDone(outcome: Outcome): void }) {
  const { sessions, exercises, importData, markExported } = useApp();
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const plan = useMemo(
    () => planImport(backup, { sessions, exercises }, { mode: 'merge', includeDuplicates }),
    [backup, sessions, exercises, includeDuplicates],
  );
  const exportedAt = Date.parse(backup.exportedAt);
  const failed: Outcome = { kind: 'error', text: 'L’import a échoué : aucune donnée n’a été modifiée. Réessayez.' };

  async function merge() {
    setBusy(true);
    const ok = await importData({ sessions: plan.sessions, exercises: plan.exercises });
    setBusy(false);
    onDone(
      ok
        ? { kind: 'ok', text: `Import terminé : ${plural(plan.sessions.length, 'séance ajoutée', 'séances ajoutées')}.` }
        : failed,
    );
  }

  async function replace() {
    setBusy(true);
    // Les données actuelles sont sauvegardées avant d'être remplacées.
    await markExported(downloadBackup({ sessions, exercises }));
    const ok = await importData({ sessions: backup.sessions, exercises: backup.exercises, replace: true });
    setBusy(false);
    onDone(ok ? { kind: 'ok', text: 'Données remplacées par la sauvegarde.' } : failed);
  }

  return (
    <section className="data-section preview" aria-label="Aperçu de l’import">
      <h2>Sauvegarde MyFitApp</h2>
      <p className="muted small">
        {Number.isFinite(exportedAt) && `Exportée le ${formatDay(exportedAt)} · `}
        {plural(backup.sessions.length, 'séance', 'séances')} · {plural(backup.exercises.length, 'exercice', 'exercices')}
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
          {plan.sessions.length === 0 && plan.exercises.length === 0 ? (
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
          Toutes les séances et tous les exercices de cet appareil, y compris une séance en cours, seront remplacés. Une sauvegarde des
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
