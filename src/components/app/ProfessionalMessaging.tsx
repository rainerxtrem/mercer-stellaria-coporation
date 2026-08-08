/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, BriefcaseBusiness, Building2, MessageCircle, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSession } from "@/lib/auth";
import { listMatterMessages, sendMatterMessage } from "@/lib/matter-messages.functions";
import {
  listProfessionalGeneralMessages,
  listProfessionalMessagingThreads,
  markProfessionalConversationRead,
  sendProfessionalGeneralMessage,
} from "@/lib/professional-messaging.functions";

type Thread = {
  kind: "general" | "matter";
  id: string;
  title: string;
  subtitle: string;
  latest: any | null;
  unread: boolean;
};

export function ProfessionalMessaging() {
  const session = useSession();
  const queryClient = useQueryClient();
  const endRef = useRef<HTMLDivElement>(null);
  const threadsFn = useServerFn(listProfessionalMessagingThreads);
  const generalMessagesFn = useServerFn(listProfessionalGeneralMessages);
  const matterMessagesFn = useServerFn(listMatterMessages);
  const sendGeneralFn = useServerFn(sendProfessionalGeneralMessage);
  const sendMatterFn = useServerFn(sendMatterMessage);
  const markReadFn = useServerFn(markProfessionalConversationRead);

  const threadsQ = useQuery({
    queryKey: ["professional-messaging", "threads"],
    queryFn: () => threadsFn(),
    refetchInterval: 4000,
  });
  const threads = useMemo<Thread[]>(() => {
    const general = (threadsQ.data?.general ?? []).map((conversation: any) => {
      const clientName = [conversation.clients?.last_name, conversation.clients?.first_name]
        .filter(Boolean)
        .join(" ");
      const latest = conversation.latest_message;
      return {
        kind: "general" as const,
        id: conversation.id,
        title: clientName || "Client",
        subtitle: conversation.subject || "Conversation générale",
        latest,
        unread: Boolean(
          latest &&
          latest.author_id !== threadsQ.data?.user_id &&
          (!conversation.staff_last_read_at || latest.created_at > conversation.staff_last_read_at),
        ),
      };
    });
    const matters = (threadsQ.data?.matters ?? []).map((matter: any) => ({
      kind: "matter" as const,
      id: matter.id,
      title:
        [matter.clients?.last_name, matter.clients?.first_name].filter(Boolean).join(" ") ||
        matter.title,
      subtitle: `${matter.number || "Dossier"} · ${matter.title}`,
      latest: matter.latest_message,
      unread: false,
    }));
    return [...general, ...matters].sort((a, b) =>
      String(b.latest?.created_at ?? "").localeCompare(String(a.latest?.created_at ?? "")),
    );
  }, [threadsQ.data]);

  const [selectedKey, setSelectedKey] = useState("");
  const [body, setBody] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    if (!selectedKey && threads[0]) setSelectedKey(`${threads[0].kind}:${threads[0].id}`);
  }, [selectedKey, threads]);
  const selected = threads.find((thread) => `${thread.kind}:${thread.id}` === selectedKey) ?? null;

  const generalQ = useQuery({
    queryKey: [
      "professional-messaging",
      "general",
      selected?.kind === "general" ? selected.id : "none",
    ],
    enabled: selected?.kind === "general",
    queryFn: () => generalMessagesFn({ data: { conversation_id: selected!.id } }),
    refetchInterval: 2500,
  });
  const matterQ = useQuery({
    queryKey: [
      "professional-messaging",
      "matter",
      selected?.kind === "matter" ? selected.id : "none",
    ],
    enabled: selected?.kind === "matter",
    queryFn: () => matterMessagesFn({ data: { matter_id: selected!.id } }),
    refetchInterval: 2500,
  });
  const messages = selected?.kind === "general" ? (generalQ.data ?? []) : (matterQ.data ?? []);

  useEffect(() => {
    if (selected?.kind !== "general") return;
    void markReadFn({ data: { conversation_id: selected.id } }).then(() =>
      queryClient.invalidateQueries({ queryKey: ["professional-messaging", "threads"] }),
    );
  }, [markReadFn, queryClient, selected]);
  useEffect(() => endRef.current?.scrollIntoView({ block: "end" }), [messages.length, selectedKey]);

  const send = useMutation({
    mutationFn: async () => {
      if (!selected || !body.trim()) return;
      if (selected.kind === "general") {
        await sendGeneralFn({ data: { conversation_id: selected.id, body: body.trim() } });
      } else {
        await sendMatterFn({
          data: { matter_id: selected.id, body: body.trim(), internal: false },
        });
      }
    },
    onSuccess: async () => {
      setBody("");
      await queryClient.invalidateQueries({ queryKey: ["professional-messaging"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function selectThread(thread: Thread) {
    setSelectedKey(`${thread.kind}:${thread.id}`);
    setMobileOpen(true);
    setBody("");
  }

  return (
    <section className="flex h-[calc(100dvh-3.5rem)] min-h-0 p-2 sm:p-4 lg:p-6">
      <div className="grid min-h-0 w-full overflow-hidden rounded-lg border bg-card shadow-lg lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside
          className={`${mobileOpen ? "hidden lg:flex" : "flex"} min-h-0 flex-col border-r bg-muted/20`}
        >
          <header className="border-b px-5 py-5">
            <p className="text-xs font-semibold uppercase text-gold">Espace professionnel</p>
            <h1 className="mt-1 font-display text-2xl font-semibold">Messagerie</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Échanges clients et dossiers de l’entreprise active
            </p>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {threads.map((thread) => (
              <button
                key={`${thread.kind}:${thread.id}`}
                type="button"
                onClick={() => selectThread(thread)}
                className={`mb-1 flex w-full items-center gap-3 rounded-md p-3 text-left transition ${selectedKey === `${thread.kind}:${thread.id}` ? "bg-secondary" : "hover:bg-secondary/60"}`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-background text-navy">
                  {thread.kind === "general" ? (
                    <Building2 className="h-4 w-4" />
                  ) : (
                    <BriefcaseBusiness className="h-4 w-4" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{thread.title}</span>
                    {thread.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-gold" />}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {thread.latest?.body || thread.subtitle}
                  </span>
                </span>
              </button>
            ))}
            {!threadsQ.isLoading && threads.length === 0 && (
              <p className="px-5 py-12 text-center text-sm text-muted-foreground">
                Aucune conversation disponible.
              </p>
            )}
          </div>
        </aside>

        <main className={`${mobileOpen ? "flex" : "hidden lg:flex"} min-h-0 min-w-0 flex-col`}>
          {selected ? (
            <>
              <header className="flex h-[76px] shrink-0 items-center gap-3 border-b px-4 sm:px-6">
                <Button
                  size="icon"
                  variant="ghost"
                  className="lg:hidden"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Retour"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-navy">
                  <MessageCircle className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate font-display text-lg font-semibold">{selected.title}</h2>
                  <p className="truncate text-xs text-muted-foreground">{selected.subtitle}</p>
                </div>
              </header>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/10 px-4 py-6 sm:px-8">
                {messages.map((message: any) => {
                  const mine = message.author_id === session?.user.id;
                  return (
                    <div
                      key={message.id}
                      className={`flex ${mine ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[82%] rounded-lg px-4 py-3 text-sm ${mine ? "bg-navy text-white" : "border bg-card"}`}
                      >
                        {!mine && (
                          <p className="mb-1 text-[11px] font-semibold text-gold">
                            {message.author_name || selected.title}
                          </p>
                        )}
                        <p className="whitespace-pre-wrap break-words">{message.body}</p>
                        {message.attachment_name && (
                          <p className="mt-2 text-xs opacity-70">
                            Pièce jointe : {message.attachment_name}
                          </p>
                        )}
                        <p
                          className={`mt-1 text-[10px] ${mine ? "text-white/60" : "text-muted-foreground"}`}
                        >
                          {new Date(message.created_at).toLocaleString("fr-FR")}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {messages.length === 0 && (
                  <p className="py-16 text-center text-sm text-muted-foreground">
                    Aucun message. Commencez la conversation.
                  </p>
                )}
                <div ref={endRef} />
              </div>
              <footer className="shrink-0 border-t p-3 sm:p-4">
                <div className="flex items-center gap-2 rounded-lg border bg-background p-1.5">
                  <Input
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && body.trim() && !send.isPending) {
                        event.preventDefault();
                        send.mutate();
                      }
                    }}
                    placeholder="Écrire un message..."
                    className="border-0 shadow-none focus-visible:ring-0"
                  />
                  <Button
                    size="icon"
                    onClick={() => send.mutate()}
                    disabled={!body.trim() || send.isPending}
                    aria-label="Envoyer"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </footer>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Sélectionnez une conversation.
            </div>
          )}
        </main>
      </div>
    </section>
  );
}
