/**
 * Couronne dorée des records personnels : discrète, à côté du texte, jamais à la place d'une pastille de statut
 * ni d'une couleur de groupe.
 */
export function Crown({ label }: { label?: string }) {
  return (
    <svg
      className="crown"
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z" fill="currentColor" stroke="#5c4300" strokeWidth="1" strokeLinejoin="round" />
      <rect x="5" y="20" width="14" height="2" rx="1" fill="currentColor" />
    </svg>
  );
}
