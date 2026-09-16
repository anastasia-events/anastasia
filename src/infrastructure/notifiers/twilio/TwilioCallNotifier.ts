import { Event } from "../../../domain/entities/Event";
import { Subscription } from "../../../domain/entities/Subscription";
import { NotificationPort, NotificationResult } from "../../../application/ports/out/NotificationPort";
import { NotificationStatus } from "../../../domain/value-objects/NotificationStatus";

/**
 * Stub: implementa el puerto para que NotificationChannel.CALL exista en el
 * dominio y en el resolver de canales desde ya, pero no realiza ninguna
 * llamada real. Queda fuera de alcance del MVP (ver plan, sección 10).
 */
export class TwilioCallNotifier implements NotificationPort {
  async send(_subscription: Subscription, _event: Event): Promise<NotificationResult> {
    return {
      status: NotificationStatus.FAILED,
      errorMessage: "TwilioCallNotifier no está implementado todavía (fuera de alcance del MVP)",
    };
  }
}
