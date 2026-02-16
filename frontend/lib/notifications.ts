/**
 * Push Notification & Service Worker Management
 * Handles: SW registration, push subscription, notification permissions
 */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_KEY || '';

/**
 * Register the service worker
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.warn('[Notifications] Service workers not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });
    console.log('[Notifications] Service worker registered:', registration.scope);
    return registration;
  } catch (error) {
    console.error('[Notifications] SW registration failed:', error);
    return null;
  }
}

/**
 * Check if push notifications are supported
 */
export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/**
 * Check current notification permission status
 */
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/**
 * Request notification permission from the user
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';

  const permission = await Notification.requestPermission();
  return permission;
}

/**
 * Subscribe to push notifications and send subscription to backend
 */
export async function subscribeToPush(token: string): Promise<boolean> {
  if (!isPushSupported() || !VAPID_PUBLIC_KEY) {
    console.warn('[Notifications] Push not supported or VAPID key missing');
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    
    // Check for existing subscription
    let subscription = await registration.pushManager.getSubscription();
    
    if (!subscription) {
      // Create new subscription
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
    }

    // Send subscription to backend
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';
    const response = await fetch(`${API_URL}/api/v1/notifications/push/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        device_type: getDeviceType(),
        user_agent: navigator.userAgent,
      }),
    });

    if (!response.ok) {
      throw new Error(`Subscribe failed: ${response.status}`);
    }

    console.log('[Notifications] Push subscription saved');
    return true;
  } catch (error) {
    console.error('[Notifications] Push subscription failed:', error);
    return false;
  }
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribeFromPush(token: string): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await subscription.unsubscribe();

      // Notify backend
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';
      await fetch(`${API_URL}/api/v1/notifications/push/unsubscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
        }),
      });
    }

    console.log('[Notifications] Push unsubscribed');
    return true;
  } catch (error) {
    console.error('[Notifications] Unsubscribe failed:', error);
    return false;
  }
}

/**
 * Detect device type
 */
function getDeviceType(): string {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Mobile/.test(ua)) return 'mobile';
  return 'desktop';
}

/**
 * Convert VAPID key from base64 to Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Detect if app is running as installed PWA
 */
export function isRunningAsPWA(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes('android-app://')
  );
}

/**
 * Detect platform for install instructions
 */
export function detectPlatform(): 'ios' | 'android' | 'desktop' | 'unknown' {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Windows|Mac|Linux/.test(ua) && !/Mobile/.test(ua)) return 'desktop';
  return 'unknown';
}

/**
 * Detect specific browser for accurate install instructions
 */
export type BrowserType = 'safari' | 'chrome' | 'firefox' | 'edge' | 'samsung' | 'opera' | 'unknown';

export function detectBrowser(): BrowserType {
  const ua = navigator.userAgent;

  // Order matters — check more specific strings first
  // Edge (Chromium-based) includes "Edg/" in UA
  if (/Edg\//i.test(ua)) return 'edge';
  // Opera includes "OPR/" or "Opera"
  if (/OPR\//i.test(ua) || /Opera/i.test(ua)) return 'opera';
  // Samsung Internet includes "SamsungBrowser"
  if (/SamsungBrowser/i.test(ua)) return 'samsung';
  // Firefox includes "Firefox" but NOT "Seamonkey"
  if (/Firefox/i.test(ua) && !/Seamonkey/i.test(ua)) return 'firefox';
  // Chrome includes "Chrome" but NOT Edge/Opera/Samsung (already filtered)
  // On iOS, Chrome UA contains "CriOS"
  if (/Chrome/i.test(ua) || /CriOS/i.test(ua)) return 'chrome';
  // Safari: check for "Safari" but NOT Chrome/CriOS/Edge/Firefox (already filtered)
  // On iOS, standalone Safari has "Safari" without other browser tokens
  if (/Safari/i.test(ua)) return 'safari';

  return 'unknown';
}

/**
 * Detect the operating system
 */
export type OSType = 'ios' | 'android' | 'macos' | 'windows' | 'linux' | 'unknown';

export function detectOS(): OSType {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Macintosh|Mac OS X/.test(ua)) return 'macos';
  if (/Windows/.test(ua)) return 'windows';
  if (/Linux/.test(ua)) return 'linux';
  return 'unknown';
}
