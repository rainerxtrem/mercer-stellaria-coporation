import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  listClientGeneralMessages,
  listClientMattersPortal,
  listClientMessages,
  markClientGeneralConversationRead,
  sendClientGeneralMessage,
  sendClientMessage,
} from "@/lib/client-portal.functions";

export const Route = createFileRoute("/portail-client/messages")({
  validateSearch: (search: Record<string, unknown>) => ({
    matter: typeof search.matter === "string" ? search.matter : "",
  }),
  head: () => ({
    meta: [{ title: "Portail client - Messages" }],
  }),
  component: ClientPortalMessagesPage,
});

function ClientPortalMessagesPage() {
  const search = Route.useSearch();
  const qc = useQueryClient();

  const mattersFn = useServerFn(listClientMattersPortal);
  const listMatterMessagesFn = useServerFn(listClientMessages);
  const sendMatterMessageFn = useServerFn(sendClientMessage);
  const listGeneralFn = useServerFn(listClientGeneralMessages);
  const sendGeneralFn = useServerFn(sendClientGeneralMessage);
  const markGeneralReadFn = useServerFn(markClientGeneralConversationRead);

  const mattersQ = useQuery({ queryKey: ["client-portal", "matters"], queryFn: () => mattersFn() });
  const [selectedMatterId, setSelectedMatterId] = useState(search.matter || "");
  const [matterBody, setMatterBody] = useState("");
  const [generalBody, setGeneralBody] = useState("");

  useEffect(() => {
    if (!selectedMatterId && (mattersQ.data ?? []).length > 0) {
      setSelectedMatterId((mattersQ.data as any[])[0].id);
    }
  }, [selectedMatterId, mattersQ.data]);

  useEffect(() => {
    void markGeneralReadFn();
  }, [markGeneralReadFn]);

  const matterMessagesQ = useQuery({
    queryKey: ["client-portal", "messages", "matter", selectedMatterId],
    enabled: Boolean(selectedMatterId),
    queryFn: () => listMatterMessagesFn({ data: { matter_id: selectedMatterId } }),
  });

  const generalQ = useQuery({
    queryKey: ["client-portal", "messages", "general"],
    queryFn: () => listGeneralFn(),
  });

  const sendMatter = useMutation({
    mutationFn: async () => {
      if (!selectedMatterId || !matterBody.trim()) return;
      return sendMatterMessageFn({
        data: {
          matter_id: selectedMatterId,
          body: matterBody.trim(),
          document_id: null,
        },
      });
    },
    onSuccess: async () => {
      setMatterBody("");
      await qc.invalidateQueries({ queryKey: ["client-portal", "messages", "matter", selectedMatterId] });
      await qc.invalidateQueries({ queryKey: ["client-portal", "dashboard"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const sendGeneral = useMutation({
    mutationFn: async () => {
      if (!generalBody.trim()) return;
      return sendGeneralFn({ data: { body: generalBody.trim() } });
    },
    onSuccess: async () => {
      setGeneralBody("");
      await qc.invalidateQueries({ queryKey: ["client-portal", "messages", "general"] });
      await qc.invalidateQueries({ queryKey: ["client-portal", "notifications"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const selectedMatter = useMemo(
    () => (mattersQ.data ?? []).find((matter: any) => matter.id === selectedMatterId),
    [mattersQ.data, selectedMatterId],
  );

  return (
    <section className="mx-auto w-full max-w-6xl space-y-4 px-5 py-8 lg:px-8">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-zinc-800 bg-zinc-900/65">
          <CardHeader>
            <CardTitle className="text-zinc-100">Conversation generale</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-h-[360px] space-y-2 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
              {(generalQ.data?.messages ?? []).length === 0 && (
                <p className="text-sm text-zinc-400">Aucun message pour le moment.</p>
              )}
              {(generalQ.data?.messages ?? []).map((message: any) => (
                <MessageBubble key={message.id} mine={Boolean(message.mine)} author={message.author_name} body={message.body} date={message.created_at} />
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={generalBody}
                onChange={(event) => setGeneralBody(event.target.value)}
                placeholder="Envoyer un message a votre entreprise"
                className="border-zinc-700 bg-zinc-950/70 text-zinc-100"
              />
              <Button onClick={() => sendGeneral.mutate()} disabled={sendGeneral.isPending || !generalBody.trim()}>
                Envoyer
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/65">
          <CardHeader>
            <CardTitle className="text-zinc-100">Messages par dossier</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <select
              value={selectedMatterId}
              onChange={(event) => setSelectedMatterId(event.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-100"
            >
              {(mattersQ.data ?? []).map((matter: any) => (
                <option key={matter.id} value={matter.id}>
                  {matter.number ?? "Dossier"} - {matter.title}
                </option>
              ))}
            </select>
            <p className="text-xs text-zinc-500">{selectedMatter ? `Dossier: ${selectedMatter.title}` : "Selectionnez un dossier."}</p>
            <div className="max-h-[300px] space-y-2 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
              {(matterMessagesQ.data ?? []).length === 0 && (
                <p className="text-sm text-zinc-400">Aucun message dans ce dossier.</p>
              )}
              {(matterMessagesQ.data ?? []).map((message: any) => (
                <MessageBubble key={message.id} mine={Boolean(message.mine)} author={message.author_name} body={message.body} date={message.created_at} />
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={matterBody}
                onChange={(event) => setMatterBody(event.target.value)}
                placeholder="Envoyer un message lie a ce dossier"
                className="border-zinc-700 bg-zinc-950/70 text-zinc-100"
              />
              <Button onClick={() => sendMatter.mutate()} disabled={sendMatter.isPending || !matterBody.trim() || !selectedMatterId}>
                Envoyer
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function MessageBubble({ mine, author, body, date }: { mine: boolean; author?: string | null; body: string; date: string }) {
  return (
    <div className={`rounded-lg border px-3 py-2 text-sm ${mine ? "border-amber-500/40 bg-amber-500/10" : "border-zinc-800 bg-zinc-900"}`}>
      <p className="text-xs text-zinc-400">{mine ? "Vous" : author || "Equipe"}</p>
      <p className="mt-0.5 text-zinc-100">{body}</p>
      <p className="mt-1 text-[11px] text-zinc-500">{new Date(date).toLocaleString("fr-FR")}</p>
    </div>
  );
}
