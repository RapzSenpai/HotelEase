import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Edit, Trash2, X, Plus, Calendar } from "lucide-react";
import {
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
} from "@/services/announcementsService";
import { uploadImageToCloudinary } from "@/services/cloudinaryService";
import RoomStatusBadge from "@/components/rooms/RoomStatusBadge";

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
      setError(err?.message || "Upload failed");
    } finally {
      setTimeout(() => setUploadProgress(null), 2000);
    }
  }

  return (
    <div className="space-y-3">
      {imageUrl && (
        <div className="relative group w-full aspect-video rounded-xl overflow-hidden border border-border bg-muted/10">
          <img
            src={imageUrl}
            alt="Preview"
            className="h-full w-full object-cover"
          />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-destructive/90 text-white shadow-lg hover:bg-destructive transition-colors backdrop-blur-sm"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {uploadProgress !== null && (
        <div className="space-y-1.5 p-3 rounded-lg border border-border bg-background/50">
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="text-foreground/70">Uploading image...</span>
            <span className="text-primary tabular-nums">{uploadProgress}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="text-xs font-medium text-destructive bg-destructive/5 p-2 rounded-lg border border-destructive/20">
          {error}
        </div>
      )}

      {!imageUrl && uploadProgress === null && (
        <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/5 p-8 text-center transition-all hover:border-primary/50 hover:bg-surface-hover cursor-pointer group">
          <div className="p-3 rounded-full bg-background border border-border shadow-sm group-hover:bg-surface-hover transition-colors">
            <Upload className="h-6 w-6 text-foreground/40" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold">Click to upload header image</p>
            <p className="text-xs text-foreground/50">PNG, JPG or JPEG (Max 5MB)</p>
          </div>
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
      setError(e?.message || "Failed to load announcements.");
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
      setError(e?.message || "Failed to save announcement.");
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
    <div className="space-y-8 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="font-playfair text-4xl font-semibold tracking-tight">Announcements</h1>
          <p className="text-foreground/60 max-w-lg">
            Manage events and updates displayed on the guest landing page.
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm font-medium text-destructive">
          {error}
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-12">
        {/* Editor Column */}
        <div className="lg:col-span-5">
          <div className="sticky top-24">
            <form
              onSubmit={onSubmit}
              className="rounded-2xl border border-border bg-background p-6 shadow-sm space-y-5"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`p-2 rounded-lg ${editingId ? "bg-primary/10" : "bg-primary/10"}`}>
                  <Plus className={`h-5 w-5 ${editingId ? "text-primary" : "text-primary"}`} />
                </div>
                <h2 className="text-lg font-bold">{editingId ? "Edit Announcement" : "Create New Announcement"}</h2>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title" className="text-xs font-bold uppercase tracking-wider text-foreground/50">Title</Label>
                  <Input
                    id="title"
                    placeholder="E.g. Summer Beach Party 2026"
                    value={form.title}
                    onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))}
                    required
                    className="h-11 rounded-lg"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="date" className="text-xs font-bold uppercase tracking-wider text-foreground/50">Event Date</Label>
                  <div className="relative group">
                    <Input
                      id="date"
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm(p => ({ ...p, date: e.target.value }))}
                      required
                      className="h-11 rounded-lg pr-10 border-border [&::-webkit-calendar-picker-indicator]:hidden"
                      onClick={(e) => e.currentTarget.showPicker?.()}
                      onFocus={(e) => e.target.blur()}
                    />
                    <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40 pointer-events-none" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description" className="text-xs font-bold uppercase tracking-wider text-foreground/50">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Tell guests what's happening..."
                    value={form.description}
                    onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
                    required
                    className="min-h-[140px] rounded-lg resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-foreground/50">Cover Photo</Label>
                  <AnnouncementPhotoUploader
                    imageUrl={form.imageUrl}
                    onChange={url => setForm(p => ({ ...p, imageUrl: url }))}
                  />
                </div>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <Button type="submit" disabled={submitting} size="lg" className="w-full">
                  {submitting ? "Saving..." : editingId ? "Save Changes" : "Publish Announcement"}
                </Button>
                {editingId && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    className="w-full bg-muted/10 text-foreground hover:bg-surface-hover border-transparent"
                    onClick={resetForm}
                  >
                    Cancel Editing
                  </Button>
                )}
              </div>
            </form>
          </div>
        </div>

        {/* List Column */}
        <div className="lg:col-span-7 space-y-6">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-sm font-bold uppercase tracking-widest text-foreground/40">Active Announcements</h3>
            <span className="text-xs text-foreground/40 font-medium">Showing {announcements.length} posts</span>
          </div>

          {loading ? (
            <div className="grid gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-48 rounded-2xl bg-muted/20 animate-pulse border border-border" />
              ))}
            </div>
          ) : announcements.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center bg-muted/5">
              <p className="text-sm text-foreground/50">No published announcements found.</p>
            </div>
          ) : (
            <div className="grid gap-5">
              {announcements.map((a) => (
                <div
                  key={a.id}
                  className="group rounded-2xl border border-border bg-background overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200"
                >
                  <div className="flex flex-col md:flex-row h-full">
                    <div className="md:w-1/3 aspect-video md:aspect-auto">
                      {a.imageUrl ? (
                        <img
                          src={a.imageUrl}
                          alt={a.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full bg-muted/20 flex items-center justify-center text-foreground/20 italic text-xs">
                          No Image
                        </div>
                      )}
                    </div>

                    <div className="flex-1 p-5 sm:p-6 flex flex-col justify-between">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-4">
                          <RoomStatusBadge status={a.status || "Published"} />
                          <span className="text-[10px] font-bold uppercase tracking-tighter text-foreground/40 bg-muted/20 px-2 py-0.5 rounded-md">
                            {formatDate(a.date)}
                          </span>
                        </div>

                        <div className="space-y-1">
                          <h4 className="text-lg font-bold leading-tight line-clamp-1">{a.title}</h4>
                          <p className="text-sm text-foreground/60 line-clamp-2 leading-relaxed">
                            {a.description}
                          </p>
                        </div>
                      </div>

                      <div className="mt-6 flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 px-4 rounded-lg bg-background hover:bg-surface-hover font-medium"
                          onClick={() => startEdit(a)}
                        >
                          <Edit className="h-3.5 w-3.5 mr-2" />
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-9 w-9 p-0 rounded-lg shadow-sm"
                          onClick={() => onDelete(a.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
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
