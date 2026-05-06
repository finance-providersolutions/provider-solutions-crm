import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList, CommandSeparator,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import OrganizationFormDialog from '@/components/organizations/OrganizationFormDialog';
import { useOrganizations } from '@/hooks/useOrganizations';
import { cn } from '@/lib/utils';

// Searchable combobox over organizations of a specific type.
//
// Props:
//   type            — 'hospital' | 'locums_partner' (filter)
//   value           — current selected organization id (string) or null
//   onChange(id)    — called with the selected id, or with null when
//                     the user picks the empty option
//   required        — if true, no empty option is shown
//   emptyLabel      — label for the "(none)" item when not required
//                     (e.g., "Direct (no partner)" for source partner)
//   allowCreateNew  — if true, a "+ Create new <singular>" item appears
//                     at the bottom and opens OrganizationFormDialog
//                     in create mode pre-seeded with type=<type>. On
//                     successful save, the new id becomes the selected
//                     value via onChange.
//   placeholder     — placeholder text on the trigger when nothing is
//                     selected
//   disabled        — disable the trigger
//
// Uses the same useOrganizations() list that powers the Organizations
// page, so newly-created orgs appear immediately after refetch.
export default function OrganizationCombobox({
  type,
  value,
  onChange,
  required = false,
  emptyLabel = 'None',
  allowCreateNew = false,
  placeholder = 'Select organization',
  disabled = false,
}) {
  const { data, loading, create } = useOrganizations();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(
    () => data.filter(o => o.type === type),
    [data, type],
  );
  const selected = useMemo(
    () => filtered.find(o => o.id === value) ?? null,
    [filtered, value],
  );

  const singular = type === 'hospital'       ? 'hospital'
                 : type === 'locums_partner' ? 'partner'
                 : 'organization';

  function pick(orgId) {
    onChange(orgId);
    setOpen(false);
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between bg-bg border-border text-text font-normal"
          >
            <span className={cn(!selected && 'text-text-muted')}>
              {loading
                ? 'Loading…'
                : selected
                  ? selected.name
                  : (value === null && !required ? emptyLabel : placeholder)}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="p-0 w-[--radix-popover-trigger-width] bg-surface border-border"
          align="start"
        >
          <Command className="bg-surface text-text">
            <CommandInput placeholder={`Search ${singular}s…`} className="h-9" />
            <CommandList>
              <CommandEmpty>No matches.</CommandEmpty>
              {!required && (
                <CommandGroup>
                  <CommandItem
                    value="__none__"
                    onSelect={() => pick(null)}
                  >
                    <Check className={cn('mr-2 h-4 w-4', value === null ? 'opacity-100' : 'opacity-0')} />
                    <span className="italic text-text-dim">{emptyLabel}</span>
                  </CommandItem>
                </CommandGroup>
              )}
              {filtered.length > 0 && (
                <CommandGroup>
                  {filtered.map(o => (
                    <CommandItem
                      key={o.id}
                      value={o.name}
                      onSelect={() => pick(o.id)}
                    >
                      <Check className={cn('mr-2 h-4 w-4', value === o.id ? 'opacity-100' : 'opacity-0')} />
                      {o.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {allowCreateNew && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      value="__create_new__"
                      onSelect={() => { setOpen(false); setCreateOpen(true); }}
                    >
                      <Plus className="mr-2 h-4 w-4 text-accent" />
                      <span className="text-accent">Create new {singular}</span>
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {allowCreateNew && (
        <OrganizationFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          initialValues={{ type }}
          onSave={async (payload) => {
            // Force the type so a user who fiddles with the type
            // dropdown mid-flow doesn't accidentally create a row
            // that won't show up in this combobox.
            const row = await create({ ...payload, type });
            onChange(row.id);
          }}
        />
      )}
    </>
  );
}
