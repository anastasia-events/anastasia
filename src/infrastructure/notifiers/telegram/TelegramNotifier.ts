import TelegramBot from "node-telegram-bot-api";
import { Event } from "../../../domain/entities/Event";
import { Subscription } from "../../../domain/entities/Subscription";
import { NotificationStatus } from "../../../domain/value-objects/NotificationStatus";
import { NotificationPort, NotificationResult } from "../../../application/ports/out/NotificationPort";

function buildMessage(event: Event): string {
  return `🎫 *${event.name}*\nEstado: ${event.status}\nRecinto: ${event.venue}`;
}

export class TelegramNotifier implements NotificationPort {
  constructor(private readonly bot: TelegramBot) {}

  async send(subscription: Subscription, event: Event): Promise<NotificationResult> {
    try {
      await this.bot.sendMessage(subscription.channelTarget, buildMessage(event), {
        parse_mode: "Markdown",
      });
      return { status: NotificationStatus.SENT };
    } catch (error) {
      return {
        status: NotificationStatus.FAILED,
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
