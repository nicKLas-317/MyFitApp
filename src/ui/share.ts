import { mailtoUrl } from '../analysis/report';

export type SendResult = 'shared' | 'mailto' | 'cancelled';

/**
 * Envoi d'un bilan sans serveur (§19.7) : partage natif d'Android (Web Share API, pour choisir Gmail), à défaut
 * un lien mailto prérempli. Un partage annulé par l'utilisateur n'ouvre rien d'autre.
 */
export async function sendByMail(subject: string, body: string, to: string): Promise<SendResult> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: subject, text: body });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      // Partage refusé ou indisponible : lien mailto.
    }
  }
  openMailto(to, subject, body);
  return 'mailto';
}

export function openMailto(to: string, subject: string, body: string): void {
  window.location.href = mailtoUrl(to, subject, body);
}

/** Copie le texte ; renvoie false si le navigateur la refuse. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Presse-papiers indisponible (contexte non sécurisé, autorisation refusée) : sélection classique.
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}
