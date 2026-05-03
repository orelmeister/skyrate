'use client';

import { useState, useEffect } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import {
  isPushSupported,
  getNotificationPermission,
  getNotificationStatus,
  isIOS,
  isRunningStandalone,
  requestNotificationPermission,
  subscribeToPush,
  unsubscribeFromPush,
} from '@/lib/notifications';

export default function NotificationPermission() {
  const { token } = useAuthStore();
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const perm = getNotificationPermission();
    setPermission(perm);

    // Check existing subscription
    if (perm === 'granted' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setIsSubscribed(!!sub);
        });
      });
    }

    // Check if dismissed
    const wasDismissed = localStorage.getItem('skyrate-push-dismissed');
    if (wasDismissed) {
      const dismissedAt = parseInt(wasDismissed, 10);
      if (Date.now() - dismissedAt < 30 * 24 * 60 * 60 * 1000) {
        setDismissed(true);
      }
    }
  }, []);

  // Must be synchronous up to the Notification.requestPermission call for iOS gesture recognition.
  const handleEnable = () => {
    if (!token) return;
    setLoading(true);
    requestNotificationPermission((perm) => {
      setPermission(perm);
      if (perm === 'granted') {
        subscribeToPush(token)
          .then((success) => setIsSubscribed(success))
          .catch((err) => console.error('Failed to subscribe to push:', err))
          .finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });
  };

  const handleDisable = async () => {
    if (!token) return;
    setLoading(true);

    try {
      await unsubscribeFromPush(token);
      setIsSubscribed(false);
    } catch (err) {
      console.error('Failed to disable notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('skyrate-push-dismissed', Date.now().toString());
  };

  const notifStatus = getNotificationStatus();

  // iOS not in standalone — show "Add to Home Screen" guidance
  if (notifStatus === 'ios-not-standalone' && !dismissed) {
    return (
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 p-2 bg-blue-100 rounded-lg">
            <Bell className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900">Enable Push Notifications on iPhone/iPad</p>
            <p className="text-xs text-gray-600 mt-1">
              To enable notifications, add this app to your Home Screen: tap the{' '}
              <strong>Share</strong> button, then <strong>Add to Home Screen</strong>, then reopen the app.
            </p>
          </div>
          <button onClick={handleDismiss} className="text-gray-400 hover:text-gray-600 text-xs flex-shrink-0">
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  // Don't show if not supported, already subscribed, or dismissed
  if (notifStatus === 'unsupported' || !isPushSupported()) return null;
  if (isSubscribed) return null;
  if (permission === 'denied') return null;
  if (dismissed) return null;

  return (
    <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-4 flex items-center gap-4">
      <div className="flex-shrink-0 p-2 bg-purple-100 rounded-lg">
        <Bell className="h-5 w-5 text-purple-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">Enable Push Notifications</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Get real-time alerts for FRN status changes, deadlines, and more.
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={handleDismiss}
          className="text-gray-400 hover:text-gray-600 text-xs"
        >
          Later
        </button>
        <button
          onClick={handleEnable}
          disabled={loading}
          className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Bell className="h-4 w-4" />
              Enable
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/**
 * Inline toggle for settings page
 */
export function PushNotificationToggle() {
  const { token } = useAuthStore();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const supported = isPushSupported();

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setIsSubscribed(!!sub);
      });
    });
  }, [supported]);

  const toggle = () => {
    if (!token) return;
    setLoading(true);
    if (isSubscribed) {
      unsubscribeFromPush(token)
        .then(() => setIsSubscribed(false))
        .catch((err) => console.error('Failed to unsubscribe:', err))
        .finally(() => setLoading(false));
    } else {
      requestNotificationPermission((perm) => {
        if (perm === 'granted') {
          subscribeToPush(token)
            .then((success) => setIsSubscribed(success))
            .catch((err) => console.error('Failed to subscribe:', err))
            .finally(() => setLoading(false));
        } else {
          setLoading(false);
        }
      });
    }
  };

  const status = getNotificationStatus();

  if (status === 'ios-not-standalone') {
    return (
      <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <Bell className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-gray-700">
          To enable push notifications on iPhone/iPad, tap <strong>Share</strong> in Safari and select{' '}
          <strong>Add to Home Screen</strong>, then reopen the app.
        </p>
      </div>
    );
  }

  if (!supported || status === 'unsupported') {
    return (
      <div className="flex items-center gap-3 opacity-50">
        <BellOff className="h-5 w-5 text-gray-400" />
        <span className="text-sm text-gray-500">Notifications not supported in this browser</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        {isSubscribed ? (
          <Bell className="h-5 w-5 text-purple-600" />
        ) : (
          <BellOff className="h-5 w-5 text-gray-400" />
        )}
        <div>
          <p className="text-sm font-medium text-gray-900">Push Notifications</p>
          <p className="text-xs text-gray-500">
            {isSubscribed ? 'Receiving push notifications' : 'Enable to get real-time alerts'}
          </p>
        </div>
      </div>
      <button
        onClick={toggle}
        disabled={loading}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          isSubscribed ? 'bg-purple-600' : 'bg-gray-300'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            isSubscribed ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}
