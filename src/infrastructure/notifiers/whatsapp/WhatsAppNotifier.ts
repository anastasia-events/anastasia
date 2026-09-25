import { Event } from "../../../domain/entities/Event";
import { Subscription } from "../../../domain/entities/Subscription";
import { NotificationStatus } from "../../../domain/value-objects/NotificationStatus";
import { NotificationPort, NotificationResult } from "../../../application/ports/out/NotificationPort";

export interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
  templateName: string;
  apiVersion: string;
}

/**
 * Manda un mensaje de plantilla vía la Cloud API de Meta. Un aviso de
 * disponibilidad es business-initiated (no una respuesta dentro de las 24h
 * de una conversación), así que la API RECHAZA texto libre acá — tiene que
 * ser una plantilla ya aprobada en Meta Business Manager. Los params y su
 * orden (`WHATSAPP_TEMPLATE_NAME`) hay que ajustarlos para que coincidan
 * exactamente con la plantilla real una vez aprobada — esto es un primer
 * intento razonable con [nombre, recinto, estado].
 */
export class WhatsAppNotifier implements NotificationPort {
  constructor(private readonly config: WhatsAppConfig) {}

  async send(subscription: Subscription, event: Event): Promise<NotificationResult> {
    try {
      const response = await fetch(
        `https://graph.facebook.com/${this.config.apiVersion}/${this.config.phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: subscription.channelTarget,
            type: "template",
            template: {
              name: this.config.templateName,
              language: { code: "es" },
              components: [
                {
                  type: "body",
                  parameters: [
                    { type: "text", text: event.name },
                    { type: "text", text: event.venue },
                    { type: "text", text: event.status },
                  ],
                },
              ],
            },
          }),
        }
      );

      if (!response.ok) {
        const body = await response.text();
        return {
          status: NotificationStatus.FAILED,
          errorMessage: `WhatsApp API ${response.status}: ${body}`,
        };
      }

      return { status: NotificationStatus.SENT };
    } catch (error) {
      return {
        status: NotificationStatus.FAILED,
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
