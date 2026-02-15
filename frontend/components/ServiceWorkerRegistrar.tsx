'use client';

import { useEffect } from 'react';
import { registerServiceWorker } from '@/lib/notifications';

/**
 * Client component that registers the service worker on mount.
 * Placed in the root layout to ensure SW is registered on every page.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    registerServiceWorker();
  }, []);

  return null;
}
