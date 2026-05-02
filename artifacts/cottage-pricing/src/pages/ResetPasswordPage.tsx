import { useState } from "react";
import { useParams } from "wouter";
import { useResetPassword } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, KeyRound, Eye, EyeOff, CheckCircle2, Trees } from "lucide-react";

export default function ResetPasswordPage() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? "";
  const mutation = useResetPassword();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  function handleSubmit() {
    setError("");
    if (!newPassword || !confirmPassword) { setError("Both fields are required."); return; }
    if (newPassword.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (newPassword !== confirmPassword) { setError("Passwords do not match."); return; }
    mutation.mutate(
      { data: { token, newPassword } },
      {
        onSuccess: () => setDone(true),
        onError: (err: any) => {
          const msg = err?.response?.data?.error || "Failed to reset password.";
          setError(msg.includes("expired") ? "This reset link has expired. Please request a new one." : msg);
        },
      }
    );
  }

  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
            <Trees className="w-6 h-6" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-foreground">Cottage Pricing</h1>
            <p className="text-sm text-muted-foreground">Reset your password</p>
          </div>
        </div>

        {done ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto" />
            <p className="text-base font-semibold text-green-800">Password reset!</p>
            <p className="text-sm text-green-700">Your password has been updated. You can now sign in with your new password.</p>
            <Button className="w-full mt-2" onClick={() => window.location.href = "/"}>
              Go to Sign In
            </Button>
          </div>
        ) : (
          <div className="bg-card border border-border/40 rounded-xl p-6 shadow-sm space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">Choose a new password</p>
              <p className="text-xs text-muted-foreground">Must be at least 6 characters.</p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">New Password</label>
                <div className="relative mt-1">
                  <Input type={showPw ? "text" : "password"} value={newPassword}
                    onChange={e => { setNewPassword(e.target.value); setError(""); }}
                    onKeyDown={e => e.key === "Enter" && handleSubmit()}
                    placeholder="New password" />
                  <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-2 top-2 text-muted-foreground">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Confirm Password</label>
                <Input type="password" value={confirmPassword}
                  onChange={e => { setConfirmPassword(e.target.value); setError(""); }}
                  onKeyDown={e => e.key === "Enter" && handleSubmit()}
                  placeholder="Repeat new password" className="mt-1" />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <Button className="w-full" onClick={handleSubmit} disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <KeyRound className="w-4 h-4 mr-2" />}
              Reset Password
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
