import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { LoginGate } from './components/LoginGate';
import { AuthProvider } from './state/AuthContext';
import { ThemeProvider } from './state/ThemeContext';
import { SchoolProvider } from './state/SchoolContext';
import { SchoologyProvider } from './state/SchoologyContext';
import { HabitsProvider } from './state/HabitsContext';
import { MatrixProvider } from './state/MatrixContext';
import { GoogleAuthProvider } from './state/GoogleAuthContext';
import { SpotifyAuthProvider } from './state/SpotifyAuthContext';
import { GoogleIcsProvider } from './state/GoogleIcsContext';
import { CalendarProvider } from './state/CalendarContext';
import { CountdownsProvider } from './state/CountdownsContext';
import { PomodoroProvider } from './state/PomodoroContext';
import { AgentProvider } from './state/AgentContext';
import { NotificationsProvider } from './state/NotificationsContext';
import { HomePage } from './pages/Home';
import { MatrixPage } from './pages/Matrix';
import { HabitsPage } from './pages/Habits';
import { CalendarPage } from './pages/Calendar';
import { PomodoroPage } from './pages/Pomodoro';
import { AgentPage } from './pages/Agent';
import { SchoolPage } from './pages/School';
import { SettingsPage } from './pages/Settings';
import { WeeklyReviewPage } from './pages/WeeklyReview';

function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
    <LoginGate>
    <SchoolProvider>
    <SchoologyProvider>
      <HabitsProvider>
        <MatrixProvider>
          <GoogleAuthProvider>
          <GoogleIcsProvider>
          <CalendarProvider>
            <CountdownsProvider>
            <PomodoroProvider>
            <SpotifyAuthProvider>
            <AgentProvider>
            <NotificationsProvider>
              <BrowserRouter>
                <Sidebar />
                <main className="content">
                  <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/matrix" element={<MatrixPage />} />
                    <Route path="/habits" element={<HabitsPage />} />
                    <Route path="/calendar" element={<CalendarPage />} />
                    <Route path="/weekly-review" element={<WeeklyReviewPage />} />
                    <Route path="/countdowns" element={<Navigate to="/habits" replace />} />
                    <Route path="/pomodoro" element={<PomodoroPage />} />
                    <Route path="/agent" element={<AgentPage />} />
                    <Route path="/school" element={<SchoolPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                  </Routes>
                </main>
              </BrowserRouter>
            </NotificationsProvider>
            </AgentProvider>
            </SpotifyAuthProvider>
            </PomodoroProvider>
            </CountdownsProvider>
          </CalendarProvider>
          </GoogleIcsProvider>
          </GoogleAuthProvider>
        </MatrixProvider>
      </HabitsProvider>
    </SchoologyProvider>
    </SchoolProvider>
    </LoginGate>
    </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
