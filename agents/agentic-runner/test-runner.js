#!/usr/bin/env node

const http = require('http');

// Configuration
const HOST = process.env.HOST || 'localhost';
const PORT = parseInt(process.env.PORT || '3000', 10);
const SERVER_URL = `http://${HOST}:${PORT}`;
// Resolve a usable repo path in this workspace
const path = require('path');
const fs = require('fs');
const candidatePaths = [
  process.env.TEST_REPO_PATH,
  // Common absolute locations in this environment
  '/home/i0vvny0u/Applications/MCP/adk-samples/python/agents/marketing-agency',
  '/home/i0vvny0u/MCP/adk-samples/python/agents/marketing-agency',
  '/home/i0vvny0u/Applications/MCP/adk-samples/python/agents/alii',
  '/home/i0vvny0u/MCP/adk-samples/python/agents/alii',
  '/home/i0vvny0u/Applications/Work/alii',
  // Repo-relative fallbacks
  path.resolve(__dirname, '../adk-samples/python/agents/marketing-agency'),
  path.resolve(__dirname, '../adk-samples/python/agents/alii'),
  path.resolve(__dirname, '../adk-samples/python/agents'),
  path.resolve(__dirname, '..')
].filter(Boolean);

let TEST_REPO_PATH = candidatePaths.find(p => {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
});

if (!TEST_REPO_PATH) {
  TEST_REPO_PATH = process.cwd();
}

async function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: HOST,
      port: PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = {
            status: res.statusCode,
            data: body ? JSON.parse(body) : null
          };
          resolve(result);
        } catch (error) {
          resolve({
            status: res.statusCode,
            data: body
          });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function testHealthCheck() {
  console.log('🔍 Testing health check...');
  try {
    const response = await makeRequest('GET', '/health');
    if (response.status === 200) {
      console.log('✅ Health check passed');
      return true;
    } else {
      console.log('❌ Health check failed:', response);
      return false;
    }
  } catch (error) {
    console.log('❌ Health check error:', error.message);
    return false;
  }
}

async function testSimpleTask() {
  console.log('🔍 Testing simple coding task...');
  try {
    const response = await makeRequest('POST', '/execute', {
      request: 'Add a simple comment to the main agent.py file explaining what the marketing agency does',
      repoPath: TEST_REPO_PATH,
      context: {
        testMode: true,
        description: 'Simple test task for agentic runner'
      }
    });

    console.log('📊 Task Response:', JSON.stringify(response.data, null, 2));
    
    if (response.status === 200 && response.data.result.success) {
      console.log('✅ Simple task test passed');
      console.log(`📺 Monitor session: tmux attach -t ${response.data.sessionName}`);
      return response.data.taskId;
    } else {
      console.log('❌ Simple task test failed');
      return null;
    }
  } catch (error) {
    console.log('❌ Simple task error:', error.message);
    return null;
  }
}

async function testRiskyTask() {
  console.log('🔍 Testing risky task (should require confirmation)...');
  try {
    const response = await makeRequest('POST', '/execute', {
      request: 'Delete all temporary files and install new dependencies via pip install',
      repoPath: TEST_REPO_PATH,
      context: {
        testMode: true,
        description: 'Risky test task to validate safety mechanisms'
      }
    });

    console.log('📊 Risky Task Response:', JSON.stringify(response.data, null, 2));
    
    if (response.data.riskAssessment && response.data.riskAssessment.riskLevel === 'high') {
      console.log('✅ Risk assessment working correctly');
      return response.data.taskId;
    } else {
      console.log('⚠️  Risk assessment may not be working as expected');
      return response.data.taskId;
    }
  } catch (error) {
    console.log('❌ Risky task error:', error.message);
    return null;
  }
}

async function testConfirmationEndpoints() {
  console.log('🔍 Testing confirmation endpoints...');
  try {
    const response = await makeRequest('GET', '/confirmations');
    console.log('📊 Pending Confirmations:', JSON.stringify(response.data, null, 2));
    
    if (response.status === 200) {
      console.log('✅ Confirmation endpoints working');
      return true;
    } else {
      console.log('❌ Confirmation endpoints failed');
      return false;
    }
  } catch (error) {
    console.log('❌ Confirmation endpoints error:', error.message);
    return false;
  }
}

async function testCloneAndRun() {
  console.log('🔍 Testing clone-and-run (test mode)...');
  const repoUrl = process.env.TEST_REPO_URL || 'https://github.com/robertsn808/alii';
  try {
    const response = await makeRequest('POST', '/clone-and-run', {
      repoUrl,
      request: 'Create a simple README note in the cloned repo',
      context: { testMode: true, description: 'Clone-and-run smoke test (offline)'}
    });

    console.log('📊 Clone-and-Run Response:', JSON.stringify(response.data, null, 2));

    if (response.status === 200 && response.data.result && response.data.result.success) {
      console.log('✅ Clone-and-run test (test mode) passed');
      return { ok: true, repoPath: response.data.repoPath };
    } else {
      console.log('⚠️  Clone-and-run test returned unexpected result');
      return { ok: false };
    }
  } catch (error) {
    console.log('❌ Clone-and-run error:', error.message);
    return { ok: false };
  }
}

async function testCleanupRepo(repoPath) {
  if (!repoPath) return false;
  const parts = repoPath.split('/');
  const name = parts[parts.length - 1];
  if (!name.startsWith('repo_')) return false;
  console.log(`🔍 Cleaning up cloned repo: ${name}`);
  try {
    const del = await makeRequest('DELETE', `/repos/${encodeURIComponent(name)}`);
    if (del.status === 200 && del.data && del.data.success) {
      console.log('✅ Cleanup by id passed');
      return true;
    }
    console.log('⚠️  Cleanup by id returned unexpected result');
    return false;
  } catch (e) {
    console.log('❌ Cleanup by id error:', e.message);
    return false;
  }
}

async function runTests() {
  console.log('🚀 Starting Agentic Claude Code Runner Tests\n');

  // Test 1: Health Check
  const healthOk = await testHealthCheck();
  if (!healthOk) {
    console.log('❌ Server not responding. Is it running? Start with: npm run dev');
    process.exit(1);
  }

  console.log('');

  // Test 2: Simple Task
  const simpleTaskId = await testSimpleTask();
  console.log('');

  // Test 3: Risky Task
  const riskyTaskId = await testRiskyTask();
  console.log('');

  // Test 4: Confirmation Endpoints
  await testConfirmationEndpoints();
  console.log('');

  // Test 5: Clone-and-Run (test mode)
  const cloneRes = await testCloneAndRun();
  console.log('');

  // Cleanup the repo we just created (if any)
  if (cloneRes && cloneRes.ok) {
    await testCleanupRepo(cloneRes.repoPath);
  }
  console.log('');

  console.log('🎉 Test suite completed!');
  console.log('');
  console.log('📝 Next Steps:');
  console.log('1. Check the tmux sessions for active Claude Code instances');
  console.log('2. Monitor the safety checkpoints in the repository');
  console.log('3. Use the confirmation endpoints to approve/deny risky operations');
  console.log('4. Review the .claude-checkpoint.json files for audit trails');
  
  if (simpleTaskId) {
    console.log(`\n📺 Monitor simple task: tmux attach -t claude_${simpleTaskId}`);
  }
  
  if (riskyTaskId) {
    console.log(`📺 Monitor risky task: tmux attach -t claude_${riskyTaskId}`);
  }
}

// Check if server is running, if not provide instructions
async function checkServer() {
  try {
    const response = await makeRequest('GET', '/health');
    if (response.status === 200) {
      runTests();
    }
  } catch (error) {
    console.log(`❌ Server not running on ${SERVER_URL}. Please start it first:`);
    console.log('');
    console.log('1. Set your Anthropic API key:');
    console.log('   export ANTHROPIC_API_KEY="your-api-key-here"');
    console.log('');
    console.log('2. Install dependencies:');
    console.log('   npm install');
    console.log('');
    console.log('3. Build the project:');
    console.log('   npm run build');
    console.log('');
    console.log('4. Start the server:');
    console.log('   PORT=' + PORT + ' npm run dev');
    console.log('');
    console.log('5. Run this test again:');
    console.log('   PORT=' + PORT + ' node test-runner.js');
  }
}

checkServer();
