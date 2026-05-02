import { useState } from "react";
import { useChangePassword } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, KeyRound, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props { open: boolean; onClose: () => void; }

export function ChangePasswordDialog({ open, onClose }: Props) {
  const { toast } = useToast();
  const mutation = useChangePassword();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState("");

  function handleClose() {
    setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    setError(""); setShowCurrent(false); setShowNew(false);
    onClose();
  }

  function handleSubmit() {
    setError("");
    if (!currentPassword || !newPassword) { setError("All fields are required."); return; }
    if (newPassword.length < 6) { setError("New password must be at least 6 characters."); return; }
    if (newPassword !== confirmPassword) { setError("New passwords do not match."); return; }
    mutation.mutate(
      { data: { currentPassword, newPassword } },
      {
        onSuccess: () => {
          toast({ title: "Password changed", description: "Your password has been updated." });
          handleClose();
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.error || "Failed to change password.";
          setError(msg === "Current password is incorrect" ? "The current password you entered is incorrect." : msg);
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="w-4 h-4" /> Change Password</DialogTitle>
          <DialogDescription>Enter your current password and choose a new one.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <label className="text-sm font-medium">Current Password</label>
            <div className="relative mt-1">
              <Input type={showCurrent ? "text" : "password"} value={currentPassword}
                onChange={e => { setCurrentPassword(e.target.value); setError(""); }}
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
                placeholder="Current password" />
              <button type="button" onClick={() => setShowCurrent(v => !v)} className="absolute right-2 top-2 text-muted-foreground">
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">New Password</label>
            <div className="relative mt-1">
              <Input type={showNew ? "text" : "password"} value={newPassword}
                onChange={e => { setNewPassword(e.target.value); setError(""); }}
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
                placeholder="New password (min 6 chars)" />
              <button type="button" onClick={() => setShowNew(v => !v)} className="absolute right-2 top-2 text-muted-foreground">
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Confirm New Password</label>
            <Input type="password" value={confirmPassword}
              onChange={e => { setConfirmPassword(e.target.value); setError(""); }}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
              placeholder="Repeat new password" className="mt-1" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <KeyRound className="w-4 h-4 mr-2" />}
            Change Password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
