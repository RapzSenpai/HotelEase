import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Eye, MailCheck, Send } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  TableRow} from "@/components/ui/table";
import {
  markAsRead,
  replyToMessage,
  sendMessageToGuest,
  subscribeToMessages} from "@/services/messageService";
import RequiredIndicator from "@/components/common/RequiredIndicator";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function statusBadge(status) {
  if (status === "unread") return <Badge variant="danger">Unread</Badge>;
  if (status === "replied") return <Badge variant="success">Replied</Badge>;
  if (status === "sent") return <Badge variant="success">Sent</Badge>;
  return <Badge variant="muted">Read</Badge>;
}

// Contact-page form layout, adapted: staff compose goes out by email and is
// recorded in Sent. No guest cooldown — staff may send several in a row.
function ComposeMessageForm({ onSent }) {
  const { user, profile } = useAuth();
  const [sending, setSending] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset} = useForm({
    defaultValues: { toEmail: "", toName: "", subject: "", message: "" }});

  async function onSubmit(values) {
    setSending(true);
    try {
      const sentByName =
        profile?.fullName || user?.displayName || user?.email?.split("@")[0] || "Staff";
      const result = await sendMessageToGuest({
        toEmail: values.toEmail,
        toName: values.toName,
        subject: values.subject,
        message: values.message,
        sentBy: user?.uid,
        sentByName});
      if (result?.auditUpdateFailed) {
        toast.error("Message sent, but delivery status could not be saved.");
      } else {
        toast.success(
          result?.emailSent
            ? "Message sent."
            : "Message saved. Email delivery is not available right now.",
        );
      }
      reset();
      onSent();
    } catch (e) {
      toast.error(e?.message || "Failed to send message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Send a Message</CardTitle>
        <CardDescription>Emails the guest and keeps a copy in Sent.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="outgoing-to-email">Recipient Email<RequiredIndicator /></Label>
              <Input
                id="outgoing-to-email"
                type="email"
                placeholder="guest@example.com"
                className="h-11"
                {...register("toEmail", {
                  required: "Recipient email is required.",
                  pattern: {
                    value: EMAIL_RE,
                    message: "Please enter a valid email."}})}
              />
              {errors.toEmail && <p className="text-xs text-destructive">{errors.toEmail.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="outgoing-to-name">Recipient Name</Label>
              <Input
                id="outgoing-to-name"
                placeholder="Defaults to Guest"
                className="h-11"
                {...register("toName")}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="outgoing-subject">Subject<RequiredIndicator /></Label>
            <Input
              id="outgoing-subject"
              placeholder="e.g. Your reservation details"
              className="h-11"
              maxLength={200}
              {...register("subject", { required: "Subject is required." })}
            />
            {errors.subject && <p className="text-xs text-destructive">{errors.subject.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="outgoing-message">Message<RequiredIndicator /></Label>
            <Textarea
              id="outgoing-message"
              placeholder="Write your message to the guest..."
              className="min-h-36"
              maxLength={2000}
              {...register("message", {
                required: "Message is required.",
                validate: (value) =>
                  value.trim().length >= 20 || "Message must be at least 20 characters.",
                maxLength: { value: 2000, message: "Message must be at most 2000 characters." }})}
            />
            {errors.message && <p className="text-xs text-destructive">{errors.message.message}</p>}
          </div>

          <Button type="submit" disabled={sending} className="w-full gap-2">
            <Send className="h-4 w-4" />
            {sending ? "Sending..." : "Send Message"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
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

  // One collection holds both directions: the inbox tabs must never leak an
  // outgoing message, and Sent lists only those.
  const incomingMessages = useMemo(
    () => messages.filter((m) => m.direction !== "outgoing"),
    [messages]);
  const sentMessages = useMemo(
    () => messages.filter((m) => m.direction === "outgoing"),
    [messages]);

  const unreadCount = useMemo(
    () => incomingMessages.filter((m) => m.status === "unread").length,
    [incomingMessages]);

  const isSentTab = activeFilter === "sent";

  const filteredMessages = useMemo(() => {
    if (activeFilter === "unread") return incomingMessages.filter((m) => m.status === "unread");
    if (activeFilter === "replied") return incomingMessages.filter((m) => m.status === "replied");
    if (activeFilter === "sent") return sentMessages;
    return incomingMessages;
  }, [activeFilter, incomingMessages, sentMessages]);

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

  const isOutgoingSelected = selected?.direction === "outgoing";

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
          { label: "Sent", value: "sent" },
          { label: "New Message", value: "compose" },
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

      {activeFilter === "compose" ? (
        <ComposeMessageForm onSent={() => setActiveFilter("sent")} />
      ) : (
        <Card>
          <CardContent className="pt-6">
            <Table className="[&_th]:h-9 [&_th]:px-3 [&_th]:text-xs [&_td]:px-3 [&_td]:py-2.5 [&_td]:text-[13px]">
              <TableHeader>
                <TableRow>
                  <TableHead>{isSentTab ? "To" : "Name"}</TableHead>
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
                      {isSentTab
                        ? "No sent messages yet."
                        : "No messages found for this filter."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredMessages.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>
                        {m.direction === "outgoing" ? m.toName || "Guest" : m.name}
                      </TableCell>
                      <TableCell>{m.direction === "outgoing" ? m.toEmail : m.email}</TableCell>
                      <TableCell>{m.subject}</TableCell>
                      <TableCell>{statusBadge(m.status)}</TableCell>
                      <TableCell>{formatDateTime(m.createdAt)}</TableCell>
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
      )}

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected?.subject || "Message Details"}</DialogTitle>
            <DialogDescription>
              {isOutgoingSelected
                ? `${selected?.toName || "Guest"} · ${selected?.toEmail || ""}${
                    selected?.sentByName ? ` · Sent by ${selected.sentByName}` : ""
                  }`
                : `${selected?.name} · ${selected?.email}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 rounded-md border border-border bg-muted/10 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground/50">Message</p>
            <p className="text-sm text-foreground/80 whitespace-pre-wrap">{selected?.message}</p>
          </div>

          {isOutgoingSelected ? (
            <p className="text-xs text-foreground/50">
              {selected?.emailSent
                ? "Email delivered to the guest."
                : "Email delivery failed — message saved only."}
            </p>
          ) : (
            <>
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
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
