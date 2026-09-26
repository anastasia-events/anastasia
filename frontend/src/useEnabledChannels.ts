import { useEffect, useState } from "react";
import { fetchEnabledChannels, type Channel } from "./api";

// Canales que el server tiene configurados (ej. WhatsApp queda afuera
// mientras la plantilla no esté aprobada). Hasta que responda, se asume
// solo Telegram, que siempre está.
export function useEnabledChannels(): Set<Channel> {
  const [channels, setChannels] = useState<Set<Channel>>(new Set(["TELEGRAM"]));

  useEffect(() => {
    let cancelled = false;
    fetchEnabledChannels()
      .then((list) => {
        if (!cancelled) setChannels(new Set(list));
      })
      .catch(() => {
        // Sin respuesta: se queda con Telegram solo.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return channels;
}
