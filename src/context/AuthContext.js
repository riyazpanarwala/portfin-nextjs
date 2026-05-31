"use client";

/**
 * context/AuthContext.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages authentication state for PortFin.
 *
 * Session persistence:
 *   Stores { id, email, displayName } in localStorage under 'portfin:session:v1'.
 *   On mount, restores the session so the user stays logged in across reloads.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";

const SESSION_KEY = "portfin:session:v1";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // { id, email, displayName } | null
  const [loading, setLoading] = useState(true); // true while restoring session
  const [error, setError] = useState(null); // login error message

  // ── Restore session on mount ──────────────────────────────────────────────
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      try {
        const raw = localStorage.getItem(SESSION_KEY);

        if (raw) {
          const parsed = JSON.parse(raw);

          if (parsed?.id && parsed?.email) {
            setUser(parsed);
          } else {
            localStorage.removeItem(SESSION_KEY);
          }
        }
      } catch {
        localStorage.removeItem(SESSION_KEY);
      } finally {
        setLoading(false);
      }
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
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
      localStorage.setItem(SESSION_KEY, JSON.stringify(loggedInUser));

      return true;
    } catch {
      setError("Unable to reach the server. Is the app running?");
      return false;
    }
  }, []);

  // ── Logout ────────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    setUser(null);
    setError(null);
    localStorage.removeItem(SESSION_KEY);
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
