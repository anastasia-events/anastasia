import { randomUUID } from "crypto";

interface PendingLink {
  eventId: string;
  createdAt: number;
}

/**
 * Puente entre "elegí un evento en la web" y "confirmé por Telegram":
 * el token vive solo el tiempo que tarda el usuario en abrir el deep link
 * y presionar Start, así que un Map en memoria alcanza — no necesita
 * sobrevivir un reinicio del proceso.
 */
export class PendingTelegramLinkStore {
  private readonly pending = new Map<string, PendingLink>();

  constructor(private readonly ttlMs: number = 15 * 60 * 1000) {}

  create(eventId: string): string {
    const token = randomUUID();
    this.pending.set(token, { eventId, createdAt: Date.now() });
    return token;
  }

  consume(token: string): string | null {
    const entry = this.pending.get(token);
    if (!entry) return null;

    this.pending.delete(token);

    if (Date.now() - entry.createdAt > this.ttlMs) {
      return null;
    }

    return entry.eventId;
  }
}
