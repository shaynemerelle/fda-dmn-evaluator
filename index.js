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

    // Handle multiple request body formats
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

    let finalRoute = null;
    try {
      finalRoute = JSON.parse(result?.decisionOutput ?? "null");
    } catch (parseError) {
      console.warn("⚠️ Could not parse decisionOutput:", result?.decisionOutput);
    }

    res.json({ output: finalRoute });
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
