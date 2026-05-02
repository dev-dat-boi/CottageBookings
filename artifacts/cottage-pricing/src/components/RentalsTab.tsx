import { useState } from "react";
import { format } from "date-fns";
import {
  useGetRentals, useUpdateRental, useDeleteRental, getGetRentalsQueryKey,
  useGetRentalApprovals, useSetRentalApproval, getGetRentalApprovalsQueryKey,
} from "@workspace/api-client-react";
import type { RentalEntry, OwnerApproval } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Phone, Mail, Calendar, Trash2, CheckCircle2, Clock, ChevronRight, Lock, ExternalLink, DollarSign, CheckCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function RentalsTab() {
  const { isLoggedIn, isAdmin } = useAuth();
  const { data: rentals, isLoading } = useGetRentals({ query: { queryKey: getGetRentalsQueryKey(), enabled: isLoggedIn } });
  const [selected, setSelected] = useState<RentalEntry | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<RentalEntry | null>(null);

  if (!isLoggedIn) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-muted-foreground">
        <Lock className="w-8 h-8" />
        <p className="text-sm font-medium">Sign in to view rentals</p>
      </div>
    );
  }

  if (isLoading) {
    return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const sorted = [...(rentals ?? [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const pendingCount = sorted.filter(r => r.status === "pending_approval").length;
  const submittedCount = sorted.filter(r => r.status === "submitted").length;
  const confirmedCount = sorted.filter(r => r.status === "confirmed").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold text-foreground">Rental Bookings</h2>
          <p className="text-sm text-muted-foreground">
            {sorted.length} total · {pendingCount} pending approval · {submittedCount} submitted · {confirmedCount} confirmed
          </p>
        </div>
      </div>

      {sorted.length === 0 ? (
        <Card className="border-border/40 shadow-sm">
          <CardContent className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
            <Calendar className="w-10 h-10 opacity-30" />
            <p className="text-sm">No rental bookings yet. Use the Bookings tab to book dates.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {sorted.map(rental => (
            <RentalCard key={rental.id} rental={rental} onOpen={() => setSelected(rental)}
              onConfirmClick={() => setConfirmDialog(rental)} isAdmin={isAdmin} />
          ))}
        </div>
      )}

      {selected && (
        <RentalDetailDialog rental={selected} onClose={() => setSelected(null)}
          onConfirmClick={(r) => { setSelected(null); setConfirmDialog(r); }} isAdmin={isAdmin} />
      )}
      {confirmDialog && <ConfirmEmailDialog rental={confirmDialog} onClose={() => setConfirmDialog(null)} />}
    </div>
  );
}

function statusBadge(status: string) {
  if (status === "confirmed") return <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100">Confirmed</Badge>;
  if (status === "pending_approval") return <Badge className="bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-100"><Clock className="w-3 h-3 mr-1" />Pending Approval</Badge>;
  return <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">Submitted</Badge>;
}

function priceDisplay(rental: RentalEntry) {
  if (rental.agreedPrice == null) return null;
  const diff = rental.agreedPrice - rental.totalPrice;
  const color = diff < 0 ? "text-orange-500" : "text-green-600";
  const icon = diff < 0 ? "↓" : "↑";
  return (
    <span className={`text-xs font-semibold ${color}`}>
      Agreed: ${rental.agreedPrice.toFixed(2)} {icon}
    </span>
  );
}

function buildGoogleCalendarUrl(rental: RentalEntry): string {
  const title = encodeURIComponent(`Cottage Rental - ${rental.renterName}`);
  const start = rental.startDate.replace(/-/g, "");
  const end = rental.endDate.replace(/-/g, "");
  const priceParts = [`Estimated: $${rental.totalPrice.toFixed(2)}`];
  if (rental.agreedPrice != null) priceParts.push(`Agreed: $${rental.agreedPrice.toFixed(2)}`);
  const details = encodeURIComponent(`${rental.nights} nights · ${priceParts.join(" | ")} · ${rental.phone} · ${rental.email}${rental.extraDetails ? "\n" + rental.extraDetails : ""}`);
  return `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${details}`;
}

function RentalCard({ rental, onOpen, onConfirmClick, isAdmin }: {
  rental: RentalEntry; onOpen: () => void; onConfirmClick: () => void; isAdmin: boolean;
}) {
  return (
    <Card className="border-border/40 shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={onOpen}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-semibold text-foreground">{rental.renterName}</span>
              {statusBadge(rental.status)}
              {rental.bookingType === "personal" && <Badge className="bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100 text-xs">Personal</Badge>}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {rental.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{rental.phone}</span>}
              {rental.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{rental.email}</span>}
              <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{rental.startDate} → {rental.endDate} ({rental.nights}n)</span>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <p className="font-bold text-foreground text-lg">${rental.totalPrice.toFixed(2)}</p>
              {priceDisplay(rental)}
              <p className="text-xs text-muted-foreground capitalize">{rental.bookingType === "personal" ? "Personal" : rental.rateType}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RentalDetailDialog({ rental, onClose, onConfirmClick, isAdmin }: {
  rental: RentalEntry; onClose: () => void; onConfirmClick: (r: RentalEntry) => void; isAdmin: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateMutation = useUpdateRental();
  const deleteMutation = useDeleteRental();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    renterName: rental.renterName, phone: rental.phone, email: rental.email,
    extraDetails: rental.extraDetails, agreedPrice: rental.agreedPrice != null ? String(rental.agreedPrice) : "",
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data: approvals } = useGetRentalApprovals(rental.id, { query: { queryKey: getGetRentalApprovalsQueryKey(rental.id) } });
  const approvalMutation = useSetRentalApproval();

  function handleSave() {
    const agreedPriceVal = form.agreedPrice === "" ? null : parseFloat(form.agreedPrice);
    updateMutation.mutate(
      { id: rental.id, data: { renterName: form.renterName, phone: form.phone, email: form.email, extraDetails: form.extraDetails, agreedPrice: agreedPriceVal } },
      {
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetRentalsQueryKey() }); setEditing(false); toast({ title: "Rental updated" }); onClose(); },
        onError: () => toast({ title: "Error", description: "Failed to update", variant: "destructive" }),
      }
    );
  }

  function handleDelete() {
    deleteMutation.mutate({ id: rental.id }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetRentalsQueryKey() }); onClose(); toast({ title: "Deleted" }); },
      onError: () => toast({ title: "Error", description: "Failed to delete", variant: "destructive" }),
    });
  }

  function handleApproval(ownerEmail: string, approved: boolean) {
    approvalMutation.mutate(
      { id: rental.id, ownerEmail: encodeURIComponent(ownerEmail), data: { approved } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetRentalsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetRentalApprovalsQueryKey(rental.id) });
          toast({ title: approved ? "Approved" : "Approval removed" });
        },
        onError: () => toast({ title: "Error", description: "Failed", variant: "destructive" }),
      }
    );
  }

  const agreedNum = form.agreedPrice !== "" ? parseFloat(form.agreedPrice) : null;
  const agreedColor = agreedNum == null ? "" : agreedNum < rental.totalPrice ? "text-orange-500" : "text-green-600";
  const canConfirm = rental.status === "submitted" || rental.status === "pending_approval";

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {rental.renterName} {statusBadge(rental.status)}
            {rental.bookingType === "personal" && <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs">Personal</Badge>}
          </DialogTitle>
          <DialogDescription>Booked {format(new Date(rental.createdAt), "MMM d, yyyy")}</DialogDescription>
        </DialogHeader>

        {editing ? (
          <div className="space-y-3 py-2">
            <div><label className="text-xs text-muted-foreground font-medium">Name</label><Input value={form.renterName} onChange={e => setForm(f => ({ ...f, renterName: e.target.value }))} /></div>
            <div><label className="text-xs text-muted-foreground font-medium">Phone</label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div><label className="text-xs text-muted-foreground font-medium">Email</label><Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div>
              <label className="text-xs text-muted-foreground font-medium">Agreed Price ($)</label>
              <div className="relative">
                <DollarSign className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                <Input type="number" step="0.01" value={form.agreedPrice} onChange={e => setForm(f => ({ ...f, agreedPrice: e.target.value }))} className={`pl-7 ${agreedColor}`} placeholder="Leave blank if not agreed" />
              </div>
              {agreedNum != null && (
                <p className={`text-xs mt-1 ${agreedColor}`}>
                  {agreedNum < rental.totalPrice ? `↓ $${(rental.totalPrice - agreedNum).toFixed(2)} below estimate` : `↑ $${(agreedNum - rental.totalPrice).toFixed(2)} above estimate`}
                </p>
              )}
            </div>
            <div><label className="text-xs text-muted-foreground font-medium">Extra Details</label><Textarea value={form.extraDetails} onChange={e => setForm(f => ({ ...f, extraDetails: e.target.value }))} rows={3} /></div>
          </div>
        ) : (
          <div className="space-y-2 py-2">
            <Row label="Name" value={rental.renterName} />
            {rental.phone && <Row label="Phone" value={rental.phone} />}
            {rental.email && <Row label="Email" value={rental.email} />}
            <Row label="Check-in" value={rental.startDate} />
            <Row label="Check-out" value={rental.endDate} />
            <Row label="Nights" value={String(rental.nights)} />
            <Row label="Estimated" value={`$${rental.totalPrice.toFixed(2)}`} />
            {rental.agreedPrice != null && (
              <div className="flex gap-3 text-sm">
                <span className="text-muted-foreground font-medium w-24 shrink-0">Agreed</span>
                <span className={`font-semibold ${rental.agreedPrice < rental.totalPrice ? "text-orange-500" : "text-green-600"}`}>
                  ${rental.agreedPrice.toFixed(2)} {rental.agreedPrice < rental.totalPrice ? "↓" : "↑"}
                </span>
              </div>
            )}
            <Row label="Rate Type" value={rental.bookingType === "personal" ? "Personal Use" : rental.rateType === "family" ? "Family Rate" : "Standard Rate"} />
            {rental.extraDetails && <Row label="Details" value={rental.extraDetails} />}

            {/* Google Calendar link */}
            <a href={buildGoogleCalendarUrl(rental)} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-primary hover:underline mt-2"
              onClick={e => e.stopPropagation()}>
              <ExternalLink className="w-3.5 h-3.5" /> Add to Google Calendar
            </a>
          </div>
        )}

        {/* Owner Approvals — admin-only */}
        {!editing && isAdmin && rental.status === "pending_approval" && approvals && approvals.length > 0 && (
          <div className="border border-border/40 rounded-lg p-3 space-y-2 bg-orange-50/40 dark:bg-orange-950/10">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><CheckCheck className="w-3.5 h-3.5 text-orange-500" /> Owner Approvals</p>
            {approvals.map(a => (
              <div key={a.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{a.ownerName || a.ownerEmail}</p>
                  <p className="text-xs text-muted-foreground truncate">{a.ownerEmail}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {a.approved ? (
                    <Badge className="bg-green-100 text-green-700 border-green-200 text-xs hover:bg-green-100"><CheckCircle2 className="w-2.5 h-2.5 mr-1" />Approved</Badge>
                  ) : (
                    <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs hover:bg-orange-100"><Clock className="w-2.5 h-2.5 mr-1" />Pending</Badge>
                  )}
                  <Button variant="outline" size="sm" className="h-6 text-xs px-2"
                    onClick={() => handleApproval(a.ownerEmail, !a.approved)} disabled={approvalMutation.isPending}>
                    {a.approved ? "Revoke" : "Approve"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2 sm:flex-row">
          {!editing ? (
            <>
              {/* Edit is available to all logged-in users */}
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Edit</Button>
              {/* Confirm (force-approve) is admin-only */}
              {canConfirm && isAdmin && (
                <Button size="sm" onClick={() => { onClose(); onConfirmClick(rental); }} className="bg-green-600 hover:bg-green-700 text-white">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Confirm
                </Button>
              )}
              {/* Delete is admin-only */}
              {isAdmin && (
                <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setShowDeleteConfirm(true)}>
                  <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
              </Button>
            </>
          )}
        </DialogFooter>

        <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Delete rental?</DialogTitle><DialogDescription>This cannot be undone.</DialogDescription></DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="text-muted-foreground font-medium w-24 shrink-0">{label}</span>
      <span className="text-foreground">{value || "—"}</span>
    </div>
  );
}

function ConfirmEmailDialog({ rental, onClose }: { rental: RentalEntry; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateMutation = useUpdateRental();
  const [sendOwner, setSendOwner] = useState(true);
  const [sendRenter, setSendRenter] = useState(!!rental.email);

  function handleConfirm() {
    updateMutation.mutate(
      { id: rental.id, data: { status: "confirmed", sendOwnerEmail: sendOwner, sendRenterEmail: sendRenter && !!rental.email } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetRentalsQueryKey() });
          toast({ title: "Rental confirmed", description: (sendOwner || sendRenter) ? "Confirmation emails sent." : undefined });
          onClose();
        },
        onError: () => toast({ title: "Error", description: "Failed to confirm rental", variant: "destructive" }),
      }
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Confirm Rental</DialogTitle>
          <DialogDescription>Confirming rental for <strong>{rental.renterName}</strong> ({rental.startDate} → {rental.endDate}). Send confirmation emails?</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={sendOwner} onChange={e => setSendOwner(e.target.checked)} className="w-4 h-4 accent-primary" />
            <span className="text-sm font-medium">Email owners</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={sendRenter} onChange={e => setSendRenter(e.target.checked)} disabled={!rental.email} className="w-4 h-4 accent-primary" />
            <span className={`text-sm font-medium ${!rental.email ? "text-muted-foreground" : ""}`}>
              Email renter {rental.email ? `(${rental.email})` : "(no email)"}
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={updateMutation.isPending} className="bg-green-600 hover:bg-green-700 text-white">
            {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />} Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
