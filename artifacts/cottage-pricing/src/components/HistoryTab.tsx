import { useState } from "react";
import { useGetHistory, useClearHistory, getGetHistoryQueryKey, type GetHistoryParams } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2, History, Settings, CalendarDays, ListOrdered, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

const TYPE_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  settings: { label: "Settings", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300", icon: <Settings className="w-3 h-3" /> },
  calendar_override: { label: "Override", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300", icon: <CalendarDays className="w-3 h-3" /> },
  calendar_remove: { label: "Reset", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300", icon: <CalendarDays className="w-3 h-3" /> },
  bulk_days: { label: "Bulk Days", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300", icon: <ListOrdered className="w-3 h-3" /> },
};

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });
}

export function HistoryTab() {
  const { isLoggedIn } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmClear, setConfirmClear] = useState(false);

  const historyParams: GetHistoryParams = { limit: 300 };
  const { data: history, isLoading } = useGetHistory(
    historyParams,
    { query: { queryKey: getGetHistoryQueryKey(historyParams), enabled: isLoggedIn } }
  );
  const clearMutation = useClearHistory();

  if (!isLoggedIn) {
    return (
      <Card className="border-border/40 shadow-sm">
        <CardContent className="py-16 flex flex-col items-center gap-4 text-center">
          <Lock className="w-10 h-10 text-muted-foreground/40" />
          <div>
            <p className="font-semibold text-foreground">Sign In Required</p>
            <p className="text-sm text-muted-foreground mt-1">
              Sign in to view change history.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-primary w-8 h-8" /></div>;
  }

  return (
    <>
      <Card className="border-border/40 shadow-sm overflow-hidden">
        <CardHeader className="bg-muted/30 border-b border-border/40">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5" />
                Change History
              </CardTitle>
              <CardDescription className="mt-1">
                A log of pricing changes — settings saves, calendar overrides, and bulk operations.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => setConfirmClear(true)}
              disabled={!history?.length}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear History
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!history?.length ? (
            <div className="py-16 text-center text-muted-foreground text-sm">
              No changes recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {history.map((entry) => {
                const meta = TYPE_META[entry.changeType] ?? { label: entry.changeType, color: "bg-muted text-muted-foreground", icon: null };
                return (
                  <div key={entry.id} className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4 px-4 sm:px-6 py-3 hover:bg-muted/20 transition-colors">
                    <span className="text-xs text-muted-foreground whitespace-nowrap pt-0.5 min-w-[130px]">
                      {formatTime(entry.createdAt)}
                    </span>
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 ${meta.color}`}>
                        {meta.icon} {meta.label}
                      </span>
                      <span className="text-sm text-foreground break-words">{entry.description}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Clear all history?</DialogTitle>
            <DialogDescription>This will permanently delete all {history?.length} log entries. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmClear(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => {
              clearMutation.mutate(undefined, {
                onSuccess: () => {
                  toast({ title: "History cleared" });
                  queryClient.invalidateQueries({ queryKey: getGetHistoryQueryKey() });
                  setConfirmClear(false);
                },
                onError: () => toast({ title: "Error", description: "Failed to clear history.", variant: "destructive" }),
              });
            }}>
              {clearMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Clear All"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
