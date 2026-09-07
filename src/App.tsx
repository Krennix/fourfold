import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { SchoolProvider } from './state/SchoolContext';
import { HomePage } from './pages/Home';
import { MatrixPage } from './pages/Matrix';
import { HabitsPage } from './pages/Habits';
import { CalendarPage } from './pages/Calendar';
import { PomodoroPage } from './pages/Pomodoro';
import { SchoolPage } from './pages/School';
import { SettingsPage } from './pages/Settings';

function App() {
  return (
    <SchoolProvider>
      <BrowserRouter>
        <Sidebar />
        <main className="content">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/matrix" element={<MatrixPage />} />
            <Route path="/habits" element={<HabitsPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/pomodoro" element={<PomodoroPage />} />
            <Route path="/school" element={<SchoolPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </BrowserRouter>
    </SchoolProvider>
  );
}

export default App;
