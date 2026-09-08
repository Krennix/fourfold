import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { LoginGate } from './components/LoginGate';
import { AuthProvider } from './state/AuthContext';
import { ThemeProvider } from './state/ThemeContext';
import { SchoolProvider } from './state/SchoolContext';
import { SchoologyProvider } from './state/SchoologyContext';
import { HabitsProvider } from './state/HabitsContext';
import { MatrixProvider } from './state/MatrixContext';
import { GoogleAuthProvider } from './state/GoogleAuthContext';
import { CalendarProvider } from './state/CalendarContext';
import { CountdownsProvider } from './state/CountdownsContext';
import { PomodoroProvider } from './state/PomodoroContext';
import { HomePage } from './pages/Home';
import { MatrixPage } from './pages/Matrix';
import { HabitsPage } from './pages/Habits';
import { CalendarPage } from './pages/Calendar';
import { CountdownsPage } from './pages/Countdowns';
import { PomodoroPage } from './pages/Pomodoro';
import { SchoolPage } from './pages/School';
import { SettingsPage } from './pages/Settings';

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
          <CalendarProvider>
            <CountdownsProvider>
            <PomodoroProvider>
              <BrowserRouter>
                <Sidebar />
                <main className="content">
                  <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/matrix" element={<MatrixPage />} />
                    <Route path="/habits" element={<HabitsPage />} />
                    <Route path="/calendar" element={<CalendarPage />} />
                    <Route path="/countdowns" element={<CountdownsPage />} />
                    <Route path="/pomodoro" element={<PomodoroPage />} />
                    <Route path="/school" element={<SchoolPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                  </Routes>
                </main>
              </BrowserRouter>
            </PomodoroProvider>
            </CountdownsProvider>
          </CalendarProvider>
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
