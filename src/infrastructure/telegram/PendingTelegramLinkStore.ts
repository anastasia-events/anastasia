import { randomUUID } from "crypto";

interface PendingLink {
  eventId: string;
  userId: string;
  createdAt: number;
}

export interface ConsumedLink {
  eventId: string;
  userId: string;
}

/**
 * Puente entre "elegí un evento y me identifiqué con mi celular en la web" y
 * "confirmé por Telegram": el token vive solo el tiempo que tarda el usuario
 * en abrir el deep link y presionar Start, así que un Map en memoria alcanza
 * — no necesita sobrevivir un reinicio del proceso. El userId ya viene
 * resuelto por teléfono desde antes de generar el token, así el bot solo
 * tiene que linkear el chatId a ese usuario, no inventar uno nuevo.
 */
export class PendingTelegramLinkStore {
  private readonly pending = new Map<string, PendingLink>();

  constructor(private readonly ttlMs: number = 15 * 60 * 1000) {}

  create(eventId: string, userId: string): string {
    const token = randomUUID();
    this.pending.set(token, { eventId, userId, createdAt: Date.now() });
    return token;
  }

  consume(token: string): ConsumedLink | null {
    const entry = this.pending.get(token);
    if (!entry) return null;

    this.pending.delete(token);

    if (Date.now() - entry.createdAt > this.ttlMs) {
      return null;
    }

    return { eventId: entry.eventId, userId: entry.userId };
  }
}
