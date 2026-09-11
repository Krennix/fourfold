import { swRegistrationPromise } from '../main';

/** Shows a browser notification, preferring a registered service worker (works while
 * backgrounded) and falling back to the plain Notification constructor otherwise. */
export async function notify(title: string, body: string): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const reg = await swRegistrationPromise;
  if (reg) {
    void reg.showNotification(title, { body, icon: '/icons/icon-192.png', tag: title });
  } else {
    new Notification(title, { body, icon: '/icons/icon-192.png' });
  }
}
