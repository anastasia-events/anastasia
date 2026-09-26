import crypto from "crypto";
import express, { Express } from "express";

export interface WhatsAppWebhookConfig {
  verifyToken: string;
  appSecret: string;
}

export const WHATSAPP_WEBHOOK_PATH = "/api/webhooks/whatsapp";

function isValidSignature(appSecret: string, rawBody: Buffer, header: string | undefined): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(
    "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")
  );
  const received = Buffer.from(header);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

interface WebhookStatus {
  id?: string;
  status?: string;
  recipient_id?: string;
  errors?: { code?: number; title?: string }[];
}

/**
 * Webhook de la Cloud API de WhatsApp. No hace falta para ENVIAR plantillas,
 * pero es la única forma de enterarse de que una entrega falló (ej. el número
 * no tiene WhatsApp) — por ahora solo se loguea, porque NotificationRecord
 * todavía no se persiste. Se registra antes de express.json() porque la firma
 * X-Hub-Signature-256 se calcula sobre el body crudo.
 */
export function registerWhatsAppWebhook(app: Express, config: WhatsAppWebhookConfig | undefined): void {
  // Handshake de verificación que hace Meta al guardar la URL en el panel.
  app.get(WHATSAPP_WEBHOOK_PATH, (req, res) => {
    if (!config) {
      res.status(404).end();
      return;
    }
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === config.verifyToken && typeof challenge === "string") {
      res.status(200).type("text/plain").send(challenge);
    } else {
      res.status(403).end();
    }
  });

  app.post(WHATSAPP_WEBHOOK_PATH, express.raw({ type: "application/json" }), (req, res) => {
    if (!config) {
      res.status(404).end();
      return;
    }
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!isValidSignature(config.appSecret, rawBody, req.header("x-hub-signature-256"))) {
      res.status(401).end();
      return;
    }

    // Meta reintenta si no recibe 200 rápido: respondemos antes de procesar.
    res.status(200).end();

    let payload: any;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      console.warn("[whatsapp-webhook] payload no es JSON válido");
      return;
    }

    for (const entry of payload?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value ?? {};
        for (const status of (value.statuses ?? []) as WebhookStatus[]) {
          if (status.status === "failed") {
            const errors = (status.errors ?? []).map((e) => `${e.code} ${e.title}`).join("; ");
            console.warn(`[whatsapp-webhook] entrega FALLIDA a ${status.recipient_id} (msg ${status.id}): ${errors}`);
          } else {
            console.log(`[whatsapp-webhook] ${status.status} → ${status.recipient_id} (msg ${status.id})`);
          }
        }
        for (const message of value.messages ?? []) {
          console.log(`[whatsapp-webhook] mensaje entrante de ${message?.from} (tipo ${message?.type})`);
        }
      }
    }
  });
}
