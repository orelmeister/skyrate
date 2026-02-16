'use client';

import { useState, useEffect } from 'react';
import { Download, Smartphone, Monitor, X, Share, Plus, MoreVertical, ChevronRight, Globe, ExternalLink } from 'lucide-react';
import { detectPlatform, detectBrowser, detectOS, isRunningAsPWA, type BrowserType, type OSType } from '@/lib/notifications';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop' | 'unknown'>('unknown');
  const [browser, setBrowser] = useState<BrowserType>('unknown');
  const [os, setOS] = useState<OSType>('unknown');
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

    const detectedPlatform = detectPlatform();
    const detectedBrowser = detectBrowser();
    const detectedOS = detectOS();
    setPlatform(detectedPlatform);
    setBrowser(detectedBrowser);
    setOS(detectedOS);

    // Listen for the install prompt event (Chrome/Edge/Android)
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // For iOS/Safari - show manual instructions after a delay
    if (detectedPlatform === 'ios') {
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

  // Determine what content to show based on platform + browser combination
  const renderInstructions = () => {
    if (platform === 'ios') {
      if (browser === 'safari') {
        return <IOSSafariInstructions />;
      }
      // Non-Safari browsers on iOS (Chrome, Firefox, Edge, etc.)
      return <IOSNonSafariInstructions browserName={getBrowserDisplayName(browser)} />;
    }

    if (platform === 'android') {
      if (deferredPrompt) {
        return <NativeInstallButton onInstall={handleInstall} icon={<Smartphone className="h-5 w-5" />} label="Install App" />;
      }
      // Manual instructions based on browser
      if (browser === 'firefox') return <AndroidFirefoxInstructions />;
      if (browser === 'samsung') return <AndroidSamsungInstructions />;
      if (browser === 'opera') return <AndroidOperaInstructions />;
      return <AndroidChromeInstructions />;
    }

    if (platform === 'desktop') {
      if (deferredPrompt) {
        return <NativeInstallButton onInstall={handleInstall} icon={<Monitor className="h-5 w-5" />} label="Install Desktop App" />;
      }
      // Manual instructions based on browser
      if (browser === 'edge') return <DesktopEdgeInstructions />;
      if (browser === 'firefox') return <DesktopFirefoxInstructions />;
      if (browser === 'safari') return <DesktopSafariInstructions />;
      if (browser === 'opera') return <DesktopOperaInstructions />;
      return <DesktopChromeInstructions />;
    }

    return <GenericInstructions />;
  };

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
          {renderInstructions()}
        </div>

        {/* Browser badge */}
        <div className="px-4 pb-3">
          <p className="text-[10px] text-gray-400 text-center">
            Detected: {getBrowserDisplayName(browser)} on {getOSDisplayName(os)}
          </p>
        </div>
      </div>
    </div>
  );
}

// ===== Helper functions =====

function getBrowserDisplayName(browser: BrowserType): string {
  const names: Record<BrowserType, string> = {
    safari: 'Safari',
    chrome: 'Chrome',
    firefox: 'Firefox',
    edge: 'Microsoft Edge',
    samsung: 'Samsung Internet',
    opera: 'Opera',
    unknown: 'your browser',
  };
  return names[browser];
}

function getOSDisplayName(os: OSType): string {
  const names: Record<OSType, string> = {
    ios: 'iOS',
    android: 'Android',
    macos: 'macOS',
    windows: 'Windows',
    linux: 'Linux',
    unknown: 'your device',
  };
  return names[os];
}

// ===== iOS Instructions =====

function IOSSafariInstructions() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Add SkyRate AI to your Home Screen for quick access:
      </p>
      <div className="space-y-2">
        <Step number={1} icon={<Share className="h-4 w-4 text-blue-500" />}>
          Tap the <strong>Share</strong> button <Share className="h-3 w-3 inline text-blue-500" /> at the bottom of Safari
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

function IOSNonSafariInstructions({ browserName }: { browserName: string }) {
  return (
    <div className="space-y-3">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
        <p className="text-sm text-amber-800">
          <strong>Tip:</strong> For the best install experience on iOS, open this page in <strong>Safari</strong>.
        </p>
      </div>
      <p className="text-sm text-gray-600">
        You&apos;re using <strong>{browserName}</strong>. To install SkyRate AI on your Home Screen:
      </p>
      <div className="space-y-2">
        <Step number={1} icon={<Globe className="h-4 w-4 text-blue-500" />}>
          Open <strong>Safari</strong> and visit <strong>skyrate.ai</strong>
        </Step>
        <Step number={2} icon={<Share className="h-4 w-4 text-blue-500" />}>
          Tap the <strong>Share</strong> button <Share className="h-3 w-3 inline text-blue-500" />
        </Step>
        <Step number={3} icon={<Plus className="h-4 w-4 text-gray-700" />}>
          Tap <strong>&quot;Add to Home Screen&quot;</strong>
        </Step>
      </div>
    </div>
  );
}

// ===== Android Instructions =====

function AndroidChromeInstructions() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Install SkyRate AI from Chrome:
      </p>
      <div className="space-y-2">
        <Step number={1} icon={<MoreVertical className="h-4 w-4 text-gray-700" />}>
          Tap the <strong>three dots</strong> <MoreVertical className="h-3 w-3 inline" /> menu in the top right
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

function AndroidFirefoxInstructions() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Install SkyRate AI from Firefox:
      </p>
      <div className="space-y-2">
        <Step number={1} icon={<MoreVertical className="h-4 w-4 text-gray-700" />}>
          Tap the <strong>three dots</strong> <MoreVertical className="h-3 w-3 inline" /> menu
        </Step>
        <Step number={2} icon={<Download className="h-4 w-4 text-blue-500" />}>
          Tap <strong>&quot;Install&quot;</strong>
        </Step>
        <Step number={3} icon={<ChevronRight className="h-4 w-4 text-green-500" />}>
          Confirm by tapping <strong>&quot;Add&quot;</strong>
        </Step>
      </div>
    </div>
  );
}

function AndroidSamsungInstructions() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Install SkyRate AI from Samsung Internet:
      </p>
      <div className="space-y-2">
        <Step number={1} icon={<MoreVertical className="h-4 w-4 text-gray-700" />}>
          Tap the <strong>hamburger menu</strong> (three lines) at the bottom right
        </Step>
        <Step number={2} icon={<Plus className="h-4 w-4 text-blue-500" />}>
          Tap <strong>&quot;Add page to&quot;</strong> → <strong>&quot;Home screen&quot;</strong>
        </Step>
        <Step number={3} icon={<ChevronRight className="h-4 w-4 text-green-500" />}>
          Tap <strong>&quot;Add&quot;</strong> to confirm
        </Step>
      </div>
    </div>
  );
}

function AndroidOperaInstructions() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Install SkyRate AI from Opera:
      </p>
      <div className="space-y-2">
        <Step number={1} icon={<MoreVertical className="h-4 w-4 text-gray-700" />}>
          Tap the <strong>three dots</strong> <MoreVertical className="h-3 w-3 inline" /> menu
        </Step>
        <Step number={2} icon={<Download className="h-4 w-4 text-blue-500" />}>
          Tap <strong>&quot;Add to Home screen&quot;</strong>
        </Step>
        <Step number={3} icon={<ChevronRight className="h-4 w-4 text-green-500" />}>
          Tap <strong>&quot;Add&quot;</strong> to confirm
        </Step>
      </div>
    </div>
  );
}

// ===== Desktop Instructions =====

function DesktopChromeInstructions() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Install SkyRate AI as a desktop app from Chrome:
      </p>
      <div className="space-y-2">
        <Step number={1} icon={<Download className="h-4 w-4 text-blue-500" />}>
          Click the <strong>install icon</strong> <Download className="h-3 w-3 inline text-blue-500" /> in the address bar (right side)
        </Step>
        <Step number={2} icon={<ChevronRight className="h-4 w-4 text-green-500" />}>
          Click <strong>&quot;Install&quot;</strong> to confirm
        </Step>
      </div>
      <p className="text-xs text-gray-400">
        Or go to <strong>⋮ Menu → Save and Share → Install page as app</strong>
      </p>
    </div>
  );
}

function DesktopEdgeInstructions() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Install SkyRate AI as a desktop app from Edge:
      </p>
      <div className="space-y-2">
        <Step number={1} icon={<Download className="h-4 w-4 text-blue-500" />}>
          Click the <strong>install icon</strong> <Download className="h-3 w-3 inline text-blue-500" /> in the address bar
        </Step>
        <Step number={2} icon={<ChevronRight className="h-4 w-4 text-green-500" />}>
          Click <strong>&quot;Install&quot;</strong> to confirm
        </Step>
      </div>
      <p className="text-xs text-gray-400">
        Or go to <strong>⋯ Menu → Apps → Install this site as an app</strong>
      </p>
    </div>
  );
}

function DesktopFirefoxInstructions() {
  return (
    <div className="space-y-3">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
        <p className="text-sm text-amber-800">
          <strong>Note:</strong> Firefox doesn&apos;t natively support installing web apps on desktop.
        </p>
      </div>
      <p className="text-sm text-gray-600">
        For the best experience, open <strong>skyrate.ai</strong> in <strong>Chrome</strong> or <strong>Edge</strong> and install from there.
      </p>
      <p className="text-xs text-gray-400">
        You can still bookmark this page for quick access.
      </p>
    </div>
  );
}

function DesktopSafariInstructions() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Add SkyRate AI to your Dock from Safari:
      </p>
      <div className="space-y-2">
        <Step number={1} icon={<ExternalLink className="h-4 w-4 text-blue-500" />}>
          Click <strong>File</strong> in the menu bar
        </Step>
        <Step number={2} icon={<Plus className="h-4 w-4 text-gray-700" />}>
          Click <strong>&quot;Add to Dock&quot;</strong>
        </Step>
        <Step number={3} icon={<ChevronRight className="h-4 w-4 text-green-500" />}>
          Click <strong>&quot;Add&quot;</strong> to confirm
        </Step>
      </div>
      <p className="text-xs text-gray-400">
        Requires macOS Sonoma (14) or later.
      </p>
    </div>
  );
}

function DesktopOperaInstructions() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Install SkyRate AI from Opera:
      </p>
      <div className="space-y-2">
        <Step number={1} icon={<Download className="h-4 w-4 text-blue-500" />}>
          Click the <strong>install icon</strong> in the address bar
        </Step>
        <Step number={2} icon={<ChevronRight className="h-4 w-4 text-green-500" />}>
          Click <strong>&quot;Install&quot;</strong> to confirm
        </Step>
      </div>
      <p className="text-xs text-gray-400">
        Or go to <strong>Menu → Install page as app</strong>
      </p>
    </div>
  );
}

// ===== Shared Components =====

function NativeInstallButton({ onInstall, icon, label }: { onInstall: () => void; icon: React.ReactNode; label: string }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Get SkyRate AI for instant access and notifications.
      </p>
      <button
        onClick={onInstall}
        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-3 rounded-xl font-medium hover:opacity-90 transition-opacity"
      >
        {icon}
        {label}
      </button>
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
