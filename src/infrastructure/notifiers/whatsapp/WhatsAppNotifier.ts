import { Event } from "../../../domain/entities/Event";
import { Subscription } from "../../../domain/entities/Subscription";
import { NotificationStatus } from "../../../domain/value-objects/NotificationStatus";
import { NotificationPort, NotificationResult } from "../../../application/ports/out/NotificationPort";
import { statusLabel } from "../statusLabel";

export interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
  templateName: string;
  apiVersion: string;
  // Se antepone a los celulares locales de 10 dígitos (así se guardan en la
  // base); sin él Meta interpreta otro número y responde #131030.
  defaultCountryCode?: string;
}

function toInternational(target: string, countryCode: string): string {
  const digits = target.replace(/\D/g, "");
  return digits.length === 10 ? `${countryCode}${digits}` : digits;
}

/**
 * Manda un mensaje de plantilla vía la Cloud API de Meta. Un aviso de
 * disponibilidad es business-initiated (no una respuesta dentro de las 24h
 * de una conversación), así que la API RECHAZA texto libre acá — tiene que
 * ser una plantilla ya aprobada en Meta Business Manager. Los params y su
 * orden (`WHATSAPP_TEMPLATE_NAME`) hay que ajustarlos para que coincidan
 * exactamente con la plantilla real una vez aprobada — esto es un primer
 * intento razonable con [nombre, recinto, estado en español].
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
            to: toInternational(subscription.channelTarget, this.config.defaultCountryCode ?? "57"),
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
                    { type: "text", text: statusLabel(event.status) },
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
