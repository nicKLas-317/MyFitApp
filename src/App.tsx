import { useEffect } from 'react';
import { AppProvider } from './app/store';
import { useHashRoute } from './app/hooks';
import { ForgottenDialog } from './ui/ForgottenDialog';
import { SaveErrorBanner } from './ui/SaveIndicator';
import { UndoToast } from './ui/UndoToast';
import { DataScreen } from './ui/screens/DataScreen';
import { ExercisePicker } from './ui/screens/ExercisePicker';
import { Home } from './ui/screens/Home';
import { Recap } from './ui/screens/Recap';
import { SessionScreen } from './ui/screens/SessionScreen';
import { Settings } from './ui/screens/Settings';

function Router() {
  const [page, param] = useHashRoute();
  // Chaque écran s'ouvre en haut : la position de défilement de l'écran précédent ne s'applique pas.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);
  switch (page) {
    case 'seance':
      return <SessionScreen openVariantId={param} />;
    case 'ajouter':
      return <ExercisePicker />;
    case 'recap':
      return param ? <Recap key={param} sessionId={param} /> : <Home />;
    case 'reglages':
      return <Settings />;
    case 'donnees':
      return <DataScreen />;
    default:
      return <Home />;
  }
}

export function App() {
  return (
    <AppProvider>
      <SaveErrorBanner />
      <Router />
      <UndoToast />
      <ForgottenDialog />
    </AppProvider>
  );
}
