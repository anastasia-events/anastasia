import { readFileSync } from "fs";

export interface WatchedTicketmasterConfigEntry {
  id: string;
  name: string;
  venue: string;
  activeFrom?: string;
  activeUntil?: string;
}

export interface WatchedCrowderConfigEntry {
  id: string;
  pageUrl: string;
  name: string;
  venue: string;
  activeFrom?: string;
  activeUntil?: string;
}

export interface WatchedEventsConfig {
  ticketmaster: WatchedTicketmasterConfigEntry[];
  crowder: WatchedCrowderConfigEntry[];
}

/**
 * La lista de eventos observables vive en JSON (no en .env) para poder
 * llevar varios eventos con su info de display sin amontonar variables de
 * entorno separadas por coma.
 */
export function loadWatchedEventsConfig(filePath: string): WatchedEventsConfig {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (error) {
    throw new Error(
      `No se pudo leer el archivo de eventos vigilados (${filePath}): ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  const parsed = JSON.parse(raw);
  return {
    ticketmaster: parsed.ticketmaster ?? [],
    crowder: parsed.crowder ?? [],
  };
}

export function parseOptionalDate(value: string | undefined, context: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Fecha inválida en ${context}: "${value}"`);
  }
  return date;
}
