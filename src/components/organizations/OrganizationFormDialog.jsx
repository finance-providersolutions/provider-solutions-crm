import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import ImageUpload from '@/components/uploads/ImageUpload';
import { ORGANIZATION_TYPES, US_STATES } from '@/utils/constants';

const EMPTY = {
  name: '',
  type: '',
  website: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  notes: '',
  // Hospital-flavored fields (per BUILD_PLAN §4.1). Hidden from the
  // form when type === 'locums_partner'; nulled in state on
  // type-switch so re-toggling shows them empty.
  logo_path:        null,
  image_path:       null,
  tourist_site_url: '',
  long_description: '',
};

// Hospital-flavored fields show for these org types and stay hidden
// otherwise. BUILD_PLAN §4.1: shown for `hospital` and `other`,
// hidden for `locums_partner`. Empty type also hides them — type
// must be picked first, which is natural progressive disclosure.
function showsHospitalFields(type) {
  return type === 'hospital' || type === 'other';
}

// Used for both create and edit. Pass `org` to edit, omit to create.
// onSave is called with the form values and must return a Promise —
// errors thrown are surfaced via toast.
//
// `initialValues` (create mode only) pre-fills selected fields when
// the dialog opens. Used by OrganizationCombobox to seed
// `type: 'hospital'` so the inline "+ Create new hospital" flow
// doesn't make the user pick the type again. Ignored in edit mode.
//
// Create-mode parentId: a uuid is generated when the dialog opens
// in create mode and used both as the ImageUpload `parentId` (so
// uploads land at organization-logos/<uuid>/...) AND as the new
// row's `id` on insert. Single-step create stays single-step. The
// uuid regenerates on each fresh dialog open, so any uploads from a
// cancelled session become orphaned — acceptable per the commit
// brief.
export default function OrganizationFormDialog({ open, onOpenChange, org, initialValues, onSave }) {
  const isEdit = Boolean(org);
  const [values, setValues] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  // null until the dialog opens. In edit mode it's org.id; in
  // create mode it's a freshly-generated uuid that becomes the new
  // row's id on save.
  const [parentId, setParentId] = useState(null);

  useEffect(() => {
    if (!open) return;
    setValues(org
      ? {
          name:             org.name             ?? '',
          type:             org.type             ?? '',
          website:          org.website          ?? '',
          address:          org.address          ?? '',
          city:             org.city             ?? '',
          state:            org.state            ?? '',
          zip:              org.zip              ?? '',
          notes:            org.notes            ?? '',
          logo_path:        org.logo_path        ?? null,
          image_path:       org.image_path       ?? null,
          tourist_site_url: org.tourist_site_url ?? '',
          long_description: org.long_description ?? '',
        }
      : { ...EMPTY, ...(initialValues ?? {}) });
    setParentId(org ? org.id : crypto.randomUUID());
  }, [open, org, initialValues]);

  const set = (key) => (e) => setValues(v => ({ ...v, [key]: e.target.value }));

  // Type changes are special: switching to locums_partner null-outs
  // the hospital-flavored fields in form state so re-toggling shows
  // them empty (and so the eventual save payload doesn't carry stale
  // values from a prior hospital incarnation).
  function handleTypeChange(next) {
    setValues(v => ({
      ...v,
      type: next,
      ...(next === 'locums_partner' && {
        logo_path:        null,
        image_path:       null,
        tourist_site_url: '',
        long_description: '',
      }),
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!values.name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSubmitting(true);
    try {
      const hospitalish = showsHospitalFields(values.type);
      const payload = {
        // Create mode: include the id so storage paths uploaded
        // against this uuid line up with the row that's about to
        // exist. Edit mode: omit, the row's id is unchanged.
        ...(isEdit ? {} : { id: parentId }),
        name:             values.name.trim(),
        type:             values.type             || null,
        website:          values.website          || null,
        address:          values.address          || null,
        city:             values.city             || null,
        state:            values.state            || null,
        zip:              values.zip              || null,
        notes:            values.notes            || null,
        // Hospital-flavored fields persist only when the type
        // actually shows them. Type toggles already null state, but
        // belt-and-suspenders here ensures a stale state never
        // reaches the database.
        logo_path:        hospitalish ? (values.logo_path        || null) : null,
        image_path:       hospitalish ? (values.image_path       || null) : null,
        tourist_site_url: hospitalish ? (values.tourist_site_url || null) : null,
        long_description: hospitalish ? (values.long_description || null) : null,
      };
      await onSave(payload);
      toast.success(isEdit ? 'Organization updated' : 'Organization created');
      onOpenChange(false);
    } catch (err) {
      console.error('OrganizationFormDialog save failed', err);
      toast.error(err?.message || 'Could not save organization');
    } finally {
      setSubmitting(false);
    }
  }

  const hospitalish = showsHospitalFields(values.type);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface border-border text-text max-w-xl">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="font-display text-2xl">
            {isEdit ? 'Edit organization' : 'New organization'}
          </DialogTitle>
          <DialogDescription className="text-text-dim">
            {isEdit ? 'Update details and save.' : 'Hospitals, LOCUMs partners, or other.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
          <Field label="Name" required>
            <Input
              value={values.name}
              onChange={set('name')}
              placeholder="Memorial Hospital"
              required
              autoFocus
              className="bg-bg border-border text-text"
            />
          </Field>

          <Field label="Type">
            <Select value={values.type || undefined} onValueChange={handleTypeChange}>
              <SelectTrigger className="bg-bg border-border text-text">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {ORGANIZATION_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Website">
            <Input
              type="url"
              value={values.website}
              onChange={set('website')}
              placeholder="https://example.com"
              className="bg-bg border-border text-text"
            />
          </Field>

          <Field label="Address">
            <Input
              value={values.address}
              onChange={set('address')}
              placeholder="123 Main St"
              className="bg-bg border-border text-text"
            />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3">
            <Field label="City">
              <Input value={values.city} onChange={set('city')} className="bg-bg border-border text-text" />
            </Field>
            <Field label="State">
              <Select value={values.state || undefined} onValueChange={(v) => setValues(s => ({ ...s, state: v }))}>
                <SelectTrigger className="bg-bg border-border text-text w-full md:w-[110px]">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent className="max-h-[260px]">
                  {US_STATES.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="ZIP">
              <Input value={values.zip} onChange={set('zip')} className="bg-bg border-border text-text w-full md:w-[100px]" />
            </Field>
          </div>

          {hospitalish && (
            <>
              <div className="border-t border-border/40 pt-4 space-y-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
                  Hospital details
                </div>

                <div className="flex flex-wrap gap-6">
                  <div className="space-y-1.5">
                    <Label className="block font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim">
                      Logo
                    </Label>
                    <ImageUpload
                      bucket="organization-logos"
                      pathPrefix="logo"
                      parentId={parentId}
                      currentPath={values.logo_path}
                      onUploaded={(p) => setValues(v => ({ ...v, logo_path: p }))}
                      onRemove={() => setValues(v => ({ ...v, logo_path: null }))}
                      alt={`${values.name || 'Organization'} logo`}
                      shape="square"
                      size="lg"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="block font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim">
                      Facility image
                    </Label>
                    <ImageUpload
                      bucket="organization-logos"
                      pathPrefix="image"
                      parentId={parentId}
                      currentPath={values.image_path}
                      onUploaded={(p) => setValues(v => ({ ...v, image_path: p }))}
                      onRemove={() => setValues(v => ({ ...v, image_path: null }))}
                      alt={`${values.name || 'Organization'} facility photo`}
                      shape="square"
                      size="lg"
                    />
                  </div>
                </div>

                <Field label="Tourist site URL">
                  <Input
                    type="url"
                    value={values.tourist_site_url}
                    onChange={set('tourist_site_url')}
                    placeholder="https://visitcityname.com"
                    className="bg-bg border-border text-text"
                  />
                </Field>

                <Field label="Long description">
                  <Textarea
                    value={values.long_description}
                    onChange={set('long_description')}
                    rows={4}
                    placeholder="Recruiting copy — what makes this facility appealing to providers."
                    className="bg-bg border-border text-text"
                  />
                </Field>
              </div>
            </>
          )}

          <Field label="Notes">
            <Textarea
              value={values.notes}
              onChange={set('notes')}
              rows={4}
              placeholder="Anything we should know"
              className="bg-bg border-border text-text"
            />
          </Field>
          </div>

          <div className="flex-shrink-0 flex flex-col gap-2 pt-3 mt-4 border-t border-border
                          sm:flex-row sm:items-center sm:justify-end sm:gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto bg-accent text-accent-foreground hover:bg-accent-bright font-mono uppercase tracking-[0.1em] text-xs"
            >
              {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
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
