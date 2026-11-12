import { mailtoUrl } from '../analysis/report';
import { downloadFile } from './download';

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

export type FileShareResult = 'shared' | 'downloaded' | 'cancelled';

/**
 * Partage un fichier par le partage natif d'Android (Web Share API, avec le fichier) quand le navigateur l'accepte ;
 * sinon, ou si le partage échoue, le télécharge (version 1.46.0, export pour le coach). Un partage annulé ne
 * télécharge rien.
 */
export async function shareFile(name: string, text: string, type: string, title: string): Promise<FileShareResult> {
  const file = new File([text], name, { type });
  if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      // Partage refusé : téléchargement.
    }
  }
  downloadFile(file, name);
  return 'downloaded';
}
