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

    // Idempotente: reintentar el mismo alta (o togglear on/off/on desde la
    // matriz de "Suscrito a") no debe acumular filas duplicadas. Si ya existe
    // una fila de OTRO usuario para este evento+canal+target (ej. dos
    // teléfonos distintos reusando el mismo email), se ignora y se crea una
    // propia — no se le "roba" la suscripción a otra persona.
    const existing = await this.subscriptionRepository.findByEventChannelAndTarget(
      providerEventId,
      channel,
      channelTarget
    );

    if (existing && existing.userId === userId) {
      const subscription = existing.active ? existing : existing.reactivate();
      if (!existing.active) {
        await this.subscriptionRepository.save(subscription);
      }
      return subscription;
    }

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
