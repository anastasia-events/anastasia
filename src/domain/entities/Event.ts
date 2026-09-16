import { EventStatus } from "../value-objects/EventStatus";

export interface EventProps {
  id: string;
  providerId: string;
  name: string;
  venue: string;
  status: EventStatus;
  onSaleDate: Date | null;
  lastCheckedAt: Date | null;
  lastKnownStatus: EventStatus | null;
}

export class Event {
  readonly id: string;
  readonly providerId: string;
  readonly name: string;
  readonly venue: string;
  readonly status: EventStatus;
  readonly onSaleDate: Date | null;
  readonly lastCheckedAt: Date | null;
  readonly lastKnownStatus: EventStatus | null;

  constructor(props: EventProps) {
    this.id = props.id;
    this.providerId = props.providerId;
    this.name = props.name;
    this.venue = props.venue;
    this.status = props.status;
    this.onSaleDate = props.onSaleDate;
    this.lastCheckedAt = props.lastCheckedAt;
    this.lastKnownStatus = props.lastKnownStatus;
  }
}
