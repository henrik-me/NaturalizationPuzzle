import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider, useAppContext } from './context/AppContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Navigation } from './components/Navigation';
import { OfflineBanner } from './components/OfflineBanner';
import { useWarmUpCache } from './hooks/useWarmUpCache';
import { StudyPage } from './pages/StudyPage';
import { QuizPage } from './pages/QuizPage';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';

function AppShell(): React.ReactNode {
  const { state } = useAppContext();
  useWarmUpCache(state.selectedStateId);

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50">
        <OfflineBanner />
        <Navigation />
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<StudyPage />} />
            <Route path="/quiz" element={<QuizPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </ErrorBoundary>
      </div>
    </BrowserRouter>
  );
}

export function App(): React.ReactNode {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
