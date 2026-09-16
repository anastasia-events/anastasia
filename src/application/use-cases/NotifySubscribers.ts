import { Event } from "../../domain/entities/Event";
import { NotificationRecord } from "../../domain/entities/NotificationRecord";
import { NotificationChannel } from "../../domain/value-objects/NotificationChannel";
import { NotificationStatus } from "../../domain/value-objects/NotificationStatus";
import { NotificationPort } from "../ports/out/NotificationPort";
import { SubscriptionRepositoryPort } from "../ports/out/SubscriptionRepositoryPort";

const COST_CENTS_PER_NOTIFICATION = 0;

export class NotifySubscribers {
  constructor(
    private readonly subscriptionRepository: SubscriptionRepositoryPort,
    private readonly notifiersByChannel: Map<NotificationChannel, NotificationPort>
  ) {}

  async execute(eventId: string, event: Event): Promise<NotificationRecord[]> {
    const subscriptions = await this.subscriptionRepository.findActiveByEventId(eventId);
    const records: NotificationRecord[] = [];

    for (const subscription of subscriptions) {
      const notifier = this.notifiersByChannel.get(subscription.channel);
      if (!notifier) {
        records.push(
          NotificationRecord.create({
            subscriptionId: subscription.id,
            eventId,
            channel: subscription.channel,
            status: NotificationStatus.FAILED,
            costCents: 0,
          })
        );
        continue;
      }

      const result = await notifier.send(subscription, event);
      records.push(
        NotificationRecord.create({
          subscriptionId: subscription.id,
          eventId,
          channel: subscription.channel,
          status: result.status,
          costCents: result.status === NotificationStatus.SENT ? COST_CENTS_PER_NOTIFICATION : 0,
        })
      );
    }

    return records;
  }
}
