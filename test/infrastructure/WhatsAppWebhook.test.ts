import crypto from "crypto";
import type { AddressInfo } from "net";
import type { Server } from "http";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { registerWhatsAppWebhook, WhatsAppWebhookConfig } from "../../src/infrastructure/http/whatsappWebhook";

const config: WhatsAppWebhookConfig = { verifyToken: "mi-token", appSecret: "secreto" };
let server: Server | undefined;

async function start(webhookConfig: WhatsAppWebhookConfig | undefined): Promise<string> {
  const app = express();
  registerWhatsAppWebhook(app, webhookConfig);
  server = app.listen(0);
  await new Promise((resolve) => server!.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}/api/webhooks/whatsapp`;
}

function sign(body: string, secret = config.appSecret): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
}

afterEach(() => {
  server?.close();
  server = undefined;
});

describe("GET /api/webhooks/whatsapp (verificación de Meta)", () => {
  it("devuelve el challenge si el verify token coincide", async () => {
    const url = await start(config);
    const res = await fetch(`${url}?hub.mode=subscribe&hub.verify_token=mi-token&hub.challenge=12345`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("12345");
  });

  it("responde 403 si el verify token no coincide", async () => {
    const url = await start(config);
    const res = await fetch(`${url}?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=12345`);
    expect(res.status).toBe(403);
  });

  it("responde 404 si el webhook no está configurado", async () => {
    const url = await start(undefined);
    const res = await fetch(`${url}?hub.mode=subscribe&hub.verify_token=mi-token&hub.challenge=1`);
    expect(res.status).toBe(404);
  });
});

describe("POST /api/webhooks/whatsapp", () => {
  const body = JSON.stringify({
    entry: [{ changes: [{ value: { statuses: [{ id: "wamid.1", status: "failed", recipient_id: "573000000000", errors: [{ code: 131026, title: "Message undeliverable" }] }] } }] }],
  });

  it("acepta un payload con firma válida", async () => {
    const url = await start(config);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Hub-Signature-256": sign(body) },
      body,
    });
    expect(res.status).toBe(200);
  });

  it("rechaza un payload con firma inválida", async () => {
    const url = await start(config);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Hub-Signature-256": sign(body, "otro-secreto") },
      body,
    });
    expect(res.status).toBe(401);
  });
});
