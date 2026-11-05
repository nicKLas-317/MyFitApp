/**
 * Garde contre la récidive (5 novembre 2026), exécutée à la fin de chaque passe de tests de bout en bout
 * (`globalTeardown` de playwright.config.ts) : la passe échoue si un fichier « .uuid » existe dans le dépôt hors de
 * e2e/fonts. fontconfig (2.13 et suivants) écrit un « .uuid » dans chaque dossier qu'il parcourt : si la configuration
 * des polices des tests (e2e/fonts/fonts.conf) lui fait parcourir autre chose que e2e/fonts, des centaines de ces
 * fichiers apparaissent dans tout le dépôt (le 5 novembre 2026 : 75 hors node_modules, 1 296 dedans, avec
 * `<dir prefix="relative">.</dir>`). node_modules et .git ne sont pas parcourus.
 */
import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SKIP = new Set(['node_modules', '.git']);

export default function uuidGuard() {
  const root = process.cwd();
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP.has(entry.name)) walk(path);
      } else if (entry.name.endsWith('.uuid')) {
        found.push(relative(root, path));
      }
    }
  };
  walk(root);
  const outside = found.filter((f) => !f.startsWith(`e2e${sep}fonts${sep}`));
  if (outside.length > 0) {
    throw new Error(
      `${outside.length} fichier(s) .uuid hors de e2e/fonts : fontconfig a parcouru le dépôt (voir e2e/fonts/fonts.conf). ` +
        `Corriger la configuration, puis supprimer : ${outside.slice(0, 10).join(', ')}${outside.length > 10 ? '…' : ''}`,
    );
  }
}
