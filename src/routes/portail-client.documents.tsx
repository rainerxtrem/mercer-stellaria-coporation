import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getClientDocumentUrl, listClientDocuments } from "@/lib/client-portal.functions";

export const Route = createFileRoute("/portail-client/documents")({
  head: () => ({
    meta: [{ title: "Portail client - Documents" }],
  }),
  component: ClientPortalDocumentsPage,
});

function ClientPortalDocumentsPage() {
  const listFn = useServerFn(listClientDocuments);
  const urlFn = useServerFn(getClientDocumentUrl);

  const docsQ = useQuery({ queryKey: ["client-portal", "documents"], queryFn: () => listFn() });
  const download = useMutation({
    mutationFn: (id: string) => urlFn({ data: { id } }),
    onSuccess: (data) => window.open(data.url, "_blank", "noopener,noreferrer"),
  });

  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-8 lg:px-8">
      <Card className="border-zinc-800 bg-zinc-900/65">
        <CardHeader>
          <CardTitle className="text-zinc-100">Documents partages</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(docsQ.data ?? []).length === 0 && <p className="text-sm text-zinc-400">Aucun document partage.</p>}
          {(docsQ.data ?? []).map((doc: any) => (
            <div key={doc.id} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate text-zinc-100">{doc.filename}</p>
                <p className="truncate text-xs text-zinc-500">
                  {(doc.matters as any)?.number ?? "Dossier"} · {new Date(doc.created_at).toLocaleString("fr-FR")}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-zinc-700 bg-transparent text-zinc-100"
                onClick={() => download.mutate(doc.id)}
                disabled={download.isPending}
              >
                <Download className="mr-1 h-3.5 w-3.5" />Telecharger
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
