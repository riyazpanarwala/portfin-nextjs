'use client';

import { useAuth } from '@/context/AuthContext';
import Dashboard from '@/components/Dashboard';
import LoginPage from '@/components/LoginPage';

export default function Home() {
  const { user, loading, sessionError, retrySession } = useAuth();

  // Wait for the server session before choosing the authenticated UI.
  if (loading) return null;
  if (sessionError) return (
    <main style={{ padding: 32 }}>
      <p role="alert">{sessionError}</p>
      <button className="btn btn-primary" onClick={retrySession}>Retry session check</button>
    </main>
  );

  return user ? <Dashboard /> : <LoginPage />;
}
