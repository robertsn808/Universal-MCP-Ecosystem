# Agentic Claude Code Runner

A production-ready system for autonomous code execution via Claude Code with comprehensive safety mechanisms and MCP integration.

## 🚀 Features

- **Autonomous Code Execution**: Spawn Claude Code sessions in tmux to perform coding tasks
- **Safety-First Architecture**: Risk assessment, path allowlists, and confirmation workflows
- **Task Planning**: AI-powered planning with complexity estimation and safeguard generation
- **MCP Integration**: Connect external tools and data sources via Model Context Protocol
- **Real-time Monitoring**: Track active sessions and checkpoint progress
- **Audit Trail**: Complete logging of all operations and decisions

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client App    │───▶│  Express API    │───▶│  Claude Code    │
│                 │    │                 │    │    Sessions     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │ Safety Manager  │
                       │ + Confirmations │
                       └─────────────────┘
```

### Core Components

1. **TaskPlanner**: Uses Claude to analyze requests and generate safe execution plans
2. **SafetyManager**: Risk assessment, path validation, and safety guideline generation
3. **ClaudeCodeRunner**: Spawns and manages tmux sessions running Claude Code
4. **ConfirmationHandler**: Manages approval workflows for risky operations

## 🛡️ Safety Mechanisms

### Path-Based Safety
- **Allowlist**: Only execute in approved directories
- **Blocklist**: Prevent access to system directories
- **Validation**: Check paths before execution

### Risk Assessment
- **Pattern Analysis**: Detect risky operations in prompts
- **Risk Levels**: Low, Medium, High, Critical
- **Automatic Blocking**: Critical operations are blocked immediately

### Confirmation Workflows
- **Human-in-the-Loop**: Require approval for risky operations
- **Timeout Protection**: Auto-deny after timeout
- **Modified Instructions**: Allow users to modify risky requests

## 📋 Setup

### Prerequisites
- Node.js 18+
- Claude API key
- tmux installed
- Claude Code CLI installed

### Installation

```bash
# Clone and setup
git clone <your-repo>
cd agentic-runner

# Install dependencies
npm install

# Set your API key
export ANTHROPIC_API_KEY="your-api-key-here"

# Build the project
npm run build

# Setup MCP (optional)
npm run setup:mcp
```

#### Offline Mode

If you don't have network access or an API key, you can still exercise the API using the offline planner:

```bash
# Use a lightweight, heuristic planner instead of calling the API
export MOCK_PLANNER=1
```

### Configuration

The system automatically creates a safety configuration file. You can customize it:

```json
{
  "allowedPaths": [
    "/home/user/projects",
    "/tmp/claude-workspace"
  ],
  "blockedPaths": [
    "/etc",
    "/usr/bin",
    "/.ssh"
  ],
  "allowedCommands": ["git", "npm", "python"],
  "blockedCommands": ["rm", "sudo", "dd"],
  "requireConfirmation": {
    "deletions": true,
    "systemCommands": true,
    "networkOperations": true,
    "packageInstalls": true
  },
  "maxSessionDuration": 60
}
```

## 🎮 Usage

### Start the Server
```bash
npm run dev
# Server runs on http://localhost:3000
```

### Execute a Task
```bash
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "request": "Add error handling to the login function",
    "repoPath": "/path/to/your/repo",
    "context": {
      "branch": "feature/error-handling",
      "priority": "high"
    }
  }'
```

Include `"testMode": true` under `context` to simulate execution without spawning external tools (tmux/Claude CLI). In test mode, the runner writes a checkpoint file and returns a simulated success so you can run smoke tests in constrained environments.

### Monitor Sessions
```bash
# List active tmux sessions
tmux list-sessions

# Attach to a Claude Code session
tmux attach -t claude_<task-id>

# View session output
tmux capture-pane -t claude_<task-id> -p
```

### Handle Confirmations
```bash
# List pending confirmations
curl http://localhost:3000/confirmations

# Approve a confirmation
curl -X POST http://localhost:3000/confirm/<task-id> \
  -H "Content-Type: application/json" \
  -d '{"approved": true, "reason": "Approved by security team"}'

# Deny a confirmation
curl -X POST http://localhost:3000/confirm/<task-id> \
  -H "Content-Type: application/json" \
  -d '{"approved": false, "reason": "Too risky"}'
```

## 🔌 API Endpoints

### Core Endpoints
- `POST /execute` - Execute a coding task
- `GET /health` - Health check

### Confirmation Endpoints
- `GET /confirmations` - List pending confirmations
- `POST /confirm/:taskId` - Approve/deny a confirmation
- `DELETE /confirm/:taskId` - Cancel a confirmation

### Clone-and-Run
- `POST /clone-and-run` - Clone a Git repo URL into a local workspace and execute a task against it.

Request body:
```json
{
  "repoUrl": "https://github.com/your-org/your-repo",
  "request": "Implement feature X with tests",
  "ref": "main",
  "context": { "testMode": false }
}
```

Notes:
- When `context.testMode` is true, the server does not perform a network clone. It creates a simulated repo folder, updates the allowlist, and proceeds, enabling offline smoke tests.
- The cloned path is added to the safety allowlist for the duration of the run. You can manage paths in `safety-config.json`.

### Repo Cleanup
- `DELETE /repos/:id` - Delete a previously cloned repo under the service's `repos/` folder. Accepts either the full folder name (e.g., `repo_ab12cd34`) or just the suffix (`ab12cd34`).
- `POST /repos/cleanup` - Bulk delete repos older than a threshold (hours).

Request body:
```json
{ "olderThanHours": 24 }
```

Notes:
- Cleanup also removes the repo path from the safety allowlist if present.
- Only folders under `agentic-runner/repos/` with prefix `repo_` are eligible.

### Automatic Cleanup
- Set `REPOS_TTL_HOURS` to enable a background cleanup loop (runs every 60 minutes) that removes repos older than the TTL and purges allowlist entries.

Example:
```bash
export REPOS_TTL_HOURS=24
``` 

### Example Response
```json
{
  "taskId": "uuid-here",
  "plan": "Step-by-step implementation plan",
  "complexity": "moderate",
  "safeguards": ["Create git commit", "Run tests"],
  "riskAssessment": {
    "riskLevel": "medium",
    "reasons": ["Modifies existing code"],
    "requiresConfirmation": false
  },
  "result": {
    "success": true,
    "output": "Session started successfully"
  },
  "sessionName": "claude_uuid-here",
  "instructions": "Monitor with: tmux attach -t claude_uuid-here"
}
```

## 🤝 Integrating the `alii` Repo

The runner operates on any local repo via the `repoPath` you send to `POST /execute`. There is a sample `alii` agent under `adk-samples/python/agents/alii`, but it is not linked to a GitHub repo or submodule.

- Not a submodule: there is no git linkage to `github.com/robertsn808/alii` in this workspace.
- Use any local clone: clone `alii` wherever you like and pass that path as `repoPath` (or set `TEST_REPO_PATH` for the test runner).

Example setup:

```bash
# Clone externally (choose your desired location)
git clone https://github.com/robertsn808/alii ~/code/alii

# Allow its path (optional): update agentic-runner/safety-config.json if needed
# Then run the server and smoke tests targeting that repo
cd agentic-runner
PORT=3000 npm run dev
TEST_REPO_PATH=~/code/alii node ./test-runner.js
```

Notes:
- The safety policy already includes common `adk-samples/python/agents/*` paths. If your clone path differs, add it to `allowedPaths` in `agentic-runner/safety-config.json`.
- In constrained environments, add `{ "testMode": true }` in the `context` field to simulate execution without spawning external tools.

## 🧪 Testing

Run the comprehensive test suite:

```bash
./test-runner.js
```

The test suite validates:
- Health check endpoint
- Simple task execution
- Risk assessment for dangerous operations
- Confirmation workflow endpoints

## 🔍 Monitoring & Debugging

### Checkpoint Files
Each task creates a `.claude-checkpoint.json` file in the target repository:

```json
{
  "taskId": "uuid",
  "prompt": "Original task description",
  "startTime": "2024-01-01T00:00:00.000Z",
  "context": {...},
  "riskAssessment": {...}
}
```

### Session Management
```bash
# List all Claude sessions
tmux list-sessions | grep claude_

# Kill a specific session
tmux kill-session -t claude_<task-id>

# Monitor session logs
tail -f logs/runner.log
```

## 🚦 Best Practices

### For Task Requests
1. **Be Specific**: Provide clear, detailed instructions
2. **Include Context**: Add relevant background information
3. **Set Boundaries**: Specify what should NOT be changed
4. **Test Incrementally**: Start with small, safe tasks

### For Safety
1. **Review Confirmations**: Always review risky operations
2. **Monitor Sessions**: Keep an eye on active Claude Code sessions
3. **Check Checkpoints**: Review audit trails regularly
4. **Update Allowlists**: Keep path and command lists current

### For Production
1. **Use HTTPS**: Secure the API endpoints
2. **Add Authentication**: Implement proper auth mechanisms
3. **Rate Limiting**: Prevent abuse with rate limits
4. **Backup Strategy**: Regular backups of target repositories

## 🔗 MCP Integration

The system supports Model Context Protocol for connecting external tools:

```bash
# Setup MCP servers
npm run setup:mcp

# Configure in ~/.config/claude-code/mcp.json
{
  "mcpServers": {
    "filesystem": {...},
    "git": {...},
    "github": {...}
  }
}
```

## 🐛 Troubleshooting

### Common Issues

**"Task blocked: Repository path not allowed"**
- Add the path to `allowedPaths` in safety config
- Ensure the path exists and is accessible

**"Session failed to start"**
- Check if tmux is installed: `which tmux`
- Verify Claude Code is available: `which claude`
- Check API key is set: `echo $ANTHROPIC_API_KEY`

**"Confirmation timeout"**
- Increase timeout in safety config
- Check confirmation endpoints are accessible
- Monitor server logs for errors

### Debug Mode
```bash
# Enable debug logging
DEBUG=* npm run dev

# Check session status
tmux list-sessions -F "#{session_name}: #{session_created}"
```

## 📚 Integration Examples

### GitHub Actions
```yaml
- name: Run Agentic Code Task
  run: |
    curl -X POST ${{ env.RUNNER_URL }}/execute \
      -H "Content-Type: application/json" \
      -d '{"request": "Fix failing tests", "repoPath": "${{ github.workspace }}"}'
```

### Webhook Integration
```javascript
app.post('/webhook/github', (req, res) => {
  if (req.body.action === 'opened' && req.body.pull_request) {
    const task = {
      request: "Review this pull request for security issues",
      repoPath: "/tmp/pr-review",
      context: {
        pr: req.body.pull_request,
        repository: req.body.repository
      }
    };
    
    executeTask(task);
  }
});
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Update documentation
5. Submit a pull request

## 📜 License

MIT License - see LICENSE file for details.

---

**⚠️ Security Notice**: This system executes code autonomously. Always review and test in safe environments before production use.
