/**
 * Contrôle d'un fichier choisi pour l'import (§11.1). Le sélecteur n'impose aucun type : sur Android, un .json
 * reçu par mail ou Drive est souvent annoncé en application/octet-stream ou sans type. Le contenu est donc
 * validé après lecture, avec un message clair, avant toute analyse.
 */

/** Au-delà, ce n'est pas une sauvegarde MyFitApp plausible (une sauvegarde de plusieurs années pèse quelques Mo). */
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

const NOT_A_BACKUP = 'Ce fichier n’est pas une sauvegarde MyFitApp (fichier .json) ni des notes de séance en texte. Aucune donnée n’a été modifiée.';

/** Message d'erreur si le fichier ne peut pas être importé, null s'il peut être analysé (JSON ou notes en texte). */
export function checkImportFile(name: string, size: number, content: string): string | null {
  if (size > MAX_IMPORT_BYTES) return `Fichier trop volumineux pour une sauvegarde MyFitApp. Aucune donnée n’a été modifiée.`;
  const trimmed = content.trim();
  if (!trimmed) return 'Le fichier est vide. Aucune donnée n’a été modifiée.';
  // Fichier binaire (image, PDF, archive…) : caractères nuls ou non décodables.
  const sample = trimmed.slice(0, 4096);
  const unreadable = (sample.match(/[\u0000-\u0008\u000E-\u001F\uFFFD]/g) ?? []).length;
  if (unreadable > 0 && unreadable / sample.length > 0.01) return NOT_A_BACKUP;
  const looksJson = /^[[{]/.test(trimmed);
  if (/\.json$/i.test(name) || looksJson) {
    try {
      JSON.parse(trimmed);
    } catch {
      return 'Ce fichier .json est illisible ou incomplet (téléchargement interrompu ?) : ce n’est pas une sauvegarde MyFitApp valide. Aucune donnée n’a été modifiée.';
    }
  }
  return null;
}
