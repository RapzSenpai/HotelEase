import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { addGuestCrmNote, listGuests, listGuestCrmNotes } from "@/services/userService";
import { listBookingsForUser } from "@/services/bookingsService";
import { listRooms } from "@/services/roomsService";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle} from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatCurrency, formatDate } from "@/lib/format";

const STATUS_VARIANT = {
  "Pending": "default",
  "Awaiting Payment": "default",
  "Approved": "success",
  "Checked In": "success",
  "Checked Out": "outline",
  "Cancelled": "destructive",
  "Rejected": "destructive"};

// A long stay list buries the notes; the FO can expand the rest in place.
const STAY_PREVIEW = 6;

/* ─── Guest Profile dialog: contact, stay history, CRM notes ───────────────── */

function GuestProfileDialog({ guest, rooms, open, onOpenChange }) {
  const [history, setHistory] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [notes, setNotes] = useState([]);
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [notesError, setNotesError] = useState(false);
  const [noteValue, setNoteValue] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [showAllStays, setShowAllStays] = useState(false);
  // Guest whose profile is currently loaded — slow reads for an earlier
  // guest must not clobber the one now on screen.
  const guestRef = useRef(null);

  useEffect(() => {
    if (!open || !guest?.id) return;
    let cancelled = false;
    guestRef.current = guest.id;
    setHistory([]);
    setHistoryLoaded(false);
    setHistoryError(false);
    setNotes([]);
    setNotesLoaded(false);
    setNotesError(false);
    setNoteValue("");
    setShowAllStays(false);
    listBookingsForUser(guest.id)
      .then((rows) => { if (!cancelled) { setHistory(rows); setHistoryLoaded(true); } })
      .catch(() => { if (!cancelled) { setHistoryError(true); setHistoryLoaded(true); } });
    // Notes come from the staff-only crmNotes subcollection (see userService).
    // The guard cancels the read if the dialog closed or switched guests.
    listGuestCrmNotes(guest.id)
      .then((rows) => { if (!cancelled) { setNotes(rows); setNotesLoaded(true); } })
      .catch(() => { if (!cancelled) { setNotesError(true); setNotesLoaded(true); } });
    return () => { cancelled = true; };
  }, [open, guest?.id]);

  if (!guest) return null;

  const visibleHistory = showAllStays ? history : history.slice(0, STAY_PREVIEW);
  const canExpandStays = historyLoaded && !historyError && history.length > STAY_PREVIEW;

  async function handleAddNote() {
    if (!noteValue.trim()) {
      toast.error("A note is required.");
      return;
    }
    setNoteSaving(true);
    try {
      await addGuestCrmNote(guest.id, noteValue);
      toast.success("Note added to guest profile.");
      setNoteValue("");
      // Notes are their own subcollection writes now — re-list instead of
      // reloading the profile document. The refresh is isolated: the note is
      // already saved, so a lost re-list must not read as a failed add.
      try {
        const fresh = await listGuestCrmNotes(guest.id);
        if (guestRef.current === guest.id) {
          setNotes(fresh);
          setNotesLoaded(true);
          setNotesError(false);
        }
      } catch {
        if (guestRef.current === guest.id) {
          setNotesError(true);
        }
        toast.error("Note saved, but the list could not be refreshed.");
      }
    } catch (err) {
      toast.error(err?.message || "Failed to add the note.");
    } finally {
      setNoteSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Guest Profile</DialogTitle>
          <DialogDescription>{guest.fullName} · internal view</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-3">
            <div>
              <p className="text-xs text-foreground/50">Email</p>
              <p className="font-medium break-all">{guest.email || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-foreground/50">Phone</p>
              <p className="font-medium">{guest.phone || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-foreground/50">Stays on record</p>
              <p className="font-medium" title={historyError ? "Could not load stays." : undefined}>
                {historyLoaded ? (historyError ? "—" : history.length) : "…"}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-foreground/70">
                Stay History{historyLoaded && history.length > 0 ? ` (${history.length})` : ""}
              </p>
              {canExpandStays && (
                <button
                  type="button"
                  aria-expanded={showAllStays}
                  onClick={() => setShowAllStays((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-foreground/50 transition-colors hover:text-foreground/80"
                >
                  {showAllStays ? "Show less" : `Show all ${history.length} stays`}
                  <ChevronDown className={`h-3 w-3 transition-transform ${showAllStays ? "rotate-180" : ""}`} />
                </button>
              )}
            </div>
            {!historyLoaded ? (
              <p className="text-xs text-foreground/50">Loading history…</p>
            ) : historyError ? (
              <p className="text-xs text-foreground/50">
                Could not load stay history — try reopening this profile.
              </p>
            ) : history.length === 0 ? (
              <p className="text-xs text-foreground/50">No bookings on record for this guest.</p>
            ) : (
              <ul className="space-y-1.5">
                {visibleHistory.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-2">
                      <Badge variant={STATUS_VARIANT[b.status] || "default"}>{b.status}</Badge>
                      <span className="text-foreground/60">
                        {formatDate(b.checkInDate)} → {formatDate(b.checkOutDate)} ·{" "}
                        {rooms[b.roomId]?.name || "—"}
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums">{formatCurrency(b.totalCost)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-border p-3">
            <p className="mb-2 text-xs font-semibold text-foreground/70">
              Internal Notes{notes.length > 0 ? ` (${notes.length})` : ""}
            </p>
            <p className="mb-2 text-xs text-foreground/50">
              Internal only — the guest never sees these. Recorded with your account.
            </p>
            {!notesLoaded ? (
              <p className="mb-2 text-xs text-foreground/50">Loading notes…</p>
            ) : notesError ? (
              <p className="mb-2 text-xs text-foreground/50">
                Could not load internal notes — try reopening this profile.
              </p>
            ) : notes.length === 0 ? (
              <p className="mb-2 text-xs text-foreground/50">No notes yet.</p>
            ) : (
              <ul className="mb-2 space-y-1.5">
                {notes.map((n, i) => (
                  <li key={i} className="text-xs text-foreground/70">
                    <span className="font-medium text-foreground/80">{n.note}</span>
                    <span className="text-foreground/40">
                      {n.at ? ` · ${formatDate(n.at)}` : ""}{n.byEmail ? ` · ${n.byEmail}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Textarea
              rows={2}
              className="mt-2"
              value={noteValue}
              onChange={(e) => setNoteValue(e.target.value)}
              placeholder="e.g. Prefers high floor, repeat guest — reliable payer"
              aria-label="Add a CRM note" />
            <div className="mt-2 flex justify-end">
              <Button type="button" size="sm" disabled={noteSaving} onClick={handleAddNote}>
                Add note
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Main Page ─────────────────────────────────────────────────────────────── */

export default function FoGuestsPage() {
  const [guests, setGuests] = useState(null); // null = still loading
  const [guestsError, setGuestsError] = useState(false);
  const [rooms, setRooms] = useState({});
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    let live = true;
    listGuests()
      .then((rows) => { if (live) setGuests(rows); })
      .catch(() => { if (live) setGuestsError(true); });
    listRooms()
      .then((rows) => { if (live) setRooms(Object.fromEntries(rows.map((r) => [r.id, r]))); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (guests || [])
      .filter((g) => {
        const hay = `${g.fullName ?? ""} ${g.email ?? ""} ${g.phone ?? ""}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) =>
        String(a.fullName || a.email || "").localeCompare(
          String(b.fullName || b.email || ""),
          undefined,
          { sensitivity: "base" }));
  }, [guests, search]);

  const selected = selectedId ? (guests || []).find((g) => g.id === selectedId) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-playfair text-3xl font-semibold">Guests</h1>
          <p className="text-sm text-foreground/60">
            Guest directory · stay history · internal notes for the front desk
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
          <Input
            className="pl-8"
            placeholder="Search name, email, phone…"
            aria-label="Search guests"
            value={search}
            onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {guestsError ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-foreground/50">
            Could not load the guest directory — try refreshing the page.
          </CardContent>
        </Card>
      ) : guests === null ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-foreground/50">
            Loading guests…
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-foreground/50">
            {search.trim() ? "No guests match that search." : "No registered guests yet."}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <p className="mb-3 text-xs text-foreground/50">
              {filtered.length} guest{filtered.length === 1 ? "" : "s"}
              {search.trim() ? " matched" : " registered"}
            </p>
            <Table className="[&_th]:h-9 [&_th]:px-3 [&_th]:text-xs [&_td]:px-3 [&_td]:py-2.5 [&_td]:text-[13px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Guest</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Guest since</TableHead>
                  <TableHead className="text-right">Profile</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell>
                      <p className="font-medium">{g.fullName || "Unnamed guest"}</p>
                      <p className="text-xs text-foreground/50">{g.email || "—"}</p>
                    </TableCell>
                    <TableCell className="text-foreground/70">{g.phone || "—"}</TableCell>
                    <TableCell className="text-foreground/60">{formatDate(g.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setSelectedId(g.id)}>
                        View profile
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <GuestProfileDialog
        guest={selected}
        rooms={rooms}
        open={!!selected}
        onOpenChange={(v) => { if (!v) setSelectedId(null); }} />
    </div>
  );
}
