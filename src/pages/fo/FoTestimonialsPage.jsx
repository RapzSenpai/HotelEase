import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Star, X, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

function formatDate(dateLike) {
  const d = dateLike?.toDate ? dateLike.toDate() : new Date(dateLike);
  if (!d || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

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

export default function FoTestimonialsPage() {
  const [testimonials, setTestimonials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("all");
  const [actingId, setActingId] = useState(null);

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
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Guest</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Actions</TableHead>
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
                    <TableCell>{formatDate(t.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {t.status === "Pending" && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={actingId === t.id}
                              onClick={() => handleApprove(t.id)}
                              className="border-success/40 bg-success/10 text-foreground hover:bg-success/20"
                            >
                              <Check className="mr-1 h-3.5 w-3.5" />
                              Approve
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={actingId === t.id}
                              onClick={() => handleReject(t.id)}
                              className="border-destructive/40 bg-destructive/10 text-foreground hover:bg-destructive/20"
                            >
                              <X className="mr-1 h-3.5 w-3.5" />
                              Reject
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={actingId === t.id}
                          onClick={() => handleDelete(t.id)}
                          className="text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                          title="Delete testimonial"
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
    </div>
  );
}
