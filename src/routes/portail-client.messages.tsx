import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Building2,
  CheckCheck,
  Download,
  FileText,
  MessageCircle,
  Paperclip,
  Scale,
  Send,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  createClientConversationUploadUrl,
  createClientUploadUrl,
  finalizeClientUpload,
  getClientConversationAttachmentUrl,
  getClientDocumentUrl,
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
    conversation: typeof search.conversation === "string" ? search.conversation : "",
  }),
  head: () => ({ meta: [{ title: "Messagerie - Mercer & Stellaria" }] }),
  component: ClientPortalMessagesPage,
});

type GeneralThread = {
  kind: "general";
  id: string;
  label: string;
  subtitle: string;
  logoUrl: string | null;
  latest: any | null;
  unread: boolean;
};

type MatterThread = {
  kind: "matter";
  id: string;
  label: string;
  subtitle: string;
  logoUrl: null;
  latest: null;
  unread: false;
};

type Thread = GeneralThread | MatterThread;

function ClientPortalMessagesPage() {
  const search = Route.useSearch();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const conversationsFn = useServerFn(listClientConversations);
  const mattersFn = useServerFn(listClientMattersPortal);
  const listGeneralFn = useServerFn(listClientGeneralMessages);
  const listMatterFn = useServerFn(listClientMessages);
  const sendGeneralFn = useServerFn(sendClientGeneralMessage);
  const sendMatterFn = useServerFn(sendClientMessage);
  const markReadFn = useServerFn(markClientGeneralConversationRead);
  const createUploadFn = useServerFn(createClientConversationUploadUrl);
  const getAttachmentFn = useServerFn(getClientConversationAttachmentUrl);
  const createMatterUploadFn = useServerFn(createClientUploadUrl);
  const finalizeMatterUploadFn = useServerFn(finalizeClientUpload);
  const getDocumentFn = useServerFn(getClientDocumentUrl);

  const conversationsQ = useQuery({
    queryKey: ["client-portal", "conversations"],
    queryFn: () => conversationsFn(),
    refetchInterval: 4000,
  });
  const mattersQ = useQuery({
    queryKey: ["client-portal", "matters"],
    queryFn: () => mattersFn(),
    refetchInterval: 10000,
  });

  const threads = useMemo<Thread[]>(() => {
    const general: GeneralThread[] = (conversationsQ.data?.conversations ?? []).map((conversation: any) => {
      const latest = conversation.latest_message ?? null;
      const unread = Boolean(
        latest &&
        !latest.mine &&
        (!conversation.client_last_read_at || latest.created_at > conversation.client_last_read_at),
      );
      return {
        kind: "general",
        id: conversation.id,
        label: conversation.firm_name,
        subtitle: "Conversation entreprise",
        logoUrl: conversation.firm_logo_url,
        latest,
        unread,
      };
    });
    const matters: MatterThread[] = (mattersQ.data ?? []).map((matter: any) => ({
      kind: "matter",
      id: matter.id,
      label: matter.title,
      subtitle: matter.number ? `Dossier ${matter.number}` : "Dossier client",
      logoUrl: null,
      latest: null,
      unread: false,
    }));
    return [...general, ...matters];
  }, [conversationsQ.data, mattersQ.data]);

  const initialThreadKey = search.matter
    ? `matter:${search.matter}`
    : search.conversation
      ? `general:${search.conversation}`
      : "";
  const [selectedKey, setSelectedKey] = useState(initialThreadKey);
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [mobileThreadOpen, setMobileThreadOpen] = useState(Boolean(search.matter || search.conversation));

  useEffect(() => {
    if (!selectedKey && threads[0]) setSelectedKey(`${threads[0].kind}:${threads[0].id}`);
  }, [selectedKey, threads]);

  const selected = useMemo(
    () => threads.find((thread) => `${thread.kind}:${thread.id}` === selectedKey) ?? null,
    [selectedKey, threads],
  );

  const generalMessagesQ = useQuery({
    queryKey: ["client-portal", "messages", "general", selected?.kind === "general" ? selected.id : "none"],
    enabled: selected?.kind === "general",
    queryFn: () => listGeneralFn({ data: { conversation_id: selected!.id } }),
    refetchInterval: 2200,
  });
  const matterMessagesQ = useQuery({
    queryKey: ["client-portal", "messages", "matter", selected?.kind === "matter" ? selected.id : "none"],
    enabled: selected?.kind === "matter",
    queryFn: () => listMatterFn({ data: { matter_id: selected!.id } }),
    refetchInterval: 2200,
  });
  const messages = selected?.kind === "general" ? generalMessagesQ.data?.messages ?? [] : matterMessagesQ.data ?? [];

  useEffect(() => {
    if (selected?.kind !== "general") return;
    void markReadFn({ data: { conversation_id: selected.id } }).then(() => {
      void queryClient.invalidateQueries({ queryKey: ["client-portal", "conversations"] });
    });
  }, [markReadFn, queryClient, selected]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, selectedKey]);

  const send = useMutation({
    mutationFn: async () => {
      if (!selected || (!body.trim() && !file)) return;
      if (selected.kind === "matter") {
        let documentId: string | null = null;
        if (file) {
          const mimeType = file.type || "application/octet-stream";
          const signed = await createMatterUploadFn({
            data: { matter_id: selected.id, filename: file.name, mime_type: mimeType, size_bytes: file.size },
          });
          const { error } = await supabase.storage
            .from("bar-media")
            .uploadToSignedUrl(signed.path, signed.token, file, { contentType: mimeType });
          if (error) throw new Error(error.message);
          await finalizeMatterUploadFn({
            data: {
              doc_id: signed.doc_id,
              matter_id: selected.id,
              filename: file.name,
              storage_path: signed.path,
              mime_type: mimeType,
              size_bytes: file.size,
              comment: body.trim() || null,
            },
          });
          documentId = signed.doc_id;
        }
        await sendMatterFn({
          data: {
            matter_id: selected.id,
            body: body.trim() || `Pièce jointe : ${file?.name ?? "document"}`,
            document_id: documentId,
          },
        });
        return;
      }

      let attachment = {
        attachment_path: null as string | null,
        attachment_name: null as string | null,
        attachment_mime: null as string | null,
        attachment_size_bytes: null as number | null,
      };
      if (file) {
        const mimeType = file.type || "application/octet-stream";
        const signed = await createUploadFn({
          data: { conversation_id: selected.id, filename: file.name, mime_type: mimeType, size_bytes: file.size },
        });
        const { error } = await supabase.storage
          .from("bar-media")
          .uploadToSignedUrl(signed.path, signed.token, file, { contentType: mimeType });
        if (error) throw new Error(error.message);
        attachment = {
          attachment_path: signed.path,
          attachment_name: file.name,
          attachment_mime: mimeType,
          attachment_size_bytes: file.size,
        };
      }
      await sendGeneralFn({ data: { conversation_id: selected.id, body: body.trim(), ...attachment } });
    },
    onSuccess: async () => {
      setBody("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["client-portal", "messages"] }),
        queryClient.invalidateQueries({ queryKey: ["client-portal", "conversations"] }),
        queryClient.invalidateQueries({ queryKey: ["client-portal", "notifications"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function downloadAttachment(messageId: string) {
    try {
      const result = await getAttachmentFn({ data: { message_id: messageId } });
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Téléchargement impossible.");
    }
  }

  async function downloadMatterDocument(documentId: string) {
    try {
      const result = await getDocumentFn({ data: { id: documentId } });
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Téléchargement impossible.");
    }
  }

  function selectThread(thread: Thread) {
    setSelectedKey(`${thread.kind}:${thread.id}`);
    setMobileThreadOpen(true);
    setBody("");
    setFile(null);
  }

  const clientName = [conversationsQ.data?.client?.last_name, conversationsQ.data?.client?.first_name]
    .filter(Boolean)
    .join(" ");

  return (
    <section className="mx-auto flex h-[calc(100vh-1rem)] w-full max-w-[1480px] p-2 sm:h-[calc(100vh-2rem)] sm:p-4 lg:h-screen lg:p-6">
      <div className="grid min-h-0 w-full overflow-hidden rounded-lg border border-zinc-800 bg-[#090e18] shadow-2xl lg:grid-cols-[350px_minmax(0,1fr)]">
        <aside className={`${mobileThreadOpen ? "hidden lg:flex" : "flex"} min-h-0 flex-col border-zinc-800 bg-[#0b111d] lg:border-r`}>
          <div className="border-b border-zinc-800 px-5 py-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300">Messagerie</p>
            <div className="mt-1 flex items-end justify-between gap-3">
              <div>
                <h1 className="font-display text-2xl font-semibold text-zinc-50">Conversations</h1>
                <p className="mt-1 text-xs text-zinc-500">{clientName || "Compte client"}</p>
              </div>
              <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-medium text-emerald-300">En ligne</span>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <ThreadSection label="Entreprises">
              {threads.filter((thread) => thread.kind === "general").map((thread) => (
                <ThreadButton key={`general:${thread.id}`} thread={thread} selected={selectedKey === `general:${thread.id}`} onSelect={() => selectThread(thread)} />
              ))}
            </ThreadSection>
            <ThreadSection label="Dossiers">
              {threads.filter((thread) => thread.kind === "matter").map((thread) => (
                <ThreadButton key={`matter:${thread.id}`} thread={thread} selected={selectedKey === `matter:${thread.id}`} onSelect={() => selectThread(thread)} />
              ))}
            </ThreadSection>
            {threads.length === 0 && (
              <div className="px-5 py-16 text-center">
                <MessageCircle className="mx-auto h-8 w-8 text-zinc-700" />
                <p className="mt-3 text-sm text-zinc-400">Aucune conversation disponible.</p>
              </div>
            )}
          </div>
        </aside>

        <main className={`${mobileThreadOpen ? "flex" : "hidden lg:flex"} min-h-0 min-w-0 flex-col bg-[#080c15]`}>
          {selected ? (
            <>
              <header className="flex h-[76px] shrink-0 items-center gap-3 border-b border-zinc-800 bg-[#0c1220]/95 px-4 backdrop-blur sm:px-6">
                <Button type="button" size="icon" variant="ghost" className="lg:hidden" onClick={() => setMobileThreadOpen(false)} aria-label="Retour aux conversations">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <ThreadAvatar thread={selected} />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-display text-base font-semibold text-zinc-50 sm:text-lg">{selected.label}</h2>
                  <p className="truncate text-xs text-zinc-500">{selected.subtitle}</p>
                </div>
                <div className="hidden items-center gap-2 text-xs text-zinc-500 sm:flex">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Actualisation en direct
                </div>
              </header>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[radial-gradient(circle_at_top,_rgba(198,166,98,0.06),_transparent_35%)] px-4 py-6 sm:px-8">
                {messages.length === 0 && (
                  <div className="mx-auto flex max-w-sm flex-col items-center py-20 text-center animate-in fade-in duration-500">
                    <ThreadAvatar thread={selected} large />
                    <h3 className="mt-4 text-sm font-semibold text-zinc-100">{selected.label}</h3>
                    <p className="mt-2 text-xs leading-5 text-zinc-500">Envoyez votre premier message. Seules les personnes autorisées sur cette entreprise ou ce dossier pourront le consulter.</p>
                  </div>
                )}
                {messages.map((message: any) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    onDownload={selected.kind === "general" && message.attachment_path
                      ? () => downloadAttachment(message.id)
                      : selected.kind === "matter" && message.document_id
                        ? () => downloadMatterDocument(message.document_id)
                        : undefined}
                  />
                ))}
                <div ref={endRef} />
              </div>

              <footer className="shrink-0 border-t border-zinc-800 bg-[#0c1220] p-3 sm:p-4">
                {file && (
                  <div className="mb-2 flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-300 animate-in slide-in-from-bottom-2">
                    <FileText className="h-4 w-4 text-amber-300" />
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <button type="button" onClick={() => setFile(null)} className="text-zinc-500 hover:text-zinc-100" aria-label="Retirer le fichier"><X className="h-4 w-4" /></button>
                  </div>
                )}
                <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950/80 p-1.5 focus-within:border-amber-500/50">
                  <input ref={fileInputRef} type="file" className="hidden" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="shrink-0 text-zinc-400 hover:text-amber-300"
                    onClick={() => fileInputRef.current?.click()}
                    title="Ajouter une pièce jointe"
                    aria-label="Ajouter une pièce jointe"
                  >
                    <Paperclip className="h-5 w-5" />
                  </Button>
                  <Input
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey && (body.trim() || file) && !send.isPending) {
                        event.preventDefault();
                        send.mutate();
                      }
                    }}
                    placeholder="Écrire un message..."
                    className="h-10 flex-1 border-0 bg-transparent px-2 text-zinc-100 shadow-none focus-visible:ring-0"
                  />
                  <Button
                    type="button"
                    size="icon"
                    className="shrink-0 bg-amber-400 text-zinc-950 hover:bg-amber-300"
                    onClick={() => send.mutate()}
                    disabled={send.isPending || (!body.trim() && !file)}
                    title="Envoyer"
                    aria-label="Envoyer"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </footer>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-center text-zinc-500">
              <MessageCircle className="h-10 w-10" />
              <p className="mt-3 text-sm">Sélectionnez une conversation.</p>
            </div>
          )}
        </main>
      </div>
    </section>
  );
}

function ThreadSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">{label}</p>
      <div>{children}</div>
    </div>
  );
}

function ThreadButton({ thread, selected, onSelect }: { thread: Thread; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group mb-1 flex w-full items-center gap-3 rounded-md px-3 py-3 text-left transition-all duration-200 ${
        selected ? "bg-zinc-800/90 shadow-sm" : "hover:bg-zinc-900/80"
      }`}
    >
      <ThreadAvatar thread={thread} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className={`truncate text-sm ${thread.unread ? "font-bold text-zinc-50" : "font-medium text-zinc-200"}`}>{thread.label}</span>
          <span className="shrink-0 text-[10px] text-zinc-600">{formatShortDate(thread.latest?.created_at)}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <span className={`min-w-0 flex-1 truncate text-xs ${thread.unread ? "text-zinc-300" : "text-zinc-500"}`}>
            {thread.latest?.body || thread.latest?.attachment_name || thread.subtitle}
          </span>
          {thread.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.55)]" aria-label="Message non lu" />}
        </span>
      </span>
    </button>
  );
}

function ThreadAvatar({ thread, large = false }: { thread: Thread; large?: boolean }) {
  const initials = thread.label.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  return (
    <Avatar className={`${large ? "h-16 w-16" : "h-11 w-11"} shrink-0 border border-zinc-700 bg-zinc-900`}>
      {thread.logoUrl ? <AvatarImage src={thread.logoUrl} alt="" /> : null}
      <AvatarFallback className="bg-gradient-to-br from-amber-400/20 to-zinc-900 text-amber-300">
        {thread.kind === "matter" ? <Scale className={large ? "h-6 w-6" : "h-4 w-4"} /> : initials || <Building2 className="h-4 w-4" />}
      </AvatarFallback>
    </Avatar>
  );
}

function MessageBubble({ message, onDownload }: { message: any; onDownload?: () => void }) {
  const mine = Boolean(message.mine);
  const attachmentName = message.attachment_name ?? message.matter_documents?.filename ?? null;
  return (
    <div className={`flex animate-in fade-in slide-in-from-bottom-1 duration-300 ${mine ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[86%] sm:max-w-[70%]">
        <p className={`mb-1 px-1 text-[11px] text-zinc-500 ${mine ? "text-right" : "text-left"}`}>
          {mine ? "Vous" : message.author_name || "Équipe Mercer & Stellaria"}
        </p>
        <div className={`px-4 py-2.5 text-sm shadow-md ${mine ? "rounded-[16px_16px_4px_16px] bg-amber-400 text-zinc-950" : "rounded-[16px_16px_16px_4px] border border-zinc-700 bg-zinc-900 text-zinc-100"}`}>
          {message.body ? <p className="whitespace-pre-wrap break-words leading-relaxed">{message.body}</p> : null}
          {attachmentName && (
            <button
              type="button"
              onClick={onDownload}
              disabled={!onDownload}
              className={`mt-2 flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-xs ${mine ? "border-zinc-900/15 bg-white/25" : "border-zinc-700 bg-zinc-950/50"}`}
            >
              <FileText className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{attachmentName}</span>
              {onDownload && <Download className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
        <p className={`mt-1 flex items-center gap-1 px-1 text-[10px] text-zinc-600 ${mine ? "justify-end" : "justify-start"}`}>
          {formatMessageDate(message.created_at)}
          {mine && <CheckCheck className="h-3 w-3 text-amber-400" />}
        </p>
      </div>
    </div>
  );
}

function formatShortDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(date);
  }
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" }).format(date);
}

function formatMessageDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}