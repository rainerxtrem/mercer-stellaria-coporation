import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Download, Send, ReceiptText, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getInsuranceRefundAttachmentUrl,
  getInsuranceRefundRequest,
  listInsuranceRefundRequests,
  sendInsuranceRefundMessage,
  updateInsuranceRefundRequestStatus,
} from "@/lib/insurance-requests.functions";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/remboursements")({
  head: () => ({ meta: [{ title: "Remboursements - Cabinet" }] }),
  component: RemboursementsStaffPage,
});

function RemboursementsStaffPage() {
  const qc = useQueryClient();
  const search = useRouterState({ select: (state) => state.location.search as Record<string, unknown> });
  const navigate = useNavigate();

  const listFn = useServerFn(listInsuranceRefundRequests);
  const detailFn = useServerFn(getInsuranceRefundRequest);
  const attachmentUrlFn = useServerFn(getInsuranceRefundAttachmentUrl);
  const statusFn = useServerFn(updateInsuranceRefundRequestStatus);
  const sendMessageFn = useServerFn(sendInsuranceRefundMessage);

  const refundsQ = useQuery({ queryKey: ["staff", "refunds"], queryFn: () => listFn() });
  const refundId = typeof search.request === "string" ? search.request : null;
  const detailQ = useQuery({
    queryKey: ["staff", "refund-detail", refundId],
    enabled: Boolean(refundId),
    queryFn: () => detailFn({ data: { refund_id: refundId! } }),
  });

  const [status, setStatus] = useState<"new" | "in_progress" | "accepted" | "rejected" | "closed">("in_progress");
  const [staffNotes, setStaffNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [reply, setReply] = useState("");

  const detail = detailQ.data as any;
  const selected = useMemo(() => refundsQ.data?.find((row: any) => row.id === refundId) || detail?.refund || null, [refundsQ.data, refundId, detail]);

  const statusMutation = useMutation({
    mutationFn: () => {
      if (!refundId) throw new Error("Aucune demande sélectionnée.");
      return statusFn({
        data: {
          refund_id: refundId,
          status,
          staff_notes: staffNotes || null,
          rejection_reason: rejectionReason || null,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Statut mis a jour");
      await qc.invalidateQueries({ queryKey: ["staff", "refunds"] });
      await qc.invalidateQueries({ queryKey: ["staff", "refund-detail", refundId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const sendMessageMutation = useMutation({
    mutationFn: () => {
      if (!refundId || !reply.trim()) return Promise.resolve(null);
      return sendMessageFn({ data: { refund_id: refundId, body: reply } });
    },
    onSuccess: async () => {
      setReply("");
      await qc.invalidateQueries({ queryKey: ["staff", "refund-detail", refundId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-zinc-50">Remboursements</h1>
          <p className="text-sm text-zinc-400">Traitement des demandes, validation et échanges clients.</p>
        </div>
        <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-200">Module cabinet</Badge>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-zinc-800 bg-zinc-900/65">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-zinc-100"><ReceiptText className="h-5 w-5 text-amber-300" /> Demandes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(refundsQ.data ?? []).length === 0 && <p className="text-sm text-zinc-400">Aucune demande disponible.</p>}
            {(refundsQ.data ?? []).map((refund: any) => (
              <button key={refund.id} onClick={() => navigate({ search: { request: refund.id } as any })} className={`w-full rounded-xl border p-4 text-left transition ${refundId === refund.id ? "border-amber-500/50 bg-amber-500/10" : "border-zinc-800 bg-zinc-950/70 hover:border-amber-500/30"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-zinc-500">{refund.number}</p>
                    <p className="truncate font-medium text-zinc-100">{refund.subject}</p>
                    <p className="mt-1 text-xs text-zinc-500">{[refund.clients?.first_name, refund.clients?.last_name].filter(Boolean).join(" ") || refund.clients?.company || "Client"}</p>
                  </div>
                  <Badge variant="outline" className="border-zinc-700 text-zinc-200">{refund.status_label}</Badge>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        {selected && (
          <Card className="border-zinc-800 bg-zinc-900/65">
            <CardHeader>
              <CardTitle className="text-zinc-100">{selected.subject}</CardTitle>
              <p className="text-xs text-zinc-400">{selected.number} · {selected.status_label}</p>
            </CardHeader>
            <CardContent className="space-y-5 text-sm text-zinc-300">
              <p>{selected.description}</p>
              <div className="grid gap-2 md:grid-cols-2">
                <Info label="Date d'achat" value={selected.purchase_date || "-"} />
                <Info label="Fournisseur" value={selected.vendor_name || "-"} />
                <Info label="Référence" value={selected.invoice_reference || "-"} />
                <Info label="Montant" value={`${Number(selected.amount).toFixed(2)} ${selected.currency}`} />
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="md:col-span-1">
                  <Label>Statut</Label>
                  <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value as any)}>
                    <option value="new">Nouvelle</option>
                    <option value="in_progress">En cours</option>
                    <option value="accepted">Acceptée</option>
                    <option value="rejected">Refusée</option>
                    <option value="closed">Clôturée</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <Label>Notes internes</Label>
                  <Input value={staffNotes} onChange={(e) => setStaffNotes(e.target.value)} placeholder="Notes de traitement" />
                </div>
                <div className="md:col-span-3">
                  <Label>Motif de refus</Label>
                  <Textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} rows={3} placeholder="Renseignez uniquement si la demande est refusée" />
                </div>
                <div className="md:col-span-3 flex justify-end">
                  <Button onClick={() => statusMutation.mutate()} disabled={statusMutation.isPending}>
                    <Save className="mr-2 h-4 w-4" />Enregistrer le statut
                  </Button>
                </div>
              </div>

              {selected.staff_notes && <p className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 text-zinc-300"><span className="font-medium text-zinc-100">Notes: </span>{selected.staff_notes}</p>}
              {selected.rejection_reason && <p className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-red-100">{selected.rejection_reason}</p>}

              <div className="space-y-2">
                <p className="font-medium text-zinc-100">Pièces jointes</p>
                {(detail?.attachments || []).length === 0 && <p className="text-sm text-zinc-400">Aucune pièce jointe.</p>}
                {(detail?.attachments || []).map((attachment: any) => (
                  <div key={attachment.id} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm">
                    <div>
                      <p className="text-zinc-100">{attachment.filename}</p>
                      <p className="text-xs text-zinc-500">{new Date(attachment.created_at).toLocaleString("fr-FR")}</p>
                    </div>
                    <AttachmentDownload attachmentId={attachment.id} label={attachment.filename} fn={attachmentUrlFn} />
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <p className="font-medium text-zinc-100">Échanges</p>
                {(detail?.messages || []).length === 0 && <p className="text-sm text-zinc-400">Aucun message pour le moment.</p>}
                {(detail?.messages || []).map((message: any) => (
                  <div key={message.id} className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-zinc-100">{message.author_name || "Utilisateur"}</p>
                      <p className="text-xs text-zinc-500">{new Date(message.created_at).toLocaleString("fr-FR")}</p>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-zinc-300">{message.body}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-2 border-t border-zinc-800 pt-4">
                <Label htmlFor="refund-staff-reply">Réponse cabinet</Label>
                <Textarea id="refund-staff-reply" value={reply} onChange={(e) => setReply(e.target.value)} rows={4} placeholder="Répondre au client" />
                <div className="flex justify-end">
                  <Button onClick={() => sendMessageMutation.mutate()} disabled={sendMessageMutation.isPending || !reply.trim()}>
                    <Send className="mr-2 h-4 w-4" />Envoyer
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.15em] text-zinc-500">{label}</p>
      <p className="mt-1 text-zinc-100">{value}</p>
    </div>
  );
}

function AttachmentDownload({ attachmentId, label, fn }: { attachmentId: string; label: string; fn: any }) {
  const [pending, setPending] = useState(false);

  async function download() {
    setPending(true);
    try {
      const data: any = await fn({ data: { attachment_id: attachmentId } });
      window.open((data as any).url, "_blank", "noopener,noreferrer");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button size="sm" variant="outline" className="border-zinc-700 bg-transparent text-zinc-100" onClick={download} disabled={pending}>
      <Download className="mr-1 h-3.5 w-3.5" />{label}
    </Button>
  );
}