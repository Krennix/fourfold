import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

/** Exposed so other features (e.g. notifications) can prefer showNotification() on a registered SW. */
export const swRegistrationPromise: Promise<ServiceWorkerRegistration | undefined> =
  'serviceWorker' in navigator
    ? new Promise((resolve) => {
        registerSW({
          immediate: true,
          onRegisteredSW(_url, registration) {
            resolve(registration);
            if (!registration) return;
            // The browser only re-checks for a new service worker on specific triggers
            // (mainly navigation); without this, a tab left open across a deploy can be
            // stuck on the old cached build indefinitely.
            const check = () => void registration.update();
            document.addEventListener('visibilitychange', () => {
              if (document.visibilityState === 'visible') check();
            });
            window.setInterval(check, 5 * 60 * 1000);
          },
          onRegisterError() {
            resolve(undefined);
          },
        });
      })
    : Promise.resolve(undefined);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
