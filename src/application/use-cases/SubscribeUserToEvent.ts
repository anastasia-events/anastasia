import { Subscription } from "../../domain/entities/Subscription";
import { NotificationChannel } from "../../domain/value-objects/NotificationChannel";
import { SubscribeUserToEventPort } from "../ports/in/SubscribeUserToEventPort";
import { EventProviderPort } from "../ports/out/EventProviderPort";
import { SubscriptionRepositoryPort } from "../ports/out/SubscriptionRepositoryPort";

export class SubscribeUserToEvent implements SubscribeUserToEventPort {
  constructor(
    private readonly eventProvider: EventProviderPort,
    private readonly subscriptionRepository: SubscriptionRepositoryPort
  ) {}

  async execute(
    userId: string,
    providerEventId: string,
    channel: NotificationChannel,
    channelTarget: string
  ): Promise<Subscription> {
    await this.eventProvider.findEventById(providerEventId);

    const subscription = Subscription.create({
      userId,
      eventId: providerEventId,
      channel,
      channelTarget,
    });

    await this.subscriptionRepository.save(subscription);
    return subscription;
  }
}
