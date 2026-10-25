import { useQuery } from "@tanstack/react-query";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { useEffect } from "react";
import { Platform } from "react-native";
import { io, type Socket } from "socket.io-client";
import type { MeDto } from "@wasitx/shared";
import { ApiError, WS_URL, get, post, tokens } from "./api";

export function useMe() {
  return useQuery<MeDto | null>({
    queryKey: ["me"],
    queryFn: async () => {
      if (!(await tokens.get())) return null;
      try {
        return await get<MeDto>("/auth/me");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          await tokens.clear();
          return null;
        }
        throw e;
      }
    },
  });
}

/** Registers this device for Expo push (real devices only; needs an EAS project id in production). */
export function usePushRegistration(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !Device.isDevice) return;
    (async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== "granted") return;
      const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
      const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
      await post("/notifications/push-tokens", { token: data, platform: Platform.OS === "ios" ? "ios" : "android" });
    })().catch(() => undefined);
  }, [enabled]);
}

let socket: Socket | null = null;
export async function getSocket(): Promise<Socket> {
  if (socket?.connected) return socket;
  const t = await tokens.get();
  socket?.disconnect();
  socket = io(WS_URL, { transports: ["websocket"], auth: { token: t?.accessToken } });
  return socket;
}
