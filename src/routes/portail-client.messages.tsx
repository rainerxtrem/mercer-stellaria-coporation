import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Building2, MessageCircle, Scale, Send } from "lucide-react";

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
import { getMyEnterpriseContext, setMyActiveEnterprise } from "@/lib/enterprise.functions";

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
  const qc = useQueryClient();

  const enterpriseContextFn = useServerFn(getMyEnterpriseContext);
  const setActiveEnterpriseFn = useServerFn(setMyActiveEnterprise);
  const mattersFn = useServerFn(listClientMattersPortal);
  const listMatterMessagesFn = useServerFn(listClientMessages);
  const sendMatterMessageFn = useServerFn(sendClientMessage);
  const listGeneralFn = useServerFn(listClientGeneralMessages);
  const sendGeneralFn = useServerFn(sendClientGeneralMessage);
  const markGeneralReadFn = useServerFn(markClientGeneralConversationRead);

  const enterpriseQ = useQuery({ queryKey: ["client-portal", "enterprise-context"], queryFn: () => enterpriseContextFn() });
  const activeFirmId = enterpriseQ.data?.active_firm_id ?? "";

  const mattersQ = useQuery({
    queryKey: ["client-portal", "matters", activeFirmId || "none"],
    queryFn: () => mattersFn(),
    refetchInterval: 12000,
  });

  const [selectedMatterId, setSelectedMatterId] = useState("");
  const [selectedThread, setSelectedThread] = useState<"general" | "matter">("general");
  const [matterBody, setMatterBody] = useState("");
  const [generalBody, setGeneralBody] = useState("");

  useEffect(() => {
    const matters = mattersQ.data ?? [];
    if (selectedMatterId && matters.some((matter: any) => matter.id === selectedMatterId)) return;
    if (matters.length > 0) {
      setSelectedMatterId((matters as any[])[0].id);
      if (selectedThread === "matter") return;
    }
    if (matters.length === 0) setSelectedThread("general");
  }, [mattersQ.data, selectedMatterId, selectedThread]);

  useEffect(() => {
    void markGeneralReadFn();
  }, [markGeneralReadFn]);

  const switchEnterprise = useMutation({
    mutationFn: async (firmId: string) => setActiveEnterpriseFn({ data: { firm_id: firmId } }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["enterprise", "context"] }),
        qc.invalidateQueries({ queryKey: ["client-portal", "enterprise-context"] }),
        qc.invalidateQueries({ queryKey: ["client-portal", "messages", "general"] }),
        qc.invalidateQueries({ queryKey: ["client-portal", "matters"] }),
      ]);
      setSelectedThread("general");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const matterMessagesQ = useQuery({
    queryKey: ["client-portal", "messages", "matter", selectedMatterId || "none", activeFirmId || "none"],
    enabled: Boolean(selectedMatterId) && selectedThread === "matter",
    queryFn: () => listMatterMessagesFn({ data: { matter_id: selectedMatterId } }),
    refetchInterval: 5000,
  });

  const generalQ = useQuery({
    queryKey: ["client-portal", "messages", "general", activeFirmId || "none"],
    queryFn: () => listGeneralFn(),
    refetchInterval: 5000,
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

  const activeEnterprise = useMemo(
    () => (enterpriseQ.data?.enterprises ?? []).find((enterprise: any) => enterprise.firm_id === activeFirmId) ?? null,
    [enterpriseQ.data, activeFirmId],
  );

  const generalLast = generalQ.data?.messages?.[generalQ.data.messages.length - 1] ?? null;
  const matterLastById = useMemo(() => {
    const map = new Map<string, { body: string; created_at: string; author_name?: string | null }>();
    if (selectedMatterId && (matterMessagesQ.data ?? []).length > 0) {
      const last = (matterMessagesQ.data ?? [])[((matterMessagesQ.data ?? []).length ?? 1) - 1] as any;
      map.set(selectedMatterId, {
        body: last?.body ?? "",
        created_at: last?.created_at ?? "",
        author_name: last?.author_name ?? null,
      });
    }
    return map;
  }, [matterMessagesQ.data, selectedMatterId]);

  return (
    <section className="mx-auto w-full max-w-[1400px] px-4 py-6 lg:px-8">
      <div className="grid min-h-[78vh] gap-4 lg:grid-cols-[340px_1fr]">
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-zinc-100">Conversations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Entreprises</p>
              {(enterpriseQ.data?.enterprises ?? []).map((enterprise: any) => {
                const isActive = enterprise.firm_id === activeFirmId;
                return (
                  <button
                    key={enterprise.firm_id}
                    type="button"
                    onClick={() => switchEnterprise.mutate(enterprise.firm_id)}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      isActive
                        ? "border-amber-500/40 bg-amber-500/10"
                        : "border-zinc-800 bg-zinc-950/60 hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <AvatarLabel label={enterprise.name} icon={<Building2 className="h-4 w-4" />} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-100">{enterprise.name}</p>
                        <p className="truncate text-xs text-zinc-400">Conversation générale</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Dossiers</p>
              <button
                type="button"
                onClick={() => setSelectedThread("general")}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  selectedThread === "general"
                    ? "border-amber-500/40 bg-amber-500/10"
                    : "border-zinc-800 bg-zinc-950/60 hover:border-zinc-700"
                }`}
              >
                <div className="flex items-center gap-3">
                  <AvatarLabel label={activeEnterprise?.name ?? "Entreprise"} icon={<MessageCircle className="h-4 w-4" />} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-100">{activeEnterprise?.name ?? "Entreprise"}</p>
                    <p className="truncate text-xs text-zinc-400">
                      {generalLast?.body ? generalLast.body : "Aucun message"}
                    </p>
                  </div>
                  <span className="ml-auto text-[11px] text-zinc-500">{formatDateShort(generalLast?.created_at)}</span>
                </div>
              </button>

              {(mattersQ.data ?? []).map((matter: any) => {
                const isSelected = selectedThread === "matter" && selectedMatterId === matter.id;
                const last = matterLastById.get(matter.id);
                return (
                  <button
                    key={matter.id}
                    type="button"
                    onClick={() => {
                      setSelectedMatterId(matter.id);
                      setSelectedThread("matter");
                    }}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      isSelected
                        ? "border-amber-500/40 bg-amber-500/10"
                        : "border-zinc-800 bg-zinc-950/60 hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <AvatarLabel label={matter.title} icon={<Scale className="h-4 w-4" />} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-100">{matter.title}</p>
                        <p className="truncate text-xs text-zinc-400">{last?.body ?? "Aucun message"}</p>
                      </div>
                      <span className="ml-auto text-[11px] text-zinc-500">{formatDateShort(last?.created_at)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/65">
          <CardHeader>
            <CardTitle className="text-zinc-100">
              {selectedThread === "general"
                ? `Conversation • ${activeEnterprise?.name ?? "Entreprise"}`
                : `Dossier • ${selectedMatter?.title ?? "Conversation"}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-h-[58vh] space-y-2 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
              {selectedThread === "general" ? (
                <>
                  {(generalQ.data?.messages ?? []).length === 0 && (
                    <p className="text-sm text-zinc-400">Aucun message pour le moment.</p>
                  )}
                  {(generalQ.data?.messages ?? []).map((message: any) => (
                    <MessageBubble key={message.id} mine={Boolean(message.mine)} author={message.author_name} body={message.body} date={message.created_at} />
                  ))}
                </>
              ) : (
                <>
                  {(matterMessagesQ.data ?? []).length === 0 && (
                    <p className="text-sm text-zinc-400">Aucun message dans ce dossier.</p>
                  )}
                  {(matterMessagesQ.data ?? []).map((message: any) => (
                    <MessageBubble key={message.id} mine={Boolean(message.mine)} author={message.author_name} body={message.body} date={message.created_at} />
                  ))}
                </>
              )}
            </div>

            <div className="flex gap-2">
              {selectedThread === "general" ? (
                <>
                  <Input
                    value={generalBody}
                    onChange={(event) => setGeneralBody(event.target.value)}
                    placeholder="Envoyer un message à votre entreprise"
                    className="border-zinc-700 bg-zinc-950/70 text-zinc-100"
                  />
                  <Button onClick={() => sendGeneral.mutate()} disabled={sendGeneral.isPending || !generalBody.trim()}>
                    <Send className="mr-1.5 h-4 w-4" />Envoyer
                  </Button>
                </>
              ) : (
                <>
                  <Input
                    value={matterBody}
                    onChange={(event) => setMatterBody(event.target.value)}
                    placeholder="Envoyer un message lié à ce dossier"
                    className="border-zinc-700 bg-zinc-950/70 text-zinc-100"
                  />
                  <Button onClick={() => sendMatter.mutate()} disabled={sendMatter.isPending || !matterBody.trim() || !selectedMatterId}>
                    <Send className="mr-1.5 h-4 w-4" />Envoyer
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function AvatarLabel({ label, icon }: { label: string; icon: ReactNode }) {
  const initials = label
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((token) => token[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-100">
      <span className="text-xs font-semibold">{initials || "MS"}</span>
      <span className="absolute -bottom-1 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-zinc-900 bg-zinc-800 text-zinc-300">
        {icon}
      </span>
    </div>
  );
}

function formatDateShort(value?: string | null) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  } catch {
    return "";
  }
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
