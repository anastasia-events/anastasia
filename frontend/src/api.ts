export interface WatchedEvent {
  id: string;
  name: string;
  venue: string;
}

export type Channel = "TELEGRAM" | "WHATSAPP" | "EMAIL";

export interface SubscribedEvent {
  id: string;
  name: string;
  venue: string;
  // subscriptionId por canal activo; un canal ausente = no suscripto por ese medio.
  channels: Partial<Record<Channel, string>>;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Error en ${path}`);
  return res.json();
}

export async function fetchEvents(): Promise<WatchedEvent[]> {
  const res = await fetch("/api/events");
  if (!res.ok) throw new Error("No se pudieron cargar los eventos");
  return res.json();
}

export type TelegramSubscribeResult =
  | { linked: true; subscriptionId: string }
  | { linked: false; token: string; deepLink: string };

export function createTelegramSubscription(
  eventId: string,
  phone: string
): Promise<TelegramSubscribeResult> {
  return postJson("/api/subscriptions/telegram", { eventId, phone });
}

export function createWhatsappSubscription(
  eventId: string,
  phone: string
): Promise<{ subscriptionId: string }> {
  return postJson("/api/subscriptions/whatsapp", { eventId, phone });
}

export function createEmailSubscription(
  eventId: string,
  phone: string,
  email: string
): Promise<{ subscriptionId: string; email: string }> {
  return postJson("/api/subscriptions/email", { eventId, phone, email });
}

export async function fetchSubscriptions(phone: string): Promise<SubscribedEvent[]> {
  const res = await fetch(`/api/subscriptions?phone=${encodeURIComponent(phone)}`);
  if (!res.ok) throw new Error("No se pudieron cargar tus suscripciones");
  return res.json();
}

// El email es un dato de cuenta (uno por usuario) — se usa para prellenarlo
// donde haga falta pedirlo de nuevo, en vez de tipearlo cada vez.
export async function fetchAccountEmail(phone: string): Promise<string | null> {
  const res = await fetch(`/api/users/me?phone=${encodeURIComponent(phone)}`);
  if (!res.ok) throw new Error("No se pudo cargar la cuenta");
  const body = await res.json();
  return body.email ?? null;
}

export async function cancelSubscription(id: string, phone: string): Promise<void> {
  const res = await fetch(`/api/subscriptions/${id}?phone=${encodeURIComponent(phone)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("No se pudo cancelar la suscripción");
}
