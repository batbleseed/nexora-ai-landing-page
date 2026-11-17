import { useState } from "react";
import { Download } from "lucide-react";
import { usePWAInstall } from "../hooks/usePWAInstall";

export function PWAInstallButton({ className = "" }: { className?: string }) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={`flex items-center gap-1.5 rounded-control bg-surface px-2.5 py-1.5 text-xs font-medium text-ink shadow-btn transition-colors hover:bg-hover whitespace-nowrap shrink-0 ${className}`}
      >
        <Download className="size-3.5" />
        <span>Install app</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={`flex items-center gap-1.5 rounded-control bg-surface px-2.5 py-1.5 text-xs font-medium text-ink shadow-btn transition-colors hover:bg-hover whitespace-nowrap shrink-0 ${className}`}
        >
          <Download className="size-3.5" />
          <span>Install</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-[14px] bg-surface p-6 shadow-overlay">
              <h3 className="text-base font-semibold text-ink">Install Nexora on iOS</h3>
              <p className="mt-2 text-xs leading-relaxed text-ink-2">
                1. Tap the <strong>Share</strong> button in Safari&apos;s toolbar.
                <br />
                2. Scroll down and tap <strong>Add to Home Screen</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-control bg-inset py-2 text-xs font-medium text-ink shadow-hairline hover:bg-hover-2"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}
