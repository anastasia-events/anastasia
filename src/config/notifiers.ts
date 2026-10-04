import TelegramBot from "node-telegram-bot-api";
import { NotificationPort } from "../application/ports/out/NotificationPort";
import { NotificationChannel } from "../domain/value-objects/NotificationChannel";
import { BrevoEmailNotifier } from "../infrastructure/notifiers/brevo/BrevoEmailNotifier";
import { TelegramNotifier } from "../infrastructure/notifiers/telegram/TelegramNotifier";
import { TwilioCallNotifier } from "../infrastructure/notifiers/twilio/TwilioCallNotifier";
import { WhatsAppNotifier } from "../infrastructure/notifiers/whatsapp/WhatsAppNotifier";

// Recibe la config por parámetro (y no importa env.ts) para poder testearse
// sin las variables obligatorias del entorno.
export interface NotifiersConfig {
  whatsapp: {
    phoneNumberId?: string;
    accessToken?: string;
    templateName?: string;
    templateLanguage: string;
    apiVersion: string;
    defaultCountryCode: string;
  };
  brevo: {
    apiKey?: string;
    senderEmail?: string;
    senderName: string;
  };
}

interface NotifierContext {
  telegramBot: TelegramBot;
}

interface NotifierRegistration {
  channel: NotificationChannel;
  // undefined = faltan credenciales y el canal no se registra.
  create(config: NotifiersConfig, ctx: NotifierContext): NotificationPort | undefined;
}

// Agregar un canal es agregar una entrada acá. Los opt-in (WhatsApp, email)
// devuelven undefined sin credenciales: NotifySubscribers ya marca FAILED
// cuando no hay adapter, así que el arranque nunca se rompe.
const NOTIFIER_REGISTRATIONS: NotifierRegistration[] = [
  {
    channel: NotificationChannel.TELEGRAM,
    create: (_config, ctx) => new TelegramNotifier(ctx.telegramBot),
  },
  {
    channel: NotificationChannel.CALL,
    create: () => new TwilioCallNotifier(),
  },
  {
    channel: NotificationChannel.WHATSAPP,
    create: ({ whatsapp }) =>
      whatsapp.phoneNumberId && whatsapp.accessToken && whatsapp.templateName
        ? new WhatsAppNotifier({
            phoneNumberId: whatsapp.phoneNumberId,
            accessToken: whatsapp.accessToken,
            templateName: whatsapp.templateName,
            templateLanguage: whatsapp.templateLanguage,
            apiVersion: whatsapp.apiVersion,
            defaultCountryCode: whatsapp.defaultCountryCode,
          })
        : undefined,
  },
  {
    channel: NotificationChannel.EMAIL,
    create: ({ brevo }) =>
      brevo.apiKey && brevo.senderEmail
        ? new BrevoEmailNotifier({
            apiKey: brevo.apiKey,
            senderEmail: brevo.senderEmail,
            senderName: brevo.senderName,
          })
        : undefined,
  },
];

export function buildNotifiers(
  config: NotifiersConfig,
  telegramBot: TelegramBot
): Map<NotificationChannel, NotificationPort> {
  const notifiersByChannel = new Map<NotificationChannel, NotificationPort>();
  for (const registration of NOTIFIER_REGISTRATIONS) {
    const notifier = registration.create(config, { telegramBot });
    if (notifier) notifiersByChannel.set(registration.channel, notifier);
  }
  return notifiersByChannel;
}
