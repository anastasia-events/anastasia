import { describe, expect, it } from "vitest";
import {
  CrowderEventProvider,
  crowderEventId,
  crowderPageSlug,
} from "../../src/infrastructure/event-providers/crowder/CrowderEventProvider";
import { CrowderPageClient, CrowderPageItem } from "../../src/infrastructure/event-providers/crowder/CrowderPageClient";
import { EventStatus } from "../../src/domain/value-objects/EventStatus";

function fakeClient(items: CrowderPageItem[]): CrowderPageClient {
  return { getItems: async () => items } as unknown as CrowderPageClient;
}

const items: CrowderPageItem[] = [
  { key: "venta-general-02-10", title: "Venta General", description: "02/10 · Bogotá", statusCode: "AVAILABLE" },
];

describe("crowderEventId / crowderPageSlug", () => {
  it("arma el id con el slug de la página para que no choquen ítems de eventos distintos", () => {
    const slug = crowderPageSlug("https://www.ticketmaster.co/event/bts-world-tour-2026");
    expect(slug).toBe("bts-world-tour-2026");
    expect(crowderEventId(slug, "venta-general-02-10")).toBe("crowder:bts-world-tour-2026/venta-general-02-10");
    expect(crowderEventId("otro-show", "venta-general-02-10")).not.toBe(
      crowderEventId(slug, "venta-general-02-10")
    );
  });
});

describe("CrowderEventProvider", () => {
  it("resuelve un id con página y usa nombre/recinto de watched-events.json", async () => {
    const provider = new CrowderEventProvider(
      fakeClient(items),
      new Map([["venta-general-02-10", { name: "BTS — Venta General (02/10)", venue: "Bogotá" }]])
    );

    const event = await provider.findEventById("crowder:bts-world-tour-2026/venta-general-02-10");

    expect(event.status).toBe(EventStatus.ONSALE);
    expect(event.name).toBe("BTS — Venta General (02/10)");
    expect(event.venue).toBe("Bogotá");
  });

  it("sin info de display, cae al título/descripción de la página", async () => {
    const provider = new CrowderEventProvider(fakeClient(items));
    const event = await provider.findEventById("crowder:bts-world-tour-2026/venta-general-02-10");
    expect(event.name).toBe("Venta General");
  });
});
