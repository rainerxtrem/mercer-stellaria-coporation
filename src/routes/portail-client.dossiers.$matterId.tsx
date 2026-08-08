import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createClientUploadUrl,
  finalizeClientUpload,
  getClientDocumentUrl,
  getClientMatter,
} from "@/lib/client-portal.functions";

export const Route = createFileRoute("/portail-client/dossiers/$matterId")({
  head: () => ({
    meta: [{ title: "Portail client - Detail dossier" }],
  }),
  component: ClientPortalMatterPage,
});

function ClientPortalMatterPage() {
  const { matterId } = Route.useParams();
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const matterFn = useServerFn(getClientMatter);
  const urlFn = useServerFn(getClientDocumentUrl);
  const createUploadFn = useServerFn(createClientUploadUrl);
  const finalizeFn = useServerFn(finalizeClientUpload);

  const matterQ = useQuery({
    queryKey: ["client-portal", "matter", matterId],
    queryFn: () => matterFn({ data: { matter_id: matterId } }),
  });

  const downloadDoc = useMutation({
    mutationFn: (id: string) => urlFn({ data: { id } }),
    onSuccess: (data) => {
      window.open(data.url, "_blank", "noopener,noreferrer");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function onUpload(file: File) {
    try {
      setUploading(true);
      const created = await createUploadFn({
        data: {
          matter_id: matterId,
          filename: file.name,
          mime_type: file.type || "application/octet-stream",
          size_bytes: file.size,
        },
      });

      const uploadRes = await fetch(created.signed_url, {
        method: "PUT",
        headers: {
          "content-type": file.type || "application/octet-stream",
          "x-upsert": "true",
        },
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error("Televersement impossible");
      }

      await finalizeFn({
        data: {
          doc_id: created.doc_id,
          matter_id: matterId,
          filename: file.name,
          storage_path: created.path,
          mime_type: file.type || "application/octet-stream",
          size_bytes: file.size,
          comment: null,
        },
      });

      toast.success("Document depose avec succes.");
      await qc.invalidateQueries({ queryKey: ["client-portal", "matter", matterId] });
      await qc.invalidateQueries({ queryKey: ["client-portal", "documents"] });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const details: any = matterQ.data;

  return (
    <section className="mx-auto w-full max-w-6xl space-y-4 px-5 py-8 lg:px-8">
      <Card className="border-zinc-800 bg-zinc-900/65">
        <CardHeader>
          <CardTitle className="text-zinc-100">{details?.matter?.title ?? "Dossier"}</CardTitle>
          <p className="text-xs text-zinc-400">{details?.matter?.number ?? ""}</p>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-zinc-300">
          <p>{details?.matter?.description ?? "Aucune description."}</p>
          <p className="text-xs text-zinc-500">Referent: {details?.matter?.owner_name ?? "-"}</p>
          <Button asChild variant="outline" className="border-zinc-700 bg-transparent text-zinc-100">
            <Link to="/portail-client/messages" search={{ matter: matterId, conversation: "" }}>
              Ouvrir la conversation de ce dossier
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-900/65">
        <CardHeader>
          <CardTitle className="text-zinc-100">Documents du dossier</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onUpload(file);
              }}
            />
            <Button
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
              className="bg-amber-500 text-zinc-950 hover:bg-amber-400"
            >
              <Upload className="mr-2 h-4 w-4" />{uploading ? "Televersement..." : "Ajouter un document"}
            </Button>
          </div>
          {(details?.documents ?? []).length === 0 && <p className="text-sm text-zinc-400">Aucun document partage.</p>}
          {(details?.documents ?? []).map((doc: any) => (
            <div key={doc.id} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm">
              <div>
                <p className="text-zinc-200">{doc.filename}</p>
                <p className="text-xs text-zinc-500">{new Date(doc.created_at).toLocaleString("fr-FR")}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-zinc-700 bg-transparent text-zinc-100"
                onClick={() => downloadDoc.mutate(doc.id)}
                disabled={downloadDoc.isPending}
              >
                <Download className="mr-1 h-3.5 w-3.5" />Telecharger
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-900/65">
        <CardHeader>
          <CardTitle className="text-zinc-100">Activite recente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(details?.activity ?? []).length === 0 && <p className="text-zinc-400">Aucune activite recente.</p>}
          {(details?.activity ?? []).map((row: any) => (
            <div key={row.id} className="rounded-md border border-zinc-800 bg-zinc-950/70 px-3 py-2">
              <p className="text-zinc-200">{row.summary}</p>
              <p className="text-xs text-zinc-500">{new Date(row.created_at).toLocaleString("fr-FR")}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
