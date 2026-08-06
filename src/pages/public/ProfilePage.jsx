import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { NavLink } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import {
  User,
  Pencil,
  Mail,
  Phone as PhoneIcon,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Upload,
  ImagePlus,
  Wallet,
  CalendarCheck,
} from "lucide-react";
import { toast } from "sonner";
import { optimizeCloudinaryUrl } from "@/lib/cloudinaryTransform";
import { uploadImageToCloudinary } from "@/services/cloudinaryService";
import { updateUserProfile } from "@/services/userService";
import { listBookingsForUser } from "@/services/bookingsService";

function getInitials(name) {
  return (
    (name || "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join("") || "G"
  );
}

export default function ProfilePage() {
  const { user, role, profile, trainingMode, forgotPassword } = useAuth();

  // Local copy so edits reflect immediately without a full reload.
  const [localProfile, setLocalProfile] = useState({});
  useEffect(() => {
    if (profile) setLocalProfile(profile);
  }, [profile]);

  const [savingName, setSavingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [editingName, setEditingName] = useState(false);

  const [phoneDraft, setPhoneDraft] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  const [editingPhone, setEditingPhone] = useState(false);

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef(null);

  const [sendingReset, setSendingReset] = useState(false);

  const [summary, setSummary] = useState({ count: 0, completed: 0, spent: 0 });
  const [summaryLoading, setSummaryLoading] = useState(true);

  const loadSummary = useCallback(async () => {
    if (!user?.uid) return;
    setSummaryLoading(true);
    try {
      const bookings = await listBookingsForUser(user.uid, { trainingMode });
      const completed = bookings.filter((b) => b.status === "Checked Out").length;
      const spent = bookings
        .filter((b) => b.status !== "Cancelled")
        .reduce((sum, b) => sum + (Number(b.totalCost) || 0), 0);
      setSummary({ count: bookings.length, completed, spent });
    } catch {
      setSummary({ count: 0, completed: 0, spent: 0 });
    } finally {
      setSummaryLoading(false);
    }
  }, [user?.uid, trainingMode]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  if (!user) {
    return (
      <div className="space-y-6">
        <h1 className="font-playfair text-3xl font-semibold">Profile</h1>
        <Card className="p-8 text-center space-y-4">
          <p className="text-foreground/60 text-sm">You are not logged in.</p>
          <Button asChild variant="default" size="sm">
            <NavLink to="/login">Sign In</NavLink>
          </Button>
        </Card>
      </div>
    );
  }

  const displayName = localProfile.fullName || user.displayName || user.email?.split("@")[0] || "Guest";
  const avatarUrl = localProfile.photoUrl || "";

  function startEditName() {
    setNameDraft(displayName);
    setEditingName(true);
  }

  async function handleSaveName() {
    const next = nameDraft.trim();
    if (!next || next === displayName) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      await updateUserProfile(user.uid, { fullName: next }, { trainingMode });
      setLocalProfile((p) => ({ ...p, fullName: next }));
      setEditingName(false);
      toast.success("Display name updated.");
    } catch (e) {
      toast.error(e?.message || "Failed to update name.");
    } finally {
      setSavingName(false);
    }
  }

  function startEditPhone() {
    setPhoneDraft(localProfile.phone || "");
    setEditingPhone(true);
  }

  async function handleSavePhone() {
    const next = phoneDraft.trim();
    if (!next || next === (localProfile.phone || "")) {
      setEditingPhone(false);
      return;
    }
    setSavingPhone(true);
    try {
      await updateUserProfile(user.uid, { phone: next }, { trainingMode });
      setLocalProfile((p) => ({ ...p, phone: next }));
      setEditingPhone(false);
      toast.success("Phone number updated.");
    } catch (e) {
      toast.error(e?.message || "Failed to update phone.");
    } finally {
      setSavingPhone(false);
    }
  }

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const { url } = await uploadImageToCloudinary(file, { compressionPreset: "avatar" });
      await updateUserProfile(user.uid, { photoUrl: url }, { trainingMode });
      setLocalProfile((p) => ({ ...p, photoUrl: url }));
      toast.success("Profile picture updated.");
    } catch (err) {
      toast.error(err?.message || "Failed to upload profile picture.");
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleResetPassword() {
    setSendingReset(true);
    try {
      await forgotPassword({ email: user.email });
      toast.success("Password reset email sent.");
    } catch (e) {
      toast.error(e?.message || "Failed to send reset email.");
    } finally {
      setSendingReset(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-playfair text-3xl font-semibold">My Profile</h1>
        <p className="text-foreground/60 text-sm">
          Your account information and preferences.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-12 items-start">
      {/* LEFT — Avatar */}
      <div className="md:col-span-4 lg:col-span-3">
        <Card className="flex flex-col items-center p-6 text-center">
          <div className="relative">
            <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-2 border-primary/40 bg-primary/10">
              {avatarUrl ? (
                <img
                  src={optimizeCloudinaryUrl(avatarUrl, { width: 200 })}
                  alt={displayName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="font-playfair text-4xl font-semibold text-primary">
                  {getInitials(displayName)}
                </span>
              )}
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <button
                  type="button"
                  aria-label="Change profile picture"
                  className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md ring-2 ring-background transition-transform hover:scale-105 active:scale-95"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Profile Picture</DialogTitle>
                  <DialogDescription>
                    Upload a photo to be shown as your profile picture.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col items-center gap-4">
                  <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-primary/30 bg-primary/10">
                    {avatarUrl ? (
                      <img src={optimizeCloudinaryUrl(avatarUrl, { width: 200 })} alt={displayName} className="h-full w-full object-cover" />
                    ) : (
                      <span className="font-playfair text-3xl font-semibold text-primary">{getInitials(displayName)}</span>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    disabled={uploadingAvatar}
                    className="w-full text-sm text-foreground/70 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
                  />
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Done</Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <h2 className="mt-4 font-playfair text-2xl font-semibold">{displayName}</h2>
          <Badge variant={role === "admin" ? "success" : role === "fo" ? "info" : "primary"} className="mt-2 capitalize">
            {role || "guest"}
          </Badge>

          <div className="mt-4 w-full space-y-1.5 text-xs text-foreground/50">
            <p className="flex items-center justify-center gap-1.5">
              <CalendarCheck className="h-3.5 w-3.5 text-primary" />
              {summaryLoading ? "…" : `${summary.completed} completed stay${summary.completed !== 1 ? "s" : ""}`}
            </p>
            <p className="flex items-center justify-center gap-1.5">
              <Wallet className="h-3.5 w-3.5 text-primary" />
              {summaryLoading ? "…" : `PHP ${summary.spent.toLocaleString()} total spent`}
            </p>
          </div>

          <div className="mt-5 w-full space-y-2">
            <Button asChild variant="outline" size="sm" className="w-full">
              <NavLink to="/my-bookings">My Bookings</NavLink>
            </Button>
            <Button asChild variant="outline" size="sm" className="w-full">
              <NavLink to="/rooms">Browse Rooms</NavLink>
            </Button>
          </div>
        </Card>
      </div>

      {/* RIGHT — Info */}
      <div className="md:col-span-8 lg:col-span-9 space-y-6">
        {/* Personal Info */}
        <Card>
          <CardHeader>
            <CardTitle>Personal Info</CardTitle>
            <CardDescription>Your basic account details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5 first:border-0 first:pt-0">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <User className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-foreground/45">Display Name</p>
                  {editingName ? (
                    <div className="mt-1 flex items-center gap-2">
                      <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} className="h-9 w-56" autoFocus />
                      <Button size="sm" onClick={handleSaveName} disabled={savingName}>
                        {savingName ? "Saving…" : "Save"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingName(false)}>Cancel</Button>
                    </div>
                  ) : (
                    <p className="mt-0.5 text-sm text-foreground">{displayName}</p>
                  )}
                </div>
              </div>
              {!editingName && (
                <Button size="icon-sm" variant="ghost" aria-label="Edit display name" onClick={startEditName}>
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Email */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Mail className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-foreground/45">Linked Email Address</p>
                  <p className="mt-0.5 text-sm text-foreground">{user.email || "—"}</p>
                </div>
              </div>
              {user.emailVerified ? (
                <Badge variant="success">
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Verified
                </Badge>
              ) : (
                <Badge variant="muted">
                  <AlertCircle className="mr-1 h-3.5 w-3.5" /> Unverified
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Phone */}
        <Card>
          <CardHeader>
            <CardTitle>Phone Number</CardTitle>
            <CardDescription>Used for booking and stay communications.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <PhoneIcon className="h-4 w-4" />
                </span>
                {editingPhone ? (
                  <div className="flex items-center gap-2">
                    <Input value={phoneDraft} onChange={(e) => setPhoneDraft(e.target.value)} placeholder="e.g. 0912 345 6789" className="h-9 w-56" autoFocus />
                    <Button size="sm" onClick={handleSavePhone} disabled={savingPhone}>
                      {savingPhone ? "Saving…" : "Save"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingPhone(false)}>Cancel</Button>
                  </div>
                ) : localProfile.phone ? (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-foreground/45">Phone Number</p>
                    <p className="mt-0.5 text-sm text-foreground">{localProfile.phone}</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-foreground/45">Phone Number</p>
                    <p className="mt-0.5 text-sm text-foreground/50">No phone number linked yet.</p>
                  </div>
                )}
              </div>
              <Button variant={localProfile.phone ? "ghost" : "secondary"} size="sm" onClick={startEditPhone}>
                {localProfile.phone ? <><Pencil className="h-4 w-4" /> Edit</> : <><PhoneIcon className="h-4 w-4" /> Link phone number</>}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Password */}
        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>Keep your account secure.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <KeyRound className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-foreground/45">Password</p>
                <p className="mt-0.5 text-sm text-foreground/70">••••••••••</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleResetPassword} disabled={sendingReset}>
              {sendingReset ? "Sending…" : "Reset password"}
            </Button>
          </CardContent>
        </Card>

        {/* Booking Summary */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Booking Summary</CardTitle>
              <CardDescription>Your activity at HotelEase.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <NavLink to="/my-bookings">View all</NavLink>
            </Button>
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <p className="text-sm text-foreground/50">Loading your booking summary…</p>
            ) : summary.count === 0 ? (
              <p className="text-sm text-foreground/50">No bookings yet. Browse rooms to get started.</p>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg bg-muted/10 p-4 text-center">
                  <p className="text-2xl font-bold tabular-nums">{summary.count}</p>
                  <p className="mt-1 text-xs text-foreground/50">Total bookings</p>
                </div>
                <div className="rounded-lg bg-muted/10 p-4 text-center">
                  <p className="text-2xl font-bold tabular-nums">{summary.completed}</p>
                  <p className="mt-1 text-xs text-foreground/50">Completed</p>
                </div>
                <div className="rounded-lg bg-muted/10 p-4 text-center">
                  <p className="text-2xl font-bold tabular-nums">{summary.spent.toLocaleString()}</p>
                  <p className="mt-1 text-xs text-foreground/50">Total spent (PHP)</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  );
}