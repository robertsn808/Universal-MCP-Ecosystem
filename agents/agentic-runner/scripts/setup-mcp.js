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
