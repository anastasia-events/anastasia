import { randomUUID } from "crypto";
import { NotificationChannel } from "../value-objects/NotificationChannel";
import { NotificationStatus } from "../value-objects/NotificationStatus";

export interface NotificationRecordProps {
  id: string;
  subscriptionId: string;
  eventId: string;
  sentAt: Date;
  channel: NotificationChannel;
  status: NotificationStatus;
  costCents: number;
}

export class NotificationRecord {
  readonly id: string;
  readonly subscriptionId: string;
  readonly eventId: string;
  readonly sentAt: Date;
  readonly channel: NotificationChannel;
  readonly status: NotificationStatus;
  readonly costCents: number;

  constructor(props: NotificationRecordProps) {
    this.id = props.id;
    this.subscriptionId = props.subscriptionId;
    this.eventId = props.eventId;
    this.sentAt = props.sentAt;
    this.channel = props.channel;
    this.status = props.status;
    this.costCents = props.costCents;
  }

  static create(params: {
    subscriptionId: string;
    eventId: string;
    channel: NotificationChannel;
    status: NotificationStatus;
    costCents: number;
  }): NotificationRecord {
    return new NotificationRecord({
      id: randomUUID(),
      subscriptionId: params.subscriptionId,
      eventId: params.eventId,
      sentAt: new Date(),
      channel: params.channel,
      status: params.status,
      costCents: params.costCents,
    });
  }
}
