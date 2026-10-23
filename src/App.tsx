import { useEffect } from 'react';
import { AppProvider, useApp } from './app/store';
import { armExitGuard, setSessionActive } from './app/navigation';
import { BodyProvider } from './body/store';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { useHashRoute } from './app/hooks';
import { useFrames } from './ui/frames';
import { ForgottenDialog } from './ui/ForgottenDialog';
import { SaveErrorBanner } from './ui/SaveIndicator';
import { UndoToast } from './ui/UndoToast';
import { UpdatePrompt } from './ui/UpdatePrompt';
import { Bilan } from './ui/screens/Bilan';
import { BodyScreen } from './ui/screens/BodyScreen';
import { DataScreen } from './ui/screens/DataScreen';
import { History, HistoryDetail } from './ui/screens/History';
import { ExerciseEdit } from './ui/screens/ExerciseEdit';
import { ExerciseSheet } from './ui/screens/ExerciseSheet';
import { Library } from './ui/screens/Library';
import { ExercisePicker } from './ui/screens/ExercisePicker';
import { Home } from './ui/screens/Home';
import { More } from './ui/screens/More';
import { Progress } from './ui/screens/Progress';
import { isGymMode, TabBar, tabOf } from './ui/TabBar';
import { kindOfSegment, PeriodReport } from './ui/screens/PeriodReport';
import { GroupProgress, groupOfSegment } from './ui/screens/GroupProgress';
import { Recap } from './ui/screens/Recap';
import { SessionScreen } from './ui/screens/SessionScreen';
import { Settings } from './ui/screens/Settings';

function Router() {
  const [page = '', param, extra] = useHashRoute();
  const { active } = useApp();
  useFrames();
  // Chaque écran s'ouvre en haut : la position de défilement de l'écran précédent ne s'applique pas.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);
  // Séance en cours : « retour » sur l'onglet Séance ne ferme pas l'appli (§3.4).
  const sessionActive = !!active;
  useEffect(() => {
    setSessionActive(sessionActive);
    if (sessionActive) armExitGuard();
  }, [sessionActive]);
  return (
    <>
      <Screen page={page} param={param} extra={extra} />
      {/* Mode salle (§5.8) : pas de barre d'onglets pendant la saisie d'une séance. */}
      {!isGymMode(page, extra) && <TabBar active={tabOf(page, extra)} />}
    </>
  );
}

function Screen({ page, param, extra }: { page: string; param: string | undefined; extra: string | undefined }) {
  switch (page) {
    case 'progres':
      return <Progress />;
    case 'plus':
      return <More />;
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
      return param ? <HistoryDetail key={param} id={param} /> : <History />;
    case 'bilan':
      return <Bilan />;
    case 'bilan-groupes':
      return <GroupProgress group={groupOfSegment(param)} />;
    case 'bilan-periode':
      return <PeriodReport key={`${param ?? ''}/${extra ?? ''}`} kind={kindOfSegment(param)} periodParam={extra} />;
    case 'poids':
      return (
        <ErrorBoundary
          fallback={
            <main className="screen">
              <p className="banner error-inline" role="alert">
                Le suivi du poids a rencontré une erreur. Tes séances ne sont pas concernées.
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
