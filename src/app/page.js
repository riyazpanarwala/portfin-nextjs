'use client';

import { useAuth } from '@/context/AuthContext';
import Dashboard from '@/components/Dashboard';
import LoginPage from '@/components/LoginPage';

export default function Home() {
  const { user, loading } = useAuth();

  // While restoring session from localStorage, show nothing (avoids flicker)
  if (loading) return null;

  return user ? <Dashboard /> : <LoginPage />;
}
