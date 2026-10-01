import { useEffect, useState } from "react";
import { fetchEnabledChannels, type Channel } from "./api";
import { usePhoneSession } from "./PhoneSession";

// Canales que el server tiene configurados (ej. WhatsApp queda afuera
// mientras la plantilla no esté aprobada) y que puede usar el celular de la
// sesión (WhatsApp solo para TEST_WAPP_NUMBERS) — por eso se vuelve a pedir
// cuando cambia el celular. Hasta que responda, se asume solo Telegram, que
// siempre está.
export function useEnabledChannels(): Set<Channel> {
  const { phone } = usePhoneSession();
  const [channels, setChannels] = useState<Set<Channel>>(new Set(["TELEGRAM"]));

  useEffect(() => {
    let cancelled = false;
    fetchEnabledChannels(phone)
      .then((list) => {
        if (!cancelled) setChannels(new Set(list));
      })
      .catch(() => {
        // Sin respuesta: se queda con lo último que tenía.
      });
    return () => {
      cancelled = true;
    };
  }, [phone]);

  return channels;
}
