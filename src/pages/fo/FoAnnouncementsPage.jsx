import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import RequiredIndicator from "@/components/common/RequiredIndicator";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Edit, Trash2, X, Plus, Calendar } from "lucide-react";
import {
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
} from "@/services/announcementsService";
import { uploadImageToCloudinary } from "@/services/cloudinaryService";
import { mapFirebaseError } from "@/lib/errors";

function formatDate(dateLike) {
  try {
    const d = dateLike?.toDate ? dateLike.toDate() : dateLike;
    if (!d) return "—";
    const dateObj = new Date(d);
    if (isNaN(dateObj)) return "—";
    return dateObj.toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}

function AnnouncementPhotoUploader({ imageUrl, onChange }) {
  const [uploadProgress, setUploadProgress] = useState(null);
  const [error, setError] = useState(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setError(null);
    setUploadProgress(0);

    try {
      const { url } = await uploadImageToCloudinary(file, {
        folder: "announcements",
        onProgress: (pct) => setUploadProgress(pct),
      });
      onChange(url);
    } catch (err) {
      setError(mapFirebaseError(err) || "Upload failed");
    } finally {
      setTimeout(() => setUploadProgress(null), 2000);
    }
  }

  return (
    <div className="space-y-2">
      {imageUrl && (
        <div className="relative group w-full h-24 rounded-lg overflow-hidden border border-border bg-muted/10">
          <img
            src={imageUrl}
            alt="Preview"
            className="h-full w-full object-cover"
          />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-destructive/90 text-white shadow-sm hover:bg-destructive transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {uploadProgress !== null && (
        <div className="space-y-1 p-2 rounded-lg border border-border bg-background/50">
          <div className="flex items-center justify-between text-xs">
            <span className="text-foreground/70">Uploading...</span>
            <span className="text-primary tabular-nums">{uploadProgress}%</span>
          </div>
          <div className="h-1 w-full rounded-full bg-border overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="text-xs text-destructive bg-destructive/5 p-1.5 rounded border border-destructive/20">
          {error}
        </div>
      )}

      {!imageUrl && uploadProgress === null && (
        <label className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/5 py-3 text-center transition-all hover:border-primary/50 hover:bg-surface-hover cursor-pointer group">
          <Upload className="h-4 w-4 text-foreground/40 group-hover:text-primary/60 transition-colors" />
          <span className="text-xs font-medium text-foreground/60">Upload cover image</span>
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={handleFile}
          />
        </label>
      )}
    </div>
  );
}

export default function FoAnnouncementsPage() {
  const [form, setForm] = useState({
    title: "",
    description: "",
    date: "",
    imageUrl: null,
  });

  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [announcements, setAnnouncements] = useState([]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const data = await listAnnouncements({ limitCount: 20 });
      setAnnouncements(data);
    } catch (e) {
      setError(mapFirebaseError(e) || "Failed to load announcements.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (editingId) {
        await updateAnnouncement(editingId, form);
      } else {
        await createAnnouncement(form);
      }
      resetForm();
      await refresh();
    } catch (e) {
      setError(mapFirebaseError(e) || "Failed to save announcement.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete(id) {
    if (!window.confirm("Are you sure you want to delete this announcement?")) return;
    try {
      await deleteAnnouncement(id);
      await refresh();
    } catch (e) {
      setError("Failed to delete announcement.");
    }
  }

  function startEdit(item) {
    setEditingId(item.id);
    setForm({
      title: item.title || "",
      description: item.description || "",
      date: formatDate(item.date),
      imageUrl: item.imageUrl || null,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setForm({ title: "", description: "", date: "", imageUrl: null });
    setEditingId(null);
    setError(null);
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-playfair text-2xl font-semibold tracking-tight">Announcements</h1>
          <p className="text-sm text-foreground/50">
            Manage events displayed on the landing page.
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm font-medium text-destructive">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Editor Column */}
        <div className="lg:col-span-4">
          <div className="sticky top-24">
            <form
              onSubmit={onSubmit}
              className="rounded-xl border border-border bg-background p-4 shadow-sm space-y-4"
            >
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-primary/10">
                  <Plus className="h-4 w-4 text-primary" />
                </div>
                <h2 className="text-sm font-semibold">{editingId ? "Edit Announcement" : "New Announcement"}</h2>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="title" className="text-xs font-medium text-foreground/60">Title<RequiredIndicator /></Label>
                  <Input
                    id="title"
                    placeholder="e.g. Summer Beach Party 2026"
                    value={form.title}
                    onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))}
                    required
                    className="h-9 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="date" className="text-xs font-medium text-foreground/60">Event Date<RequiredIndicator /></Label>
                  <div className="relative">
                    <Input
                      id="date"
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm(p => ({ ...p, date: e.target.value }))}
                      required
                      className="h-9 text-sm pr-9 border-border [&::-webkit-calendar-picker-indicator]:hidden"
                      onClick={(e) => e.currentTarget.showPicker?.()}
                      onFocus={(e) => e.target.blur()}
                    />
                    <Calendar className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-foreground/40 pointer-events-none" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="description" className="text-xs font-medium text-foreground/60">Description<RequiredIndicator /></Label>
                  <Textarea
                    id="description"
                    placeholder="Tell guests what's happening..."
                    value={form.description}
                    onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
                    required
                    className="min-h-[80px] text-sm rounded-lg resize-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-foreground/60">Cover Photo</Label>
                  <AnnouncementPhotoUploader
                    imageUrl={form.imageUrl}
                    onChange={url => setForm(p => ({ ...p, imageUrl: url }))}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5 pt-1">
                <Button type="submit" disabled={submitting} size="default" className="w-full">
                  {submitting ? "Saving..." : editingId ? "Save Changes" : "Publish"}
                </Button>
                {editingId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs"
                    onClick={resetForm}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </div>
        </div>

        {/* List Column */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground/40">Published</h3>
            <span className="text-xs text-foreground/40">{announcements.length}</span>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 rounded-lg bg-muted/20 animate-pulse border border-border" />
              ))}
            </div>
          ) : announcements.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center bg-muted/5">
              <p className="text-sm text-foreground/50">No announcements yet.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {announcements.map((a) => (
                <div
                  key={a.id}
                  className="group flex items-center gap-3 rounded-lg border border-border/60 bg-background p-2.5 hover:bg-muted/30 transition-colors"
                >
                  <div className="h-12 w-16 shrink-0 rounded-md overflow-hidden bg-muted/20">
                    {a.imageUrl ? (
                      <img
                        src={a.imageUrl}
                        alt={a.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-foreground/20">
                        <Calendar className="h-4 w-4" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium truncate">{a.title}</h4>
                      <span className="text-[10px] text-foreground/40 shrink-0">{formatDate(a.date)}</span>
                    </div>
                    <p className="text-xs text-foreground/50 truncate mt-0.5">{a.description}</p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => startEdit(a)}
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => onDelete(a.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
