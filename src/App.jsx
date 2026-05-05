import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { useAuth } from '@/hooks/useAuth';
import RequireAuth from '@/components/auth/RequireAuth';
import PageHeader from '@/components/brand/PageHeader';
import { Toaster } from '@/components/ui/sonner';

import Login from '@/pages/Login';
import Home from '@/pages/Home';
import Organizations from '@/pages/Organizations';
import Organization from '@/pages/Organization';
import Contacts from '@/pages/Contacts';

function AppShell({ children }) {
  const { signOut } = useAuth();
  return (
    <>
      <PageHeader subtitle="CRM · Phase 1" onSignOut={signOut} />
      {children}
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={<RequireAuth><AppShell><Home /></AppShell></RequireAuth>}
            />
            <Route
              path="/organizations"
              element={<RequireAuth><AppShell><Organizations /></AppShell></RequireAuth>}
            />
            <Route
              path="/organizations/:id"
              element={<RequireAuth><AppShell><Organization /></AppShell></RequireAuth>}
            />
            <Route
              path="/contacts"
              element={<RequireAuth><AppShell><Contacts /></AppShell></RequireAuth>}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
