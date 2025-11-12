require("dotenv").config();
const express = require("express");
const { Camunda8 } = require("@camunda8/sdk");

const app = express();
app.use(express.json());

const c8 = new Camunda8();
const zeebe = c8.getZeebeGrpcApiClient();

app.post("/evaluate", async (req, res) => {
  try {
    // Normalize incoming payloads into an array of emails
    const emails = Array.isArray(req.body)
      ? req.body.map(item => item.email || item) // handle [{ email: {...} }]
      : [req.body.body || req.body]; // handle { body: {...} } or single object

    if (!emails.length) {
      return res.status(400).json({ error: "No emails found in request body" });
    }

    const results = [];

    for (const email of emails) {
      if (!email || !email.subject || !email.from_?.email) {
        console.warn("⚠️ Skipping invalid email object:", email);
        results.push({
          ok: false,
          error: "Missing required fields: email.from_.email or email.subject",
          email,
        });
        continue;
      }

      const inputVariables = {
        from: email.from_.email,
        subject: email.subject,
        body_text: email.body_text || "",
        attachments: email.attachments || [],
        headers: email.headers || {},
      };

      console.log("📩 Evaluating DMN for:", {
        from: inputVariables.from,
        subject: inputVariables.subject,
      });

      try {
        // --- Evaluate DMN Decision ---
        const result = await zeebe.evaluateDecision({
          decisionId: "dec_email_routing",
          decisionRequirementsId: "defs_email_routing",
          variables: inputVariables,
        });

        console.log("📘 Full DMN evaluation result:");
        console.log(JSON.stringify(result, null, 2));

        // --- Parse DMN output ---
        let decisionOutput = null;
        if (result?.decisionOutput) {
          try {
            decisionOutput = JSON.parse(result.decisionOutput);
          } catch (err) {
            console.warn("⚠️ Could not parse DMN output:", result.decisionOutput);
            decisionOutput = { error: "Failed to parse DMN output", raw: result.decisionOutput };
          }
        } else {
          decisionOutput = { dmn_evaluation: "No output returned by DMN" };
        }

        // --- Build structured response ---
        results.push({
          ok: true,
          email, // original email object
          from: inputVariables.from,
          subject: inputVariables.subject,
          dmn_output: decisionOutput,
          dmn_meta: {
            decisionId: result?.decisionId || null,
            decisionName: result?.decisionName || null,
            decisionDefinitionId: result?.decisionDefinitionId || null,
            decisionRequirementsId: result?.decisionRequirementsId || null,
            tenantId: result?.tenantId || "<default>",
          },
        });
      } catch (dmnErr) {
        console.error("❌ DMN evaluation failed:", dmnErr);
        results.push({
          ok: false,
          email,
          from: inputVariables.from,
          subject: inputVariables.subject,
          error: dmnErr.message || "DMN evaluation failed",
        });
      }
    }

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 DMN evaluator running at http://localhost:${PORT}`);
});
