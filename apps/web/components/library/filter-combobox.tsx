"use client"

import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@workspace/ui/components/combobox"

export type FilterOption = { value: string; label: string }

/** Single-select searchable filter (shadcn Combobox). `value` "" means the first/"all" option. */
export function FilterCombobox({ options, value, onChange, label }: { options: FilterOption[]; value: string; onChange: (v: string) => void; label: string }) {
  const selected = options.find((o) => o.value === value) ?? options[0]!
  return (
    <Combobox
      items={options}
      value={selected}
      onValueChange={(o: FilterOption | null) => onChange(o?.value ?? "")}
      itemToStringLabel={(o: FilterOption) => o.label}
      isItemEqualToValue={(a: FilterOption, b: FilterOption) => a.value === b.value}
    >
      <ComboboxInput aria-label={label} placeholder={label} className="card h-11 w-full min-w-0 rounded-xl" />
      <ComboboxContent>
        <ComboboxEmpty>No match</ComboboxEmpty>
        <ComboboxList>
          {(o: FilterOption) => <ComboboxItem key={o.value} value={o}>{o.label}</ComboboxItem>}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
