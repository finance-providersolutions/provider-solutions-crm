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
import Contact from '@/pages/Contact';
import Providers from '@/pages/Providers';
import Provider from '@/pages/Provider';
import Opportunities from '@/pages/Opportunities';
import Opportunity from '@/pages/Opportunity';
import Tasks from '@/pages/Tasks';
import Task from '@/pages/Task';
import Expirations from '@/pages/Expirations';
import Funnel from '@/pages/Funnel';
import FinancialProjections from '@/pages/FinancialProjections';

function AppShell({ children }) {
  const { signOut } = useAuth();
  return (
    <>
      <PageHeader onSignOut={signOut} />
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
            <Route
              path="/contacts/:id"
              element={<RequireAuth><AppShell><Contact /></AppShell></RequireAuth>}
            />
            <Route
              path="/providers"
              element={<RequireAuth><AppShell><Providers /></AppShell></RequireAuth>}
            />
            <Route
              path="/providers/:id"
              element={<RequireAuth><AppShell><Provider /></AppShell></RequireAuth>}
            />
            <Route
              path="/opportunities"
              element={<RequireAuth><AppShell><Opportunities /></AppShell></RequireAuth>}
            />
            <Route
              path="/opportunities/:id"
              element={<RequireAuth><AppShell><Opportunity /></AppShell></RequireAuth>}
            />
            <Route
              path="/tasks"
              element={<RequireAuth><AppShell><Tasks /></AppShell></RequireAuth>}
            />
            <Route
              path="/tasks/:id"
              element={<RequireAuth><AppShell><Task /></AppShell></RequireAuth>}
            />
            <Route
              path="/expirations"
              element={<RequireAuth><AppShell><Expirations /></AppShell></RequireAuth>}
            />
            <Route
              path="/funnel"
              element={<RequireAuth><AppShell><Funnel /></AppShell></RequireAuth>}
            />
            <Route
              path="/financial-projections"
              element={<RequireAuth><AppShell><FinancialProjections /></AppShell></RequireAuth>}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
