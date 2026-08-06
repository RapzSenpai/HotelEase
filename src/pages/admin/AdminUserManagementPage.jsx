import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { setUserRole, deleteUser, subscribeToUsers } from "@/services/userService";
import { forceLogoutUser } from "@/services/sessionService";
import { isOnlineNow } from "@/services/presenceService";
import { auditAction, AUDIT_ACTIONS } from "@/services/auditService";
import { Mail, User, Shield, Trash2, Save, MoreVertical, Search, LogOut, Monitor, Clock, Circle } from "lucide-react";
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

function toDate(value) {
  if (!value) return null;
  return typeof value?.toDate === "function" ? value.toDate() : new Date(value);
}

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

  function applyUserData(data) {
    setUsers(data);
    setRoleEdits((prev) => {
      const next = { ...prev };
      for (const u of data) {
        if (next[u.id] === undefined) next[u.id] = u.role || "guest";
      }
      return next;
    });
  }

  useEffect(() => {
    setLoading(true);
    setError(null);

    const unsub = subscribeToUsers({
      trainingMode: isTrainingSource,
      onData: (data) => {
        applyUserData(data);
        setLoading(false);
      },
      onError: (e) => {
        setError(e?.message || "Failed to load users.");
        toast.error("Failed to load users");
        setLoading(false);
      },
    });

    return () => unsub();
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
    const currentRole = users.find((u) => u.id === uid)?.role;
    if (nextRole === currentRole) {
      toast.info("No changes made to role");
      return;
    }

    setSavingRoleFor(uid);
    try {
      await setUserRole(uid, nextRole, { trainingMode: isTrainingSource });
      auditAction(AUDIT_ACTIONS.USER_ROLE_CHANGE, {
        targetId: uid,
        targetType: "user",
        changes: { role: { from: currentRole, to: nextRole } },
        description: `Role changed from ${currentRole} to ${nextRole}`,
        trainingMode: isTrainingSource,
      });
      toast.success("User role updated successfully");
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
      auditAction(AUDIT_ACTIONS.USER_DELETE, {
        targetId: uid,
        targetType: "user",
        changes: { email: deletingUser.email, fullName: deletingUser.fullName },
        description: `Deleted user ${deletingUser.email || deletingUser.fullName || uid}`,
        trainingMode: isTrainingSource,
      });
      toast.success("User deleted successfully");
      setUsers((prev) => prev.filter((u) => u.id !== uid));
      setIsDeleteDialogOpen(false);
      setDeletingUser(null);
    } catch (e) {
      toast.error(e?.message || "Failed to delete user");
    }
  }

  async function handleForceLogout(uid) {
    try {
      await forceLogoutUser(uid, { trainingMode: isTrainingSource });
      auditAction(AUDIT_ACTIONS.USER_FORCE_LOGOUT, {
        targetId: uid,
        targetType: "user",
        description: "Force logged out user",
        trainingMode: isTrainingSource,
      });
      toast.success("User will be logged out on next activity");
    } catch (e) {
      toast.error(e?.message || "Failed to force logout user");
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              placeholder="Search users..."
              className="pl-10 pr-4 py-2 bg-background border border-border rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 w-full md:w-64 transition-all"
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
            <Card>
              <CardContent className="pt-6 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User Name & Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead className="text-center">Cancellations</TableHead>
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
                            <span className="font-medium text-sm text-foreground flex items-center">
                              {u.fullName || "Unnamed User"} {isSelf && <span className="text-[10px] bg-gold/10 text-gold px-1.5 py-0.5 rounded font-medium ml-2">You</span>}
                            </span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                              <Mail className="w-3 h-3 opacity-70" />
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
                              className="flex h-8 w-28 items-center justify-between rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
                            >
                              <Select.Value />
                            </Select.Trigger>
                            <Select.Portal>
                              <Select.Content className="z-50 max-h-64 min-w-[7rem] overflow-hidden rounded-md border border-border bg-background p-1 text-foreground shadow-md">
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
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Circle 
                              className={`h-2.5 w-2.5 ${
                                isOnlineNow(u) 
                                  ? "fill-emerald-500 text-emerald-500" 
                                  : "fill-muted text-muted"
                              }`} 
                            />
                            <span className="text-xs font-medium text-foreground/80">
                              {isOnlineNow(u) ? "Online" : "Offline"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {u.lastLoginAt ? (
                            (() => {
                              const loginAt = toDate(u.lastLoginAt);
                              return loginAt && !isNaN(loginAt) ? (
                                <div className="flex items-center gap-1.5 text-xs text-foreground/70 whitespace-nowrap">
                                  <Clock className="h-3 w-3 text-muted-foreground" />
                                  {loginAt.toLocaleDateString('en-PH', { 
                                    month: 'short', 
                                    day: 'numeric',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-xs">Never</span>
                              );
                            })()
                          ) : (
                            <span className="text-muted-foreground text-xs">Never</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {u.lastLoginDevice ? (
                            <div className="flex items-center gap-1.5 text-xs text-foreground/70 whitespace-nowrap">
                              <Monitor className="h-3 w-3 text-muted-foreground" />
                              <span>
                                {u.lastLoginDevice.deviceType || "Unknown"} · {u.lastLoginDevice.browser || "Unknown"}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
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
                              variant="outline"
                              className="h-8 w-8 text-foreground/70 hover:text-foreground disabled:opacity-30"
                              onClick={() => handleForceLogout(u.id)}
                              disabled={isSelf}
                              title="Force logout user"
                            >
                              <LogOut className="w-4 h-4" />
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
              </CardContent>
            </Card>
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
