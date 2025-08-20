import { spawn, ChildProcess } from "node:child_process";
import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CodeTask } from "./task-queue";
import { SafetyManager } from "./safety-manager";

export class ClaudeCodeRunner {
  private activeSessions = new Map<string, ChildProcess>();
  private safetyManager = new SafetyManager();

  async runTask(task: CodeTask): Promise<{ success: boolean; output?: string; error?: string; riskAssessment?: any }> {
    console.log(`Starting Claude Code task: ${task.id}`);
    
    try {
      // Safety assessment
      const riskAssessment = this.safetyManager.assessTaskRisk(task.prompt, task.repoPath);
      
      if (riskAssessment.blockedReasons) {
        return {
          success: false,
          error: `Task blocked: ${riskAssessment.blockedReasons.join(', ')}`,
          riskAssessment
        };
      }

      if (!existsSync(task.repoPath)) {
        throw new Error(`Repository path does not exist: ${task.repoPath}`);
      }

      if (!task.context?.testMode && !this.safetyManager.isPathAllowed(task.repoPath)) {
        throw new Error(`Repository path not allowed: ${task.repoPath}`);
      }

      const checkpointPath = join(task.repoPath, '.claude-checkpoint.json');
      writeFileSync(checkpointPath, JSON.stringify({
        taskId: task.id,
        prompt: task.prompt,
        startTime: new Date().toISOString(),
        context: task.context,
        riskAssessment
      }, null, 2));

      // In test mode, simulate a successful run without spawning external tools
      if (task.context?.testMode) {
        return {
          success: true,
          output: `Simulated run for task ${task.id} (testMode). No external processes started.`,
          riskAssessment
        };
      }

      const sessionName = `claude_${task.id}`;
      const output = await this.startClaudeCodeSession(sessionName, task, riskAssessment);
      
      return { success: true, output, riskAssessment };
    } catch (error) {
      console.error(`Task ${task.id} failed:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  private async startClaudeCodeSession(sessionName: string, task: CodeTask, riskAssessment: any): Promise<string> {
    return new Promise((resolve, reject) => {
      const safetyGuidelines = this.safetyManager.generateSafetyGuidelines(riskAssessment);
      
      const progressLog = `${task.repoPath}/.runner-progress-${task.id}.log`;
      const enhancedPrompt = `
TASK: ${task.prompt}

${safetyGuidelines}

VERSION CONTROL WORKFLOW:
- Create a new git branch named "slack/${task.id.substring(0, 8)}" before changes
- Make small, atomic commits with clear messages
- After tests pass locally, push the branch to origin
- If repository has a remote on GitHub, open a Pull Request with a summary
- Never push directly to main; always use a PR

PROGRESS LOGGING:
- Append concise milestone updates to: ${progressLog}
- Include key steps like: planned, editing files, running build, running parity check, branch pushed, PR opened, done.
- Write plain text lines, one event per line.

PR REQUIREMENTS:
- Use the repository's pull request template (if present).
- In the PR description, paste the first ~20 lines from ${progressLog} under a Progress Log section.
- If a parity report is generated, attach links to composite images (compare-*.png) and include the total mismatched pixels.
- Add a Monitoring Links section with the Slack thread URL (if available in context) and tmux session info.

RISK ASSESSMENT:
- Risk Level: ${riskAssessment.riskLevel.toUpperCase()}
- Requires Confirmation: ${riskAssessment.requiresConfirmation ? 'YES' : 'NO'}
${riskAssessment.reasons.length > 0 ? `- Risk Factors: ${riskAssessment.reasons.join(', ')}` : ''}

CONTEXT:
${task.context ? JSON.stringify(task.context, null, 2) : 'No additional context provided'}

Repository: ${task.repoPath}

Please proceed with implementing the requested changes following all safety guidelines above.
      `.trim();

      const child = spawn("bash", ["-c", `
        cd "${task.repoPath}"
        tmux kill-session -t ${sessionName} 2>/dev/null || true
        tmux new-session -d -s ${sessionName} -c "${task.repoPath}" 'claude'
        sleep 2
        tmux send-keys -t ${sessionName} "${enhancedPrompt.replace(/"/g, '\\"')}" C-m
        echo "Claude Code session started: ${sessionName}"
      `], { stdio: ["pipe", "pipe", "pipe"] });

      let output = "";
      child.stdout?.on("data", (data) => output += data.toString());
      child.stderr?.on("data", (data) => output += data.toString());

      child.on("exit", (code) => {
        this.activeSessions.delete(sessionName);
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Process exited with code ${code}: ${output}`));
        }
      });

      this.activeSessions.set(sessionName, child);
      setTimeout(() => resolve(`Session ${sessionName} started. Output: ${output}`), 3000);
    });
  }

  async getSessionStatus(sessionName: string): Promise<'active' | 'inactive'> {
    return new Promise((resolve) => {
      const child = spawn("tmux", ["list-sessions", "-F", "#{session_name}"]);
      let output = "";
      child.stdout?.on("data", (data) => output += data.toString());
      child.on("exit", () => {
        const sessions = output.trim().split('\n');
        resolve(sessions.includes(sessionName) ? 'active' : 'inactive');
      });
    });
  }
}
