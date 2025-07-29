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

    // Accept either "route" or "classification"
    if (req.body.route) {
      inputVariables = { route: req.body.route };
    } else if (req.body.classification) {
      inputVariables = { classification: req.body.classification };
    } else {
      throw new Error("Missing required input: 'route' or 'classification'.");
    }

    // Evaluate the DMN decision
    const result = await zeebe.evaluateDecision({
      decisionId: "Decision_1eofb53",
      decisionRequirementsId: "Definitions_15ecy0z",
      variables: inputVariables,
    });

    // Log raw result for debugging
    console.log("🎯 Raw decision output:", result?.decisionOutput);

    let decisionOutput = null;
    try {
      decisionOutput = JSON.parse(result?.decisionOutput ?? "null");
    } catch (parseError) {
      console.warn("⚠️ Could not parse decisionOutput:", result?.decisionOutput);
      return res.status(500).json({
        error: "Failed to parse decisionOutput",
        rawOutput: result?.decisionOutput,
      });
    }

    // If Camunda returned a single object instead of array
    if (!Array.isArray(decisionOutput) && typeof decisionOutput === "object") {
      return res.json({
        input: inputVariables,
        output: decisionOutput,
      });
    }

    if (Array.isArray(decisionOutput) && decisionOutput.length > 0) {
      return res.json({
        input: inputVariables,
        output: decisionOutput[0],
      });
    }

    return res.status(200).json({
      message: "DMN evaluated successfully, but no matching rule was found.",
      input: inputVariables,
      rawOutput: result?.decisionOutput,
    });
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
