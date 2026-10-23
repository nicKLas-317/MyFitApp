/** Onglet Plus (§3.4) : bibliothèque d'exercices, réglages, importer / exporter. */
export function More() {
  return (
    <main className="screen tab-screen more-screen">
      <h1>Plus</h1>
      <nav className="hub-links" aria-label="Plus">
        <a className="btn big" href="#/bibliotheque">
          Bibliothèque d’exercices
        </a>
        <a className="btn big" href="#/reglages">
          Réglages
        </a>
        <a className="btn big" href="#/donnees">
          Importer / exporter
        </a>
      </nav>
    </main>
  );
}
