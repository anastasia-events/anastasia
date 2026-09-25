import { Event } from "../../../domain/entities/Event";
import { Subscription } from "../../../domain/entities/Subscription";
import { NotificationStatus } from "../../../domain/value-objects/NotificationStatus";
import { NotificationPort, NotificationResult } from "../../../application/ports/out/NotificationPort";

export interface SendGridConfig {
  apiKey: string;
  fromEmail: string;
}

function buildSubject(event: Event): string {
  return `🎫 ${event.name}: cambió la disponibilidad`;
}

function buildBody(event: Event): string {
  return `Estado: ${event.status}\nRecinto: ${event.venue}`;
}

/** Pega directo a la API REST de SendGrid (sin sumar @sendgrid/mail como dependencia). */
export class SendGridEmailNotifier implements NotificationPort {
  constructor(private readonly config: SendGridConfig) {}

  async send(subscription: Subscription, event: Event): Promise<NotificationResult> {
    try {
      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: subscription.channelTarget }] }],
          from: { email: this.config.fromEmail },
          subject: buildSubject(event),
          content: [{ type: "text/plain", value: buildBody(event) }],
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        return {
          status: NotificationStatus.FAILED,
          errorMessage: `SendGrid API ${response.status}: ${body}`,
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
