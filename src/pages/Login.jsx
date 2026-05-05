import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function Login() {
  const { session, loading, requestEmailOtp, verifyEmailOtp } = useAuth();
  const [step, setStep] = useState('email');   // 'email' → 'code'
  const [email, setEmail] = useState('');
  const [code, setCode]   = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && session) return <Navigate to="/" replace />;

  async function handleEmailSubmit(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    const { error } = await requestEmailOtp(email.trim());
    setSubmitting(false);
    if (error) {
      console.error('requestEmailOtp', error);
      toast.error(error.message || 'Could not send code');
      return;
    }
    setCode('');
    setStep('code');
  }

  async function handleCodeSubmit(e) {
    e.preventDefault();
    if (code.trim().length < 6) {
      toast.error('Enter the code from the email');
      return;
    }
    setSubmitting(true);
    const { error } = await verifyEmailOtp(email.trim(), code);
    setSubmitting(false);
    if (error) {
      console.error('verifyEmailOtp', error);
      toast.error(error.message || 'Invalid or expired code');
      return;
    }
    // The auth listener will pick up the new session and the
    // <Navigate to="/"/> at the top of this component will fire.
  }

  async function handleResend() {
    if (!email.trim()) return;
    setSubmitting(true);
    const { error } = await requestEmailOtp(email.trim());
    setSubmitting(false);
    if (error) {
      toast.error(error.message || 'Could not resend');
      return;
    }
    toast.success('Code resent');
  }

  function handleUseDifferentEmail() {
    setCode('');
    setEmail('');
    setStep('email');
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-3 mb-10">
          <img src="/pslogo.png" alt="Provider Solutions" className="w-14 h-14 rounded-md object-cover" />
          <h1 className="font-display text-3xl text-text leading-none">Provider Solutions</h1>
          <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-text-dim">
            CRM · Sign in
          </span>
        </div>

        <div className="bg-surface border border-border rounded p-6 relative
                        after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0
                        after:h-0.5 after:bg-gradient-to-r after:from-accent after:to-transparent after:opacity-40">
          {step === 'email' ? (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim">
                  Email address
                </Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@providersolutions.com"
                  className="bg-bg border-border text-text"
                />
              </div>
              <Button
                type="submit"
                disabled={submitting || !email.trim()}
                className="w-full bg-accent text-accent-foreground hover:bg-accent-bright font-mono uppercase tracking-[0.12em] text-xs"
              >
                {submitting ? 'Sending…' : 'Send sign-in code'}
              </Button>
              <p className="text-text-muted text-xs leading-relaxed">
                We'll email you a 6-digit code. No password needed.
              </p>
            </form>
          ) : (
            <form onSubmit={handleCodeSubmit} className="space-y-4">
              <div className="text-center space-y-1 mb-2">
                <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
                  Check your email
                </div>
                <p className="text-text-dim text-sm">
                  We sent a 6-digit code to <span className="text-text font-mono">{email}</span>
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="code" className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim">
                  Sign-in code
                </Label>
                {/*
                  inputMode="numeric" + autoComplete="one-time-code" lets iOS
                  auto-suggest the code from the recent email above the
                  keyboard (iOS 17+).
                */}
                {/*
                  Supabase email OTP length is configurable from 6 to 10
                  digits in dashboard → Auth → Providers → Email. We accept
                  any length in that range so a project setting change
                  doesn't lock users out.
                */}
                <Input
                  id="code"
                  type="text"
                  required
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6,10}"
                  maxLength={10}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  className="bg-bg border-border text-text text-center font-mono text-2xl tracking-[0.4em]"
                />
              </div>

              <Button
                type="submit"
                disabled={submitting || code.length < 6}
                className="w-full bg-accent text-accent-foreground hover:bg-accent-bright font-mono uppercase tracking-[0.12em] text-xs"
              >
                {submitting ? 'Verifying…' : 'Sign in'}
              </Button>

              <div className="flex items-center justify-between gap-2 text-xs font-mono uppercase tracking-[0.12em]">
                <button
                  type="button"
                  onClick={handleUseDifferentEmail}
                  disabled={submitting}
                  className="text-text-muted hover:text-accent disabled:opacity-50"
                >
                  Different email
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={submitting}
                  className="text-text-muted hover:text-accent disabled:opacity-50"
                >
                  Resend code
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
