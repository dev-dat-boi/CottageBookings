import { useState } from "react";
import { useAuthLogin, useForgotPassword } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, LogIn, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface LoginDialogProps {
  open: boolean;
  onClose: () => void;
}

function ForgotPasswordView({ onBack }: { onBack: () => void }) {
  const mutation = useForgotPassword();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  function handleSubmit() {
    setError("");
    if (!email) { setError("Email is required."); return; }
    mutation.mutate(
      { data: { email } },
      {
        onSuccess: () => setSent(true),
        onError: () => setError("Something went wrong. Please try again."),
      }
    );
  }

  if (sent) {
    return (
      <div className="space-y-4 py-2 text-center">
        <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto" />
        <p className="text-sm font-semibold text-foreground">Check your inbox</p>
        <p className="text-sm text-muted-foreground">
          If that email has an account, a reset link has been sent. Ask your admin if you don't receive it.
        </p>
        <Button variant="outline" className="w-full" onClick={onBack}>Back to Sign In</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-2">
      <p className="text-sm text-muted-foreground">Enter your email and we'll send a password reset link.</p>
      <div>
        <label className="text-sm font-medium">Email</label>
        <Input type="email" value={email} onChange={e => { setEmail(e.target.value); setError(""); }}
          onKeyDown={e => e.key === "Enter" && handleSubmit()}
          placeholder="you@example.com" className="mt-1" autoFocus />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button className="w-full" onClick={handleSubmit} disabled={mutation.isPending}>
        {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        Send Reset Link
      </Button>
      <Button variant="ghost" className="w-full" onClick={onBack}>Back to Sign In</Button>
    </div>
  );
}

export function LoginDialog({ open, onClose }: LoginDialogProps) {
  const { login } = useAuth();
  const { toast } = useToast();
  const loginMutation = useAuthLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [showForgot, setShowForgot] = useState(false);

  function handleClose() {
    setEmail(""); setPassword(""); setError(""); setShowPw(false); setShowForgot(false);
    onClose();
  }

  function handleSubmit() {
    setError("");
    if (!email || !password) { setError("Email and password are required."); return; }
    loginMutation.mutate(
      { data: { email, password } },
      {
        onSuccess: (data) => {
          login(data.token, data.user as any);
          toast({ title: `Welcome, ${data.user.name || data.user.email}!` });
          handleClose();
        },
        onError: () => setError("Invalid email or password."),
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogIn className="w-4 h-4" />
            {showForgot ? "Forgot Password" : "Sign In"}
          </DialogTitle>
          {!showForgot && (
            <DialogDescription>Enter your credentials to access admin features.</DialogDescription>
          )}
        </DialogHeader>

        {showForgot ? (
          <ForgotPasswordView onBack={() => setShowForgot(false)} />
        ) : (
          <>
            <div className="space-y-3 py-2">
              <div>
                <label className="text-sm font-medium">Email</label>
                <Input type="email" value={email} onChange={e => { setEmail(e.target.value); setError(""); }}
                  onKeyDown={e => e.key === "Enter" && handleSubmit()} placeholder="you@example.com" className="mt-1" autoFocus />
              </div>
              <div>
                <label className="text-sm font-medium">Password</label>
                <div className="relative mt-1">
                  <Input type={showPw ? "text" : "password"} value={password}
                    onChange={e => { setPassword(e.target.value); setError(""); }}
                    onKeyDown={e => e.key === "Enter" && handleSubmit()} placeholder="Password" />
                  <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-2 top-2 text-muted-foreground">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <button type="button" onClick={() => setShowForgot(true)}
                className="text-xs text-primary hover:underline text-left w-full">
                Forgot your password?
              </button>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={loginMutation.isPending}>
                {loginMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <LogIn className="w-4 h-4 mr-2" />}
                Sign In
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
