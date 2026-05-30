import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { PORTAL_URL } from '@/utils/constants';

// Full-screen status message — used for the session-check and the
// provider-redirect states so neither flashes the CRM UI.
function FullScreen({ children }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center px-6 text-center text-text-dim font-mono text-sm tracking-[0.1em] uppercase">
      {children}
    </div>
  );
}

export default function RequireAuth({ children }) {
  const { session, loading, profile, profileLoading, signOut } = useAuth();
  const location = useLocation();

  // Latches once we detect a provider session so we keep showing the
  // redirect screen even after signOut() clears the session (which would
  // otherwise bounce to /login for a frame before the browser navigates
  // away). The CRM is staff-only — a provider must never see its UI.
  const [redirecting, setRedirecting] = useState(false);
  const isProvider = profile?.role === 'provider';

  useEffect(() => {
    if (redirecting) return;
    if (session && !profileLoading && isProvider) {
      setRedirecting(true);
      (async () => {
        try {
          await signOut();
        } catch (err) {
          console.error('sign-out before portal redirect failed', err);
        }
        // Leave the CRM entirely. replace() so Back doesn't return here.
        window.location.replace(PORTAL_URL);
      })();
    }
  }, [redirecting, session, profileLoading, isProvider, signOut]);

  if (redirecting) {
    return (
      <FullScreen>
        Providers should log in at the Provider Portal — redirecting you there…
      </FullScreen>
    );
  }

  // Hold rendering until both the session AND (if signed in) the profile
  // role are known, so a provider session can't render the CRM for even
  // one frame before the guard above fires.
  if (loading || (session && profileLoading)) {
    return <FullScreen>Checking session…</FullScreen>;
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}
