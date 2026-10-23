"use client";

/**
 * context/AuthContext.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages authentication state for PortFin.
 *
 * Restores identity only from the server's HttpOnly session cookie.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { readClientSession } from '@/lib/clientSession';
import { snapshotCache } from '@/lib/snapshotCache';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // { id, email, displayName } | null
  const [loading, setLoading] = useState(true); // true while restoring session
  const [error, setError] = useState(null); // login error message
  const [sessionError, setSessionError] = useState(null);
  const [probeVersion, setProbeVersion] = useState(0);
  const retrySession = useCallback(() => {
    setLoading(true);
    setSessionError(null);
    setProbeVersion(version => version + 1);
  }, []);

  // ── Restore session on mount ──────────────────────────────────────────────
  useEffect(() => {
    const controller = new AbortController();
    // Storage cleanup must not prevent cookie-based session verification.
    try { localStorage.removeItem('portfin:session:v1'); } catch { /* Storage may be disabled. */ }
    readClientSession({ signal: controller.signal })
      .then(restored => { if (!controller.signal.aborted) setUser(restored); })
      .catch(() => { if (!controller.signal.aborted) setSessionError('Unable to verify your session. Please retry.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [probeVersion]);

  // ── Login ─────────────────────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login failed");
        return false;
      }

      const { user: loggedInUser } = data;

      snapshotCache.clear();
      setUser(loggedInUser);

      return true;
    } catch {
      setError("Unable to reach the server. Is the app running?");
      return false;
    }
  }, []);

  // ── Logout ────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (!res.ok) throw new Error('Sign out failed. Please retry.');
      snapshotCache.clear();
      setUser(null);
      setError(null);
    } catch (err) { setError(err.message); }
  }, []);

  return (
    <AuthCtx.Provider
      value={{
        user,
        loading,
        error,
        sessionError,
        retrySession,
        login,
        logout,
        setError,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);

  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return ctx;
}
