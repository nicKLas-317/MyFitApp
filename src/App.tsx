import { useEffect } from 'react';
import { AppProvider } from './app/store';
import { BodyProvider } from './body/store';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { useHashRoute } from './app/hooks';
import { ForgottenDialog } from './ui/ForgottenDialog';
import { SaveErrorBanner } from './ui/SaveIndicator';
import { UndoToast } from './ui/UndoToast';
import { UpdatePrompt } from './ui/UpdatePrompt';
import { Bilan } from './ui/screens/Bilan';
import { BodyScreen } from './ui/screens/BodyScreen';
import { DataScreen } from './ui/screens/DataScreen';
import { History } from './ui/screens/History';
import { SessionDetail } from './ui/screens/SessionDetail';
import { ExerciseEdit } from './ui/screens/ExerciseEdit';
import { ExerciseSheet } from './ui/screens/ExerciseSheet';
import { Library } from './ui/screens/Library';
import { ExercisePicker } from './ui/screens/ExercisePicker';
import { Home } from './ui/screens/Home';
import { Recap } from './ui/screens/Recap';
import { SessionScreen } from './ui/screens/SessionScreen';
import { Settings } from './ui/screens/Settings';

function Router() {
  const [page, param, extra] = useHashRoute();
  // Chaque écran s'ouvre en haut : la position de défilement de l'écran précédent ne s'applique pas.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);
  switch (page) {
    case 'seance':
      return <SessionScreen openVariantId={param} />;
    case 'ajouter':
      return <ExercisePicker key={param ?? ''} variantId={param} />;
    case 'bibliotheque':
      return <Library />;
    case 'exercice':
      return param ? <ExerciseSheet key={param} variantId={param} fromBilan={extra === 'evolution'} /> : <Library />;
    case 'modifier':
      return param ? <ExerciseEdit key={param} exerciseId={param} /> : <Library />;
    case 'nouvel-exercice':
      return <ExerciseEdit key={`new-${param ?? ''}`} initialName={param} forSession={extra === 'seance'} />;
    case 'recap':
      return param ? <Recap key={param} sessionId={param} /> : <Home />;
    case 'reglages':
      return <Settings />;
    case 'donnees':
      return <DataScreen />;
    case 'historique':
      return param ? <SessionDetail key={param} sessionId={param} /> : <History />;
    case 'bilan':
      return <Bilan />;
    case 'poids':
      return (
        <ErrorBoundary
          fallback={
            <main className="screen">
              <p className="banner error-inline" role="alert">
                Le suivi du poids a rencontré une erreur. Vos séances ne sont pas concernées.
              </p>
              <a className="btn primary big" href="#/">
                Accueil
              </a>
            </main>
          }
        >
          <BodyScreen />
        </ErrorBoundary>
      );
    default:
      return <Home />;
  }
}

export function App() {
  return (
    <AppProvider>
      {/* Suivi corporel isolé (§20) : son chargement ou ses erreurs n'affectent jamais les séances. */}
      <BodyProvider>
        <SaveErrorBanner />
        <Router />
        <UndoToast />
        <ForgottenDialog />
        <UpdatePrompt />
      </BodyProvider>
    </AppProvider>
  );
}
