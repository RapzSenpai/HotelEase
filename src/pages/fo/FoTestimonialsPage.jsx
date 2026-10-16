import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/format";
import { Check, Eye, Star, X, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  approveTestimonial,
  deleteTestimonial,
  listAllTestimonials,
  subscribeToAllTestimonials,
  rejectTestimonial,
} from "@/services/testimonialsService";


function statusBadge(status) {
  if (status === "Pending") return <Badge variant="warning">Pending</Badge>;
  if (status === "Approved") return <Badge variant="success">Approved</Badge>;
  if (status === "Rejected") return <Badge variant="danger">Rejected</Badge>;
  return <Badge variant="muted">{status || "Unknown"}</Badge>;
}

function RatingStars({ rating }) {
  const value = Math.round(Number(rating) || 0);
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${
            i < value ? "fill-primary text-primary" : "text-foreground/20"
          }`}
        />
      ))}
    </div>
  );
}

// Same pattern as the Room Management status legend: teaches the icon-only
// actions so the row stays narrow enough to skip horizontal scrolling.
function TestimonialActionsLegend() {
  return (
    <div
      aria-label="Testimonial actions legend"
      className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 px-1 text-[11px] text-foreground/60"
    >
      <span className="inline-flex items-center gap-1.5">
        <Check className="h-3.5 w-3.5 text-success" />
        Approve
      </span>
      <span className="inline-flex items-center gap-1.5">
        <X className="h-3.5 w-3.5 text-destructive" />
        Reject
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Eye className="h-3.5 w-3.5" />
        View
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Trash2 className="h-3.5 w-3.5 text-destructive" />
        Delete
      </span>
    </div>
  );
}

export default function FoTestimonialsPage() {
  const [testimonials, setTestimonials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("all");
  const [actingId, setActingId] = useState(null);
  const [viewing, setViewing] = useState(null);

  async function refresh() {
    setLoading(true);
    try {
      const data = await listAllTestimonials();
      setTestimonials(data);
    } catch (e) {
      toast.error(e?.message || "Failed to load testimonials.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const unsub = subscribeToAllTestimonials((data) => {
      setTestimonials(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  const pendingCount = useMemo(
    () => testimonials.filter((t) => t.status === "Pending").length,
    [testimonials],
  );

  const filtered = useMemo(() => {
    if (activeFilter === "pending") {
      return testimonials.filter((t) => t.status === "Pending");
    }
    if (activeFilter === "approved") {
      return testimonials.filter((t) => t.status === "Approved");
    }
    if (activeFilter === "rejected") {
      return testimonials.filter((t) => t.status === "Rejected");
    }
    return testimonials;
  }, [activeFilter, testimonials]);

  async function handleApprove(id) {
    setActingId(id);
    try {
      await approveTestimonial(id);
      toast.success("Testimonial approved.");
      await refresh();
    } catch (e) {
      toast.error(e?.message || "Failed to approve testimonial.");
    } finally {
      setActingId(null);
    }
  }

  async function handleReject(id) {
    setActingId(id);
    try {
      await rejectTestimonial(id);
      toast.success("Testimonial rejected.");
      await refresh();
    } catch (e) {
      toast.error(e?.message || "Failed to reject testimonial.");
    } finally {
      setActingId(null);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Are you sure you want to delete this testimonial? This cannot be undone.")) return;
    setActingId(id);
    try {
      await deleteTestimonial(id);
      toast.success("Testimonial deleted.");
      await refresh();
    } catch (e) {
      toast.error(e?.message || "Failed to delete testimonial.");
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-playfair text-3xl font-semibold">Guest Testimonials</h1>
          <p className="text-sm text-foreground/60">
            Review and moderate guest-submitted testimonials before they appear on the landing page.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {[
          { label: "All", value: "all" },
          { label: "Pending", value: "pending", count: pendingCount },
          { label: "Approved", value: "approved" },
          { label: "Rejected", value: "rejected" },
        ].map((item) => {
          const isActive = activeFilter === item.value;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => setActiveFilter(item.value)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground/60 hover:bg-surface-hover hover:text-foreground/90"
              }`}
            >
              {item.label}
              {item.count !== undefined && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-xs leading-none ${
                    isActive
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted/20 text-foreground/50"
                  }`}
                >
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <TestimonialActionsLegend />
          <Table className="[&_th]:h-9 [&_th]:px-3 [&_th]:text-xs [&_td]:px-3 [&_td]:py-2.5 [&_td]:text-[13px]">
            <TableHeader>
              <TableRow>
                <TableHead>Guest</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-foreground/60">
                    Loading testimonials...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-foreground/60">
                    No testimonials found for this filter.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.guestName || "Guest"}</TableCell>
                    <TableCell>
                      <RatingStars rating={t.rating} />
                    </TableCell>
                    <TableCell className="max-w-xs truncate" title={t.message}>
                      {t.message}
                    </TableCell>
                    <TableCell>{statusBadge(t.status)}</TableCell>
                    <TableCell>{formatDateTime(t.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setViewing(t)}
                          title={`View testimonial from ${t.guestName || "Guest"}`}
                          aria-label={`View testimonial from ${t.guestName || "Guest"}`}
                          className="text-foreground/70 hover:text-foreground"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {t.status === "Pending" && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              disabled={actingId === t.id}
                              onClick={() => handleApprove(t.id)}
                              title={`Approve testimonial from ${t.guestName || "Guest"}`}
                              aria-label={`Approve testimonial from ${t.guestName || "Guest"}`}
                              className="text-success hover:text-success hover:bg-success/10"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              disabled={actingId === t.id}
                              onClick={() => handleReject(t.id)}
                              title={`Reject testimonial from ${t.guestName || "Guest"}`}
                              aria-label={`Reject testimonial from ${t.guestName || "Guest"}`}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={actingId === t.id}
                          onClick={() => handleDelete(t.id)}
                          title={`Delete testimonial from ${t.guestName || "Guest"}`}
                          aria-label={`Delete testimonial from ${t.guestName || "Guest"}`}
                          className="text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={Boolean(viewing)} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Testimonial from {viewing?.guestName || "Guest"}</DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-2">
              {statusBadge(viewing?.status)}
              <span>{formatDateTime(viewing?.createdAt)}</span>
            </DialogDescription>
          </DialogHeader>

          <RatingStars rating={viewing?.rating} />

          <div className="space-y-2 rounded-md border border-border bg-muted/10 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground/50">Message</p>
            <p className="text-sm text-foreground/80 whitespace-pre-wrap">{viewing?.message}</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
