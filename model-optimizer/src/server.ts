/** Dashboard HTTP server: the live page, an SSE event stream and the plan as JSON. Uses node:http only. */
import { createServer } from "node:http";
import type { ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { EventBus } from "./events.ts";
import { renderHtml } from "./render/html.ts";
import type { RoutedPlan } from "./types.ts";

export interface DashboardServer {
  url: string;
  close(): Promise<void>;
}

export function startDashboard(opts: {
  plan: RoutedPlan;
  bus: EventBus;
  port?: number;
  host?: string;
}): Promise<DashboardServer> {
  const host = opts.host ?? "127.0.0.1";
  const port = opts.port ?? 4777;
  const clients = new Set<{ res: ServerResponse; stop: () => void }>();

  const server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { allow: "GET, HEAD" }).end();
      return;
    }
    if (path === "/") {
      const body = renderHtml({ plan: opts.plan, live: { eventsUrl: "/events" } });
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" }).end(body);
    } else if (path === "/plan.json") {
      res
        .writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-cache" })
        .end(JSON.stringify(opts.plan));
    } else if (path === "/events") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      });
      res.write(": connected\n\n");
      const send = (e: unknown): void => {
        if (!res.writableEnded) res.write(`data: ${JSON.stringify(e)}\n\n`);
      };
      const unsubscribe = opts.bus.subscribe(send, true);
      const ping = setInterval(() => {
        if (!res.writableEnded) res.write(": ping\n\n");
      }, 15_000);
      ping.unref();
      const client = {
        res,
        stop: () => {
          clearInterval(ping);
          unsubscribe();
          clients.delete(client);
        },
      };
      clients.add(client);
      req.on("close", client.stop);
    } else {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not found");
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      const addr = server.address() as AddressInfo;
      const shownHost = host.includes(":") ? `[${host}]` : host;
      resolve({
        url: `http://${shownHost}:${addr.port}/`,
        close: () =>
          new Promise<void>((done) => {
            for (const c of [...clients]) {
              c.stop();
              c.res.end();
            }
            server.close(() => done());
            server.closeAllConnections();
          }),
      });
    });
  });
}
