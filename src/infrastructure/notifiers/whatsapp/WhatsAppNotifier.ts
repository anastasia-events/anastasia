import { Event } from "../../../domain/entities/Event";
import { Subscription } from "../../../domain/entities/Subscription";
import { NotificationStatus } from "../../../domain/value-objects/NotificationStatus";
import { NotificationPort, NotificationResult } from "../../../application/ports/out/NotificationPort";
import { statusLabel } from "../statusLabel";

export interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
  templateName: string;
  // Código de idioma EXACTO con el que se aprobó la plantilla en Meta
  // ("es", "es_CO", "es_ES"...). Si no coincide, Meta responde #132001.
  templateLanguage?: string;
  apiVersion: string;
  // Se antepone a los celulares locales de 10 dígitos (así se guardan en la
  // base); sin él Meta interpreta otro número y responde #131030.
  defaultCountryCode?: string;
}

function toInternational(target: string, countryCode: string): string {
  const digits = target.replace(/\D/g, "");
  return digits.length === 10 ? `${countryCode}${digits}` : digits;
}

// Los errores de la Cloud API son crípticos; estas pistas van al log de
// [notify] para saber qué tocar sin ir a buscar el código en la doc de Meta.
const ERROR_HINTS: Record<number, string> = {
  131030:
    "el destinatario no está en la lista de autorizados del número de prueba (agregarlo en el panel de Meta → Configuración de la API → \"Para\")",
  132001: "la plantilla o su idioma no existen (revisar WHATSAPP_TEMPLATE_NAME y WHATSAPP_TEMPLATE_LANGUAGE)",
  132000: "la cantidad de parámetros no coincide con la plantilla aprobada",
  190: "el token venció o es inválido (usar un token permanente de Usuario del sistema)",
};

function errorHint(body: string): string | undefined {
  try {
    const code = JSON.parse(body)?.error?.code;
    return typeof code === "number" ? ERROR_HINTS[code] : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Manda un mensaje de plantilla vía la Cloud API de Meta. Un aviso de
 * disponibilidad es business-initiated (no una respuesta dentro de las 24h
 * de una conversación), así que la API RECHAZA texto libre acá — tiene que
 * ser una plantilla ya aprobada en Meta Business Manager. La plantilla
 * aprobada tiene 3 variables en el cuerpo, en este orden: {{1}} evento,
 * {{2}} recinto, {{3}} estado en español. Si se cambia la plantilla, hay
 * que ajustar estos parámetros.
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
              language: { code: this.config.templateLanguage ?? "es" },
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
        const hint = errorHint(body);
        return {
          status: NotificationStatus.FAILED,
          errorMessage: `WhatsApp API ${response.status}: ${body}${hint ? ` — ${hint}` : ""}`,
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
