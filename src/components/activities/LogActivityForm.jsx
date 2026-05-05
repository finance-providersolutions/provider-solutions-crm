import { useState } from 'react';
import { toast } from 'sonner';
import { Phone, Mail, Calendar, FileText, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ACTIVITY_TYPES } from '@/utils/constants';
import { cn } from '@/lib/utils';

export const ACTIVITY_ICON = {
  call:    Phone,
  email:   Mail,
  meeting: Calendar,
  note:    FileText,
  sms:     MessageSquare,
};

// Always-visible inline form. Phase 1 logs activities against a
// single parent at a time — caller passes the parent column name
// (e.g. 'organization_id') and id.
export default function LogActivityForm({ parentColumn, parentId, onLogged }) {
  const [type, setType]       = useState('call');
  const [subject, setSubject] = useState('');
  const [body, setBody]       = useState('');
  const [occurredAt, setOccurredAt] = useState(() => toLocalInput(new Date()));
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!body.trim() && !subject.trim()) {
      toast.error('Add a subject or note before saving');
      return;
    }
    setSubmitting(true);
    try {
      await onLogged({
        activity_type: type,
        subject:       subject.trim() || null,
        body:          body.trim()    || null,
        occurred_at:   new Date(occurredAt).toISOString(),
        [parentColumn]: parentId,
      });
      setSubject('');
      setBody('');
      setOccurredAt(toLocalInput(new Date()));
      toast.success('Activity logged');
    } catch (err) {
      console.error('log activity failed', err);
      toast.error(err?.message || 'Could not log activity');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}
          className="bg-surface border border-border rounded p-5 space-y-3 mb-6
                     relative after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0
                     after:h-0.5 after:bg-gradient-to-r after:from-accent after:to-transparent after:opacity-40">
      <div className="flex items-center gap-2 flex-wrap">
        {ACTIVITY_TYPES.map(t => {
          const Icon = ACTIVITY_ICON[t.value];
          const active = type === t.value;
          return (
            <button
              type="button"
              key={t.value}
              onClick={() => setType(t.value)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded border font-mono text-[11px] uppercase tracking-[0.1em] transition-colors',
                active
                  ? 'bg-accent text-accent-foreground border-accent'
                  : 'bg-bg text-text-dim border-border hover:text-accent hover:border-accent',
              )}
            >
              {Icon && <Icon className="w-3.5 h-3.5" />}
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-3">
        <FieldLabel label="Subject (optional)">
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Quick subject line"
            className="bg-bg border-border text-text"
          />
        </FieldLabel>
        <FieldLabel label="When">
          <Input
            type="datetime-local"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            className="bg-bg border-border text-text"
          />
        </FieldLabel>
      </div>

      <FieldLabel label="Notes">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="What happened? Outcome? Next steps?"
          className="bg-bg border-border text-text"
        />
      </FieldLabel>

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={submitting}
          className="bg-accent text-accent-foreground hover:bg-accent-bright font-mono uppercase tracking-[0.1em] text-xs"
        >
          {submitting ? 'Logging…' : 'Log activity'}
        </Button>
      </div>
    </form>
  );
}

function FieldLabel({ label, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-dim">{label}</Label>
      {children}
    </div>
  );
}

// datetime-local needs YYYY-MM-DDTHH:mm in the user's local zone.
function toLocalInput(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
