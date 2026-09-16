import { CheckEventAvailabilityPort } from "../../application/ports/in/CheckEventAvailabilityPort";

export interface WatchedEvent {
  id: string;
  // Ventana activa opcional: fuera de ella, el scheduler ni siquiera llama
  // al provider (evita pegarle a un sitio con protección anti-bot fuera de
  // las fechas en que de verdad importa vigilarlo).
  activeFrom?: Date;
  activeUntil?: Date;
}

function isActive(item: WatchedEvent, now: Date): boolean {
  if (item.activeFrom && now < item.activeFrom) return false;
  if (item.activeUntil && now > item.activeUntil) return false;
  return true;
}

export class PollingScheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly watchedEvents: WatchedEvent[],
    private readonly intervalSeconds: number,
    private readonly checkEventAvailability: CheckEventAvailabilityPort
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.intervalSeconds * 1000);
    void this.tick();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    // Evita ticks superpuestos si una vuelta anterior todavía no terminó
    // (ej. porque el rate limit de Ticketmaster obligó a esperar).
    if (this.running) return;
    this.running = true;

    const now = new Date();
    for (const item of this.watchedEvents) {
      if (!isActive(item, now)) continue;

      try {
        const result = await this.checkEventAvailability.execute(item.id);
        if (result.changed) {
          console.log(`[scheduler] ${item.id} cambió de estado -> ${result.newStatus}`);
        }
      } catch (error) {
        console.error(`[scheduler] error revisando ${item.id}:`, error);
      }
    }

    this.running = false;
  }
}
