import { Subscription } from "../../../domain/entities/Subscription";

export interface SubscriptionRepositoryPort {
  findActiveByEventId(eventId: string): Promise<Subscription[]>;
  save(subscription: Subscription): Promise<void>;
}
