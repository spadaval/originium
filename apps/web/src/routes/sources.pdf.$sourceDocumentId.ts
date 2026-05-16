import { createFileRoute } from "@tanstack/react-router";
import { readWebRuntimeConfig, WebRuntimeConfigError } from "../config.ts";
import { streamSourcePdfResponse } from "../server/source-pdf.ts";

export const Route = createFileRoute("/sources/pdf/$sourceDocumentId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          return await streamSourcePdfResponse(params.sourceDocumentId, readWebRuntimeConfig());
        } catch (error) {
          if (error instanceof WebRuntimeConfigError) {
            return Response.json(
              {
                error: {
                  ...error.failure,
                  operation: "web.source_pdf.stream",
                  input: {
                    sourceDocumentId: params.sourceDocumentId,
                    configName: error.failure.input.name,
                  },
                },
              },
              {
                status: 503,
                headers: {
                  "Cache-Control": "no-store",
                },
              },
            );
          }
          throw error;
        }
      },
    },
  },
});
