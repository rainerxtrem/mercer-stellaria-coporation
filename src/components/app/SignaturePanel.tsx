import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Copy, Download, PenLine, ShieldCheck, XCircle } from "lucide-react";
import {
  createSignatureLink, listSignatureState, revokeSignatureLink, getSignedPdf,
} from "@/lib/signature.functions";
import { SIGNATURE_EVENT_LABELS } from "@/lib/signature-utils";

export function SignaturePanel({ invoiceId, kind }: { invoiceId: string; kind: string }) {
  const qc = useQueryClient();
  const stateFn = useServerFn(listSignatureState);
  const createFn = useServerFn(createSignatureLink);
  const revokeFn = useServerFn(revokeSignatureLink);
  const pdfFn = useServerFn(getSignedPdf);

  const [expiry, setExpiry] = useState("14");
  const [maxOpens, setMaxOpens] = useState("");
  const [pin, setPin] = useState("");
  const [invalidateOnSign, setInvalidateOnSign] = useState(true);

  const state = useQuery({
    queryKey: ["signature-state", invoiceId],
    queryFn: () => stateFn({ data: { invoice_id: invoiceId } }),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["signature-state", invoiceId] });
    qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
  };

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          invoice_id: invoiceId,
          expires_in_days: expiry ? Number(expiry) : null,
          max_opens: maxOpens ? Number(maxOpens) : null,
          pin: pin || null,
          invalidate_on_sign: invalidateOnSign,
        },
      }),
    onSuccess: async (r: any) => {
      const url = `${window.location.origin}/signature/${r.token}`;
      try { await navigator.clipboard.writeText(url); toast.success("Lien créé et copié"); }
      catch { toast.success("Lien de signature créé"); }
      setPin("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeFn({ data: { id } }),
    onSuccess: () => { toast.success("Lien révoqué"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const downloadSigned = useMutation({
    mutationFn: (signature_id: string) => pdfFn({ data: { signature_id } }),
    onSuccess: (r: any) => {
      const bin = atob(r.base64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([arr], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url; a.download = r.filename; a.click();
      URL.revokeObjectURL(url);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const data: any = state.data ?? { links: [], signatures: [], events: [] };
  const label = kind === "quote" ? "devis" : "facture";

  const copyLink = async (token: string) => {
    const url = `${window.location.origin}/signature/${token}`;
    try { await navigator.clipboard.writeText(url); toast.success("Lien copié"); }
    catch { toast.error("Copie impossible"); }
  };

  return (
    <Card className="shadow-[var(--shadow-card)]">
      <CardContent className="p-6">
        <h3 className="flex items-center gap-2 font-display text-lg font-bold text-navy-deep">
          <PenLine className="h-4 w-4 text-gold" />Signature électronique
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Envoyez un lien sécurisé : le client consulte le {label} et le signe sans créer de compte.
        </p>

        {data.signatures.length > 0 && (
          <div className="mt-4 space-y-2">
            {data.signatures.map((sig: any) => (
              <div key={sig.id} className="rounded-md border border-success/40 bg-success/10 p-3 text-xs">
                <p className="font-semibold text-foreground">
                  Signé par {sig.first_name} {sig.last_name}
                </p>
                <p className="text-muted-foreground">
                  {new Date(sig.signed_at).toLocaleString("fr-FR")} ·{" "}
                  {sig.method === "drawn" ? "signature dessinée" : `générée (${sig.style ?? "—"})`}
                </p>
                <p className="font-mono text-[11px] text-muted-foreground">{sig.signature_uid}</p>
                <Button
                  size="sm" variant="outline" className="mt-2"
                  onClick={() => downloadSigned.mutate(sig.id)}
                  disabled={downloadSigned.isPending}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />PDF signé
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 space-y-2">
          {data.links.map((l: any) => {
            const expired = l.expires_at && new Date(l.expires_at) < new Date();
            const active = l.active && !l.revoked_at && !expired;
            return (
              <div key={l.id} className="rounded-md border border-border bg-muted/30 p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 font-semibold ${active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                    {l.signed_at ? "Signé" : active ? "Actif" : l.revoked_at ? "Révoqué" : expired ? "Expiré" : "Inactif"}
                  </span>
                  <span className="text-muted-foreground">
                    {l.opens_count} ouverture{l.opens_count > 1 ? "s" : ""}
                    {l.max_opens ? ` / ${l.max_opens}` : ""}
                  </span>
                </div>
                <p className="mt-1.5 text-muted-foreground">
                  Créé le {new Date(l.created_at).toLocaleString("fr-FR")}
                  {l.expires_at ? ` · expire le ${new Date(l.expires_at).toLocaleDateString("fr-FR")}` : " · sans expiration"}
                  {l.pin_hash ? " · protégé par code" : ""}
                </p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => void copyLink(l.token)}>
                    <Copy className="mr-1.5 h-3.5 w-3.5" />Copier
                  </Button>
                  {active && (
                    <Button size="sm" variant="ghost" onClick={() => revoke.mutate(l.id)}>
                      <XCircle className="mr-1.5 h-3.5 w-3.5 text-destructive" />Révoquer
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 space-y-3 border-t border-border pt-4">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Expiration (jours)</Label>
              <Input value={expiry} onChange={(e) => setExpiry(e.target.value.replace(/\D/g, ""))} placeholder="14" />
            </div>
            <div>
              <Label className="text-xs">Ouvertures max.</Label>
              <Input value={maxOpens} onChange={(e) => setMaxOpens(e.target.value.replace(/\D/g, ""))} placeholder="illimité" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Code d'accès (optionnel, 4 à 8 chiffres)</Label>
            <Input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="ex. 4821" />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <span className="text-xs">Invalider le lien après signature</span>
            <Switch checked={invalidateOnSign} onCheckedChange={setInvalidateOnSign} />
          </div>
          <Button
            className="w-full bg-navy text-white hover:bg-navy-deep"
            onClick={() => create.mutate()}
            disabled={create.isPending}
          >
            <ShieldCheck className="mr-1.5 h-4 w-4" />Générer un lien de signature
          </Button>
        </div>

        {data.events.length > 0 && (
          <div className="mt-5 border-t border-border pt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Historique</h4>
            <ul className="mt-2 space-y-2">
              {data.events.map((ev: any) => (
                <li key={ev.id} className="text-xs">
                  <span className="font-medium">{SIGNATURE_EVENT_LABELS[ev.type] ?? ev.type}</span>
                  <span className="text-muted-foreground">
                    {" "}· {new Date(ev.created_at).toLocaleString("fr-FR")}
                    {ev.actor_label ? ` · ${ev.actor_label}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
