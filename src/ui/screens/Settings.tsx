import { useEffect, useState, type ReactNode } from 'react';
import { ActionMenu } from '../ActionMenu';
import { useApp } from '../../app/store';
import { parseHeight } from '../../body/model';
import { useBody } from '../../body/store';
import type { CardioMachine, MuscleGroup } from '../../domain/types';
import { machineListErrors, newMachine, type MachineListError } from '../../cardio/model';
import { isValidEmail } from '../../analysis/report';
import { HABIT_GROUPS, WEEKDAY_LABELS, WEEKDAYS, habitErrors, newHabit, type Habit, type HabitError, type Weekday } from '../../activities/model';
import { MUSCLE_GROUP_LABELS } from '../../library/seed';
import { Stepper } from '../ExerciseCard';

const PERSIST_LABELS = {
  granted: 'accordé',
  denied: 'non accordé (le navigateur peut effacer les données en cas de manque de place)',
  unsupported: 'non pris en charge par ce navigateur',
} as const;

export function Settings() {
  const { persist } = useApp();
  return (
    <main className="screen settings">
      <header className="simple-header">
        <a href="#/plus" className="back" aria-label="Plus">
          ‹
        </a>
        <h1>Réglages</h1>
      </header>
      <div className="settings-links">
        <a className="btn big" href="#/bibliotheque">
          Exercices, variantes et réglages par exercice
        </a>
      </div>
      <SettingsSection title="Taille" open>
        <HeightField />
      </SettingsSection>
      <SettingsSection title="Récapitulatif de la semaine">
        <RecapSettingsField />
      </SettingsSection>
      <SettingsSection title="Bilans de la semaine et du mois">
        <ReportSettingsField />
      </SettingsSection>
      <SettingsSection title="Activités habituelles">
        <HabitsField />
      </SettingsSection>
      <SettingsSection title="Machines de cardio">
        <CardioMachinesField />
      </SettingsSection>
      <dl className="settings-list frame">
        <dt>Stockage persistant</dt>
        <dd data-testid="persist-state">{persist ? PERSIST_LABELS[persist] : '…'}</dd>
        <dt>Version</dt>
        <dd>{__APP_VERSION__}</dd>
      </dl>
      <div className="settings-links">
        <a className="btn big" href="#/donnees">
          Importer / exporter
        </a>
      </div>
    </main>
  );
}

/** Section repliable des réglages : fermée à l'ouverture de l'écran, sauf la première. */
function SettingsSection({ title, open = false, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="frame settings-section" open={open}>
      <summary>
        <span className="section-title">{title}</span>
      </summary>
      <div className="settings-body" role="group" aria-label={title}>
        {children}
      </div>
    </details>
  );
}

/** Taille, saisie une seule fois (§14, §20). Indépendante des séances. */
function HeightField() {
  const { status, data, setHeight } = useBody();
  const [text, setText] = useState(data.heightCm === null ? '' : String(data.heightCm));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setText(data.heightCm === null ? '' : String(data.heightCm)), [data.heightCm]);
  if (status === 'error') return <p className="muted small">Suivi corporel indisponible sur cet appareil.</p>;

  async function save() {
    const parsed = parseHeight(text);
    if ('error' in parsed) return setMessage({ ok: false, text: 'Taille invalide : entre 80 et 250 cm.' });
    const ok = await setHeight(parsed.value);
    setMessage(ok ? { ok: true, text: 'Taille enregistrée.' } : { ok: false, text: 'Enregistrement impossible : réessaie.' });
  }

  return (
    <form
      className="name-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label htmlFor="height">Taille (cm)</label>
      <div className="row">
        <input id="height" type="text" inputMode="numeric" value={text} disabled={status !== 'ready'} onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="btn">
          Enregistrer
        </button>
      </div>
      {message && (
        <p className={message.ok ? 'ok-text small' : 'field-error'} role={message.ok ? 'status' : 'alert'}>
          {message.text}
        </p>
      )}
    </form>
  );
}

const RECAP_CHOICES: MuscleGroup[] = ['pectoraux', 'dos', 'epaules', 'biceps', 'triceps', 'jambes', 'abdominaux'];

/** Récapitulatif hebdomadaire de l'accueil (§19.6) : groupes affichés et seuil du rouge. */
function RecapSettingsField() {
  const { recapSettings, setRecapSettings } = useApp();
  const [failed, setFailed] = useState(false);
  const save = async (next: typeof recapSettings) => setFailed(!(await setRecapSettings(next)));

  return (
    <div className="recap-settings">
      <div className="feeling-options" role="group" aria-label="Groupes affichés">
        {RECAP_CHOICES.map((g) => {
          const on = recapSettings.groups.includes(g);
          return (
            <button
              key={g}
              type="button"
              className="chip"
              aria-pressed={on}
              disabled={on && recapSettings.groups.length === 1}
              onClick={() => {
                const groups = on ? recapSettings.groups.filter((x) => x !== g) : RECAP_CHOICES.filter((x) => x === g || recapSettings.groups.includes(x));
                void save({ ...recapSettings, groups });
              }}
            >
              {MUSCLE_GROUP_LABELS[g]}
            </button>
          );
        })}
      </div>
      <Stepper
        label="Rouge à partir de (séances)"
        value={recapSettings.redThreshold}
        min={2}
        max={7}
        onChange={(redThreshold) => void save({ ...recapSettings, redThreshold })}
      />
      {failed && (
        <p className="field-error" role="alert">
          Enregistrement impossible : réessaie.
        </p>
      )}
    </div>
  );
}

/** Bilans de la semaine et du mois (§19.7) : bandeaux de l'accueil et adresse préremplie dans le mail. */
function ReportSettingsField() {
  const { reportSettings, setReportSettings } = useApp();
  const [email, setEmail] = useState(reportSettings.email);
  // Cases cochées aussitôt, puis enregistrées ; rétablies si l'enregistrement échoue.
  const [shown, setShown] = useState(reportSettings);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setEmail(reportSettings.email), [reportSettings.email]);
  useEffect(() => setShown(reportSettings), [reportSettings]);
  const save = async (next: typeof reportSettings, done?: string) => {
    setShown(next);
    const ok = await setReportSettings(next);
    if (!ok) setShown(reportSettings);
    setMessage(ok ? (done ? { ok: true, text: done } : null) : { ok: false, text: 'Enregistrement impossible : réessaie.' });
  };

  return (
    <form
      className="name-form report-settings"
      // Contrôle de l'adresse par l'appli, avec un message en français, plutôt que la bulle du navigateur.
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = email.trim();
        if (!isValidEmail(trimmed)) return setMessage({ ok: false, text: 'Adresse e-mail invalide.' });
        void save({ ...reportSettings, email: trimmed }, trimmed ? 'Adresse enregistrée.' : 'Adresse retirée.');
      }}
    >
      <label className="check-line">
        <input type="checkbox" checked={shown.weekBanner} onChange={(e) => void save({ ...shown, weekBanner: e.target.checked })} />
        <span>Signaler le bilan de la semaine (pastille sur Progrès)</span>
      </label>
      <label className="check-line">
        <input type="checkbox" checked={shown.monthBanner} onChange={(e) => void save({ ...shown, monthBanner: e.target.checked })} />
        <span>Signaler le bilan du mois (pastille sur Progrès)</span>
      </label>
      <label htmlFor="report-email">Adresse e-mail (facultative, préremplie dans le mail)</label>
      <div className="row">
        <input id="report-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button type="submit" className="btn">
          Enregistrer l’adresse
        </button>
      </div>
      {/* Message neutre : pas de vert, d'orange ni de rouge hors des statuts (§19.7). */}
      {message && (
        <p className="report-message small" role={message.ok ? 'status' : 'alert'}>
          {message.text}
        </p>
      )}
    </form>
  );
}

const MACHINE_ERRORS: Record<MachineListError, string> = {
  empty_name: 'Chaque machine doit avoir un nom.',
  duplicate_name: 'Deux machines portent le même nom.',
  empty_list: 'Garde au moins une machine.',
};

/**
 * Machines de cardio proposées pendant la séance. Renommer ou retirer une machine ne modifie pas
 * les séances déjà enregistrées : chaque bloc garde le nom de sa machine.
 */
function CardioMachinesField() {
  const { cardioMachines, setCardioMachines } = useApp();
  const [list, setList] = useState<CardioMachine[]>(cardioMachines);
  const [added, setAdded] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setList(cardioMachines), [cardioMachines]);
  const dirty = JSON.stringify(list) !== JSON.stringify(cardioMachines);
  const errors = machineListErrors(list);

  const change = (next: CardioMachine[]) => {
    setMessage(null);
    setList(next);
  };

  async function save() {
    if (errors.length > 0) return;
    const ok = await setCardioMachines(list.map((m) => ({ ...m, name: m.name.trim() })));
    setMessage(ok ? { ok: true, text: 'Machines enregistrées.' } : { ok: false, text: 'Enregistrement impossible : réessaie.' });
  }

  return (
    <div className="cardio-machines">
      <ul className="machine-list">
        {list.map((m, i) => (
          <li key={m.id} className="machine-row">
            <input
              type="text"
              aria-label={`Nom de la machine ${i + 1}`}
              value={m.name}
              onChange={(e) => change(list.map((x) => (x.id === m.id ? { ...x, name: e.target.value } : x)))}
            />
            <button
              type="button"
              className="chip"
              aria-pressed={m.incline}
              aria-label={`Inclinaison : ${m.name}`}
              onClick={() => change(list.map((x) => (x.id === m.id ? { ...x, incline: !x.incline } : x)))}
            >
              Inclinaison
            </button>
            {list.length > 1 ? (
              <ActionMenu label={m.name.trim() || `Machine ${i + 1}`} actions={[{ label: 'Retirer', danger: true, onSelect: () => change(list.filter((x) => x.id !== m.id)) }]} />
            ) : (
              <span className="menu-placeholder" />
            )}
          </li>
        ))}
      </ul>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!added.trim()) return;
          change([...list, newMachine(added, false, list)]);
          setAdded('');
        }}
      >
        <input type="text" aria-label="Nouvelle machine" placeholder="Nouvelle machine" value={added} onChange={(e) => setAdded(e.target.value)} />
        <button type="submit" className="btn">
          Ajouter
        </button>
      </form>
      {dirty && errors.length > 0 && (
        <ul className="problems" role="alert">
          {errors.map((e) => (
            <li key={e} className="problem error">
              {MACHINE_ERRORS[e]}
            </li>
          ))}
        </ul>
      )}
      {dirty && (
        <div className="row">
          <button type="button" className="btn primary" disabled={errors.length > 0} onClick={() => void save()}>
            Enregistrer les machines
          </button>
          <button type="button" className="btn" onClick={() => change(cardioMachines)}>
            Annuler
          </button>
        </div>
      )}
      {message && (
        <p className={message.ok ? 'ok-text small' : 'field-error'} role={message.ok ? 'status' : 'alert'}>
          {message.text}
        </p>
      )}
      <p className="muted small">Les séances déjà enregistrées gardent le nom de leur machine.</p>
    </div>
  );
}

const HABIT_ERRORS: Record<HabitError, string> = {
  empty_name: 'Donne un nom à l’activité.',
  duplicate_name: 'Deux activités portent le même nom.',
  bad_time: 'Heures de début et de fin à indiquer.',
  end_before_start: 'L’heure de fin doit suivre l’heure de début (même jour).',
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Activités habituelles hors salle (badminton…) : jour, heures et groupes sollicités. Après l'heure de fin, l'accueil
 * demande « Oui » ou « Non ». Désactiver une activité (vacances) suspend la question. Modifier ou supprimer une
 * habitude ne change pas les activités déjà enregistrées.
 */
function HabitsField() {
  const { habits, setHabits } = useApp();
  const [list, setList] = useState<Habit[]>(habits);
  const [added, setAdded] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setList(habits), [habits]);
  const dirty = JSON.stringify(list) !== JSON.stringify(habits);
  const errors = new Map(list.map((h) => [h.id, habitErrors(h, list)]));
  const invalid = [...errors.values()].some((e) => e.length > 0);

  const change = (next: Habit[]) => {
    setMessage(null);
    setList(next);
  };
  const update = (id: string, patch: Partial<Habit>) => change(list.map((h) => (h.id === id ? { ...h, ...patch } : h)));

  async function save() {
    if (invalid) return;
    const ok = await setHabits(list.map((h) => ({ ...h, name: h.name.trim() })));
    setMessage(ok ? { ok: true, text: 'Activités enregistrées.' } : { ok: false, text: 'Enregistrement impossible : réessaie.' });
  }

  return (
    <div className="habits">
      <p className="muted small">Hors salle : après l’heure de fin, l’accueil demande si l’activité a eu lieu.</p>
      {list.length === 0 && <p className="muted small">Aucune activité habituelle.</p>}
      <ul className="habit-list">
        {list.map((h, i) => {
          const name = h.name.trim() || `Activité ${i + 1}`;
          return (
            <li key={h.id} className="habit-row" aria-label={name}>
              <input type="text" aria-label={`Nom de l’activité ${i + 1}`} value={h.name} onChange={(e) => update(h.id, { name: e.target.value })} />
              <div className="habit-when">
                <select aria-label={`Jour : ${name}`} value={h.weekday} onChange={(e) => update(h.id, { weekday: Number(e.target.value) as Weekday })}>
                  {WEEKDAYS.map((d) => (
                    <option key={d} value={d}>
                      {capitalize(WEEKDAY_LABELS[d])}
                    </option>
                  ))}
                </select>
                <input type="time" aria-label={`Début : ${name}`} value={h.start} onChange={(e) => update(h.id, { start: e.target.value })} />
                <span className="habit-end">
                  <span aria-hidden="true">–</span>
                  <input type="time" aria-label={`Fin : ${name}`} value={h.end} onChange={(e) => update(h.id, { end: e.target.value })} />
                </span>
              </div>
              <div className="feeling-options" role="group" aria-label={`Groupes sollicités : ${name}`}>
                {HABIT_GROUPS.map((g) => {
                  const on = h.groups.includes(g);
                  return (
                    <button
                      key={g}
                      type="button"
                      className="chip"
                      aria-pressed={on}
                      onClick={() => update(h.id, { groups: on ? h.groups.filter((x) => x !== g) : HABIT_GROUPS.filter((x) => x === g || h.groups.includes(x)) })}
                    >
                      {MUSCLE_GROUP_LABELS[g]}
                    </button>
                  );
                })}
              </div>
              <div className="row">
                <label className="check-line">
                  <input type="checkbox" checked={h.enabled} onChange={(e) => update(h.id, { enabled: e.target.checked })} />
                  <span>Activée</span>
                </label>
                <button type="button" className="btn" aria-label={`Supprimer ${name}`} onClick={() => change(list.filter((x) => x.id !== h.id))}>
                  Supprimer
                </button>
              </div>
              {dirty && (errors.get(h.id) ?? []).length > 0 && (
                <ul className="problems" role="alert">
                  {errors.get(h.id)!.map((e) => (
                    <li key={e} className="report-message small">
                      {HABIT_ERRORS[e]}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!added.trim()) return;
          change([...list, newHabit(added, list)]);
          setAdded('');
        }}
      >
        <input type="text" aria-label="Nouvelle activité" placeholder="Nouvelle activité" value={added} onChange={(e) => setAdded(e.target.value)} />
        <button type="submit" className="btn">
          Ajouter l’activité
        </button>
      </form>
      {dirty && (
        <div className="row">
          <button type="button" className="btn primary" disabled={invalid} onClick={() => void save()}>
            Enregistrer les activités
          </button>
          <button type="button" className="btn" onClick={() => change(habits)}>
            Annuler
          </button>
        </div>
      )}
      {message && (
        <p className="report-message small" role={message.ok ? 'status' : 'alert'}>
          {message.text}
        </p>
      )}
      <p className="muted small">Les activités déjà enregistrées gardent leur nom, leurs heures et leurs groupes.</p>
    </div>
  );
}
