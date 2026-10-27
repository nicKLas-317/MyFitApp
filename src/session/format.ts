const pad = (n: number) => String(n).padStart(2, '0');

/** Date locale de l'appareil au format YYYY-MM-DD. */
export function localDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const DAY_FORMAT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

/** « 12 octobre 2026 ». */
export function formatDay(ts: number): string {
  return DAY_FORMAT.format(new Date(ts));
}

/** « 15 h 45 », « 9 h 05 ». */
export function formatHour(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours()} h ${pad(d.getMinutes())}`;
}

/** Nom proposé par défaut (§5.6) : « Séance du 12 octobre 2026 — 15 h 45 ». */
export function defaultSessionName(startedAt: number): string {
  return `Séance du ${formatDay(startedAt)} — ${formatHour(startedAt)}`;
}

/** Durée de chronomètre : « 42:07 » ou « 1:02:33 ». */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Durée lisible : « 1 h 05 », « 42 min ». */
export function formatDurationLong(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(minutes / 60);
  return h > 0 ? `${h} h ${pad(minutes % 60)}` : `${minutes} min`;
}

/** Répétitions, ou durée d'un exercice en secondes (gainage) : « 9 », « 30 s ». */
export function formatReps(n: number, seconds = false): string {
  return seconds ? `${n} s` : String(n);
}

/** Séries × répétitions : « 3 × 9 », « 3 × 30 s ». */
export function formatSetsReps(sets: number, reps: number, seconds = false): string {
  return `${sets} × ${formatReps(reps, seconds)}`;
}

/** Poids en français : « 52,5 kg ». */
export function formatKg(kg: number): string {
  return `${kg.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} kg`;
}

/** Valeur pour un champ datetime-local (heure locale). */
export function toDateTimeLocal(ts: number): string {
  const d = new Date(ts);
  return `${localDate(ts)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDateTimeLocal(value: string): number | null {
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : null;
}

/** Date YYYY-MM-DD en français : « 12 octobre 2026 ». */
export function formatIsoDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return DAY_FORMAT.format(new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

const SHORT_DAY_FORMAT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

/** Date YYYY-MM-DD courte : « 15 oct. ». */
export function formatShortDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return SHORT_DAY_FORMAT.format(new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

const SHORT_DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

/** Date YYYY-MM-DD courte avec l'année : « 22 sept. 2026 ». */
export function formatShortDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return SHORT_DATE_FORMAT.format(new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

/** Date courte numérique, « 15/10 » : tient sur une ligne même sur un petit écran. */
export function formatNumericDay(date: string): string {
  const [, m, d] = date.split('-');
  return `${d}/${m}`;
}

/** Nom d'une séance importée sans heure connue : « Séance du 12 octobre 2026 ». */
export function importedSessionName(date: string): string {
  return `Séance du ${formatIsoDay(date)}`;
}

export function isIsoDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}
