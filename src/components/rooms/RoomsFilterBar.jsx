import { Select } from "radix-ui";
import { Input } from "@/components/ui/input";
import {
  Search,
  X,
  List,
  LayoutGrid,
  SlidersHorizontal,
  ArrowUpDown,
  ChevronDown,
} from "lucide-react";

const SORT_OPTIONS = [
  { value: "number-asc", label: "Room # (Low → High)" },
  { value: "number-desc", label: "Room # (High → Low)" },
  { value: "name-asc", label: "Name (A → Z)" },
  { value: "name-desc", label: "Name (Z → A)" },
  { value: "rate-asc", label: "Rate (Low → High)" },
  { value: "rate-desc", label: "Rate (High → Low)" },
  { value: "status", label: "Status" },
];

/**
 * The search box, view-mode toggle, filter selects and sort control above the
 * admin room list.
 *
 * Props are grouped rather than passed one-by-one: this control panel reads six
 * pieces of filter state and writes all of them back, so a flat signature would
 * have been ~19 props. SORT_OPTIONS moved in here because only this toolbar
 * used it.
 */

// Styled filter picker — same slim yellow recipe as the admin Select filters.
// Native <select> panels are OS-rendered and can't match it.
function FilterSelect({ value, onChange, options, ariaLabel }) {
  return (
    <Select.Root value={value} onValueChange={onChange}>
      <Select.Trigger
        aria-label={ariaLabel}
        className="flex h-9 items-center justify-between gap-2 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring/50"
      >
        <Select.Value />
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
      </Select.Trigger>
      <Select.Portal>
        <Select.Content position="popper" side="bottom" align="start" sideOffset={4} className="z-50 max-h-64 overflow-hidden rounded-md border border-border bg-background p-1 text-foreground shadow-md">
          <Select.Viewport>
            {options.map((o) => (
              <Select.Item
                key={o.value}
                value={o.value}
                className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-surface-hover data-[state=checked]:bg-primary/15 data-[highlighted]:text-foreground"
              >
                <Select.ItemText>{o.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
export default function RoomsFilterBar({
  filters,
  options,
  counts,
  hasActiveFilters,
  onChange,
  onClear,
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1 group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40 group-focus-within:text-primary transition-colors" />
          <Input
            placeholder="Search by name, room #, or type..."
            value={filters.searchQuery}
            onChange={(e) => onChange.search(e.target.value)}
            className="pl-9"
          />
          {filters.searchQuery && (
            <button
              onClick={() => onChange.search("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-surface-hover"
            >
              <X className="h-3.5 w-3.5 text-foreground/40" />
            </button>
          )}
        </div>

        {/* View toggle */}
        <div className="flex items-center border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => onChange.view("compact")}
            className={`p-2.5 transition-colors ${filters.viewMode === "compact" ? "bg-primary/10 text-primary" : "text-foreground/40 hover:bg-surface-hover"}`}
            title="Compact view"
          >
            <List className="h-4 w-4" />
          </button>
          <button
            onClick={() => onChange.view("grid")}
            className={`p-2.5 transition-colors ${filters.viewMode === "grid" ? "bg-primary/10 text-primary" : "text-foreground/40 hover:bg-surface-hover"}`}
            title="Grid view"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2">
        <SlidersHorizontal className="h-3.5 w-3.5 text-foreground/40" />

        {/* Status filter */}
        <FilterSelect
          ariaLabel="Filter by status"
          value={filters.statusFilter}
          onChange={onChange.status}
          options={[{ value: "all", label: "All Status" }, ...options.statuses.map((s) => ({ value: s, label: s }))]}
        />

        {/* Type filter */}
        <FilterSelect
          ariaLabel="Filter by type"
          value={filters.typeFilter}
          onChange={onChange.type}
          options={[{ value: "all", label: "All Types" }, ...options.types.map((t) => ({ value: t, label: t }))]}
        />

        {/* Floor filter */}
        <FilterSelect
          ariaLabel="Filter by floor"
          value={filters.floorFilter}
          onChange={onChange.floor}
          options={[{ value: "all", label: "All Floors" }, ...options.floors.map((f) => ({ value: f, label: `Floor ${f}` }))]}
        />

        {/* Sort */}
        <div className="flex items-center gap-1.5">
          <ArrowUpDown className="h-3.5 w-3.5 text-foreground/40" />
          <FilterSelect
            ariaLabel="Sort rooms"
            value={filters.sortBy}
            onChange={onChange.sort}
            options={SORT_OPTIONS}
          />
        </div>

        {/* Clear filters */}
        {hasActiveFilters && (
          <button
            onClick={onClear}
            className="h-8 px-3 rounded-lg text-xs font-medium text-foreground/50 hover:text-foreground hover:bg-surface-hover transition-colors"
          >
            Clear filters
          </button>
        )}

        {/* Result count */}
        <span className="ml-auto text-xs text-foreground/40">
          {counts.filtered} of {counts.total} rooms
        </span>
      </div>
    </div>
  );
}
