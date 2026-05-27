import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Command, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { useOrganizations } from '@/hooks/useOrganizations';
import { useOpportunities } from '@/hooks/useOpportunities';
import { useProviders } from '@/hooks/useProviders';
import { TASK_PRIORITIES, TASK_STATUSES } from '@/utils/constants';
import { cn } from '@/lib/utils';

const EMPTY = {
  title:           '',
  description:     '',
  due_date:        '',
  priority:        'normal',
  status:          'open',
  assignToMe:      true,
  parentType:      'none',  // 'organization' | 'opportunity' | 'provider' | 'none'
  organization_id: null,
  opportunity_id:  null,
  provider_id:     null,
};

// Same create-mode uuid pattern as the other forms — generate the
// row's id when the dialog opens in create mode so any inline-create
// pattern downstream can use it. No image uploads on tasks so this
// is purely for `id`.
//
// Assignee picker note: the schema's assignee_id references
// auth.users, which the client cannot enumerate without the service
// role key. Until the profiles table lands (Phase 2-plus), we ship a
// simple "Assign to me / Unassigned" toggle. The hook treats
// assignee_id as a regular UUID, so when profiles arrive the picker
// can swap in without touching the storage shape.
//
// Locked-parent props (lockedParentColumn, lockedParentId,
// lockedParentLabel) are honored in CREATE mode only. When set, the
// parent radio + picker are replaced with a read-only display line
// — the user can't change the parent type or record from the create
// flow because the dialog was opened from a parent's detail page
// where that context is implicit.
//
// In EDIT mode the locked props are intentionally ignored: editing
// an existing task should always allow re-parenting, since a task
// that started on one opportunity might genuinely move to another.
//
// Slice 4: the dialog-level Delete button (edit mode only) is now
// conditional on `hideDeleteAction`. When opened from the new Task
// detail page (which carries its own page-level Delete at the
// bottom, mirroring Provider), pass `hideDeleteAction` to suppress
// the in-dialog Delete so the record has exactly one delete affordance
// from that entry point. List-context entry points (the Tasks list
// page kebab, the embedded TasksSection on Opportunity/Provider/
// Organization detail pages) leave the prop unset and keep the
// dialog-level Delete visible, since no detail page is involved in
// those flows.
export default function TaskFormDialog({
  open, onOpenChange, task, onSave, onDeleted,
  lockedParentColumn, lockedParentId, lockedParentLabel,
  hideDeleteAction = false,
}) {
  const { user } = useAuth();
  const isEdit = Boolean(task);
  const isLocked = !isEdit && Boolean(lockedParentColumn && lockedParentId);
  const [values, setValues] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [createId, setCreateId] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const deleteTriggerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    if (task) {
      setValues({
        title:           task.title           ?? '',
        description:     task.description     ?? '',
        due_date:        task.due_date        ?? '',
        priority:        task.priority        ?? 'normal',
        status:          task.status          ?? 'open',
        assignToMe:      task.assignee_id != null && task.assignee_id === user?.id,
        parentType:      task.organization_id ? 'organization'
                       : task.opportunity_id  ? 'opportunity'
                       : task.provider_id     ? 'provider'
                       : 'none',
        organization_id: task.organization_id ?? null,
        opportunity_id:  task.opportunity_id  ?? null,
        provider_id:     task.provider_id     ?? null,
      });
    } else if (isLocked) {
      // Pre-fill the matching parent type and id; everything else
      // starts empty.
      const type = lockedParentColumnToType(lockedParentColumn);
      setValues({
        ...EMPTY,
        parentType:      type,
        organization_id: type === 'organization' ? lockedParentId : null,
        opportunity_id:  type === 'opportunity'  ? lockedParentId : null,
        provider_id:     type === 'provider'     ? lockedParentId : null,
      });
    } else {
      setValues(EMPTY);
    }
    setCreateId(task ? task.id : crypto.randomUUID());
  }, [open, task, user?.id, isLocked, lockedParentColumn, lockedParentId]);

  const set = (k) => (e) => setValues(v => ({ ...v, [k]: e.target.value }));

  function setParentType(next) {
    setValues(v => ({
      ...v,
      parentType: next,
      // Clear all three parent ids whenever the type radio changes,
      // then set just the relevant one when the user picks a record.
      organization_id: null,
      opportunity_id:  null,
      provider_id:     null,
    }));
  }

  async function performDelete() {
    if (!task || !onDeleted) return;
    setDeleting(true);
    try {
      await onDeleted(task.id);
      toast.success('Task deleted');
      onOpenChange(false);
    } catch (err) {
      console.error('TaskFormDialog delete failed', err);
      toast.error(err?.message || 'Could not delete task');
      throw err;
    } finally {
      setDeleting(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!values.title.trim()) {
      toast.error('Title is required');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        ...(isEdit ? {} : { id: createId }),
        title:        values.title.trim(),
        description:  values.description || null,
        due_date:     values.due_date || null,
        priority:     values.priority,
        status:       values.status,
        assignee_id:  values.assignToMe ? (user?.id ?? null) : null,
        organization_id: values.parentType === 'organization' ? values.organization_id : null,
        opportunity_id:  values.parentType === 'opportunity'  ? values.opportunity_id  : null,
        provider_id:     values.parentType === 'provider'     ? values.provider_id     : null,
        // completed_at: only stamp it when the form transitions a
        // task into the completed state. Editing other fields on a
        // task that's already completed shouldn't touch its
        // completed_at; deferring that nuance to update path below.
        ...(values.status === 'completed' && (!task || task.status !== 'completed')
          ? { completed_at: new Date().toISOString() }
          : {}),
        ...(values.status !== 'completed' && task?.status === 'completed'
          ? { completed_at: null }
          : {}),
      };
      await onSave(payload);
      toast.success(isEdit ? 'Task updated' : 'Task created');
      onOpenChange(false);
    } catch (err) {
      console.error('TaskFormDialog save failed', err);
      toast.error(err?.message || 'Could not save task');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface border-border text-text max-w-xl">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="font-display text-2xl">
            {isEdit ? 'Edit task' : 'New task'}
          </DialogTitle>
          <DialogDescription className="text-text-dim">
            {isEdit ? 'Update details and save.' : 'Quick follow-up to track.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
          <Field label="Title" required>
            <Input
              value={values.title}
              onChange={set('title')}
              placeholder="Follow up with credentialing lead"
              required
              autoFocus
              className="bg-bg border-border text-text"
            />
          </Field>

          <Field label="Notes">
            <Textarea
              value={values.description}
              onChange={set('description')}
              rows={3}
              className="bg-bg border-border text-text"
            />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Due date">
              <Input
                type="date"
                value={values.due_date}
                onChange={set('due_date')}
                className="bg-bg border-border text-text"
              />
            </Field>
            <Field label="Priority">
              <Select value={values.priority} onValueChange={(v) => setValues(s => ({ ...s, priority: v }))}>
                <SelectTrigger className="bg-bg border-border text-text"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={values.status} onValueChange={(v) => setValues(s => ({ ...s, status: v }))}>
                <SelectTrigger className="bg-bg border-border text-text"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Assignee">
            <div className="flex items-center gap-4">
              <Radio
                name="assignee"
                checked={values.assignToMe}
                onChange={() => setValues(s => ({ ...s, assignToMe: true }))}
                label="Assign to me"
              />
              <Radio
                name="assignee"
                checked={!values.assignToMe}
                onChange={() => setValues(s => ({ ...s, assignToMe: false }))}
                label="Unassigned"
              />
            </div>
          </Field>

          <Field label="Linked record">
            {isLocked ? (
              <div className="bg-surface2 border border-border rounded px-3 py-2">
                <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
                  {lockedParentColumnToType(lockedParentColumn)}
                </div>
                <div className="text-text">{lockedParentLabel || 'Linked record'}</div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-4 mb-2">
                  <Radio name="parent" checked={values.parentType === 'none'}         onChange={() => setParentType('none')}         label="None" />
                  <Radio name="parent" checked={values.parentType === 'organization'} onChange={() => setParentType('organization')} label="Organization" />
                  <Radio name="parent" checked={values.parentType === 'opportunity'}  onChange={() => setParentType('opportunity')}  label="Opportunity" />
                  <Radio name="parent" checked={values.parentType === 'provider'}     onChange={() => setParentType('provider')}     label="Provider" />
                </div>
                {values.parentType === 'organization' && (
                  <OrganizationParentPicker
                    value={values.organization_id}
                    onChange={(id) => setValues(s => ({ ...s, organization_id: id }))}
                  />
                )}
                {values.parentType === 'opportunity' && (
                  <OpportunityParentPicker
                    value={values.opportunity_id}
                    onChange={(id) => setValues(s => ({ ...s, opportunity_id: id }))}
                  />
                )}
                {values.parentType === 'provider' && (
                  <ProviderParentPicker
                    value={values.provider_id}
                    onChange={(id) => setValues(s => ({ ...s, provider_id: id }))}
                  />
                )}
              </>
            )}
          </Field>
          </div>

          {/* Footer pinned outside the scroll region. Phone: Delete
              top, Cancel, Save bottom. Desktop: Delete left, [Cancel,
              Save] inline right. */}
          <div className="flex-shrink-0 flex flex-col gap-2 pt-3 mt-4 border-t border-border
                          sm:flex-row sm:items-center sm:justify-between">
            <div>
              {isEdit && onDeleted && !hideDeleteAction && (
                <Button
                  ref={deleteTriggerRef}
                  type="button"
                  variant="ghost"
                  onClick={() => setConfirmDeleteOpen(true)}
                  disabled={submitting || deleting}
                  className="w-full sm:w-auto text-danger hover:bg-danger/10 hover:text-danger font-mono uppercase tracking-[0.1em] text-xs"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  {deleting ? 'Deleting…' : 'Delete'}
                </Button>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={submitting || deleting}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting || deleting}
                className="w-full sm:w-auto bg-accent text-accent-foreground hover:bg-accent-bright font-mono uppercase tracking-[0.1em] text-xs"
              >
                {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create'}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
      <ConfirmDeleteDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        triggerRef={deleteTriggerRef}
        title="Delete this task?"
        onConfirm={performDelete}
      />
    </Dialog>
  );
}

// Three flavor-specific pickers, each backed by the corresponding
// resource hook. Inlined per the brief: "cleaner is better than DRY
// here." Each owns just the Command-in-Popover boilerplate plus the
// type-specific record→display-name mapping.

function OrganizationParentPicker({ value, onChange }) {
  const { data, loading } = useOrganizations();
  const records = useMemo(
    () => data.map(o => ({ id: o.id, name: o.name, type: o.type })),
    [data],
  );
  return (
    <RecordCombobox
      records={records}
      value={value}
      onChange={onChange}
      placeholder="Pick an organization"
      searchPlaceholder="Search organizations…"
      loading={loading}
    />
  );
}

function OpportunityParentPicker({ value, onChange }) {
  const { data, loading } = useOpportunities();
  const records = useMemo(
    () => data.map(o => ({
      id:   o.id,
      name: o.title || o.name || 'Untitled',
      sub:  o.organization?.name,
    })),
    [data],
  );
  return (
    <RecordCombobox
      records={records}
      value={value}
      onChange={onChange}
      placeholder="Pick an opportunity"
      searchPlaceholder="Search opportunities…"
      loading={loading}
    />
  );
}

function ProviderParentPicker({ value, onChange }) {
  const { data, loading } = useProviders();
  const records = useMemo(
    () => data.map(p => ({
      id:   p.id,
      name: [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unnamed',
      sub:  p.specialty,
    })),
    [data],
  );
  return (
    <RecordCombobox
      records={records}
      value={value}
      onChange={onChange}
      placeholder="Pick a provider"
      searchPlaceholder="Search providers…"
      loading={loading}
    />
  );
}

function RecordCombobox({ records, value, onChange, placeholder, searchPlaceholder, loading }) {
  const [open, setOpen] = useState(false);
  const selected = records.find(r => r.id === value) ?? null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between bg-bg border-border text-text font-normal"
        >
          <span className={cn(!selected && 'text-text-muted')}>
            {loading ? 'Loading…' : selected ? selected.name : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width] bg-surface border-border" align="start">
        <Command className="bg-surface text-text">
          <CommandInput placeholder={searchPlaceholder} className="h-9" />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            {records.length > 0 && (
              <CommandGroup>
                {records.map(r => (
                  <CommandItem
                    key={r.id}
                    value={r.name}
                    onSelect={() => { onChange(r.id); setOpen(false); }}
                  >
                    <Check className={cn('mr-2 h-4 w-4', value === r.id ? 'opacity-100' : 'opacity-0')} />
                    <div className="flex flex-col">
                      <span>{r.name}</span>
                      {r.sub && <span className="text-text-muted text-xs">{r.sub}</span>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function Field({ label, required, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim">
        {label}{required && <span className="text-danger ml-1">*</span>}
      </Label>
      {children}
    </div>
  );
}

function lockedParentColumnToType(col) {
  if (col === 'organization_id') return 'organization';
  if (col === 'opportunity_id')  return 'opportunity';
  if (col === 'provider_id')     return 'provider';
  return 'none';
}

function Radio({ name, checked, onChange, label }) {
  return (
    <label className="flex items-center gap-1.5 cursor-pointer select-none">
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="w-4 h-4 accent-accent"
      />
      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim">
        {label}
      </span>
    </label>
  );
}
