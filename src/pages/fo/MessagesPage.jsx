import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Eye, MailCheck, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  markAsRead,
  replyToMessage,
  subscribeToMessages,
} from "@/services/messageService";
import { useEffect } from "react";

function formatDate(dateLike) {
  const d = dateLike?.toDate ? dateLike.toDate() : new Date(dateLike);
  if (!d || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function statusBadge(status) {
  if (status === "unread") return <Badge variant="danger">Unread</Badge>;
  if (status === "replied") return <Badge variant="success">Replied</Badge>;
  return <Badge variant="muted">Read</Badge>;
}

export default function MessagesPage() {
  const [messages, setMessages] = useState([]);
  const [activeFilter, setActiveFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const unsub = subscribeToMessages((data) => setMessages(data));
    return () => unsub();
  }, []);

  const unreadCount = useMemo(
    () => messages.filter((m) => m.status === "unread").length,
    [messages],
  );

  const filteredMessages = useMemo(() => {
    if (activeFilter === "unread") return messages.filter((m) => m.status === "unread");
    if (activeFilter === "replied") return messages.filter((m) => m.status === "replied");
    return messages;
  }, [activeFilter, messages]);

  async function handleMarkRead(id) {
    try {
      await markAsRead(id);
      toast.success("Message marked as read.");
    } catch (e) {
      toast.error(e?.message || "Failed to mark as read.");
    }
  }

  async function handleSendReply() {
    if (!selected?.id) return;
    if (replyText.trim().length < 5) {
      toast.error("Reply message is too short.");
      return;
    }
    setSending(true);
    try {
      const result = await replyToMessage(selected.id, replyText.trim());
      if (result?.emailSent) {
        toast.success("Reply sent successfully.");
      } else {
        toast.success("Reply saved. Email delivery is not available right now.");
      }
      setReplyText("");
      setSelected(null);
    } catch (e) {
      toast.error(e?.message || "Failed to send reply.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-playfair text-3xl font-semibold">Guest Messages</h1>
          <p className="text-sm text-foreground/60">Review, respond, and track guest support inquiries.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {[
          { label: "All", value: "all" },
          { label: "Unread", value: "unread", count: unreadCount },
          { label: "Replied", value: "replied" },
        ].map((item) => {
          const isActive = activeFilter === item.value;
          return (
            <button
              key={item.value}
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
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMessages.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-foreground/60">
                    No messages found for this filter.
                  </TableCell>
                </TableRow>
              ) : (
                filteredMessages.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.name}</TableCell>
                    <TableCell>{m.email}</TableCell>
                    <TableCell>{m.subject}</TableCell>
                    <TableCell>{statusBadge(m.status)}</TableCell>
                    <TableCell>{formatDate(m.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelected(m);
                            setReplyText(m.replyMessage || "");
                          }}
                        >
                          <Eye className="mr-1 h-3.5 w-3.5" />
                          View
                        </Button>
                        {m.status === "unread" && (
                          <Button variant="ghost" size="sm" onClick={() => handleMarkRead(m.id)}>
                            <MailCheck className="mr-1 h-3.5 w-3.5" />
                            Mark as Read
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected?.subject || "Message Details"}</DialogTitle>
            <DialogDescription>
              {selected?.name} · {selected?.email}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 rounded-md border border-border bg-muted/10 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground/50">Message</p>
            <p className="text-sm text-foreground/80 whitespace-pre-wrap">{selected?.message}</p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground/50">Reply</p>
            <Textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Type your response to the guest..."
              className="min-h-28"
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSendReply} disabled={sending}>
              <Send className="mr-1.5 h-4 w-4" />
              {sending ? "Sending..." : "Send Reply"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
