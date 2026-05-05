import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider, useAppContext } from './context/AppContext';
import { ThemeProvider } from './context/ThemeContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Navigation } from './components/Navigation';
import { OfflineBanner } from './components/OfflineBanner';
import { SlowConnectionBanner } from './components/SlowConnectionBanner';
import { useWarmUpCache } from './hooks/useWarmUpCache';
import { StudyPage } from './pages/StudyPage';
import { QuizPage } from './pages/QuizPage';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { StoriesPage } from './pages/StoriesPage';
import { StoryPage } from './pages/StoryPage';

function AppShell(): React.ReactNode {
  const { state } = useAppContext();
  useWarmUpCache(state.selectedStateId);

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-gray-900 dark:text-gray-100">
        <SlowConnectionBanner />
        <OfflineBanner />
        <Navigation />
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<StudyPage />} />
            <Route path="/quiz" element={<QuizPage />} />
            <Route path="/stories" element={<StoriesPage />} />
            <Route path="/stories/:slug" element={<StoryPage />} />
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
    <ThemeProvider>
      <AppProvider>
        <AppShell />
      </AppProvider>
    </ThemeProvider>
  );
}
