import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { Navigation } from './components/Navigation';
import { OfflineBanner } from './components/OfflineBanner';
import { StudyPage } from './pages/StudyPage';
import { QuizPage } from './pages/QuizPage';
import { SettingsPage } from './pages/SettingsPage';

export function App(): React.ReactNode {
  return (
    <AppProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-slate-50">
          <OfflineBanner />
          <Navigation />
          <Routes>
            <Route path="/" element={<StudyPage />} />
            <Route path="/quiz" element={<QuizPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </div>
      </BrowserRouter>
    </AppProvider>
  );
}
