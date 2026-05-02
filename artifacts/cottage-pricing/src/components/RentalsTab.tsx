import { useState } from "react";
import { format } from "date-fns";
import {
  useGetRentals, useUpdateRental, useDeleteRental, getGetRentalsQueryKey,
} from "@workspace/api-client-react";
import type { RentalEntry } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAdminLock } from "@/contexts/AdminLockContext";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Phone, Mail, Calendar, Trash2, CheckCircle2, Clock, ChevronRight, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function RentalsTab() {
  const { isLocked } = useAdminLock();
  const { data: rentals, isLoading } = useGetRentals({ query: { queryKey: getGetRentalsQueryKey() } });
  const [selected, setSelected] = useState<RentalEntry | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<RentalEntry | null>(null);

  if (isLocked) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-muted-foreground">
        <Lock className="w-8 h-8" />
        <p className="text-sm font-medium">Unlock to view rentals</p>
      </div>
    );
  }

  if (isLoading) {
    return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const sorted = [...(rentals ?? [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold text-foreground">Rental Bookings</h2>
          <p className="text-sm text-muted-foreground">{sorted.length} booking{sorted.length !== 1 ? "s" : ""} total</p>
        </div>
      </div>

      {sorted.length === 0 ? (
        <Card className="border-border/40 shadow-sm">
          <CardContent className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
            <Calendar className="w-10 h-10 opacity-30" />
            <p className="text-sm">No rental bookings yet. Book dates on the Bookings tab.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {sorted.map(rental => (
            <RentalCard
              key={rental.id}
              rental={rental}
              onOpen={() => setSelected(rental)}
              onConfirmClick={() => setConfirmDialog(rental)}
            />
          ))}
        </div>
      )}

      {selected && (
        <RentalDetailDialog
          rental={selected}
          onClose={() => setSelected(null)}
          onConfirmClick={(r) => { setSelected(null); setConfirmDialog(r); }}
        />
      )}

      {confirmDialog && (
        <ConfirmEmailDialog
          rental={confirmDialog}
          onClose={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}

function statusBadge(status: string) {
  if (status === "confirmed") return <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100">Confirmed</Badge>;
  return <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">Submitted</Badge>;
}

function RentalCard({ rental, onOpen, onConfirmClick }: {
  rental: RentalEntry; onOpen: () => void; onConfirmClick: () => void;
}) {
  return (
    <Card
      className="border-border/40 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
      onClick={onOpen}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-semibold text-foreground">{rental.renterName}</span>
              {statusBadge(rental.status)}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{rental.phone}</span>
              <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{rental.email}</span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {rental.startDate} → {rental.endDate} ({rental.nights}n)
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <p className="font-bold text-foreground text-lg">${rental.totalPrice.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground capitalize">{rental.rateType}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RentalDetailDialog({ rental, onClose, onConfirmClick }: {
  rental: RentalEntry; onClose: () => void; onConfirmClick: (r: RentalEntry) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateMutation = useUpdateRental();
  const deleteMutation = useDeleteRental();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    renterName: rental.renterName, phone: rental.phone, email: rental.email, extraDetails: rental.extraDetails,
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  function handleSave() {
    updateMutation.mutate(
      { id: rental.id, data: { renterName: form.renterName, phone: form.phone, email: form.email, extraDetails: form.extraDetails } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetRentalsQueryKey() });
          setEditing(false);
          toast({ title: "Rental updated" });
          onClose();
        },
        onError: () => toast({ title: "Error", description: "Failed to update rental", variant: "destructive" }),
      }
    );
  }

  function handleDelete() {
    deleteMutation.mutate(
      { id: rental.id },
      {
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetRentalsQueryKey() }); onClose(); toast({ title: "Rental deleted" }); },
        onError: () => toast({ title: "Error", description: "Failed to delete rental", variant: "destructive" }),
      }
    );
  }

  const canConfirm = rental.status !== "confirmed";

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Rental — {rental.renterName}
            {statusBadge(rental.status)}
          </DialogTitle>
          <DialogDescription>
            Booked {format(new Date(rental.createdAt), "MMM d, yyyy")}
          </DialogDescription>
        </DialogHeader>

        {editing ? (
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs text-muted-foreground font-medium">Name</label>
              <Input value={form.renterName} onChange={e => setForm(f => ({ ...f, renterName: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium">Phone</label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium">Email</label>
              <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium">Extra Details</label>
              <Textarea value={form.extraDetails} onChange={e => setForm(f => ({ ...f, extraDetails: e.target.value }))} rows={3} />
            </div>
          </div>
        ) : (
          <div className="space-y-2 py-2">
            <Row label="Name" value={rental.renterName} />
            <Row label="Phone" value={rental.phone} />
            <Row label="Email" value={rental.email} />
            <Row label="Check-in" value={rental.startDate} />
            <Row label="Check-out" value={rental.endDate} />
            <Row label="Nights" value={String(rental.nights)} />
            <Row label="Total" value={`$${rental.totalPrice.toFixed(2)}`} />
            <Row label="Rate Type" value={rental.rateType === "family" ? "Family Rate" : "Standard Rate"} />
            {rental.extraDetails && <Row label="Details" value={rental.extraDetails} />}
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2 sm:flex-row">
          {!editing ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Edit</Button>
              {canConfirm && (
                <Button size="sm" onClick={() => { onClose(); onConfirmClick(rental); }} className="bg-green-600 hover:bg-green-700 text-white">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Confirm
                </Button>
              )}
              <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => setShowDeleteConfirm(true)}>
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
              </Button>
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
            <DialogHeader>
              <DialogTitle>Delete rental?</DialogTitle>
              <DialogDescription>This cannot be undone.</DialogDescription>
            </DialogHeader>
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
      {
        id: rental.id,
        data: {
          status: "confirmed",
          sendOwnerEmail: sendOwner,
          sendRenterEmail: sendRenter && !!rental.email,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetRentalsQueryKey() });
          toast({ title: "Rental confirmed", description: sendOwner || sendRenter ? "Confirmation emails sent." : undefined });
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
          <DialogDescription>
            Confirming rental for <strong>{rental.renterName}</strong> ({rental.startDate} → {rental.endDate}).
            Would you like to send confirmation emails?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={sendOwner} onChange={e => setSendOwner(e.target.checked)} className="w-4 h-4 accent-primary" />
            <span className="text-sm font-medium">Email owners</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={sendRenter} onChange={e => setSendRenter(e.target.checked)} disabled={!rental.email} className="w-4 h-4 accent-primary" />
            <span className={`text-sm font-medium ${!rental.email ? "text-muted-foreground" : ""}`}>
              Email renter {rental.email ? `(${rental.email})` : "(no email on file)"}
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={updateMutation.isPending} className="bg-green-600 hover:bg-green-700 text-white">
            {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
