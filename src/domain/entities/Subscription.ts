import { randomUUID } from "crypto";
import { NotificationChannel } from "../value-objects/NotificationChannel";

export interface SubscriptionProps {
  id: string;
  userId: string;
  eventId: string;
  channel: NotificationChannel;
  channelTarget: string;
  createdAt: Date;
  active: boolean;
}

export class Subscription {
  readonly id: string;
  readonly userId: string;
  readonly eventId: string;
  readonly channel: NotificationChannel;
  readonly channelTarget: string;
  readonly createdAt: Date;
  readonly active: boolean;

  constructor(props: SubscriptionProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.eventId = props.eventId;
    this.channel = props.channel;
    this.channelTarget = props.channelTarget;
    this.createdAt = props.createdAt;
    this.active = props.active;
  }

  static create(params: {
    userId: string;
    eventId: string;
    channel: NotificationChannel;
    channelTarget: string;
  }): Subscription {
    return new Subscription({
      id: randomUUID(),
      userId: params.userId,
      eventId: params.eventId,
      channel: params.channel,
      channelTarget: params.channelTarget,
      createdAt: new Date(),
      active: true,
    });
  }

  deactivate(): Subscription {
    return new Subscription({
      id: this.id,
      userId: this.userId,
      eventId: this.eventId,
      channel: this.channel,
      channelTarget: this.channelTarget,
      createdAt: this.createdAt,
      active: false,
    });
  }

  reactivate(): Subscription {
    return new Subscription({
      id: this.id,
      userId: this.userId,
      eventId: this.eventId,
      channel: this.channel,
      channelTarget: this.channelTarget,
      createdAt: this.createdAt,
      active: true,
    });
  }
}
