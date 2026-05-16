import { createFileRoute } from "@tanstack/react-router";
import { readWebRuntimeConfig } from "../config.ts";
import { checkWebRuntimeHealth } from "../health.ts";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const config = readWebRuntimeConfig();
        const report = await checkWebRuntimeHealth(config);

        return Response.json(report, {
          status: report.status === "failed" ? 503 : 200,
        });
      },
    },
  },
});
