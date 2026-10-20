import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "edutech.install.dismissed";

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as any).standalone === true
  );
}

function isiOS() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [show, setShow] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISS_KEY)) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    const onInstalled = () => {
      setShow(false);
      setDeferred(null);
      localStorage.setItem(DISMISS_KEY, "installed");
    };
    window.addEventListener("appinstalled", onInstalled);

    // iOS has no beforeinstallprompt — show manual hint after a short delay
    if (isiOS()) {
      const t = window.setTimeout(() => { setIosHint(true); setShow(true); }, 1200);
      return () => {
        window.clearTimeout(t);
        window.removeEventListener("beforeinstallprompt", onPrompt);
        window.removeEventListener("appinstalled", onInstalled);
      };
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!show) return null;

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const result = await deferred.userChoice;
    if (result.outcome === "accepted") {
      localStorage.setItem(DISMISS_KEY, "installed");
    }
    setShow(false);
    setDeferred(null);
  };

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShow(false);
  };

  return (
    <div className="sf-install-prompt fixed inset-x-3 bottom-3 z-50 rounded-lg border border-line bg-surface shadow-lg animate-in fade-in slide-in-from-bottom-3 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[340px]">
      <div className="flex items-start gap-3 p-4">
        <div className="sf-seal flex h-10 w-10 flex-none items-center justify-center">
          <span className="font-serif text-sm font-semibold text-brass">ET</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-serif text-[15px] text-ink">Install EduTech</div>
          <p className="mt-1 text-[12px] leading-snug text-ink-soft">
            {iosHint
              ? "Tap the Share icon in Safari and choose “Add to Home Screen” to install EduTech as an app."
              : "Install EduTech on this device for one-tap access, full-screen mode, and a dedicated app icon."}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!iosHint && (
              <button
                onClick={install}
                className="inline-flex items-center gap-1.5 rounded-md bg-forest px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-[#163F31]"
              >
                <Download className="h-3.5 w-3.5" /> Install app
              </button>
            )}
            <button
              onClick={dismiss}
              className="rounded-md border border-line-strong px-3 py-1.5 text-[12.5px] text-ink-soft hover:bg-paper"
            >
              Not now
            </button>
          </div>
        </div>
        <button onClick={dismiss} aria-label="Dismiss" className="text-ink-soft hover:text-ink">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
