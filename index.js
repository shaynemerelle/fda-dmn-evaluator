require("dotenv").config();
const express = require("express");
const { Camunda8 } = require("@camunda8/sdk");

const app = express();
app.use(express.json());

const c8 = new Camunda8();
const zeebe = c8.getZeebeGrpcApiClient();

app.post("/evaluate", async (req, res) => {
  try {
    let inputVariables = {};

    // Flexible input parsing
    if (req.body.variables && typeof req.body.variables.route === "string") {
      inputVariables = { route: req.body.variables.route };
    } else if (req.body.variables?.route?.value) {
      inputVariables = { route: req.body.variables.route.value };
    } else if (req.body.route) {
      inputVariables = { route: req.body.route };
    } else {
      throw new Error("Missing 'route' in request body.");
    }

    const result = await zeebe.evaluateDecision({
      decisionId: "Decision_1eofb53",
      decisionRequirementsId: "Definitions_15ecy0z",
      variables: inputVariables,
    });

    // Safely parse the decision output (Zeebe sometimes stringifies it)
    let decisionOutput = {};
    try {
      decisionOutput = typeof result?.decisionOutput === "string"
        ? JSON.parse(result.decisionOutput)
        : result.decisionOutput;
    } catch (err) {
      console.warn("⚠️ Failed to parse decision output:", result?.decisionOutput);
    }

    // Explicitly extract each output field
    const output = {
      finalRoute: decisionOutput?.finalRoute ?? null,
      fileLocation: decisionOutput?.fileLocation ?? null,
      jiraNeeded: decisionOutput?.jiraNeeded ?? null,
      jiraSummary: decisionOutput?.jiraSummary ?? null,
      jiraAssignee: decisionOutput?.jiraAssignee ?? null,
    };

    res.json({ output });
  } catch (error) {
    console.error("❌ DMN Evaluation failed:", error);
    if (!res.headersSent) {
      res.status(500).json({
        error: error.message,
        details: error.details,
      });
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 DMN evaluator running at http://localhost:${PORT}`);
});
