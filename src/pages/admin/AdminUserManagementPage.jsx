import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { listUsers, setUserRole, deleteUser } from "@/services/userService";
import { Mail, User, Shield, Trash2, Save, MoreVertical, Search } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select } from "radix-ui";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ROLE_OPTIONS = ["guest", "fo", "admin"];
const FILTER_TABS = [
  { id: "all", label: "All Users" },
  { id: "fo", label: "Front Office" },
  { id: "admin", label: "Admin" },
  { id: "training", label: "Training Session Users" },
];

export default function AdminUserManagementPage() {
  const { user: currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [users, setUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const isTrainingSource = activeTab === "training";

  const [roleEdits, setRoleEdits] = useState({});
  const [savingRoleFor, setSavingRoleFor] = useState(null);
  const [deletingUser, setDeletingUser] = useState(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const data = await listUsers({ trainingMode: isTrainingSource });
      setUsers(data);
      const nextEdits = {};
      for (const u of data) nextEdits[u.id] = u.role || "guest";
      setRoleEdits(nextEdits);
    } catch (e) {
      setError(e?.message || "Failed to load users.");
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [isTrainingSource]);

  const filteredUsers = useMemo(() => {
    let result = users;
    if (activeTab === "fo") result = result.filter(u => u.role === "fo");
    if (activeTab === "admin") result = result.filter(u => u.role === "admin");
    
    return result
      .filter((u) => {
        const search = searchQuery.toLowerCase();
        return (
          u.fullName?.toLowerCase().includes(search) ||
          u.email?.toLowerCase().includes(search) ||
          u.id.toLowerCase().includes(search)
        );
      })
      .sort((a, b) =>
        String(a.email || "").localeCompare(String(b.email || ""))
      );
  }, [users, searchQuery, activeTab]);

  async function onSaveRole(uid) {
    const nextRole = roleEdits[uid];
    if (nextRole === users.find((u) => u.id === uid)?.role) {
      toast.info("No changes made to role");
      return;
    }

    setSavingRoleFor(uid);
    try {
      await setUserRole(uid, nextRole, { trainingMode: isTrainingSource });
      toast.success("User role updated successfully");
      await refresh();
    } catch (e) {
      toast.error(e?.message || "Failed to update role");
    } finally {
      setSavingRoleFor(null);
    }
  }

  async function confirmDelete() {
    if (!deletingUser) return;
    
    const uid = deletingUser.id;
    try {
      await deleteUser(uid, { trainingMode: isTrainingSource });
      toast.success("User deleted successfully");
      setUsers((prev) => prev.filter((u) => u.id !== uid));
      setIsDeleteDialogOpen(false);
      setDeletingUser(null);
    } catch (e) {
      toast.error(e?.message || "Failed to delete user");
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-playfair text-4xl font-bold tracking-tight">
            User Management
          </h1>
          <p className="text-muted-foreground text-lg">
            Manage system access and roles for all registered users.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-gold transition-colors" />
            <input
              type="text"
              placeholder="Search users..."
              className="pl-10 pr-4 py-2 bg-background border border-border rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-gold/50 w-full md:w-64 transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="bg-gold/10 text-gold border border-gold/20 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap">
            {users.length} Users
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {FILTER_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground/60 hover:bg-surface-hover hover:text-foreground/90"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {error ? (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive flex items-center gap-3">
          <Shield className="w-5 h-5" />
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-48 rounded-2xl border border-border bg-background animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 rounded-2xl border-2 border-dashed border-border text-center space-y-3">
              <User className="w-12 h-12 text-muted-foreground opacity-20" />
              <p className="text-muted-foreground">No users found matching your criteria.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-x-auto shadow-sm">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead>User Name & Email</TableHead>
                    <TableHead>System Role</TableHead>
                    <TableHead className="text-center">Cancellations</TableHead>
                    <TableHead>User ID</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((u) => {
                    const currentRole = u.role || "guest";
                    const editedRole = roleEdits[u.id] || currentRole;
                    const hasChanged = editedRole !== currentRole;
                    const isSelf = u.id === currentUser?.uid;

                    return (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-semibold text-foreground">
                              {u.fullName || "Unnamed User"} {isSelf && <span className="text-xs text-gold font-normal ml-1.5">(You)</span>}
                            </span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                              <Mail className="w-3 h-3" />
                              {u.email || "No email"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Select.Root
                            value={editedRole}
                            onValueChange={(value) =>
                              setRoleEdits((p) => ({
                                ...p,
                                [u.id]: value,
                              }))
                            }
                          >
                            <Select.Trigger
                              disabled={isSelf}
                              className="flex h-8 w-32 items-center justify-between rounded-md border border-border bg-background px-3 py-1 text-xs text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-gold/30 disabled:opacity-50"
                            >
                              <Select.Value />
                            </Select.Trigger>
                            <Select.Portal>
                              <Select.Content className="z-50 max-h-64 min-w-[8rem] overflow-hidden rounded-md border border-border bg-background p-1 text-foreground shadow-md">
                                <Select.Viewport>
                                  {ROLE_OPTIONS.map((opt) => (
                                    <Select.Item
                                      key={opt}
                                      value={opt}
                                      className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-muted data-[highlighted]:text-foreground"
                                    >
                                      <Select.ItemText>
                                        {opt.toUpperCase()}
                                      </Select.ItemText>
                                    </Select.Item>
                                  ))}
                                </Select.Viewport>
                              </Select.Content>
                            </Select.Portal>
                          </Select.Root>
                        </TableCell>
                        <TableCell className="text-center">
                          {u.cancellationCount ? (
                            <Badge variant="destructive" className="font-mono text-[10px]">
                              {u.cancellationCount}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-[10px] text-muted-foreground/70">{u.id}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => onSaveRole(u.id)}
                              disabled={savingRoleFor === u.id || !hasChanged || isSelf}
                              className="h-8 text-xs shadow-sm"
                            >
                              {savingRoleFor === u.id ? "Saving..." : "Save"}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive disabled:opacity-30 disabled:hover:bg-transparent"
                              onClick={() => {
                                setDeletingUser(u);
                                setIsDeleteDialogOpen(true);
                              }}
                              disabled={isSelf}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" /> Confirm Deletion
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deletingUser?.fullName || deletingUser?.email}</strong>? 
              This action cannot be undone and will remove all associated profile data from the system.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
