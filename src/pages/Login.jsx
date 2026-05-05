import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function Login() {
  const { session, loading, signInWithMagicLink } = useAuth();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  if (!loading && session) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    const { error } = await signInWithMagicLink(email.trim());
    setSubmitting(false);
    if (error) {
      console.error('signInWithMagicLink error', error);
      toast.error(error.message || 'Could not send magic link');
      return;
    }
    setSent(true);
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
          {sent ? (
            <div className="text-center space-y-3">
              <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
                Check your email
              </div>
              <p className="text-text-dim text-sm">
                We sent a magic link to <span className="text-text font-mono">{email}</span>.
                Click it from this device to sign in.
              </p>
              <button
                type="button"
                onClick={() => { setSent(false); setEmail(''); }}
                className="text-text-muted hover:text-accent text-xs font-mono uppercase tracking-[0.12em] mt-4"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
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
                {submitting ? 'Sending…' : 'Send magic link'}
              </Button>
              <p className="text-text-muted text-xs leading-relaxed">
                We'll email you a one-time link. No password needed.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
