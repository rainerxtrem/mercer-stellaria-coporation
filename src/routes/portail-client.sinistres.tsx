import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Download, Paperclip, Plus, Send, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createClientInsuranceClaim,
  createClientInsuranceClaimUploadUrl,
  finalizeClientInsuranceClaimAttachment,
  getClientInsuranceClaim,
  getClientInsuranceClaimAttachmentUrl,
  listClientInsuranceClaims,
  listClientInsuranceModules,
  sendClientInsuranceClaimMessage,
} from "@/lib/insurance-requests.functions";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/portail-client/sinistres")({
  head: () => ({ meta: [{ title: "Portail client - Sinistres" }] }),
  component: PortailClientSinistresPage,
});

function PortailClientSinistresPage() {
  const qc = useQueryClient();
  const search = useRouterState({ select: (state) => state.location.search as Record<string, unknown> });
  const navigate = useNavigate();

  const modulesFn = useServerFn(listClientInsuranceModules);
  const listFn = useServerFn(listClientInsuranceClaims);
  const createFn = useServerFn(createClientInsuranceClaim);
  const uploadFn = useServerFn(createClientInsuranceClaimUploadUrl);
  const finalizeFn = useServerFn(finalizeClientInsuranceClaimAttachment);
  const detailFn = useServerFn(getClientInsuranceClaim);
  const attachmentUrlFn = useServerFn(getClientInsuranceClaimAttachmentUrl);
  const sendMessageFn = useServerFn(sendClientInsuranceClaimMessage);

  const modulesQ = useQuery({ queryKey: ["client-portal", "modules"], queryFn: () => modulesFn() });
  const claimsQ = useQuery({ queryKey: ["client-portal", "claims"], queryFn: () => listFn() });

  const claimId = typeof search.request === "string" ? search.request : null;
  const detailQ = useQuery({
    queryKey: ["client-portal", "claim-detail", claimId],
    enabled: Boolean(claimId),
    queryFn: () => detailFn({ data: { claim_id: claimId! } }),
  });

  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [incidentDate, setIncidentDate] = useState("");
  const [incidentLocation, setIncidentLocation] = useState("");
  const [incidentType, setIncidentType] = useState("");
  const [estimatedAmount, setEstimatedAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [files, setFiles] = useState<File[]>([]);
  const [reply, setReply] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const created = await createFn({
        data: {
          subject,
          description,
          incident_date: incidentDate || null,
          incident_location: incidentLocation || null,
          incident_type: incidentType || null,
          estimated_amount: estimatedAmount ? Number(estimatedAmount) : null,
          currency,
        },
      });

      for (const file of files) {
        const upload = await uploadFn({
          data: {
            claim_id: created.id,
            filename: file.name,
            mime_type: file.type || "application/octet-stream",
            size_bytes: file.size,
          },
        });
        const response = await fetch(upload.signed_url, {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!response.ok) throw new Error("Upload impossible.");
        await finalizeFn({
          data: {
            claim_id: created.id,
            filename: file.name,
            storage_path: upload.path,
            mime_type: file.type || "application/octet-stream",
            size_bytes: file.size,
          },
        });
      }

      return created;
    },
    onSuccess: async (created: any) => {
      toast.success("Sinistre declare");
      setSubject("");
      setDescription("");
      setIncidentDate("");
      setIncidentLocation("");
      setIncidentType("");
      setEstimatedAmount("");
      setFiles([]);
      setCurrency("EUR");
      navigate({ search: { request: created.id } as any, replace: true });
      await qc.invalidateQueries({ queryKey: ["client-portal", "claims"] });
      await qc.invalidateQueries({ queryKey: ["client-portal", "claim-detail", created.id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      if (!claimId || !reply.trim()) return;
      return sendMessageFn({ data: { claim_id: claimId, body: reply } });
    },
    onSuccess: async () => {
      setReply("");
      await qc.invalidateQueries({ queryKey: ["client-portal", "claim-detail", claimId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const detail = detailQ.data as any;
  const allowed = useMemo(() => (modulesQ.data?.modules ?? []).includes("claims"), [modulesQ.data]);

  if (modulesQ.isLoading) {
    return <section className="mx-auto w-full max-w-7xl px-5 py-8 lg:px-8"><p className="text-sm text-zinc-400">Chargement...</p></section>;
  }

  if (!allowed) {
    return (
      <section className="mx-auto w-full max-w-6xl px-5 py-8 lg:px-8">
        <Card className="border-zinc-800 bg-zinc-900/65">
          <CardHeader>
            <CardTitle className="text-zinc-100">Sinistres indisponibles</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-zinc-400">
            Cette entreprise n'a pas activé le module de déclaration de sinistre.
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-7xl px-5 py-8 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Portail client</p>
          <h1 className="font-display text-2xl font-semibold text-zinc-50">Déclarer un sinistre</h1>
          <p className="mt-1 text-sm text-zinc-400">Suivez l'avancement, ajoutez des pièces et échangez avec le cabinet.</p>
        </div>
        <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-200">Module activé</Badge>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-zinc-800 bg-zinc-900/65">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-zinc-100"><ShieldAlert className="h-5 w-5 text-amber-300" /> Nouveau sinistre</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Objet</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ex: Bris de vitrine" />
            </div>
            <div className="md:col-span-2">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Décrivez les circonstances et les impacts" rows={6} />
            </div>
            <div>
              <Label>Date de l'incident</Label>
              <Input type="date" value={incidentDate} onChange={(e) => setIncidentDate(e.target.value)} />
            </div>
            <div>
              <Label>Lieu</Label>
              <Input value={incidentLocation} onChange={(e) => setIncidentLocation(e.target.value)} placeholder="Lieu de l'incident" />
            </div>
            <div>
              <Label>Type d'incident</Label>
              <Input value={incidentType} onChange={(e) => setIncidentType(e.target.value)} placeholder="Dégât des eaux, vol, incendie..." />
            </div>
            <div>
              <Label>Montant estimé</Label>
              <div className="flex gap-2">
                <Input type="number" min="0" step="0.01" value={estimatedAmount} onChange={(e) => setEstimatedAmount(e.target.value)} placeholder="0.00" />
                <Input className="w-24" value={currency} onChange={(e) => setCurrency(e.target.value)} />
              </div>
            </div>
            <div className="md:col-span-2">
              <Label>Pièces jointes</Label>
              <Input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
              {files.length > 0 && <p className="mt-1 text-xs text-zinc-500">{files.length} fichier(s) prêt(s) à être envoyés.</p>}
            </div>
            <div className="md:col-span-2 flex justify-end">
              <Button className="bg-amber-500 text-zinc-950 hover:bg-amber-400" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !subject.trim() || !description.trim()}>
                <Plus className="mr-2 h-4 w-4" />Déclarer le sinistre
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/65">
          <CardHeader>
            <CardTitle className="text-zinc-100">Mes sinistres</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(claimsQ.data ?? []).length === 0 && <p className="text-sm text-zinc-400">Aucun sinistre déclaré.</p>}
            {(claimsQ.data ?? []).map((claim: any) => (
              <button key={claim.id} onClick={() => navigate({ search: { request: claim.id } as any })} className={`w-full rounded-xl border p-4 text-left transition ${claimId === claim.id ? "border-amber-500/50 bg-amber-500/10" : "border-zinc-800 bg-zinc-950/70 hover:border-amber-500/30"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-zinc-500">{claim.number}</p>
                    <p className="truncate font-medium text-zinc-100">{claim.subject}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{claim.description}</p>
                  </div>
                  <Badge variant="outline" className="border-zinc-700 text-zinc-200">{claim.status_label}</Badge>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      {detail && (
        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_0.9fr]">
          <Card className="border-zinc-800 bg-zinc-900/65">
            <CardHeader>
              <CardTitle className="text-zinc-100">{detail.claim.subject}</CardTitle>
              <p className="text-xs text-zinc-400">{detail.claim.number} · {detail.claim.status_label}</p>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-zinc-300">
              <p>{detail.claim.description}</p>
              <div className="grid gap-2 md:grid-cols-2">
                <Info label="Date" value={detail.claim.incident_date ?? "-"} />
                <Info label="Lieu" value={detail.claim.incident_location ?? "-"} />
                <Info label="Type" value={detail.claim.incident_type ?? "-"} />
                <Info label="Estimation" value={detail.claim.estimated_amount ? `${Number(detail.claim.estimated_amount).toFixed(2)} ${detail.claim.currency}` : "-"} />
              </div>
              {detail.claim.staff_notes && <p className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 text-zinc-300"><span className="font-medium text-zinc-100">Notes du cabinet: </span>{detail.claim.staff_notes}</p>}
              {detail.claim.rejection_reason && <p className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-red-100">{detail.claim.rejection_reason}</p>}
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-zinc-900/65">
            <CardHeader>
              <CardTitle className="text-zinc-100">Pièces et échanges</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                {(detail.attachments ?? []).length === 0 && <p className="text-sm text-zinc-400">Aucune pièce jointe.</p>}
                {(detail.attachments ?? []).map((attachment: any) => (
                  <div key={attachment.id} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate text-zinc-100">{attachment.filename}</p>
                      <p className="text-xs text-zinc-500">{new Date(attachment.created_at).toLocaleString("fr-FR")}</p>
                    </div>
                    <AttachmentDownload attachmentId={attachment.id} label={attachment.filename} fn={attachmentUrlFn} />
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                {(detail.messages ?? []).length === 0 && <p className="text-sm text-zinc-400">Aucun message pour l'instant.</p>}
                {(detail.messages ?? []).map((message: any) => (
                  <div key={message.id} className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-zinc-100">{message.author_name ?? "Utilisateur"}</p>
                      <p className="text-xs text-zinc-500">{new Date(message.created_at).toLocaleString("fr-FR")}</p>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-zinc-300">{message.body}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-2 border-t border-zinc-800 pt-4">
                <Label htmlFor="claim-reply">Répondre</Label>
                <Textarea id="claim-reply" value={reply} onChange={(e) => setReply(e.target.value)} rows={4} placeholder="Ajoutez une précision ou une question" />
                <div className="flex justify-end">
                  <Button onClick={() => sendMessageMutation.mutate()} disabled={sendMessageMutation.isPending || !reply.trim()}>
                    <Send className="mr-2 h-4 w-4" />Envoyer
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
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
  const download = useMutation({
    mutationFn: () => fn({ data: { attachment_id: attachmentId } }),
    onSuccess: (data) => window.open((data as any).url, "_blank", "noopener,noreferrer"),
  });

  return (
    <Button size="sm" variant="outline" className="border-zinc-700 bg-transparent text-zinc-100" onClick={() => download.mutate()} disabled={download.isPending}>
      <Download className="mr-1 h-3.5 w-3.5" />{label}
    </Button>
  );
}