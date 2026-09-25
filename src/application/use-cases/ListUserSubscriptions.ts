import { Subscription } from "../../domain/entities/Subscription";
import { ListUserSubscriptionsPort } from "../ports/in/ListUserSubscriptionsPort";
import { SubscriptionRepositoryPort } from "../ports/out/SubscriptionRepositoryPort";

export class ListUserSubscriptions implements ListUserSubscriptionsPort {
  constructor(private readonly subscriptionRepository: SubscriptionRepositoryPort) {}

  async execute(userId: string): Promise<Subscription[]> {
    return this.subscriptionRepository.findActiveByUserId(userId);
  }
}
