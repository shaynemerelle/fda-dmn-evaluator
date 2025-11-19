// index.js
//
// Simple DMN Email Routing Evaluator (no OTEL)
// -------------------------------------------
// Requires:
//   - .env with Camunda config
//

require("dotenv").config();
const express = require("express");
const { Camunda8 } = require("@camunda8/sdk");

const app = express();
app.use(express.json());

const c8 = new Camunda8();
const zeebe = c8.getZeebeGrpcApiClient();

// ---- Config --------------------------------------------------------------

const DMN_DECISION_ID =
  process.env.DMN_DECISION_ID || "dec_email_routing";
const DMN_REQUIREMENTS_ID =
  process.env.DMN_REQUIREMENTS_ID || "defs_email_routing";

const PORT = process.env.PORT || 3000;

// ---- Helpers ------------------------------------------------------------

/**
 * Normalize request body into an array of emails.
 * Supports:
 *  - [ { ... }, { ... } ]
 *  - { emails: [ ... ] }
 *  - { email: { ... } }
 *  - { ...single email fields... }
 */
function extractEmails(body) {
  if (!body) return [];

  // Case 1: already an array
  if (Array.isArray(body)) {
    return body;
  }

  // Case 2: { emails: [ ... ] }
  if (Array.isArray(body.emails)) {
    return body.emails;
  }

  // Case 3: { email: { ... } }
  if (body.email && typeof body.email === "object") {
    return [body.email];
  }

  // Case 4: body looks like a single email object
  const hasSubject = !!body.subject;
  const hasFrom =
    !!(body.from && body.from.email) ||
    !!(body.from_ && body.from_.email) ||
    !!body.fromEmail;

  if (hasSubject && hasFrom) {
    return [body];
  }

  return [];
}

// ---- Routes ------------------------------------------------------------

app.post("/evaluate", async (req, res) => {
  console.log("==============================================");
  console.log("📥 Incoming request at /evaluate");
  console.log("Timestamp:", new Date().toISOString());
  console.log("Request body:", JSON.stringify(req.body, null, 2));

  try {
    const emails = extractEmails(req.body);

    if (!emails.length) {
      console.warn("⚠️ No emails found in request body");
      return res
        .status(400)
        .json({ error: "No emails found in request body" });
    }

    const results = [];

    for (const [index, email] of emails.entries()) {
      console.log(`\n📨 Processing email #${index + 1}`);

      const fromEmail =
        email?.from?.email ||
        email?.from_?.email ||
        email?.fromEmail ||
        null;
      const subject = email?.subject || null;

      console.log("Email preview:", {
        subject,
        from: fromEmail,
        message_id: email?.message_id,
      });

      // Validate required fields
      if (!fromEmail || !subject) {
        const msg =
          "Missing required fields: email.from.email / email.from_ / email.fromEmail or email.subject";
        console.warn("⚠️ Skipping invalid email object:", msg, email);

        results.push({
          ok: false,
          error: msg,
          email,
        });
        continue;
      }

      const inputVariables = {
        from: fromEmail,
        subject,
        body_text: email.body_text || email.body || "",
        attachments: email.attachments || [],
        headers: email.headers || {},
        to: email.to || [],
        cc: email.cc || [],
        bcc: email.bcc || [],
        message_id: email.message_id || null,
        internet_message_id: email.internet_message_id || null,
      };

      console.log(
        "🔹 DMN evaluation input variables:",
        JSON.stringify(inputVariables, null, 2)
      );

      try {
        // --- Evaluate DMN Decision ---
        const result = await zeebe.evaluateDecision({
          decisionId: DMN_DECISION_ID,
          decisionRequirementsId: DMN_REQUIREMENTS_ID,
          variables: inputVariables,
        });

        console.log("✅ DMN evaluation completed");

        // --- Parse DMN output ---
        let decisionOutput = null;
        if (result?.decisionOutput) {
          try {
            decisionOutput = JSON.parse(result.decisionOutput);
          } catch (err) {
            console.warn(
              "⚠️ Could not parse DMN output:",
              result.decisionOutput
            );
            decisionOutput = {
              error: "Failed to parse DMN output",
              raw: result.decisionOutput,
            };
          }
        } else {
          decisionOutput = { dmn_evaluation: "No output returned by DMN" };
        }

        console.log(
          "📘 DMN output:",
          JSON.stringify(decisionOutput, null, 2)
        );

        results.push({
          classification: decisionOutput,
          confidence: 1,
        });

        console.log(`📝 Email #${index + 1} processed successfully`);
      } catch (dmnErr) {
        console.error("❌ DMN evaluation failed:", dmnErr);
        results.push({
          ok: false,
          email,
          from: fromEmail,
          subject,
          error: dmnErr.message || "DMN evaluation failed",
        });
      }
    }

    console.log("\n📊 Final results summary:");
    console.log(JSON.stringify(results, null, 2));

    res.json({
      evaluated_at: new Date().toISOString(),
      results,
    });
  } catch (error) {
    console.error("❌ Server error:", error);
    res.status(500).json({
      error: error.message || "Internal Server Error",
    });
  }
});

// ---- Wake-up / Healthcheck Route ----------------------------------------

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "DMN evaluator is awake 👋",
    evaluatedDecisionId: DMN_DECISION_ID,
    timestamp: new Date().toISOString(),
    uptime_seconds: process.uptime(),
  });
});

// ---- Start Server -------------------------------------------------------

app.listen(PORT, () => {
  console.log(
    `🚀 DMN evaluator running at http://localhost:${PORT} (decisionId=${DMN_DECISION_ID})`
  );
});
