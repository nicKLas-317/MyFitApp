import { useEffect, useRef, useState } from 'react';

export interface MenuAction {
  label: string;
  /** Action immédiate ; ou `href` pour un lien. */
  onSelect?(): void;
  href?: string;
  danger?: boolean;
}

/**
 * Menu « ⋯ » des actions secondaires d'une carte (ajuster, voir la fiche, corriger, retirer) : elles ne sont plus
 * affichées en permanence sous le pouce. Le menu se ferme après un choix, par Échap ou par un appui ailleurs.
 */
export function ActionMenu({ label, actions }: { label: string; actions: MenuAction[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div className="action-menu" ref={root}>
      <button
        type="button"
        className="menu-button"
        aria-label={`Actions : ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        ⋯
      </button>
      {open && (
        <div className="menu-panel" role="menu" aria-label={`Actions : ${label}`}>
          {actions.map((a) =>
            a.href ? (
              <a key={a.label} role="menuitem" className="menu-item" href={a.href} onClick={() => setOpen(false)}>
                {a.label}
              </a>
            ) : (
              <button
                key={a.label}
                type="button"
                role="menuitem"
                className={`menu-item${a.danger ? ' danger' : ''}`}
                onClick={() => {
                  setOpen(false);
                  a.onSelect?.();
                }}
              >
                {a.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/** Confirmation d'un retrait, dans la carte : « Oui, retirer » ou « Non ». */
export function ConfirmRemove({ question, onConfirm, onCancel }: { question: string; onConfirm(): void; onCancel(): void }) {
  return (
    <div className="confirm-box" role="alertdialog" aria-label={question}>
      <p>{question}</p>
      <div className="row">
        <button type="button" className="btn danger" onClick={onConfirm}>
          Oui, retirer
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Non
        </button>
      </div>
    </div>
  );
}
