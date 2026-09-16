const BASE_URL = "https://app.ticketmaster.com/discovery/v2";

export interface TicketmasterApiClientOptions {
  maxRequestsPerSecond: number;
  requestTimeoutMs: number;
  retryMaxAttempts: number;
  retryBaseDelayMs: number;
}

export interface TicketmasterEventDto {
  id: string;
  name: string;
  dates: {
    status: { code: string };
    start?: { dateTime?: string };
  };
  _embedded?: {
    venues?: Array<{ name: string }>;
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Cliente HTTP para la Discovery API de Ticketmaster. Aplica un espaciado
 * mínimo entre requests (rate limit configurable) y reintentos con backoff
 * exponencial ante 429/5xx, porque la cuota del tier gratuito es fácil de
 * agotar si varios eventos se consultan en el mismo tick del scheduler.
 */
export class TicketmasterApiClient {
  private lastRequestAt = 0;

  constructor(
    private readonly apiKey: string,
    private readonly options: TicketmasterApiClientOptions
  ) {}

  async getEvent(providerEventId: string): Promise<TicketmasterEventDto> {
    return this.requestWithRetry(`/events/${encodeURIComponent(providerEventId)}.json`);
  }

  private async requestWithRetry<T>(path: string, attempt = 1): Promise<T> {
    await this.throttle();

    const url = `${BASE_URL}${path}?apikey=${this.apiKey}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.requestTimeoutMs);

    try {
      const response = await fetch(url, { signal: controller.signal });

      if (response.status === 429 || response.status >= 500) {
        if (attempt >= this.options.retryMaxAttempts) {
          throw new Error(`Ticketmaster respondió ${response.status} tras ${attempt} intentos`);
        }
        const backoffMs = this.options.retryBaseDelayMs * 2 ** (attempt - 1);
        await sleep(backoffMs);
        return this.requestWithRetry<T>(path, attempt + 1);
      }

      if (!response.ok) {
        throw new Error(`Ticketmaster respondió ${response.status} para ${path}`);
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async throttle(): Promise<void> {
    const minIntervalMs = 1000 / this.options.maxRequestsPerSecond;
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < minIntervalMs) {
      await sleep(minIntervalMs - elapsed);
    }
    this.lastRequestAt = Date.now();
  }
}
