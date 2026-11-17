"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { NexoraLogo } from "./icons/NexoraLogo";

function GoogleColorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
      />
    </svg>
  );
}

export default function LoginModal({
  open,
  onClose,
  onGoogleLogin,
  onEmailLogin,
  onEmailRegister,
}: {
  open: boolean;
  onClose: () => void;
  onGoogleLogin: () => Promise<void>;
  onEmailLogin: (email: string, password: string) => Promise<void>;
  onEmailRegister: (name: string, email: string, password: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleGoogleClick = async () => {
    setError(null);
    setGoogleBusy(true);
    try {
      await onGoogleLogin();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Google sign-in failed.";
      if (!msg.includes("popup-closed-by-user")) {
        setError(msg);
      }
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") {
        await onEmailLogin(email.trim(), password);
      } else {
        await onEmailRegister(name.trim(), email.trim(), password);
      }
      setPassword("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={mode === "login" ? "Login" : "Create account"}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[380px] rounded-[18px] border border-line bg-surface p-7 shadow-overlay"
        style={{ animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both" }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close login modal"
          className="absolute right-4 top-4 flex size-7 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-hover-2 hover:text-ink"
        >
          <X className="size-4" />
        </button>

        {/* Logo mark */}
        <div className="mb-4 flex items-center text-ink">
          <NexoraLogo size={28} />
        </div>

        <h2 className="font-serif text-[26px] font-semibold leading-tight tracking-tight text-ink">
          {mode === "login" ? "Login" : "Create an account"}
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
          Sign in to sync your Nexora chats, models, and workspace settings under one account.
        </p>

        {/* Google Login */}
        <button
          type="button"
          disabled={googleBusy || busy}
          onClick={() => void handleGoogleClick()}
          className="mt-5 flex h-10 w-full items-center justify-center gap-2.5 rounded-[10px] border border-line bg-inset text-[13px] font-medium text-ink transition-colors hover:bg-hover-2 disabled:opacity-55"
        >
          <GoogleColorIcon />
          <span>{googleBusy ? "Connecting to Google…" : "Login with Google"}</span>
        </button>

        {/* Divider */}
        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-line" />
          <span className="text-[11.5px] font-medium text-ink-3">or login with email</span>
          <div className="h-px flex-1 bg-line" />
        </div>

        {/* Email Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          {mode === "register" && (
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-ink-2">Name</span>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="h-10 rounded-[10px] border border-line bg-inset px-3 text-[13px] text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-ink-2"
              />
            </label>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-ink-2">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="h-10 rounded-[10px] border border-line bg-inset px-3 text-[13px] text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-ink-2"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-ink-2">Password</span>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              className="h-10 rounded-[10px] border border-line bg-inset px-3 text-[13px] text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-ink-2"
            />
          </label>

          {error && (
            <div className="rounded-[9px] bg-red-tint px-3 py-2 text-[12px] font-medium text-red">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || googleBusy}
            className="mt-1 flex h-10 w-full items-center justify-center rounded-[10px] bg-ink text-[13px] font-semibold text-surface transition-opacity hover:opacity-90 disabled:opacity-55"
          >
            {busy
              ? "Please wait…"
              : mode === "login"
                ? "Login with email"
                : "Create account"}
          </button>
        </form>

        <div className="mt-5 text-center">
          <button
            type="button"
            onClick={() => {
              setMode((m) => (m === "login" ? "register" : "login"));
              setError(null);
            }}
            className="text-[12.5px] font-medium text-ink-2 transition-colors hover:text-ink"
          >
            {mode === "login"
              ? "New here? Create an account"
              : "Already have an account? Login"}
          </button>
        </div>
      </div>
    </div>
  );
}
