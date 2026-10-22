import { useState } from 'react';
import { useApp } from '../app/store';
import { useNow } from '../app/hooks';
import { pendingOccurrences, questionText, type Occurrence } from '../activities/model';

/**
 * Question d'une activité habituelle sur l'accueil : « Badminton lundi soir (21 h – 22 h 30) ? », « Oui » / « Non ».
 * Affichée après l'heure de fin, jusqu'au dimanche ; aucune saisie. « Oui » enregistre l'activité à la date du jour
 * de l'habitude, « Non » n'enregistre rien et la question ne revient plus pour ce jour.
 */
export function ActivityBanner() {
  const { habits, activities, answerActivity } = useApp();
  const now = useNow(60_000);
  const [failed, setFailed] = useState<string | null>(null);
  const pending = pendingOccurrences(habits, activities, now);
  if (pending.length === 0) return null;

  async function reply(o: Occurrence, yes: boolean) {
    const key = `${o.habit.id}|${o.date}`;
    setFailed((await answerActivity(o, yes)) ? null : key);
  }

  return (
    <>
      {pending.map((o) => {
        const key = `${o.habit.id}|${o.date}`;
        const question = questionText(o);
        return (
          <div key={key} className="banner info activity-banner" role="group" aria-label={question} data-habit={o.habit.id}>
            <span>{question}</span>
            <span className="row">
              <button type="button" className="btn primary" onClick={() => void reply(o, true)}>
                Oui
              </button>
              <button type="button" className="btn" onClick={() => void reply(o, false)}>
                Non
              </button>
            </span>
            {failed === key && (
              <p className="report-message small" role="alert">
                Réponse non enregistrée : réessayez.
              </p>
            )}
          </div>
        );
      })}
    </>
  );
}
