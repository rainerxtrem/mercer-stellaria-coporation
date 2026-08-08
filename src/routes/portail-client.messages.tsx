import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileText, Paperclip } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  createClientConversationUploadUrl,
  getClientConversationAttachmentUrl,
  listClientConversations,
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mattersFn = useServerFn(listClientMattersPortal);
  const conversationsFn = useServerFn(listClientConversations);
  const listMatterMessagesFn = useServerFn(listClientMessages);
  const sendMatterMessageFn = useServerFn(sendClientMessage);
  const listGeneralFn = useServerFn(listClientGeneralMessages);
  const sendGeneralFn = useServerFn(sendClientGeneralMessage);
  const markGeneralReadFn = useServerFn(markClientGeneralConversationRead);
  const createConversationUploadFn = useServerFn(createClientConversationUploadUrl);
  const getConversationAttachmentFn = useServerFn(getClientConversationAttachmentUrl);

  const conversationsQ = useQuery({
    queryKey: ["client-portal", "conversations"],
    queryFn: () => conversationsFn(),
    refetchInterval: 5000,
  });
  const mattersQ = useQuery({ queryKey: ["client-portal", "matters"], queryFn: () => mattersFn() });
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [selectedMatterId, setSelectedMatterId] = useState(search.matter || "");
  const [matterBody, setMatterBody] = useState("");
  const [generalBody, setGeneralBody] = useState("");
  const [generalFile, setGeneralFile] = useState<File | null>(null);

  useEffect(() => {
    if (!selectedMatterId && (mattersQ.data ?? []).length > 0) {
      setSelectedMatterId((mattersQ.data as any[])[0].id);
    }
  }, [selectedMatterId, mattersQ.data]);

  useEffect(() => {
    const conversations = conversationsQ.data?.conversations ?? [];
    if (!selectedConversationId && conversations[0]) setSelectedConversationId(conversations[0].id);
  }, [conversationsQ.data, selectedConversationId]);

  useEffect(() => {
    if (selectedConversationId) void markGeneralReadFn({ data: { conversation_id: selectedConversationId } });
  }, [markGeneralReadFn, selectedConversationId]);

  const matterMessagesQ = useQuery({
    queryKey: ["client-portal", "messages", "matter", selectedMatterId],
    enabled: Boolean(selectedMatterId),
    queryFn: () => listMatterMessagesFn({ data: { matter_id: selectedMatterId } }),
  });

  const generalQ = useQuery({
    queryKey: ["client-portal", "messages", "general", selectedConversationId],
    enabled: Boolean(selectedConversationId),
    queryFn: () => listGeneralFn({ data: { conversation_id: selectedConversationId } }),
    refetchInterval: 2500,
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
      if (!selectedConversationId || (!generalBody.trim() && !generalFile)) return;
      let attachment = {
        attachment_path: null as string | null,
        attachment_name: null as string | null,
        attachment_mime: null as string | null,
        attachment_size_bytes: null as number | null,
      };
      if (generalFile) {
        const mimeType = generalFile.type || "application/octet-stream";
        const signed = await createConversationUploadFn({
          data: {
            conversation_id: selectedConversationId,
            filename: generalFile.name,
            mime_type: mimeType,
            size_bytes: generalFile.size,
          },
        });
        const { error } = await supabase.storage
          .from("bar-media")
          .uploadToSignedUrl(signed.path, signed.token, generalFile, { contentType: mimeType });
        if (error) throw new Error(error.message);
        attachment = {
          attachment_path: signed.path,
          attachment_name: generalFile.name,
          attachment_mime: mimeType,
          attachment_size_bytes: generalFile.size,
        };
      }
      return sendGeneralFn({
        data: {
          conversation_id: selectedConversationId,
          body: generalBody.trim(),
          ...attachment,
        },
      });
    },
    onSuccess: async () => {
      setGeneralBody("");
      setGeneralFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await qc.invalidateQueries({ queryKey: ["client-portal", "messages", "general", selectedConversationId] });
      await qc.invalidateQueries({ queryKey: ["client-portal", "conversations"] });
      await qc.invalidateQueries({ queryKey: ["client-portal", "notifications"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const selectedMatter = useMemo(
    () => (mattersQ.data ?? []).find((matter: any) => matter.id === selectedMatterId),
    [mattersQ.data, selectedMatterId],
  );

  async function downloadGeneralAttachment(messageId: string) {
    try {
      const result = await getConversationAttachmentFn({ data: { message_id: messageId } });
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Téléchargement impossible.");
    }
  }

  return (
    <section className="mx-auto w-full max-w-6xl space-y-4 px-5 py-8 lg:px-8">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-zinc-800 bg-zinc-900/65">
          <CardHeader>
            <CardTitle className="text-zinc-100">Conversation generale</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <select
              value={selectedConversationId}
              onChange={(event) => setSelectedConversationId(event.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-100"
            >
              {(conversationsQ.data?.conversations ?? []).map((conversation: any) => (
                <option key={conversation.id} value={conversation.id}>{conversation.firm_name}</option>
              ))}
            </select>
            <div className="max-h-[360px] space-y-2 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
              {(generalQ.data?.messages ?? []).length === 0 && (
                <p className="text-sm text-zinc-400">Aucun message pour le moment.</p>
              )}
              {(generalQ.data?.messages ?? []).map((message: any) => (
                <MessageBubble
                  key={message.id}
                  mine={Boolean(message.mine)}
                  author={message.author_name}
                  body={message.body}
                  date={message.created_at}
                  attachmentName={message.attachment_name}
                  onDownload={message.attachment_path ? () => downloadGeneralAttachment(message.id) : undefined}
                />
              ))}
            </div>
            {generalFile && (
              <div className="flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-xs text-zinc-300">
                <FileText className="h-4 w-4 text-amber-300" />
                <span className="min-w-0 flex-1 truncate">{generalFile.name}</span>
                <button type="button" onClick={() => setGeneralFile(null)} className="text-zinc-400 hover:text-zinc-100">Retirer</button>
              </div>
            )}
            <div className="flex gap-2">
              <input ref={fileInputRef} type="file" className="hidden" onChange={(event) => setGeneralFile(event.target.files?.[0] ?? null)} />
              <Button type="button" size="icon" variant="outline" onClick={() => fileInputRef.current?.click()} title="Ajouter une pièce jointe" aria-label="Ajouter une pièce jointe">
                <Paperclip className="h-4 w-4" />
              </Button>
              <Input
                value={generalBody}
                onChange={(event) => setGeneralBody(event.target.value)}
                placeholder="Envoyer un message a votre entreprise"
                className="border-zinc-700 bg-zinc-950/70 text-zinc-100"
              />
              <Button onClick={() => sendGeneral.mutate()} disabled={sendGeneral.isPending || (!generalBody.trim() && !generalFile)}>
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

function MessageBubble({
  mine,
  author,
  body,
  date,
  attachmentName,
  onDownload,
}: {
  mine: boolean;
  author?: string | null;
  body: string;
  date: string;
  attachmentName?: string | null;
  onDownload?: () => void;
}) {
  return (
    <div className={`rounded-lg border px-3 py-2 text-sm ${mine ? "border-amber-500/40 bg-amber-500/10" : "border-zinc-800 bg-zinc-900"}`}>
      <p className="text-xs text-zinc-400">{mine ? "Vous" : author || "Equipe"}</p>
      <p className="mt-0.5 text-zinc-100">{body}</p>
      {attachmentName && (
        <button type="button" onClick={onDownload} className="mt-2 flex w-full items-center gap-2 rounded border border-zinc-700 px-2 py-1.5 text-left text-xs text-zinc-200">
          <FileText className="h-4 w-4" />
          <span className="min-w-0 flex-1 truncate">{attachmentName}</span>
          <Download className="h-3.5 w-3.5" />
        </button>
      )}
      <p className="mt-1 text-[11px] text-zinc-500">{new Date(date).toLocaleString("fr-FR")}</p>
    </div>
  );
}
