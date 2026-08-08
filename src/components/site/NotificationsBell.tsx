import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Check, CheckCheck, X } from "lucide-react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  listMyNotifications, unreadNotificationsCount,
  markNotificationRead, markAllNotificationsRead, deleteNotification,
} from "@/lib/notifications.functions";

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const countFn = useServerFn(unreadNotificationsCount);
  const listFn = useServerFn(listMyNotifications);
  const markFn = useServerFn(markNotificationRead);
  const markAllFn = useServerFn(markAllNotificationsRead);
  const deleteFn = useServerFn(deleteNotification);

  const { data: countData } = useQuery({
    queryKey: ["notifications", "count"],
    queryFn: () => countFn({ data: undefined as any }),
    refetchInterval: 60_000,
  });
  const { data: items } = useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () => listFn({ data: { limit: 20 } }),
    enabled: open,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const mark = useMutation({ mutationFn: (id: string) => markFn({ data: { id } }), onSuccess: invalidate });
  const markAll = useMutation({ mutationFn: () => markAllFn({ data: undefined as any }), onSuccess: invalidate });
  const del = useMutation({ mutationFn: (id: string) => deleteFn({ data: { id } }), onSuccess: invalidate });

  const unread = countData?.count ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-gold px-1 text-[10px] font-bold text-navy-deep">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b border-border p-3">
          <div className="font-display font-bold text-navy-deep">Notifications</div>
          {unread > 0 && (
            <Button variant="ghost" size="sm" onClick={() => markAll.mutate()}>
              <CheckCheck className="mr-1 h-4 w-4" />Tout marquer lu
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-96">
          {!items || items.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Aucune notification</p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n: any) => (
                <li
                  key={n.id}
                  className={`group flex items-start gap-2 p-3 text-sm ${n.read_at ? "" : "bg-gold/5"}`}
                >
                  <div className="min-w-0 flex-1">
                    <button
                      className="text-left"
                      onClick={() => {
                        if (!n.read_at) mark.mutate(n.id);
                        if (n.link) { setOpen(false); navigate({ to: n.link }); }
                      }}
                    >
                      <div className="font-medium text-navy-deep">{n.title}</div>
                      {n.body && <div className="text-xs text-muted-foreground line-clamp-2">{n.body}</div>}
                      <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                        {new Date(n.created_at).toLocaleString("fr-FR")}
                      </div>
                    </button>
                  </div>
                  <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!n.read_at && (
                      <button aria-label="Marquer lu" onClick={() => mark.mutate(n.id)}>
                        <Check className="h-4 w-4 text-muted-foreground hover:text-navy" />
                      </button>
                    )}
                    <button aria-label="Supprimer" onClick={() => del.mutate(n.id)}>
                      <X className="h-4 w-4 text-muted-foreground hover:text-red-600" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
