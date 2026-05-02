import { useState } from "react";
import {
  useListUsers, useCreateUser, useUpdateUser, useDeleteUser, getListUsersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Trash2, Plus, Users, Shield, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface Props { open: boolean; onClose: () => void; }

export function UserManagementDialog({ open, onClose }: Props) {
  const { user: me } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: users, isLoading } = useListUsers({ query: { queryKey: getListUsersQueryKey(), enabled: open } });
  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();
  const deleteMutation = useDeleteUser();

  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"viewer" | "admin">("viewer");
  const [addError, setAddError] = useState("");

  function invalidate() { queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() }); }

  function handleAdd() {
    setAddError("");
    if (!newEmail || !newPassword) { setAddError("Email and password required."); return; }
    createMutation.mutate(
      { data: { email: newEmail, name: newName, password: newPassword, role: newRole } },
      {
        onSuccess: () => {
          invalidate();
          setShowAdd(false); setNewEmail(""); setNewName(""); setNewPassword(""); setNewRole("viewer");
          toast({ title: "User created" });
        },
        onError: () => setAddError("Failed to create user. Email may already exist."),
      }
    );
  }

  function handleRoleChange(id: number, role: string) {
    updateMutation.mutate(
      { id, data: { role } },
      { onSuccess: invalidate, onError: () => toast({ title: "Error", description: "Failed to update role", variant: "destructive" }) }
    );
  }

  function handleDelete(id: number) {
    deleteMutation.mutate(
      { id },
      { onSuccess: invalidate, onError: () => toast({ title: "Error", description: "Failed to delete user", variant: "destructive" }) }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Users className="w-4 h-4" /> User Management</DialogTitle>
          <DialogDescription>Manage who can access this app and their permissions.</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : (
          <div className="space-y-2 py-2">
            {users?.map(u => (
              <div key={u.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/40 bg-muted/10">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{u.name || u.email}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                </div>
                <select
                  className="text-xs border border-border/40 rounded px-2 py-1 bg-background"
                  value={u.role}
                  disabled={u.id === me?.id}
                  onChange={e => handleRoleChange(u.id, e.target.value)}
                >
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                </select>
                <Badge className={u.role === "admin"
                  ? "bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-100 text-xs"
                  : "bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100 text-xs"}>
                  {u.role === "admin" ? <><Shield className="w-2.5 h-2.5 mr-1" />Admin</> : <><Eye className="w-2.5 h-2.5 mr-1" />Viewer</>}
                </Badge>
                {u.id !== me?.id && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => handleDelete(u.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {showAdd ? (
          <div className="border border-border/40 rounded-lg p-4 space-y-3 bg-muted/5">
            <p className="text-sm font-semibold">Add New User</p>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Name" value={newName} onChange={e => setNewName(e.target.value)} />
              <Input type="email" placeholder="Email *" value={newEmail} onChange={e => { setNewEmail(e.target.value); setAddError(""); }} />
              <Input type="password" placeholder="Password *" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
              <select className="text-sm border border-border/40 rounded px-3 py-2 bg-background" value={newRole} onChange={e => setNewRole(e.target.value as any)}>
                <option value="viewer">Viewer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            {addError && <p className="text-xs text-destructive">{addError}</p>}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setShowAdd(false); setAddError(""); }}>Cancel</Button>
              <Button size="sm" onClick={handleAdd} disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null} Create
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setShowAdd(true)} className="w-full">
            <Plus className="w-4 h-4 mr-1" /> Add User
          </Button>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
