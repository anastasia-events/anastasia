import { Event } from "../../../domain/entities/Event";
import { Subscription } from "../../../domain/entities/Subscription";
import { NotificationStatus } from "../../../domain/value-objects/NotificationStatus";
import { NotificationPort, NotificationResult } from "../../../application/ports/out/NotificationPort";
import { statusLabel } from "../statusLabel";

export interface BrevoConfig {
  apiKey: string;
  senderEmail: string;
  senderName: string;
}

function buildSubject(event: Event): string {
  return `🎫 ${event.name}: cambió la disponibilidad`;
}

function buildBody(event: Event): string {
  return `Estado: ${statusLabel(event.status)}\nRecinto: ${event.venue}`;
}

/** Pega directo a la API transaccional de Brevo (sin sumar su SDK como dependencia). */
export class BrevoEmailNotifier implements NotificationPort {
  constructor(private readonly config: BrevoConfig) {}

  async send(subscription: Subscription, event: Event): Promise<NotificationResult> {
    try {
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": this.config.apiKey,
          "Content-Type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          sender: { email: this.config.senderEmail, name: this.config.senderName },
          to: [{ email: subscription.channelTarget }],
          subject: buildSubject(event),
          textContent: buildBody(event),
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        return {
          status: NotificationStatus.FAILED,
          errorMessage: `Brevo API ${response.status}: ${body}`,
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
