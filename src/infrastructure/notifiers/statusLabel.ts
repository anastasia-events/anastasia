import { EventStatus } from "../../domain/value-objects/EventStatus";

const LABELS: Record<EventStatus, string> = {
  [EventStatus.ONSALE]: "Disponible",
  [EventStatus.OFFSALE]: "No disponible",
  [EventStatus.CANCELLED]: "Cancelado",
  [EventStatus.RESCHEDULED]: "Reprogramado",
};

/** Texto en español del estado, para lo que ve el usuario final en cada canal. */
export function statusLabel(status: EventStatus): string {
  return LABELS[status] ?? status;
}
