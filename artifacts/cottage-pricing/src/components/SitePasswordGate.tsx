import { useState } from "react";
import { useCheckSitePassword } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

const SESSION_KEY = "cottage_site_unlocked";

interface SitePasswordGateProps {
  children: React.ReactNode;
}

export function SitePasswordGate({ children }: SitePasswordGateProps) {
  const [unlocked, setUnlocked] = useState(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const checkMutation = useCheckSitePassword();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    checkMutation.mutate({ data: { password } }, {
      onSuccess: (result) => {
        if (result.ok) {
          try { sessionStorage.setItem(SESSION_KEY, "1"); } catch {}
          setUnlocked(true);
        } else {
          setError("Incorrect password. Please try again.");
          setPassword("");
        }
      },
      onError: () => {
        setError("Unable to verify password. Please try again.");
      },
    });
  }

  if (unlocked) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-background to-muted/30 px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-4">
          <div className="w-20 h-20 rounded-2xl bg-primary flex items-center justify-center shadow-lg">
            <svg viewBox="0 0 180 180" className="w-12 h-12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M90 20 L160 75 L160 160 L20 160 L20 75 Z" fill="white" fillOpacity="0.95" />
              <path d="M90 20 L160 75 L20 75 Z" fill="white" fillOpacity="0.7" />
              <rect x="68" y="100" width="24" height="60" fill="#2d6a4f" rx="3" />
              <rect x="100" y="100" width="40" height="40" fill="#2d6a4f" rx="3" />
            </svg>
          </div>
          <div className="text-center">
            <h1 className="text-3xl font-bold text-foreground tracking-tight">40 Duncan</h1>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="site-password" className="text-sm font-medium text-foreground">
              Site Password
            </label>
            <Input
              id="site-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password to continue"
              autoFocus
              autoComplete="current-password"
              className="h-11 text-base"
            />
            {error && (
              <p className="text-sm text-destructive font-medium">{error}</p>
            )}
          </div>
          <Button
            type="submit"
            className="w-full h-11 text-base"
            disabled={!password || checkMutation.isPending}
          >
            {checkMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying…</>
            ) : (
              "Enter Site"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
