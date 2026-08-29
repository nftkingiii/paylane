import { createServer } from "node:http";
import type { ShortLinkStore } from "./shortlinks.ts";

export function startServer(store: ShortLinkStore, port = Number(process.env.PORT ?? "3000")): void {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (request.method === "GET" && url.pathname === "/healthz") {
      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      return void response.end(JSON.stringify({ ok: true, service: "paylane-bot", revision: process.env.PAYLANE_REVISION ?? "unknown" }));
    }
    const match = request.method === "GET" ? url.pathname.match(/^\/p\/([2-9A-HJ-NP-Z]{8})$/) : null;
    if (match) {
      const target = store.resolve(match[1]);
      if (target) {
        response.writeHead(302, { location: target, "cache-control": "no-store", "referrer-policy": "no-referrer" });
        return void response.end();
      }
    }
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
    response.end("This Paylane payment link is invalid or expired.");
  });
  server.listen(port, "0.0.0.0", () => console.log(`Paylane short-link server is listening on port ${port}.`));
}
