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

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // { id, email, displayName } | null
  const [loading, setLoading] = useState(true); // true while restoring session
  const [error, setError] = useState(null); // login error message

  // ── Restore session on mount ──────────────────────────────────────────────
  useEffect(() => {
    const controller = new AbortController();
    localStorage.removeItem('portfin:session:v1');
    fetch('/api/auth/session', { cache: 'no-store', signal: controller.signal })
      .then(async res => res.ok ? (await res.json()).user : null)
      .then(restored => { if (!controller.signal.aborted) setUser(restored); })
      .catch(() => {})
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

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
