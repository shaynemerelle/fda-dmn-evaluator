// tracing.js
"use strict";

const { NodeSDK } = require("@opentelemetry/sdk-node");
const { getNodeAutoInstrumentations } = require("@opentelemetry/auto-instrumentations-node");
const { OTLPTraceExporter } = require("@opentelemetry/exporter-otlp-http");

console.log("🔧 [Tracing] Initializing Honeycomb (traces only)...");

const honeycombApiKey = process.env.HONEYCOMB_API_KEY;
const dataset = process.env.HONEYCOMB_DATASET || "dmn-evaluator";
const tracesEndpoint =
  process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
  "https://api.honeycomb.io/v1/traces";

if (!honeycombApiKey) {
  console.warn(
    "⚠️ [Tracing] HONEYCOMB_API_KEY is NOT set. Traces will not export."
  );
}

const traceExporter = new OTLPTraceExporter({
  url: tracesEndpoint,
  headers: {
    "x-honeycomb-team": honeycombApiKey || "",
    "x-honeycomb-dataset": dataset,
  },
});

const sdk = new NodeSDK({
  traceExporter,
  instrumentations: [getNodeAutoInstrumentations()],
});

try {
  sdk.start();
  console.log("🚀 [Tracing] Honeycomb trace telemetry initialized");
} catch (err) {
  console.error("❌ [Tracing] Failed to start OpenTelemetry SDK:", err);
}

process.on("SIGTERM", async () => {
  console.log("🛑 [Tracing] SIGTERM received, shutting down telemetry...");
  try {
    await sdk.shutdown();
    console.log("✅ [Tracing] Telemetry shut down cleanly");
  } catch (err) {
    console.error("❌ [Tracing] Error during telemetry shutdown:", err);
  } finally {
    process.exit(0);
  }
});
