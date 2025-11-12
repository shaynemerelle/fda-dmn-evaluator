require("dotenv").config();
const express = require("express");
const { Camunda8 } = require("@camunda8/sdk");

const app = express();
app.use(express.json());

const c8 = new Camunda8();
const zeebe = c8.getZeebeGrpcApiClient();

app.post("/evaluate", async (req, res) => {
  try {
    const emails = req.body;

    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({
        error: "Expected an array of emails in the request body",
      });
    }

    const results = [];

    for (const item of emails) {
      const email = item.email;

      if (!email || !email.subject || !email.from?.email) {
        console.warn("⚠️ Skipping invalid email object:", email);
        results.push({
          ok: false,
          error: "Missing required fields: email.from.email or email.subject",
        });
        continue;
      }

      const inputVariables = {
        from: email.from.email,
        subject: email.subject,
      };

      console.log("📩 Evaluating DMN for:", inputVariables);

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
          email, // ✅ include the original email object here
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
