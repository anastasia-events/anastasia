import { Subscription } from "../../../domain/entities/Subscription";
import { NotificationChannel } from "../../../domain/value-objects/NotificationChannel";

export interface SubscriptionRepositoryPort {
  findActiveByEventId(eventId: string): Promise<Subscription[]>;
  findActiveByUserId(userId: string): Promise<Subscription[]>;
  findById(subscriptionId: string): Promise<Subscription | null>;
  findByEventChannelAndTarget(
    eventId: string,
    channel: NotificationChannel,
    channelTarget: string
  ): Promise<Subscription | null>;
  // Propaga un nuevo channelTarget a TODAS las suscripciones existentes de
  // un usuario en ese canal — usado al editar el email de cuenta, para que
  // las suscripciones ya activas no queden apuntando a una dirección vieja.
  updateChannelTargetForUser(
    userId: string,
    channel: NotificationChannel,
    channelTarget: string
  ): Promise<void>;
  save(subscription: Subscription): Promise<void>;
}
