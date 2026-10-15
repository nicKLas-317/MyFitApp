import { Component, type ReactNode } from 'react';

interface Props {
  /** Message affiché à la place du contenu en erreur. */
  fallback: ReactNode;
  children: ReactNode;
}

/**
 * Confine une erreur d'affichage à une partie secondaire de l'interface (suivi corporel, graphiques, §20) :
 * le reste de l'application, et en particulier les séances, reste utilisable.
 */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    console.error('[MyFitApp] erreur d’affichage confinée', error);
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
