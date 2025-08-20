import express from "express";
import { ClaudeCodeRunner } from './queue-consumer';
import { TaskPlanner } from './planner';
import { CodeTask } from './task-queue';
import { ConfirmationHandler } from './confirmation-handler';
import { randomUUID } from "crypto";
import { SafetyManager } from './safety-manager';
import { spawn } from "node:child_process";
import { mkdirSync, existsSync, writeFileSync, readdirSync, statSync, rmSync } from "node:fs";
import { join } from "node:path";

const app = express();
app.use(express.json());

const runner = new ClaudeCodeRunner();
const planner = new TaskPlanner(process.env.ANTHROPIC_API_KEY);
const confirmationHandler = new ConfirmationHandler();
const safety = new SafetyManager();

app.post('/execute', async (req, res) => {
  try {
    const { request, repoPath, context } = req.body;
    
    if (!request || !repoPath) {
      return res.status(400).json({ 
        error: 'Missing required fields: request, repoPath' 
      });
    }

    console.log('Planning task...');
    const plan = await planner.planTask(request, context);
    
    if (!plan.needsCodeExecution) {
      return res.json({
        type: 'text_response',
        content: plan.plan,
        message: 'This request doesn\'t require code execution'
      });
    }

    const task: CodeTask = {
      id: randomUUID(),
      repoPath,
      prompt: `${plan.plan}\n\nOriginal request: ${request}`,
      context: { ...context, plan, safeguards: plan.safeguards },
      priority: plan.estimatedComplexity === 'complex' ? 'high' : 'medium',
      status: 'pending',
      createdAt: new Date()
    };

    console.log(`Executing task ${task.id}`);
    const result = await runner.runTask(task);

    res.json({
      taskId: task.id,
      plan: plan.plan,
      complexity: plan.estimatedComplexity,
      safeguards: plan.safeguards,
      riskAssessment: result.riskAssessment,
      result,
      sessionName: `claude_${task.id}`,
      instructions: result.success ? 
        `Task started! Monitor with: tmux attach -t claude_${task.id}` :
        'Task failed to start'
    });

  } catch (error) {
    console.error('Error executing task:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Clone a repository and run a task against it
app.post('/clone-and-run', async (req, res) => {
  try {
    const { repoUrl, request, ref, context } = req.body || {};

    if (!repoUrl || !request) {
      return res.status(400).json({
        error: "Missing required fields: repoUrl, request"
      });
    }

    const id = randomUUID();
    const reposDir = join(process.cwd(), "repos");
    const targetDir = join(reposDir, `repo_${id.substring(0, 8)}`);

    mkdirSync(reposDir, { recursive: true });

    // Helper to run a shell command
    const runCmd = (cmd: string, args: string[], cwd?: string) => new Promise<string>((resolve, reject) => {
      const child = spawn(cmd, args, { cwd });
      let output = "";
      let err = "";
      child.stdout?.on("data", d => output += d.toString());
      child.stderr?.on("data", d => err += d.toString());
      child.on("exit", (code) => {
        if (code === 0) resolve(output || err);
        else reject(new Error(`${cmd} ${args.join(" ")} failed (code ${code}): ${err || output}`));
      });
    });

    if (context?.testMode) {
      // In test mode, avoid network: simulate a repo by creating an empty folder with a README
      mkdirSync(targetDir, { recursive: true });
      const readme = `# Simulated Repo\n\nThis directory simulates a cloned repo for testMode.\nSource: ${repoUrl}\nCreated: ${new Date().toISOString()}\n`;
      writeFileSync(join(targetDir, "README.md"), readme);
    } else {
      // Perform actual clone
      await runCmd("git", ["clone", "--depth=1", repoUrl, targetDir]);
      if (ref) {
        await runCmd("git", ["fetch", "--depth=1", "origin", ref], targetDir).catch(() => Promise.resolve(""));
        await runCmd("git", ["checkout", ref], targetDir);
      }
    }

    // Dynamically allow the cloned path
    const cfg = safety.getConfig();
    if (!cfg.allowedPaths.includes(targetDir)) {
      safety.updateConfig({ allowedPaths: [...cfg.allowedPaths, targetDir] });
    }

    console.log('Planning task for cloned repo...');
    const plan = await planner.planTask(request, context);

    if (!plan.needsCodeExecution) {
      return res.json({
        type: 'text_response',
        content: plan.plan,
        message: 'This request doesn\'t require code execution',
        repoPath: targetDir
      });
    }

    const task: CodeTask = {
      id,
      repoPath: targetDir,
      prompt: `${plan.plan}\n\nOriginal request: ${request}`,
      context: { ...context, plan, safeguards: plan.safeguards, repoUrl, ref },
      priority: plan.estimatedComplexity === 'complex' ? 'high' : 'medium',
      status: 'pending',
      createdAt: new Date()
    };

    console.log(`Executing cloned task ${task.id}`);
    const result = await runner.runTask(task);

    res.json({
      taskId: task.id,
      plan: plan.plan,
      complexity: plan.estimatedComplexity,
      safeguards: plan.safeguards,
      riskAssessment: result.riskAssessment,
      result,
      sessionName: `claude_${task.id}`,
      repoPath: targetDir,
      instructions: result.success ?
        `Task started! Monitor with: tmux attach -t claude_${task.id}` :
        'Task failed to start'
    });
  } catch (error) {
    console.error('Error in /clone-and-run:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Delete a previously cloned repo by id (folder name suffix or full repo_<suffix>)
app.delete('/repos/:id', (req, res) => {
  try {
    const { id } = req.params;
    const reposDir = join(process.cwd(), 'repos');
    const dirName = id.startsWith('repo_') ? id : `repo_${id}`;
    const targetPath = join(reposDir, dirName);

    if (!existsSync(targetPath)) {
      return res.status(404).json({ error: `Not found: ${dirName}` });
    }

    rmSync(targetPath, { recursive: true, force: true });

    // Remove from allowlist if present
    const cfg = safety.getConfig();
    if (cfg.allowedPaths.includes(targetPath)) {
      safety.updateConfig({ allowedPaths: cfg.allowedPaths.filter(p => p !== targetPath) });
    }

    res.json({ success: true, removed: dirName });
  } catch (error) {
    console.error('Error deleting repo:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Cleanup repos older than a given age (hours). Default 24h.
app.post('/repos/cleanup', (req, res) => {
  try {
    const { olderThanHours } = req.body || {};
    const thresholdHours = typeof olderThanHours === 'number' && olderThanHours >= 0 ? olderThanHours : 24;
    const result = cleanupReposOlderThan(thresholdHours);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error in /repos/cleanup:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

function cleanupReposOlderThan(thresholdHours: number): { removed: string[]; thresholdHours: number } {
  const now = Date.now();
  const reposDir = join(process.cwd(), 'repos');
  const removed: string[] = [];
  try { mkdirSync(reposDir, { recursive: true }); } catch {}

  for (const name of readdirSync(reposDir, { withFileTypes: true })) {
    if (!name.isDirectory()) continue;
    if (!name.name.startsWith('repo_')) continue;
    const p = join(reposDir, name.name);
    const st = statSync(p);
    const ageHours = (now - st.mtimeMs) / (1000 * 60 * 60);
    if (ageHours >= thresholdHours) {
      rmSync(p, { recursive: true, force: true });
      removed.push(name.name);
      const cfg = safety.getConfig();
      if (cfg.allowedPaths.includes(p)) {
        safety.updateConfig({ allowedPaths: cfg.allowedPaths.filter(x => x !== p) });
      }
    }
  }
  return { removed, thresholdHours };
}

// Confirmation endpoints
app.get('/confirmations', (req, res) => {
  const pending = confirmationHandler.getPendingConfirmations();
  res.json({ pendingConfirmations: pending });
});

app.post('/confirm/:taskId', (req, res) => {
  const { taskId } = req.params;
  const { approved, reason, modifiedInstructions } = req.body;
  
  const handled = confirmationHandler.handleConfirmationResponse(
    taskId, 
    approved, 
    reason, 
    modifiedInstructions
  );
  
  if (handled) {
    res.json({ 
      success: true, 
      message: `Confirmation for task ${taskId} ${approved ? 'approved' : 'denied'}` 
    });
  } else {
    res.status(404).json({ 
      error: `No pending confirmation found for task ${taskId}` 
    });
  }
});

app.delete('/confirm/:taskId', (req, res) => {
  const { taskId } = req.params;
  
  const cancelled = confirmationHandler.cancelConfirmation(taskId);
  
  if (cancelled) {
    res.json({ 
      success: true, 
      message: `Confirmation for task ${taskId} cancelled` 
    });
  } else {
    res.status(404).json({ 
      error: `No pending confirmation found for task ${taskId}` 
    });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Status endpoint with configuration details
app.get('/status', (req, res) => {
  const config = safety.getConfig();
  res.json({
    status: 'ok',
    service: 'agentic-claude-runner',
    timestamp: new Date().toISOString(),
    anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    port: process.env.PORT || 3000,
    safety: {
      allowedPaths: config.allowedPaths,
      blockedPaths: config.blockedPaths,
      maxSessionDuration: config.maxSessionDuration
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Agentic Claude Code Runner listening on port ${PORT}`);
  console.log('🔧 Endpoints:');
  console.log('  POST /execute - Execute a coding task');
  console.log('  POST /clone-and-run - Clone a repo URL and run a task');
  console.log('  DELETE /repos/:id - Remove a cloned repo (repo_<suffix> or <suffix>)');
  console.log('  POST /repos/cleanup - Remove repos older than N hours (default 24h)');
  console.log('  GET /confirmations - List pending confirmations');
  console.log('  POST /confirm/:taskId - Approve/deny a confirmation');
  console.log('  DELETE /confirm/:taskId - Cancel a confirmation');
  console.log('  GET /health - Health check');
});

// Background cleanup based on TTL env var (REPOS_TTL_HOURS)
const TTL_ENV = process.env.REPOS_TTL_HOURS;
const ttlHours = TTL_ENV && !isNaN(parseInt(TTL_ENV, 10)) ? Math.max(0, parseInt(TTL_ENV, 10)) : undefined;
if (ttlHours !== undefined) {
  const intervalMs = 60 * 60 * 1000; // 60 minutes
  console.log(`🧹 Scheduled repo cleanup enabled. TTL=${ttlHours}h, interval=60m.`);
  // Initial run
  try {
    const { removed } = cleanupReposOlderThan(ttlHours);
    if (removed.length) console.log(`🧹 Startup cleanup removed: ${removed.join(', ')}`);
  } catch (e) {
    console.warn('Startup cleanup error:', e instanceof Error ? e.message : e);
  }
  setInterval(() => {
    try {
      const { removed } = cleanupReposOlderThan(ttlHours);
      if (removed.length) console.log(`🧹 Scheduled cleanup removed: ${removed.join(', ')}`);
    } catch (e) {
      console.warn('Scheduled cleanup error:', e instanceof Error ? e.message : e);
    }
  }, intervalMs);
}
