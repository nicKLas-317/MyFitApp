/**
 * Formes courantes de vouvoiement (§3.6) : « vous », « votre », « vos », impératifs en « -ez » (« Choisissez »,
 * « réessayez »). Les mots qui finissent par « ez » sans être des verbes sont admis. Partagé par les tests unitaires
 * (textes du code) et de bout en bout (textes affichés).
 */
const ALLOWED_EZ = new Set(['assez', 'chez', 'nez', 'rez']);

export function formalForms(text: string): string[] {
  const words = text.match(/(?<!\p{L})\p{L}+(?!\p{L})/gu) ?? [];
  return words.filter((w) => {
    const lower = w.toLowerCase();
    return lower === 'vous' || lower === 'votre' || lower === 'vos' || (lower.endsWith('ez') && lower.length > 3 && !ALLOWED_EZ.has(lower));
  });
}
