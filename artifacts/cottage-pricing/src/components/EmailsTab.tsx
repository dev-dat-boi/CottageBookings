import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Save, Mail, Clock, AlertCircle, CheckCircle2, Loader2, Copy, Check, XCircle, RefreshCw, Send, ShieldAlert } from "lucide-react";
import {
  useGetEmailTemplates,
  useUpdateEmailTemplate,
  getGetEmailTemplatesQueryKey,
  useGetEmailLogs,
  getGetEmailLogsQueryKey,
  useGetSettings,
  useUpdateSettings,
  getGetSettingsQueryKey,
  type EmailTemplate,
  type EmailLogEntry,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";

const TEMPLATE_ORDER = ["renter_new_booking", "renter_confirmed", "owner_confirmed"];

const TEMPLATE_LABELS: Record<string, string> = {
  renter_new_booking: "Booking Requested (Renter)",
  owner_new_booking: "New Booking (Owners)",
  renter_submitted: "Booking Approved (Renter)",
  renter_confirmed: "Booking Confirmed (Renter)",
  owner_confirmed: "Booking Confirmed (Owners)",
  renter_cancelled: "Booking Cancelled (Renter)",
};

interface TemplateEditorProps {
  template: EmailTemplate;
}

function TemplateEditor({ template }: TemplateEditorProps) {
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [enabled, setEnabled] = useState((template as any).enabled !== false);
  const [saved, setSaved] = useState(false);
  const [copiedVar, setCopiedVar] = useState<string | null>(null);
  const [testState, setTestState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [testMsg, setTestMsg] = useState("");
  const [togglingEnabled, setTogglingEnabled] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isDirty = subject !== template.subject || body !== template.body;

  useEffect(() => {
    setSubject(template.subject);
    setBody(template.body);
    setEnabled((template as any).enabled !== false);
    setSaved(false);
  }, [template.type]);

  async function handleToggleEnabled(checked: boolean) {
    setTogglingEnabled(true);
    try {
      const token = localStorage.getItem("cottage_auth_token");
      const res = await fetch(`/api/email-templates/${template.type}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ enabled: checked }),
      });
      if (res.ok) {
        setEnabled(checked);
        queryClient.invalidateQueries({ queryKey: getGetEmailTemplatesQueryKey() });
      }
    } finally {
      setTogglingEnabled(false);
    }
  }

  const { mutate, isPending, isError } = useUpdateEmailTemplate({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetEmailTemplatesQueryKey() });
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      },
    },
  });

  function handleSave() {
    mutate({ type: template.type, data: { subject, body } });
  }

  function handleReset() {
    setSubject(template.subject);
    setBody(template.body);
  }

  function insertVar(varName: string) {
    const ta = textareaRef.current;
    if (!ta) {
      setBody(prev => prev + varName);
      return;
    }
    const start = ta.selectionStart ?? body.length;
    const end = ta.selectionEnd ?? body.length;
    const newBody = body.slice(0, start) + varName + body.slice(end);
    setBody(newBody);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + varName.length, start + varName.length);
    }, 0);
  }

  function copyVar(varName: string) {
    navigator.clipboard.writeText(varName).catch(() => {});
    setCopiedVar(varName);
    setTimeout(() => setCopiedVar(null), 1500);
  }

  async function handleSendTest() {
    setTestState("sending");
    setTestMsg("");
    try {
      const token = localStorage.getItem("cottage_auth_token");
      const res = await fetch(`/api/email-templates/${template.type}/test`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setTestState("sent");
        setTestMsg(`Test sent to ${data.sentTo}`);
      } else {
        setTestState("error");
        setTestMsg(data.error ?? "Failed to send test");
      }
    } catch {
      setTestState("error");
      setTestMsg("Network error — could not send test");
    }
    setTimeout(() => setTestState("idle"), 4000);
  }

  const updatedAt = new Date(template.updatedAt);

  return (
    <div className="space-y-5">
      <div className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${enabled ? "border-border/40 bg-muted/20" : "border-amber-300 bg-amber-50/60"}`}>
        <div className="flex items-center gap-2.5">
          <Switch
            checked={enabled}
            onCheckedChange={handleToggleEnabled}
            disabled={togglingEnabled}
          />
          <div>
            <p className="text-sm font-medium leading-tight">
              {enabled ? "Sending enabled" : "Sending disabled"}
            </p>
            <p className="text-xs text-muted-foreground">
              {enabled ? "This email will be sent automatically." : "This email type will be skipped."}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="w-3.5 h-3.5" />
          Last saved: {updatedAt.toLocaleDateString()} {updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {saved && (
            <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Saved successfully
            </div>
          )}
          {isError && (
            <div className="flex items-center gap-1.5 text-xs text-red-600 font-medium">
              <AlertCircle className="w-3.5 h-3.5" />
              Failed to save
            </div>
          )}
          {testState === "sent" && (
            <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {testMsg}
            </div>
          )}
          {testState === "error" && (
            <div className="flex items-center gap-1.5 text-xs text-red-600 font-medium">
              <XCircle className="w-3.5 h-3.5" />
              {testMsg}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`subject-${template.type}`} className="text-sm font-medium">
          Subject Line
        </Label>
        <Input
          id={`subject-${template.type}`}
          value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder="Email subject..."
          className="font-mono text-sm"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`body-${template.type}`} className="text-sm font-medium">
          Email Body
        </Label>
        <p className="text-xs text-muted-foreground">
          Click a variable below to insert it at your cursor position, or right-click to copy it.
        </p>
        <Textarea
          ref={textareaRef}
          id={`body-${template.type}`}
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Email body..."
          className="font-mono text-sm min-h-[280px] resize-y leading-relaxed"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Available Variables</Label>
        <p className="text-xs text-muted-foreground">
          Click to insert at cursor · Right-click to copy
        </p>
        <div className="flex flex-wrap gap-1.5">
          {template.variables.map(v => (
            <button
              key={v}
              onClick={() => insertVar(v)}
              onContextMenu={e => { e.preventDefault(); copyVar(v); }}
              title={`Click to insert · Right-click to copy`}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-mono font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors cursor-pointer"
            >
              {copiedVar === v ? (
                <><Check className="w-3 h-3" /> copied</>
              ) : (
                <><Copy className="w-3 h-3" />{v}</>
              )}
            </button>
          ))}
        </div>
      </div>

      {template.type === "renter_confirmed" && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700">
          <strong>[ConfirmLink]</strong> — When this variable appears on its own line, it renders as a green "Confirm My Booking" button in the email.
        </div>
      )}

      <div className="flex items-center gap-3 pt-1 flex-wrap">
        <Button onClick={handleSave} disabled={isPending || !isDirty} size="sm">
          {isPending ? (
            <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving…</>
          ) : (
            <><Save className="w-3.5 h-3.5 mr-1.5" />Save Template</>
          )}
        </Button>
        {isDirty && (
          <Button variant="ghost" size="sm" onClick={handleReset} disabled={isPending}>
            Reset
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={handleSendTest}
          disabled={testState === "sending"}
          className="ml-auto"
        >
          {testState === "sending" ? (
            <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Sending…</>
          ) : (
            <><Send className="w-3.5 h-3.5 mr-1.5" />Send Test to Me</>
          )}
        </Button>
      </div>
    </div>
  );
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });
}

function EmailLogSection() {
  const queryClient = useQueryClient();
  const { data: logs, isLoading, isError, isFetching } = useGetEmailLogs(
    { limit: 200 },
    { query: { queryKey: getGetEmailLogsQueryKey({ limit: 200 }) } },
  );

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: getGetEmailLogsQueryKey({ limit: 200 }) });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center space-y-2">
          <AlertCircle className="w-8 h-8 text-destructive mx-auto" />
          <p className="text-sm text-muted-foreground">Failed to load email log</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {logs?.length === 0
            ? "No emails have been sent yet."
            : `Showing last ${logs?.length} email attempts, newest first.`}
        </p>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {logs && logs.length > 0 && (
        <div className="rounded-lg border border-border/40 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border/40">
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Status</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Sent At</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Template</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Rental</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Recipients</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Subject</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {logs.map((entry: EmailLogEntry) => (
                  <tr key={entry.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {entry.success ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5 font-medium">
                          <CheckCircle2 className="w-3 h-3" /> Sent
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5 font-medium cursor-help"
                          title={entry.errorMessage ?? "Unknown error"}
                        >
                          <XCircle className="w-3 h-3" /> Failed
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(entry.sentAt)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <Badge variant="outline" className="text-xs font-normal">
                        {TEMPLATE_LABELS[entry.templateType] ?? (entry.templateType || "—")}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {entry.rentalId != null ? `#${entry.rentalId}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[180px] truncate" title={entry.recipients}>
                      {entry.recipients}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[220px] truncate" title={entry.subject}>
                      {entry.subject}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function EmailKillSwitch() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetSettings();
  const [toggling, setToggling] = useState(false);

  const enabled = (settings as any)?.emailsEnabled ?? true;

  async function handleToggle(checked: boolean) {
    setToggling(true);
    try {
      const token = localStorage.getItem("cottage_auth_token");
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ emailsEnabled: checked }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      }
    } finally {
      setToggling(false);
    }
  }

  if (isLoading) return null;

  return (
    <Card className={`border ${enabled ? "border-border/40" : "border-red-300 bg-red-50/40"}`}>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${enabled ? "bg-green-100" : "bg-red-100"}`}>
              <ShieldAlert className={`w-4 h-4 ${enabled ? "text-green-700" : "text-red-600"}`} />
            </div>
            <div>
              <p className="text-sm font-semibold">
                Email Sending {enabled ? "Enabled" : "Disabled (Kill Switch Active)"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {enabled
                  ? "All booking emails are being sent normally to renters and owners."
                  : "All outgoing emails are blocked. No emails will be sent until re-enabled."}
              </p>
            </div>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={handleToggle}
            disabled={toggling}
            className={enabled ? "" : "data-[state=unchecked]:bg-red-500"}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export function EmailsTab() {
  const { isAdmin } = useAuth();
  const { data: templates, isLoading, isError } = useGetEmailTemplates();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !templates) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center space-y-2">
          <AlertCircle className="w-8 h-8 text-destructive mx-auto" />
          <p className="text-sm text-muted-foreground">Failed to load email templates</p>
        </div>
      </div>
    );
  }

  const ordered = TEMPLATE_ORDER
    .map(type => templates.find(t => t.type === type))
    .filter((t): t is EmailTemplate => !!t)
    .concat(templates.filter(t => !TEMPLATE_ORDER.includes(t.type)));

  const defaultTab = ordered[0]?.type ?? "";

  return (
    <div className="space-y-6">
      {isAdmin && <EmailKillSwitch />}

      <Card className="border border-border/40">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Mail className="w-4 h-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Email Templates</CardTitle>
              <CardDescription className="text-sm">
                Customize the emails sent to renters and owners when a booking is confirmed.
                Use <code className="text-xs bg-muted px-1 py-0.5 rounded">[Variable]</code> placeholders for dynamic content.
                {isAdmin && " Use \u201cSend Test to Me\u201d to preview any template in your inbox."}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <Tabs defaultValue={defaultTab}>
            <TabsList className="mb-6 h-auto flex-wrap bg-muted/50 border border-border/40 p-1">
              {ordered.map(t => (
                <TabsTrigger
                  key={t.type}
                  value={t.type}
                  className="text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap"
                >
                  {t.name}
                </TabsTrigger>
              ))}
            </TabsList>
            {ordered.map(t => (
              <TabsContent key={t.type} value={t.type} className="mt-0 outline-none">
                <TemplateEditor template={t} />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      <Card className="border border-border/40">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Clock className="w-4 h-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Email Delivery Log</CardTitle>
              <CardDescription className="text-sm">
                A record of every email attempt — who received it, which template was used, and whether it succeeded.
                Hover over a failed row's status badge to see the error.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <EmailLogSection />
        </CardContent>
      </Card>
    </div>
  );
}
