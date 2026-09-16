import { Input } from "@/components/ui/input";
import {
  Search,
  X,
  List,
  LayoutGrid,
  SlidersHorizontal,
  ArrowUpDown,
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
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted"
            >
              <X className="h-3.5 w-3.5 text-foreground/40" />
            </button>
          )}
        </div>

        {/* View toggle */}
        <div className="flex items-center border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => onChange.view("compact")}
            className={`p-2.5 transition-colors ${filters.viewMode === "compact" ? "bg-primary/10 text-primary" : "text-foreground/40 hover:bg-muted"}`}
            title="Compact view"
          >
            <List className="h-4 w-4" />
          </button>
          <button
            onClick={() => onChange.view("grid")}
            className={`p-2.5 transition-colors ${filters.viewMode === "grid" ? "bg-primary/10 text-primary" : "text-foreground/40 hover:bg-muted"}`}
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
        <select
          value={filters.statusFilter}
          onChange={(e) => onChange.status(e.target.value)}
          className="h-9 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring/50"
        >
          <option value="all">All Status</option>
          {options.statuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {/* Type filter */}
        <select
          value={filters.typeFilter}
          onChange={(e) => onChange.type(e.target.value)}
          className="h-9 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring/50"
        >
          <option value="all">All Types</option>
          {options.types.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        {/* Floor filter */}
        <select
          value={filters.floorFilter}
          onChange={(e) => onChange.floor(e.target.value)}
          className="h-9 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring/50"
        >
          <option value="all">All Floors</option>
          {options.floors.map((f) => (
            <option key={f} value={f}>Floor {f}</option>
          ))}
        </select>

        {/* Sort */}
        <div className="flex items-center gap-1.5">
          <ArrowUpDown className="h-3.5 w-3.5 text-foreground/40" />
          <select
            value={filters.sortBy}
            onChange={(e) => onChange.sort(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring/50"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Clear filters */}
        {hasActiveFilters && (
          <button
            onClick={onClear}
            className="h-8 px-3 rounded-lg text-xs font-medium text-foreground/50 hover:text-foreground hover:bg-muted transition-colors"
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
