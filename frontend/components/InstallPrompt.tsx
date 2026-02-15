'use client';

import { useState, useEffect } from 'react';
import { Download, Smartphone, Monitor, X, Share, Plus, MoreVertical, ChevronRight } from 'lucide-react';
import { detectPlatform, isRunningAsPWA } from '@/lib/notifications';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop' | 'unknown'>('unknown');
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Don't show if already installed as PWA
    if (isRunningAsPWA()) return;

    // Check if user previously dismissed
    const wasDismissed = localStorage.getItem('skyrate-install-dismissed');
    if (wasDismissed) {
      const dismissedAt = parseInt(wasDismissed, 10);
      // Show again after 7 days
      if (Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) return;
    }

    setPlatform(detectPlatform());

    // Listen for the install prompt event (Chrome/Edge/Android)
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // For iOS/Safari - show manual instructions after a delay
    const p = detectPlatform();
    if (p === 'ios') {
      const timer = setTimeout(() => setShowPrompt(true), 3000);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      };
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setDismissed(true);
    localStorage.setItem('skyrate-install-dismissed', Date.now().toString());
  };

  if (!showPrompt || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 animate-slide-up">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img
              src="/icons/icon-96x96.png"
              alt="SkyRate AI"
              className="w-8 h-8 rounded-lg"
            />
            <span className="text-white font-semibold text-sm">Install SkyRate AI</span>
          </div>
          <button
            onClick={handleDismiss}
            className="text-white/80 hover:text-white p-1"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {platform === 'ios' && <IOSInstructions />}
          {platform === 'android' && (
            deferredPrompt ? (
              <AndroidInstallButton onInstall={handleInstall} />
            ) : (
              <AndroidInstructions />
            )
          )}
          {platform === 'desktop' && (
            deferredPrompt ? (
              <DesktopInstallButton onInstall={handleInstall} />
            ) : (
              <DesktopInstructions />
            )
          )}
          {platform === 'unknown' && <GenericInstructions />}
        </div>
      </div>
    </div>
  );
}

function IOSInstructions() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Add SkyRate AI to your home screen for quick access and push notifications:
      </p>
      <div className="space-y-2">
        <Step number={1} icon={<Share className="h-4 w-4 text-blue-500" />}>
          Tap the <strong>Share</strong> button <Share className="h-3 w-3 inline text-blue-500" /> in Safari
        </Step>
        <Step number={2} icon={<Plus className="h-4 w-4 text-gray-700" />}>
          Scroll down and tap <strong>&quot;Add to Home Screen&quot;</strong>
        </Step>
        <Step number={3} icon={<ChevronRight className="h-4 w-4 text-green-500" />}>
          Tap <strong>&quot;Add&quot;</strong> to confirm
        </Step>
      </div>
    </div>
  );
}

function AndroidInstructions() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Install SkyRate AI on your device for the best experience:
      </p>
      <div className="space-y-2">
        <Step number={1} icon={<MoreVertical className="h-4 w-4 text-gray-700" />}>
          Tap the <strong>menu</strong> button <MoreVertical className="h-3 w-3 inline" /> in your browser
        </Step>
        <Step number={2} icon={<Download className="h-4 w-4 text-blue-500" />}>
          Tap <strong>&quot;Install app&quot;</strong> or <strong>&quot;Add to Home screen&quot;</strong>
        </Step>
        <Step number={3} icon={<ChevronRight className="h-4 w-4 text-green-500" />}>
          Tap <strong>&quot;Install&quot;</strong> to confirm
        </Step>
      </div>
    </div>
  );
}

function AndroidInstallButton({ onInstall }: { onInstall: () => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Get SkyRate AI on your home screen for instant access and notifications.
      </p>
      <button
        onClick={onInstall}
        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-3 rounded-xl font-medium hover:opacity-90 transition-opacity"
      >
        <Smartphone className="h-5 w-5" />
        Install App
      </button>
    </div>
  );
}

function DesktopInstallButton({ onInstall }: { onInstall: () => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Install SkyRate AI as a desktop app for quick access and notifications.
      </p>
      <button
        onClick={onInstall}
        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-3 rounded-xl font-medium hover:opacity-90 transition-opacity"
      >
        <Monitor className="h-5 w-5" />
        Install Desktop App
      </button>
    </div>
  );
}

function DesktopInstructions() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Install SkyRate AI as a desktop app:
      </p>
      <div className="space-y-2">
        <Step number={1} icon={<Download className="h-4 w-4 text-blue-500" />}>
          Click the <strong>install icon</strong> in the address bar (Chrome/Edge)
        </Step>
        <Step number={2} icon={<ChevronRight className="h-4 w-4 text-green-500" />}>
          Click <strong>&quot;Install&quot;</strong> to confirm
        </Step>
      </div>
    </div>
  );
}

function GenericInstructions() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        You can install SkyRate AI on your device for quick access. Look for the install option in your browser menu.
      </p>
    </div>
  );
}

function Step({ number, icon, children }: { number: number; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 bg-gray-50 rounded-lg p-2.5">
      <div className="flex-shrink-0 w-6 h-6 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-xs font-bold">
        {number}
      </div>
      <p className="text-sm text-gray-700 leading-relaxed">{children}</p>
    </div>
  );
}
