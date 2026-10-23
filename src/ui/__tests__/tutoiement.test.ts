import { parseSync } from 'vite';
import { describe, expect, it } from 'vitest';
import { formalForms } from './vouvoiement';

/** Fichiers de l'appli, tests et données de test exclus. */
const APP_SOURCES = import.meta.glob<string>(['../../**/*.{ts,tsx}', '!../../**/__tests__/**', '!../../**/*.d.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** Textes du code : chaînes, gabarits et texte JSX (commentaires, identifiants et chemins d'import exclus). */
function texts(path: string, code: string): string[] {
  const { program, errors } = parseSync(path, code);
  expect(errors, path).toEqual([]);
  const out: string[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (typeof node !== 'object' || node === null) return;
    const n = node as Record<string, unknown> & { type?: string };
    if (n.type === 'ImportDeclaration' || n.type === 'ImportExpression') return;
    if (n.type === 'Literal' && typeof n.value === 'string') out.push(n.value);
    else if (n.type === 'TemplateElement') out.push((n.value as { cooked?: string; raw: string }).cooked ?? (n.value as { raw: string }).raw);
    else if (n.type === 'JSXText') out.push(String(n.value));
    for (const [key, child] of Object.entries(n)) if (key !== 'type' && typeof child === 'object') visit(child);
  };
  visit(program);
  return out;
}

describe('Ton de l’appli (§3.6)', () => {
  it('241. Tutoiement partout : aucun texte de l’appli (écrans, erreurs, confirmations, mail du bilan) ne vouvoie', () => {
    expect(formalForms('Choisissez une activité. Importez vos blocs, vous pouvez réessayez. Votre bilan.')).toEqual(['Choisissez', 'Importez', 'vos', 'vous', 'pouvez', 'réessayez', 'Votre']);
    expect(formalForms('Choisis une activité ; pas assez de données ; ÉLÉVATIONS ; Ton bilan de la semaine est prêt.')).toEqual([]);
    expect(Object.keys(APP_SOURCES).length).toBeGreaterThan(50);
    const found = Object.entries(APP_SOURCES).flatMap(([path, code]) =>
      texts(path, code).flatMap((text) => formalForms(text).map((word) => `${path} : « ${word} » dans « ${text.trim().slice(0, 80)} »`)),
    );
    expect(found).toEqual([]);
  });
});
