import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { CardKebab } from '@/components/ui/card-kebab';
import Thumb from '@/components/uploads/Thumb';
import ContactFormDialog from '@/components/contacts/ContactFormDialog';
import { useContacts } from '@/hooks/useContacts';
import { useOrganizations } from '@/hooks/useOrganizations';
import { useChromeBottom } from '@/hooks/useChromeBottom';
import { CONTACT_ROLES, labelFor } from '@/utils/constants';
import { fmtName } from '@/utils/formatters';
import { initialsFor } from '@/utils/storage';
import { cn } from '@/lib/utils';

// Slice 4 card swap. Same two-layout responsive shape as the
// Opportunities card; logo slot IS used here because contacts
// uniformly have a parent org with a logo (inverse of the Tasks
// decision). The card visually reads as "this person at this
// hospital."
//
// Per-page card variations:
//   - Role rendered as mono cap label on row 1 (mobile) / top of
//     center cluster (wide), NOT as a chip. Role is categorization,
//     not lifecycle state — the badge slot stays empty to keep the
//     "badge slot = lifecycle state" grammar honest across the suite.
//   - No parent-scoped indicator. Right cluster on wide is just the
//     kebab; mobile row 4 right is empty.
//   - Email/phone summary as a single sub-line; whichever piece is
//     present renders, em-dash when both are missing.

const SORT_DEFAULT = 'default';
const SORT_NEWEST  = 'newest';
const SORT_OPTIONS = [
  { value: SORT_DEFAULT, label: 'Name (A→Z)'    },
  { value: SORT_NEWEST,  label: 'Newest first'  },
];

// Chrome heights — bar 1 is owned by PageHeader (Slice 1, 58px).
// Bar 2 is the list subheader; bar 3 is the conditional search bar
// that appears below bar 2 only when searchOpen is true.
const BAR1_H = 58;
const BAR2_H = 56;
const BAR3_H = 52;
const FILTER_PANEL_W = 320;

export default function Contacts() {
  const navigate = useNavigate();
  const contacts = useContacts();
  const orgs = useOrganizations();
  const [search, setSearch]         = useState('');
  const [orgFilter, setOrgFilter]   = useState('all');
  const [sort, setSort]             = useState(SORT_DEFAULT);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const deleteTriggerRef = useRef(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  // Anchor dialogs below this page's total fixed chrome (primary
  // header + bar-2 + bar-3 when search is open). Tracks searchOpen
  // live via the hook's dependency on its px argument.
  useChromeBottom(BAR1_H + BAR2_H + (searchOpen ? BAR3_H : 0));

  const filtersActive = orgFilter !== 'all' || sort !== SORT_DEFAULT;
  const searchActive  = search.trim().length > 0;
  const anyActive     = filtersActive || searchActive;

  const clearAll = () => {
    setSearch('');
    setOrgFilter('all');
    setSort(SORT_DEFAULT);
  };

  useEffect(() => {
    if (!filterOpen && !searchOpen) return;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (filterOpen) setFilterOpen(false);
      else if (searchOpen) setSearchOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filterOpen, searchOpen]);

  const searchInputRef = useRef(null);
  useEffect(() => {
    if (searchOpen) {
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [searchOpen]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = contacts.data.filter(c => {
      if (orgFilter !== 'all' && c.organization_id !== orgFilter) return false;
      if (!q) return true;
      const name = fmtName(c).toLowerCase();
      return (
        name.includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        c.title?.toLowerCase().includes(q) ||
        c.organization?.name?.toLowerCase().includes(q)
      );
    });
    if (sort === SORT_NEWEST) {
      return [...filtered].sort((a, b) =>
        (b.created_at || '').localeCompare(a.created_at || ''));
    }
    return filtered;
  }, [contacts.data, search, orgFilter, sort]);

  const bodyPaddingTop =
    `calc(${BAR1_H + BAR2_H + (searchOpen ? BAR3_H : 0)}px + env(safe-area-inset-top))`;

  return (
    <>
      {/* Bar 2 — list subheader */}
      <div
        className="fixed left-0 right-0 z-[150] border-b border-border bg-surface"
        style={{ top: `calc(${BAR1_H}px + env(safe-area-inset-top))` }}
      >
        <div className="flex items-center justify-between gap-3 px-6 h-14">
          <div className="min-w-0">
            <h1 className="font-display text-[18px] sm:text-[22px] text-text leading-none truncate">
              Contacts
            </h1>
            <p className="hidden sm:block font-mono text-[10px] uppercase tracking-[0.12em] text-text-dim mt-1 truncate">
              People at hospitals and partners
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {anyActive && (
              <button
                type="button"
                onClick={clearAll}
                className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-dim hover:text-accent px-2 transition-colors"
              >
                Clear
              </button>
            )}
            <IconBtn
              onClick={() => setSearchOpen(o => !o)}
              active={searchOpen || searchActive}
              ariaLabel="Search"
            >
              <Search className="w-[18px] h-[18px]" strokeWidth={1.5} />
            </IconBtn>
            <IconBtn
              onClick={() => setFilterOpen(true)}
              active={filtersActive}
              ariaLabel="Filter"
            >
              <SlidersHorizontal className="w-[18px] h-[18px]" strokeWidth={1.5} />
            </IconBtn>
            <IconBtn
              onClick={() => setCreateOpen(true)}
              ariaLabel="New contact"
            >
              <Plus className="w-[18px] h-[18px]" strokeWidth={1.5} />
            </IconBtn>
          </div>
        </div>
      </div>

      {/* Bar 3 — conditional search bar */}
      <div
        className="fixed left-0 right-0 z-[150] border-b border-border bg-surface overflow-hidden transition-[height] duration-300 ease-out"
        style={{
          top: `calc(${BAR1_H + BAR2_H}px + env(safe-area-inset-top))`,
          height: searchOpen ? `${BAR3_H}px` : '0px',
          borderBottomWidth: searchOpen ? '1px' : '0px',
        }}
      >
        <div className="flex items-center gap-2 px-6 h-[52px]">
          <Search className="w-4 h-4 text-text-muted flex-shrink-0" />
          <Input
            ref={searchInputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, phone, organization…"
            className="bg-transparent border-0 text-text focus-visible:ring-0 focus-visible:ring-offset-0 flex-1 px-0 h-9 shadow-none"
          />
          <button
            type="button"
            onClick={() => setSearchOpen(false)}
            aria-label="Close search"
            className="text-text-dim hover:text-accent transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div
        className="min-h-full pb-12 px-6 transition-[padding] duration-300 ease-out"
        style={{ paddingTop: bodyPaddingTop }}
      >
        <div className="max-w-6xl mx-auto py-8">
          {contacts.loading && (
            <EmptyContainer>
              <div className="font-mono text-xs uppercase tracking-[0.1em] text-text-muted">
                Loading…
              </div>
            </EmptyContainer>
          )}
          {!contacts.loading && contacts.error && (
            <EmptyContainer>
              <div className="text-danger font-mono text-xs">{contacts.error.message}</div>
            </EmptyContainer>
          )}
          {!contacts.loading && !contacts.error && rows.length === 0 && (
            <EmptyContainer>
              <div className="text-text-dim mb-3 font-mono text-xs uppercase tracking-[0.1em]">
                {contacts.data.length === 0 ? 'No contacts yet.' : 'No matches for current filters.'}
              </div>
              {contacts.data.length === 0 && (
                <Button
                  onClick={() => setCreateOpen(true)}
                  variant="outline"
                  className="border-accent text-accent hover:bg-accent-dim font-mono uppercase tracking-[0.1em] text-xs"
                >
                  <Plus className="w-4 h-4 mr-1" /> Add the first one
                </Button>
              )}
            </EmptyContainer>
          )}

          {!contacts.loading && !contacts.error && rows.length > 0 && (
            <div className="flex flex-col gap-3">
              {rows.map(c => (
                <ContactCard
                  key={c.id}
                  contact={c}
                  onClick={() => navigate(`/contacts/${c.id}`)}
                  onEdit={() => setEditTarget(c)}
                  onDelete={(triggerEl) => {
                    deleteTriggerRef.current = triggerEl;
                    setDeleteTarget(c);
                  }}
                />
              ))}
            </div>
          )}

          {!contacts.loading && rows.length > 0 && (
            <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
              {rows.length} {rows.length === 1 ? 'contact' : 'contacts'}
              {rows.length !== contacts.data.length && ` · ${contacts.data.length} total`}
            </div>
          )}
        </div>
      </div>

      {/* Filter panel */}
      {createPortal(
        <>
          <div
            className={cn(
              'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity',
              filterOpen ? 'opacity-100' : 'opacity-0 pointer-events-none',
            )}
            onClick={() => setFilterOpen(false)}
          />
          <aside
            className="fixed top-0 h-full z-50 flex flex-col border-l border-border bg-surface transition-[right] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={{
              width: FILTER_PANEL_W,
              right: filterOpen ? 0 : -FILTER_PANEL_W,
              paddingTop: 'calc(58px + env(safe-area-inset-top))',
            }}
          >
            <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-surface2">
              <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted">
                Filters
              </span>
              <div className="flex items-center gap-3">
                {anyActive && (
                  <button
                    type="button"
                    onClick={clearAll}
                    className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-dim hover:text-accent transition-colors"
                  >
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setFilterOpen(false)}
                  aria-label="Close filters"
                  className="text-text-muted hover:text-text transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-4 px-6 py-5 overflow-y-auto">
              <FilterRow label="Organization">
                <Select value={orgFilter} onValueChange={setOrgFilter}>
                  <SelectTrigger className="bg-surface border-border text-text"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All organizations</SelectItem>
                    {orgs.data.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FilterRow>
              <FilterRow label="Sort">
                <Select value={sort} onValueChange={setSort}>
                  <SelectTrigger className="bg-surface border-border text-text"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FilterRow>
            </div>
          </aside>
        </>,
        document.body,
      )}

      <ContactFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        organizations={orgs.data}
        onSave={async (payload) => { await contacts.create(payload); }}
      />

      {/* Edit dialog driven by the card kebab. List context — the
          ContactFormDialog has no in-dialog Delete (unlike Tasks),
          so there's no conflict with the page-level Delete on the
          detail page. No hideDeleteAction prop needed. */}
      <ContactFormDialog
        open={Boolean(editTarget)}
        onOpenChange={(o) => { if (!o) setEditTarget(null); }}
        contact={editTarget}
        organizations={orgs.data}
        onSave={async (payload) => {
          try {
            await contacts.update(editTarget.id, payload);
            setEditTarget(null);
          } catch (err) {
            console.error('Contact update failed', err);
            toast.error(err?.message || 'Update failed.');
          }
        }}
      />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => { if (!next) setDeleteTarget(null); }}
        triggerRef={deleteTriggerRef}
        title={deleteTarget
          ? `Delete contact "${fmtName(deleteTarget)}"?`
          : 'Delete contact?'}
        onConfirm={async () => {
          try {
            await contacts.remove(deleteTarget.id);
            setDeleteTarget(null);
          } catch (err) {
            console.error('Contact delete failed', err);
            toast.error(err?.message || 'Delete failed.');
            throw err;
          }
        }}
      />
    </>
  );
}

// Two-layout responsive card. Logo slot is the PARENT ORG logo, not
// the contact's own image (contacts have none today).
//
// Email and phone live ON THE DETAIL PAGE only — they're action data
// (mailto/tel taps), not scanning data, and the combined line on
// mobile truncated below the threshold of usefulness.
//
// Mobile rows (up to 4; rows 2 and 4 hide when their datum is null):
//   1 — contact name (accent teal, font-display, primary) + kebab right
//   2 — role with trailing "at" preposition (mono cap, text-dim) —
//       reads as the lead-in to row 3, so the visual flows
//       "DECISION MAKER at / Gastro Health Grandview" across the
//       two rows
//   3 — organization name (white sans, parent identifier)
//   4 — title (mono normal-case, text-muted) — descriptor only
//
// Wide layout:
//   left thumb     — org logo / initials fallback
//   left cluster   — org name / city, ST
//   center cluster — contact name (accent teal) / title (mono)
//   right cluster  — kebab on top / role (mono cap, text-dim) below
function ContactCard({ contact: c, onClick, onEdit, onDelete }) {
  const orgName  = c.organization?.name ?? '—';
  const orgCity  = c.organization?.city  ?? null;
  const orgState = c.organization?.state ?? null;
  const orgLocation = [orgCity, orgState].filter(Boolean).join(', ');

  const name = fmtName(c);
  const roleLabel = c.role ? labelFor(CONTACT_ROLES, c.role) : null;
  const titleText = c.title || null;

  const kebab = (
    <CardKebab ariaLabel="Contact actions" onEdit={onEdit} onDelete={onDelete} />
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className="relative bg-surface border border-border rounded p-3 md:px-5 md:py-3 cursor-pointer transition-colors hover:border-accent hover:bg-surface2 focus-visible:border-accent focus-visible:outline-none"
    >
      {/* ── Mobile / narrow layout (below md) ─────────────────── */}
      <div className="md:hidden flex items-center gap-3">
        <Thumb
          path={c.organization?.logo_path}
          bucket="organization-logos"
          alt={orgName}
          fallback={initialsFor(orgName)}
          size="lg"
          shape="square"
          className="h-20 w-20 text-base flex-shrink-0"
        />
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Row 1 — contact name (primary) + kebab. items-center
              vertically aligns the 36×36 kebab against the title's
              cap-height. */}
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="flex-1 min-w-0 font-display text-[18px] text-accent leading-none truncate">
              {name}
            </h3>
            <div className="flex-shrink-0">{kebab}</div>
          </div>
          {/* Row 2 — "ROLE at" lead-in. Mono cap on the role; the
              trailing "at" is lowercase mono so the eye reads it as
              a preposition flowing into the org name on row 3.
              Hidden when no role is set. */}
          {roleLabel && (
            <p className="mt-1 font-mono text-[11px] leading-none truncate text-text-dim">
              <span className="uppercase tracking-[0.12em]">{roleLabel}</span>
              <span className="text-text-muted normal-case"> at</span>
            </p>
          )}
          {/* Row 3 — organization name. Tightens against row 2 when
              row 2 is present so the "at" preposition reads as a
              direct lead-in; falls back to the dominant title-to-
              parent break (mt-3) when row 2 is hidden. */}
          <p className={cn(
            'text-text text-[15px] font-medium leading-none truncate',
            roleLabel ? 'mt-1' : 'mt-3',
          )}>
            {orgName}
          </p>
          {/* Row 4 — title (mono, descriptor). Hidden when null. */}
          {titleText && (
            <p className="mt-1 font-mono text-[11px] tracking-tight text-text-muted leading-none truncate">
              {titleText}
            </p>
          )}
        </div>
      </div>

      {/* ── Wide / horizontal layout (md and up) ──────────────── */}
      {/* items-stretch + justify-between on each cluster makes
          row 1 sit at the top edge and row 2 at the bottom edge of
          a single shared height across all three sections, so the
          rows visually align across left / middle / right. The
          logo is vertical-centered within that same height. Card
          height is driven by the tallest cluster (typically the
          right cluster's kebab+role pair). */}
      <div className="hidden md:flex items-stretch gap-5">
        <div className="flex-shrink-0 flex items-center">
          <Thumb
            path={c.organization?.logo_path}
            bucket="organization-logos"
            alt={orgName}
            fallback={initialsFor(orgName)}
            size="md"
            shape="square"
            className="h-12 w-12 lg:h-14 lg:w-14 text-sm"
          />
        </div>

        {/* Left cluster — org name (top) / city, ST (tight under).
            justify-start + small gap (rather than justify-between)
            keeps row 2 close to row 1 visually; the right cluster
            still uses justify-between, so role sits lower than the
            left/middle row 2 by design. */}
        <div className="min-w-0 basis-1/3 flex flex-col justify-start gap-1 py-0.5">
          <p className="text-text text-[16px] lg:text-[17px] font-medium leading-tight truncate">
            {orgName}
          </p>
          <p className="font-mono text-[11px] lg:text-[12px] text-text-dim leading-none truncate">
            {orgLocation || <span className="text-text-muted">—</span>}
          </p>
        </div>

        {/* Center cluster — contact name (top) / title (tight under) */}
        <div className="flex-1 min-w-0 flex flex-col justify-start gap-1 py-0.5">
          <h3 className="font-display text-[18px] lg:text-[20px] text-accent leading-tight truncate">
            {name}
          </h3>
          <p className="font-mono text-[12px] lg:text-[13px] leading-none truncate text-text-muted">
            {titleText || <span className="text-text-muted">—</span>}
          </p>
        </div>

        {/* Right cluster — kebab (top) / role mono cap (bottom).
            Role renders as mono text (categorization signal), not a
            chip, so position matches the badge-slot grammar without
            misreading as lifecycle state. Hidden when no role set. */}
        <div className="flex-shrink-0 flex flex-col justify-between items-end">
          {kebab}
          {roleLabel ? (
            <span className="font-mono text-[10px] lg:text-[11px] uppercase tracking-[0.12em] text-text-dim leading-none">
              {roleLabel}
            </span>
          ) : (
            // Empty placeholder keeps the right cluster's lower edge
            // anchored at the bottom shared baseline even when role
            // is absent, so the kebab doesn't drift downward via
            // justify-between collapsing to a single child.
            <span aria-hidden className="h-[11px] leading-none" />
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyContainer({ children }) {
  return (
    <div className="bg-surface border border-border rounded flex flex-col items-center justify-center text-center px-6 py-20 min-h-[280px]">
      {children}
    </div>
  );
}

function IconBtn({ children, onClick, active = false, ariaLabel }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        'flex items-center justify-center w-9 h-9 border rounded cursor-pointer flex-shrink-0 transition-colors',
        active
          ? 'bg-accent-dim border-accent text-accent'
          : 'bg-surface border-border text-text-dim hover:border-accent hover:bg-accent-dim hover:text-accent',
      )}
    >
      {children}
    </button>
  );
}

function FilterRow({ label, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
        {label}
      </span>
      {children}
    </div>
  );
}
