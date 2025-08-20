import Anthropic from "@anthropic-ai/sdk";

type Complexity = "simple" | "moderate" | "complex";

export class TaskPlanner {
  private anthropic?: Anthropic;

  constructor(apiKey?: string) {
    if (apiKey) {
      this.anthropic = new Anthropic({ apiKey });
    }
  }

  private offlinePlan(userRequest: string, context: any = {}) {
    const text = userRequest.toLowerCase();
    const needsCodeExecution = /(add|modify|create|implement|refactor|fix|rename|delete)\b/.test(text);

    let estimatedComplexity: Complexity = "simple";
    if (/(refactor|integrate|database|migrate|concurrency|auth|oauth|deploy)/.test(text)) {
      estimatedComplexity = "complex";
    } else if (/(install|configure|api|endpoint|typescript|tests|lint)/.test(text) || userRequest.length > 140) {
      estimatedComplexity = "moderate";
    }

    const steps: string[] = [];
    if (needsCodeExecution) {
      steps.push(
        "Review current code and related files",
        "Create a new git branch",
        "Implement changes in small, tested commits",
        "Run existing tests and add new ones if needed",
        "Verify behavior manually and via test-runner",
        "Open a PR with a clear summary"
      );
    } else {
      steps.push(
        "Analyze the request and gather context",
        "Draft a concise, direct response",
        "Include examples or references if useful"
      );
    }

    const safeguards = [
      "Create git commit before changes",
      "Run tests after changes",
      "Avoid unrelated modifications",
      "Request confirmation before deletions or installs"
    ];

    return {
      needsCodeExecution,
      plan: `Plan for: ${userRequest}\n\nContext: ${JSON.stringify(context || {}, null, 2)}\n\nSteps:\n- ${steps.join("\n- ")}`,
      estimatedComplexity,
      safeguards
    } as const;
  }

  async planTask(userRequest: string, context: any = {}): Promise<{
    needsCodeExecution: boolean;
    plan: string;
    estimatedComplexity: Complexity;
    safeguards: string[];
  }> {
    const useOffline = !this.anthropic || process.env.MOCK_PLANNER === "1" || context?.testMode;
    if (useOffline) {
      return this.offlinePlan(userRequest, context);
    }

    const response = await this.anthropic!.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1000,
      system: `You are a senior software architect planning code tasks. Analyze the user's request and determine:

1. Does this need actual code execution/file changes? (vs just answering questions)
2. What's the step-by-step plan?
3. What's the complexity level?
4. What safeguards are needed?

Respond in JSON format:
{
  "needsCodeExecution": boolean,
  "plan": "detailed step-by-step plan",
  "estimatedComplexity": "simple|moderate|complex",
  "safeguards": ["list", "of", "safety", "measures"]
}`,
      messages: [
        {
          role: "user",
          content: `Request: ${userRequest}\n\nContext: ${JSON.stringify(context, null, 2)}`
        }
      ]
    });

    const content = response.content[0];
    if (content.type === "text") {
      try {
        return JSON.parse(content.text);
      } catch {
        return {
          needsCodeExecution: true,
          plan: content.text,
          estimatedComplexity: "moderate" as const,
          safeguards: ["Create git commit before changes", "Run tests after changes"]
        };
      }
    }

    throw new Error("Failed to get planning response");
  }
}
