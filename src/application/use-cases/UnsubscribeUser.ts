import { UnsubscribeResult, UnsubscribeUserPort } from "../ports/in/UnsubscribeUserPort";
import { SubscriptionRepositoryPort } from "../ports/out/SubscriptionRepositoryPort";

export class UnsubscribeUser implements UnsubscribeUserPort {
  constructor(private readonly subscriptionRepository: SubscriptionRepositoryPort) {}

  async execute(subscriptionId: string, userId: string): Promise<UnsubscribeResult> {
    const subscription = await this.subscriptionRepository.findById(subscriptionId);
    if (!subscription) {
      return { ok: false, reason: "not_found" };
    }
    if (subscription.userId !== userId) {
      return { ok: false, reason: "not_owner" };
    }

    await this.subscriptionRepository.save(subscription.deactivate());
    return { ok: true };
  }
}
