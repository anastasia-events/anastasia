import { Subscription } from "../../../domain/entities/Subscription";
import { NotificationChannel } from "../../../domain/value-objects/NotificationChannel";

export interface SubscribeUserToEventPort {
  execute(
    userId: string,
    providerEventId: string,
    channel: NotificationChannel,
    channelTarget: string
  ): Promise<Subscription>;
}
