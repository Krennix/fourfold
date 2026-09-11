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
