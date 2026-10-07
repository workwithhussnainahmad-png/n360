"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { api } from "@/lib/api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

type Notification = {
  id: number;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
};

/**
 * On-demand notifications: list + unread count load only after the bell opens.
 * No background polling (live updates are not required for this feature).
 */
export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await api.get<{ notifications: Notification[]; unreadCount: number }>("/api/me/notifications");
      return res;
    },
    enabled: open,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await api.patch("/api/me/notifications/read-all", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.patch("/api/me/notifications", { notificationIds: [id] });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const unreadCount = data?.unreadCount ?? 0;
  const notifications = data?.notifications || [];

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5 text-stone-600" />
          {open && unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-brand-500 border-2 border-white" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[min(20rem,calc(100vw-1rem))] p-0" align="end">
        <div className="flex items-center justify-between p-4 border-b">
          <h4 className="font-semibold text-sm">Notifications</h4>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-auto py-1 px-2 text-brand-600 hover:text-brand-700 hover:bg-brand-50"
              onClick={() => markAllReadMutation.mutate()}
            >
              Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-4 sm:p-8 text-center text-sm text-stone-500">No notifications yet</div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={`p-4 border-b last:border-b-0 cursor-pointer transition-colors ${n.isRead ? "bg-white" : "bg-stone-50/50"}`}
                onClick={() => !n.isRead && markAsReadMutation.mutate(n.id)}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="font-medium text-sm text-stone-900">{n.title}</span>
                  {!n.isRead && <span className="h-2 w-2 mt-1.5 rounded-full bg-brand-500 flex-shrink-0" />}
                </div>
                <p className="text-sm text-stone-600 line-clamp-2">{n.message}</p>
                <span className="text-xs text-stone-400 mt-2 block">
                  {new Date(n.createdAt).toLocaleDateString()}{" "}
                  {new Date(n.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
