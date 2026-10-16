/**
 * Écritures de séance non confirmées : la dernière version envoyée de chaque séance reste ici tant que
 * son écriture n'a pas abouti (en cours ou échouée). Au passage en arrière-plan, à la fermeture et au retour,
 * elles sont relancées : une saisie n'est jamais perdue parce qu'Android a gelé ou fermé l'appli.
 */
export class PendingWrites<T extends { id: string }> {
  private readonly latest = new Map<string, T>();
  private readonly failed = new Set<string>();

  /** Écriture lancée (immédiatement, sans délai ni regroupement). */
  begin(item: T): void {
    this.latest.set(item.id, item);
  }

  /** Écriture confirmée : rien à relancer, sauf si une version plus récente a été envoyée entre-temps. */
  confirm(item: T): void {
    if (this.latest.get(item.id) === item) {
      this.latest.delete(item.id);
      this.failed.delete(item.id);
    }
  }

  fail(item: T): void {
    if (this.latest.get(item.id) === item) this.failed.add(item.id);
  }

  /** Séance retirée de la base (suppression) : plus rien à écrire. */
  forget(id: string): void {
    this.latest.delete(id);
    this.failed.delete(id);
  }

  hasFailures(): boolean {
    return this.failed.size > 0;
  }

  /** Dernières versions à relancer : toutes les écritures non confirmées, ou seulement celles qui ont échoué. */
  toRetry(onlyFailed = false): T[] {
    return [...this.latest.values()].filter((x) => !onlyFailed || this.failed.has(x.id));
  }

  clear(): void {
    this.latest.clear();
    this.failed.clear();
  }
}
