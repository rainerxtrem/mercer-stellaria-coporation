import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { listClientDocumentsToSign, refuseClientDocument } from "@/lib/client-portal.functions";

export const Route = createFileRoute("/portail-client/signatures")({
  head: () => ({
    meta: [{ title: "Portail client - Signatures" }],
  }),
  component: ClientPortalSignaturesPage,
});

function ClientPortalSignaturesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listClientDocumentsToSign);
  const refuseFn = useServerFn(refuseClientDocument);

  const docsQ = useQuery({ queryKey: ["client-portal", "to-sign"], queryFn: () => listFn() });
  const [toRefuse, setToRefuse] = useState<any | null>(null);
  const [reason, setReason] = useState("");

  const refuse = useMutation({
    mutationFn: async () => {
      if (!toRefuse) return;
      return refuseFn({ data: { invoice_id: toRefuse.id, reason: reason.trim() || null } });
    },
    onSuccess: async () => {
      toast.success("Document refuse");
      setToRefuse(null);
      setReason("");
      await qc.invalidateQueries({ queryKey: ["client-portal", "to-sign"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-8 lg:px-8">
      <Card className="border-zinc-800 bg-zinc-900/65">
        <CardHeader>
          <CardTitle className="text-zinc-100">Documents a signer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(docsQ.data ?? []).length === 0 && <p className="text-sm text-zinc-400">Aucun document en attente de signature.</p>}
          {(docsQ.data ?? []).map((doc: any) => (
            <div key={doc.id} className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-zinc-100">{doc.kind === "quote" ? "Devis" : "Facture"} {doc.number ?? ""}</p>
                  <p className="text-xs text-zinc-500">Statut: {doc.delivery_status}</p>
                </div>
                <p className="font-semibold text-zinc-100">{Number(doc.total).toFixed(2)} {doc.currency}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {doc.token ? (
                  <Button asChild className="bg-amber-500 text-zinc-950 hover:bg-amber-400">
                    <Link to="/signature/$token" params={{ token: doc.token }}>
                      Ouvrir et signer
                    </Link>
                  </Button>
                ) : (
                  <Button disabled variant="outline" className="border-zinc-700 bg-transparent text-zinc-300">Lien indisponible</Button>
                )}
                <Button
                  variant="outline"
                  className="border-zinc-700 bg-transparent text-zinc-200"
                  onClick={() => setToRefuse(doc)}
                >
                  Refuser
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={Boolean(toRefuse)} onOpenChange={(open) => !open && setToRefuse(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Refuser ce document</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reason">Motif (optionnel)</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Expliquez la raison du refus"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToRefuse(null)}>Annuler</Button>
            <Button onClick={() => refuse.mutate()} disabled={refuse.isPending}>
              Confirmer le refus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
