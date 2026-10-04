import { describe, expect, it, vi } from "vitest";
import { buildCrowderWatches, buildTicketmasterWatches, EventWatchDeps } from "../../src/config/eventWatchers";
import { NotifySubscribers } from "../../src/application/use-cases/NotifySubscribers";
import { openDatabase } from "../../src/infrastructure/persistence/sqlite/Database";
import { SqliteEventStateRepository } from "../../src/infrastructure/persistence/sqlite/SqliteEventStateRepository";
import { SqliteSubscriptionRepository } from "../../src/infrastructure/persistence/sqlite/SqliteSubscriptionRepository";

// Ventana en el futuro: el scheduler arranca y loguea, pero nunca le pega al
// provider (los tests no hacen llamadas reales a la red).
const FUTURE = new Date(Date.now() + 86_400_000).toISOString();

function createDeps(lines: string[]): EventWatchDeps {
  const db = openDatabase(":memory:");
  const subscriptionRepository = new SqliteSubscriptionRepository(db);
  return {
    eventStateRepository: new SqliteEventStateRepository(db),
    subscriptionRepository,
    notifySubscribers: new NotifySubscribers(subscriptionRepository, new Map()),
    log: (line) => lines.push(line),
  };
}

const PAGE_A = "https://www.ticketmaster.co/event/bts-world-tour-2026";
const PAGE_B = "https://www.ticketmaster.co/event/otro-evento";

describe("buildCrowderWatches", () => {
  it("arma ids globales y un scheduler (y provider) por página", async () => {
    const lines: string[] = [];
    const { schedulers, watchedEvents } = buildCrowderWatches(
      [
        { id: "item-1", pageUrl: PAGE_A, name: "A1", venue: "V", activeFrom: FUTURE },
        { id: "item-2", pageUrl: PAGE_A, name: "A2", venue: "V", activeFrom: FUTURE },
        { id: "item-1", pageUrl: PAGE_B, name: "B1", venue: "V", activeFrom: FUTURE },
      ],
      { pollingIntervalSeconds: 3600, pageCacheTtlSeconds: 60 },
      createDeps(lines)
    );

    expect(watchedEvents.map((e) => e.id)).toEqual([
      "crowder:bts-world-tour-2026/item-1",
      "crowder:bts-world-tour-2026/item-2",
      "crowder:otro-evento/item-1",
    ]);
    // Los ítems de una misma página comparten provider (y por ende el client con caché).
    expect(watchedEvents[0].provider).toBe(watchedEvents[1].provider);
    expect(watchedEvents[0].provider).not.toBe(watchedEvents[2].provider);

    expect(schedulers).toHaveLength(2);
    schedulers.forEach((s) => s.start());
    try {
      await vi.waitFor(() => expect(lines.filter((l) => l.includes("tick #1"))).toHaveLength(2));
    } finally {
      schedulers.forEach((s) => s.stop());
    }
    expect(lines).toContainEqual(expect.stringContaining("[crowder:bts-world-tour-2026] arrancado: 2 evento(s)"));
    expect(lines).toContainEqual(expect.stringContaining("[crowder:otro-evento] arrancado: 1 evento(s)"));
  });

  it("falla al arrancar con una fecha inválida", () => {
    expect(() =>
      buildCrowderWatches(
        [{ id: "item-1", pageUrl: PAGE_A, name: "A1", venue: "V", activeUntil: "no-es-fecha" }],
        { pollingIntervalSeconds: 60, pageCacheTtlSeconds: 60 },
        createDeps([])
      )
    ).toThrow(/Fecha inválida en watched-events.json \(crowder:bts-world-tour-2026\/item-1\)/);
  });
});

describe("buildTicketmasterWatches", () => {
  const config = {
    apiKey: "x",
    client: { maxRequestsPerSecond: 5, requestTimeoutMs: 1000, retryMaxAttempts: 1, retryBaseDelayMs: 1 },
    pollingIntervalSeconds: 15,
  };

  it("sin eventos no crea scheduler", () => {
    expect(buildTicketmasterWatches([], config, createDeps([]))).toEqual({ schedulers: [], watchedEvents: [] });
  });

  it("usa el id crudo de Discovery y comparte un solo scheduler", () => {
    const { schedulers, watchedEvents } = buildTicketmasterWatches(
      [
        { id: "G5abc", name: "Uno", venue: "V" },
        { id: "G5def", name: "Dos", venue: "V" },
      ],
      config,
      createDeps([])
    );
    expect(watchedEvents.map((e) => e.id)).toEqual(["G5abc", "G5def"]);
    expect(schedulers).toHaveLength(1);
  });
});
