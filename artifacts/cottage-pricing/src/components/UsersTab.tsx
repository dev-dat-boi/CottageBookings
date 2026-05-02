import { useState } from "react";
import {
  useListUsers, useCreateUser, useUpdateUser, useDeleteUser, useSendResetLink, getListUsersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Trash2, Plus, Shield, Eye, Link2, Copy, Check, KeyRound, Mail, ChevronDown, ChevronUp, Wrench } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button variant="outline" size="sm" onClick={() => {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }}>
      {copied ? <><Check className="w-3.5 h-3.5 mr-1.5 text-green-600" />Copied</> : <><Copy className="w-3.5 h-3.5 mr-1.5" />Copy Link</>}
    </Button>
  );
}

function ResetLinkDialog({ link, emailSent, onClose }: { link: string; emailSent: boolean; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Link2 className="w-4 h-4" /> Password Reset Link</DialogTitle>
          <DialogDescription>
            {emailSent
              ? "A reset email was sent. You can also copy the link below to share manually."
              : "Email is not configured — share this link with the user directly."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {emailSent && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              <Mail className="w-4 h-4 shrink-0" /> Reset email sent to user.
            </div>
          )}
          <div className="bg-muted/30 border border-border/40 rounded-lg p-3 break-all text-xs font-mono text-foreground select-all">
            {link}
          </div>
          <p className="text-xs text-muted-foreground">This link expires in 24 hours.</p>
        </div>
        <DialogFooter className="flex-row justify-between">
          <CopyButton text={link} />
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoleBadge({ role }: { role: string }) {
  if (role === "admin") return (
    <Badge className="bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-100 text-xs shrink-0">
      <Shield className="w-2.5 h-2.5 mr-1" />Admin
    </Badge>
  );
  if (role === "mod") return (
    <Badge className="bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-100 text-xs shrink-0">
      <Wrench className="w-2.5 h-2.5 mr-1" />Mod
    </Badge>
  );
  return (
    <Badge className="bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100 text-xs shrink-0">
      <Eye className="w-2.5 h-2.5 mr-1" />Owner
    </Badge>
  );
}

interface InlinePasswordProps {
  userId: number;
  onClose: () => void;
}
function InlinePasswordEdit({ userId, onClose }: InlinePasswordProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateMutation = useUpdateUser();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function handleSave() {
    setError("");
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    updateMutation.mutate(
      { id: userId, data: { password } as any },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          toast({ title: "Password updated", description: "The user's password has been changed." });
          onClose();
        },
        onError: () => setError("Failed to update password."),
      }
    );
  }

  return (
    <div className="mt-2 pt-2 border-t border-border/30 flex flex-wrap items-center gap-2">
      <Input
        type="password"
        placeholder="New password (min 6 chars)"
        value={password}
        onChange={e => { setPassword(e.target.value); setError(""); }}
        className="h-7 text-xs flex-1 min-w-40"
        onKeyDown={e => e.key === "Enter" && handleSave()}
        autoFocus
      />
      {error && <p className="text-xs text-destructive w-full">{error}</p>}
      <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={onClose}>Cancel</Button>
      <Button size="sm" className="h-7 text-xs px-2" onClick={handleSave} disabled={updateMutation.isPending}>
        {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
        Save Password
      </Button>
    </div>
  );
}

interface AddUserFormProps { onDone: () => void; }
function AddUserForm({ onDone }: AddUserFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createMutation = useCreateUser();
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"owner" | "mod" | "admin">("owner");
  const [addError, setAddError] = useState("");

  function handleAdd() {
    setAddError("");
    if (!newEmail || !newPassword) { setAddError("Email and password required."); return; }
    createMutation.mutate(
      { data: { email: newEmail, name: newName, password: newPassword, role: newRole } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          toast({ title: "User created", description: `${newEmail} has been added.` });
          onDone();
        },
        onError: () => setAddError("Failed to create user. Email may already exist."),
      }
    );
  }

  return (
    <div className="border border-border/40 rounded-lg p-4 space-y-3 bg-muted/5">
      <p className="text-sm font-semibold">Add New User</p>
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Name" value={newName} onChange={e => setNewName(e.target.value)} />
        <Input type="email" placeholder="Email *" value={newEmail} onChange={e => { setNewEmail(e.target.value); setAddError(""); }} />
        <Input type="password" placeholder="Password *" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
        <select className="text-sm border border-border/40 rounded px-3 py-2 bg-background" value={newRole} onChange={e => setNewRole(e.target.value as "owner" | "mod" | "admin")}>
          <option value="owner">Owner</option>
          <option value="mod">Mod</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      {addError && <p className="text-xs text-destructive">{addError}</p>}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onDone}>Cancel</Button>
        <Button size="sm" onClick={handleAdd} disabled={createMutation.isPending}>
          {createMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null} Create User
        </Button>
      </div>
    </div>
  );
}

export function UsersTab() {
  const { user: me } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: users, isLoading } = useListUsers({ query: { queryKey: getListUsersQueryKey() } });
  const updateMutation = useUpdateUser();
  const deleteMutation = useDeleteUser();
  const sendResetMutation = useSendResetLink();

  const [showAdd, setShowAdd] = useState(false);
  const [resetLinkData, setResetLinkData] = useState<{ link: string; emailSent: boolean } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [expandedPasswordId, setExpandedPasswordId] = useState<number | null>(null);

  function invalidate() { queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() }); }

  function handleRoleChange(id: number, role: string) {
    updateMutation.mutate(
      { id, data: { role } },
      { onSuccess: invalidate, onError: () => toast({ title: "Error", description: "Failed to update role", variant: "destructive" }) }
    );
  }

  function handleDelete(id: number) {
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => { invalidate(); toast({ title: "User deleted" }); setConfirmDeleteId(null); },
        onError: () => toast({ title: "Error", description: "Failed to delete user", variant: "destructive" }),
      }
    );
  }

  function handleSendReset(id: number) {
    sendResetMutation.mutate(
      { id },
      {
        onSuccess: (data) => setResetLinkData({ link: (data as any).link, emailSent: (data as any).emailSent }),
        onError: () => toast({ title: "Error", description: "Failed to generate reset link", variant: "destructive" }),
      }
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/40 shadow-sm">
        <CardHeader className="bg-muted/30 border-b border-border/40">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>User Management</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Manage who can access this app. Users automatically receive email notifications for rentals.
              </CardDescription>
            </div>
            {!showAdd && (
              <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
                <Plus className="w-4 h-4 mr-1" /> Add User
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 space-y-3">
          {showAdd && <AddUserForm onDone={() => setShowAdd(false)} />}

          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : (
            <div className="space-y-2">
              {users?.map(u => (
                <div key={u.id} className="rounded-lg border border-border/40 bg-muted/10">
                  <div className="flex items-center gap-3 p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{u.name || u.email}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    </div>
                    <select
                      className="text-xs border border-border/40 rounded px-2 py-1 bg-background hidden sm:block"
                      value={u.role}
                      disabled={u.id === me?.id}
                      onChange={e => handleRoleChange(u.id, e.target.value)}
                    >
                      <option value="owner">Owner</option>
                      <option value="mod">Mod</option>
                      <option value="admin">Admin</option>
                    </select>
                    <RoleBadge role={u.role} />
                    <Button
                      variant="outline" size="sm"
                      className="shrink-0 text-xs h-7 px-2 hidden sm:flex"
                      onClick={() => setExpandedPasswordId(expandedPasswordId === u.id ? null : u.id)}
                      title="Set password"
                    >
                      {expandedPasswordId === u.id
                        ? <ChevronUp className="w-3 h-3" />
                        : <KeyRound className="w-3 h-3" />}
                      <span className="ml-1 hidden md:inline">
                        {expandedPasswordId === u.id ? "Cancel" : "Password"}
                      </span>
                    </Button>
                    <Button
                      variant="outline" size="sm"
                      className="shrink-0 text-xs h-7 px-2 hidden sm:flex"
                      disabled={sendResetMutation.isPending}
                      onClick={() => handleSendReset(u.id)}
                      title="Send password reset link"
                    >
                      {sendResetMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
                      <span className="ml-1 hidden md:inline">Reset Link</span>
                    </Button>
                    {u.id !== me?.id && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10 shrink-0"
                        onClick={() => setConfirmDeleteId(u.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                  {expandedPasswordId === u.id && (
                    <div className="px-3 pb-3">
                      <InlinePasswordEdit userId={u.id} onClose={() => setExpandedPasswordId(null)} />
                    </div>
                  )}
                </div>
              ))}
              {(!users || users.length === 0) && (
                <p className="text-sm text-muted-foreground italic text-center py-4">No users found.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {resetLinkData && (
        <ResetLinkDialog link={resetLinkData.link} emailSent={resetLinkData.emailSent} onClose={() => setResetLinkData(null)} />
      )}

      {confirmDeleteId != null && (
        <Dialog open onOpenChange={() => setConfirmDeleteId(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete User</DialogTitle>
              <DialogDescription>This will permanently remove the user and their access. This cannot be undone.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => handleDelete(confirmDeleteId)} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null} Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
