export interface WatchedEvent {
  id: string;
  name: string;
  venue: string;
}

export async function fetchEvents(): Promise<WatchedEvent[]> {
  const res = await fetch("/api/events");
  if (!res.ok) throw new Error("No se pudieron cargar los eventos");
  return res.json();
}

export async function createTelegramSubscription(
  eventId: string
): Promise<{ token: string; deepLink: string }> {
  const res = await fetch("/api/subscriptions/telegram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventId }),
  });
  if (!res.ok) throw new Error("No se pudo iniciar la suscripción");
  return res.json();
}
