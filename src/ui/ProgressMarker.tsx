import type { ProgressMarker } from '../engine';
import { markerArrow, markerLabel } from './labels';

/**
 * Repère de progression (§5.3.1), dans le style du bandeau de changement de charge : sans couleur de statut,
 * la flèche et le texte suffisent.
 */
export function ProgressMarkerBanner({ marker, assisted }: { marker: ProgressMarker; assisted: boolean }) {
  return (
    <p className={`reco reco-${marker.kind}`} role="status" data-testid="progress-marker">
      <span className="reco-arrow" aria-hidden="true">
        {markerArrow(marker)}{' '}
      </span>
      <span>{markerLabel(marker, assisted)}</span>
    </p>
  );
}
