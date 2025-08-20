#!/bin/bash
# setup-agentic-runner.sh - Complete setup script for the agentic runner

set -e  # Exit on any error

echo "🚀 Setting up Agentic Claude Code Runner..."

# Check if we're in the right directory
if [ ! -d "$(pwd)" ]; then
    echo "❌ Current directory not accessible"
    exit 1
fi

CURRENT_DIR=$(pwd)
echo "📁 Setting up in: $CURRENT_DIR"

# Check prerequisites
echo "🔍 Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found! Please install Node.js first."
    exit 1
fi

# Check npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm not found! Please install npm first."
    exit 1
fi

# Check tmux
if ! command -v tmux &> /dev/null; then
    echo "❌ tmux not found! Installing..."
    if command -v apt &> /dev/null; then
        sudo apt update && sudo apt install -y tmux
    elif command -v yum &> /dev/null; then
        sudo yum install -y tmux
    elif command -v pacman &> /dev/null; then
        sudo pacman -S tmux
    else
        echo "❌ Please install tmux manually for your system"
        exit 1
    fi
fi

echo "✅ Prerequisites check passed"

# Create directory structure
echo "📁 Creating directory structure..."
mkdir -p services/runner
mkdir -p scripts
mkdir -p logs

# Create package.json
echo "📦 Creating package.json..."
cat > package.json << 'EOF'
{
  "name": "agentic-claude-runner",
  "version": "1.0.0",
  "description": "Agentic Claude Code runner with MCP integration",
  "main": "dist/main.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/main.js",
    "dev": "ts-node services/runner/main.ts",
    "setup": "npm run build && npm run setup:mcp",
    "setup:mcp": "node scripts/setup-mcp.js"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.24.0",
    "express": "^4.18.0",
    "typescript": "^5.0.0",
    "ts-node": "^10.9.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/express": "^4.17.0"
  },
  "keywords": ["claude", "ai", "automation", "mcp"],
  "author": "Your Name",
  "license": "MIT"
}
EOF

# Create TypeScript config
echo "⚙️ Creating TypeScript configuration..."
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": [
    "services/**/*",
    "scripts/**/*"
  ],
  "exclude": [
    "node_modules",
    "dist"
  ]
}
EOF

# Create environment example
echo "🔐 Creating environment configuration..."
cat > .env.example << 'EOF'
# Anthropic API Key (required)
ANTHROPIC_API_KEY=your_api_key_here

# Server configuration
PORT=3000
NODE_ENV=development

# Default repository paths (optional)
DEFAULT_REPO_PATH=/home/$(whoami)/projects

# Logging level
LOG_LEVEL=info

# Safety settings
REQUIRE_CONFIRMATION_FOR_DESTRUCTIVE_OPS=true
MAX_CONCURRENT_SESSIONS=5
EOF

# Create main TypeScript files
echo "📝 Creating main application files..."

# Task queue interface
cat > services/runner/task-queue.ts << 'EOF'
export interface CodeTask {
  id: string;
  repoPath: string;
  prompt: string;
  context?: any;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
  result?: string;
  error?: string;
}
EOF

# Planner
cat > services/runner/planner.ts << 'EOF'
import Anthropic from "@anthropic-ai/sdk";

export class TaskPlanner {
  private anthropic: Anthropic;

  constructor(apiKey: string) {
    this.anthropic = new Anthropic({ apiKey });
  }

  async planTask(userRequest: string, context: any = {}): Promise<{
    needsCodeExecution: boolean;
    plan: string;
    estimatedComplexity: 'simple' | 'moderate' | 'complex';
    safeguards: string[];
  }> {
    const response = await this.anthropic.messages.create({
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
    if (content.type === 'text') {
      try {
        return JSON.parse(content.text);
      } catch {
        return {
          needsCodeExecution: true,
          plan: content.text,
          estimatedComplexity: 'moderate' as const,
          safeguards: ['Create git commit before changes', 'Run tests after changes']
        };
      }
    }

    throw new Error('Failed to get planning response');
  }
}
EOF

# Queue consumer (simplified for initial setup)
cat > services/runner/queue-consumer.ts << 'EOF'
import { spawn, ChildProcess } from "node:child_process";
import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CodeTask } from "./task-queue";

export class ClaudeCodeRunner {
  private activeSessions = new Map<string, ChildProcess>();

  async runTask(task: CodeTask): Promise<{ success: boolean; output?: string; error?: string }> {
    console.log(`Starting Claude Code task: ${task.id}`);
    
    try {
      if (!existsSync(task.repoPath)) {
        throw new Error(`Repository path does not exist: ${task.repoPath}`);
      }

      const checkpointPath = join(task.repoPath, '.claude-checkpoint.json');
      writeFileSync(checkpointPath, JSON.stringify({
        taskId: task.id,
        prompt: task.prompt,
        startTime: new Date().toISOString(),
        context: task.context
      }, null, 2));

      const sessionName = `claude_${task.id}`;
      const output = await this.startClaudeCodeSession(sessionName, task);
      
      return { success: true, output };
    } catch (error) {
      console.error(`Task ${task.id} failed:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  private async startClaudeCodeSession(sessionName: string, task: CodeTask): Promise<string> {
    return new Promise((resolve, reject) => {
      const enhancedPrompt = `
TASK: ${task.prompt}

SAFETY GUIDELINES:
- Always create a git commit before making significant changes
- Run tests before and after changes to ensure nothing breaks
- If you need to delete files, ask for confirmation first
- Make small, focused changes and test incrementally

CONTEXT:
${task.context ? JSON.stringify(task.context, null, 2) : 'No additional context provided'}

Repository: ${task.repoPath}

Please proceed with implementing the requested changes following best practices.
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
EOF

# Main application
cat > services/runner/main.ts << 'EOF'
import express from 'express';
import { ClaudeCodeRunner } from './queue-consumer';
import { TaskPlanner } from './planner';
import { CodeTask } from './task-queue';
import { randomUUID } from 'crypto';

const app = express();
app.use(express.json());

const runner = new ClaudeCodeRunner();
const planner = new TaskPlanner(process.env.ANTHROPIC_API_KEY!);

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

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Agentic Claude Code Runner listening on port ${PORT}`);
  console.log('🔧 Endpoints:');
  console.log('  POST /execute - Execute a coding task');
  console.log('  GET /health - Health check');
});
EOF

# Create setup script
cat > scripts/setup-mcp.js << 'EOF'
const fs = require('fs');
const path = require('path');
const os = require('os');

function setupMCPConfig() {
  console.log('🔧 Setting up MCP configuration...');
  
  const mcpConfig = {
    "mcpServers": {
      "filesystem": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", process.env.DEFAULT_REPO_PATH || "/tmp"],
        "env": { "NODE_ENV": "production" }
      },
      "git": {
        "command": "npx", 
        "args": ["-y", "@modelcontextprotocol/server-git"],
        "env": { "NODE_ENV": "production" }
      },
      "shell": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-shell"],
        "env": { "NODE_ENV": "production" }
      }
    }
  };

  const configDir = path.join(os.homedir(), '.config', 'claude-code');
  const configPath = path.join(configDir, 'mcp.json');
  
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  
  fs.writeFileSync(configPath, JSON.stringify(mcpConfig, null, 2));
  console.log(`✅ MCP configuration written to: ${configPath}`);
}

if (require.main === module) {
  setupMCPConfig();
}

module.exports = { setupMCPConfig };
EOF

# Create monitoring script
cat > scripts/monitor-sessions.sh << 'EOF'
#!/bin/bash
echo "🔍 Active Claude Code sessions:"
echo "================================"

tmux list-sessions 2>/dev/null | grep "claude_" | while read session; do
    session_name=$(echo "$session" | cut -d: -f1)
    echo "📝 Session: $session_name"
    echo "   Attach: tmux attach -t $session_name"
    echo "   Kill: tmux kill-session -t $session_name"
    echo ""
done

if [ $? -ne 0 ]; then
    echo "ℹ️  No active Claude sessions found"
fi
EOF

chmod +x scripts/monitor-sessions.sh

# Create start script
cat > scripts/start-runner.sh << 'EOF'
#!/bin/bash
echo "🚀 Starting Agentic Claude Code Runner..."

if [ ! -f .env ]; then
    echo "❌ .env file not found! Copy .env.example to .env and configure it."
    exit 1
fi

if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "❌ ANTHROPIC_API_KEY not set in environment!"
    exit 1
fi

if ! command -v claude &> /dev/null; then
    echo "❌ Claude Code not found! Install with: npm install -g @anthropic-ai/claude-code"
    exit 1
fi

export $(cat .env | grep -v '^#' | xargs)

if [ ! -d "dist" ]; then
    echo "🔨 Building project..."
    npm run build
fi

echo "✅ Starting server on port ${PORT:-3000}"
npm start
EOF

chmod +x scripts/start-runner.sh

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Install Claude Code globally if not present
if ! command -v claude &> /dev/null; then
    echo "🤖 Installing Claude Code..."
    npm install -g @anthropic-ai/claude-code
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "🚀 Next steps:"
echo "1. Copy .env.example to .env: cp .env.example .env"
echo "2. Edit .env and add your ANTHROPIC_API_KEY"
echo "3. Build the project: npm run build"
echo "4. Start the server: npm start"
echo ""
echo "🔧 Available commands:"
echo "  npm run build    - Build TypeScript"
echo "  npm start        - Start the server"
echo "  npm run dev      - Start in development mode"
echo "  ./scripts/start-runner.sh - Start with environment checks"
echo "  ./scripts/monitor-sessions.sh - Monitor active Claude sessions"
echo ""
echo "📡 Once running, test with:"
echo "curl -X POST http://localhost:3000/health"
EOF

chmod +x setup-agentic-runner.sh
echo "🎯 Setup script created! Run it with: ./setup-agentic-runner.sh"