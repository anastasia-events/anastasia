import { Event } from "../../../domain/entities/Event";
import { Subscription } from "../../../domain/entities/Subscription";
import { NotificationStatus } from "../../../domain/value-objects/NotificationStatus";

export interface NotificationResult {
  status: NotificationStatus;
  errorMessage?: string;
}

export interface NotificationPort {
  send(subscription: Subscription, event: Event): Promise<NotificationResult>;
}
