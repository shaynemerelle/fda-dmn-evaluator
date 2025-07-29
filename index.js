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

    // Normalize the input
      inputVariables = 
      req.body.classification ? { classification: req.body.classification } :
      req.body.route ? { classification: req.body.route } :
      req.body.variables?.classification ? { classification: req.body.variables.classification } :
      req.body.variables?.route ? { classification: req.body.variables.route } :
      (() => { throw new Error("Missing 'classification' or 'route' in request body."); })();


    // Evaluate the DMN decision
    const result = await zeebe.evaluateDecision({
      decisionId: "Decision_1eofb53",
      decisionRequirementsId: "Definitions_15ecy0z",
      variables: inputVariables,
    });

    // result.decisionOutput is expected to be a JSON string representing an array
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

    if (!Array.isArray(decisionOutput) || decisionOutput.length === 0) {
      return res.status(404).json({
        error: "No matching rule found in the DMN decision table.",
        input: inputVariables,
      });
    }

    // Return the first matching rule (DMN can return multiple matches in hit policies like 'Collect')
    res.json({
      input: inputVariables,
      output: decisionOutput[0],
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
