import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface SafetyConfig {
  allowedPaths: string[];
  blockedPaths: string[];
  allowedCommands: string[];
  blockedCommands: string[];
  requireConfirmation: {
    deletions: boolean;
    systemCommands: boolean;
    networkOperations: boolean;
    packageInstalls: boolean;
  };
  maxSessionDuration: number; // minutes
}

export interface RiskAssessment {
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  reasons: string[];
  requiresConfirmation: boolean;
  blockedReasons?: string[];
}

export class SafetyManager {
  private config!: SafetyConfig;
  private configPath: string;

  constructor(configPath: string = './safety-config.json') {
    this.configPath = configPath;
    this.loadConfig();
  }

  private loadConfig(): void {
    const defaultConfig: SafetyConfig = {
      allowedPaths: [
        "/home/i0vvny0u/MCP/adk-samples/python/agent/marketing-agency",
        "/home/i0vvny0u/MCP/agentic-runner",
        "/tmp/claude-workspace"
      ],
      blockedPaths: [
        "/etc",
        "/usr/bin",
        "/bin",
        "/sbin",
        "/var",
        "/root",
        "/.ssh",
        "/home/*/.ssh"
      ],
      allowedCommands: [
        "git", "npm", "pip", "python", "python3", "pytest", "poetry",
        "ls", "cat", "grep", "find", "mkdir", "cp", "mv", "touch",
        "code", "vim", "nano", "curl", "wget"
      ],
      blockedCommands: [
        "rm", "rmdir", "dd", "fdisk", "mkfs", "mount", "umount",
        "su", "sudo", "passwd", "chown", "chmod", "iptables",
        "systemctl", "service", "crontab", "at", "batch"
      ],
      requireConfirmation: {
        deletions: true,
        systemCommands: true,
        networkOperations: true,
        packageInstalls: true
      },
      maxSessionDuration: 60 // 1 hour
    };

    if (existsSync(this.configPath)) {
      try {
        const fileContent = readFileSync(this.configPath, 'utf8');
        this.config = { ...defaultConfig, ...JSON.parse(fileContent) };
      } catch (error) {
        console.warn(`Failed to load safety config: ${error}. Using defaults.`);
        this.config = defaultConfig;
      }
    } else {
      this.config = defaultConfig;
      this.saveConfig();
    }
  }

  private saveConfig(): void {
    try {
      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error(`Failed to save safety config: ${error}`);
    }
  }

  assessTaskRisk(prompt: string, repoPath: string): RiskAssessment {
    const reasons: string[] = [];
    let riskLevel: RiskAssessment['riskLevel'] = 'low';
    let requiresConfirmation = false;

    // Check path safety
    const pathAllowed = this.config.allowedPaths.some(allowed => 
      repoPath.startsWith(allowed)
    );
    const pathBlocked = this.config.blockedPaths.some(blocked => 
      repoPath.match(new RegExp(blocked.replace('*', '.*')))
    );

    if (pathBlocked) {
      return {
        riskLevel: 'critical',
        reasons: [`Repository path ${repoPath} is in blocked directory`],
        requiresConfirmation: false,
        blockedReasons: ['Path blocked by safety policy']
      };
    }

    if (!pathAllowed) {
      riskLevel = 'medium';
      reasons.push('Repository path not in allowed list');
      requiresConfirmation = true;
    }

    // Analyze prompt content
    const lowerPrompt = prompt.toLowerCase();
    
    // High-risk patterns
    const highRiskPatterns = [
      /delete|remove|rm\s/i,
      /system|sudo|root/i,
      /password|secret|key|token/i,
      /network|curl|wget|download/i,
      /install|pip install|npm install/i
    ];

    for (const pattern of highRiskPatterns) {
      if (pattern.test(prompt)) {
        riskLevel = 'high';
        reasons.push(`Contains potentially risky operation: ${pattern.source}`);
        requiresConfirmation = true;
      }
    }

    // Critical patterns that should be blocked
    const criticalPatterns = [
      /format|fdisk|mkfs/i,
      /etc\/passwd|\/etc\/shadow/i,
      /chmod 777|chmod -R/i
    ];

    for (const pattern of criticalPatterns) {
      if (pattern.test(prompt)) {
        return {
          riskLevel: 'critical',
          reasons: [`Contains critical system operation: ${pattern.source}`],
          requiresConfirmation: false,
          blockedReasons: ['Operation blocked by safety policy']
        };
      }
    }

    return {
      riskLevel,
      reasons,
      requiresConfirmation
    };
  }

  generateSafetyGuidelines(riskAssessment: RiskAssessment): string {
    const guidelines = [
      "CRITICAL SAFETY GUIDELINES:",
      "- Always create a git commit before making ANY changes",
      "- Run tests before and after changes to ensure nothing breaks",
      "- Make small, incremental changes and test each step",
      "- Never modify system files or directories outside the project",
      "- Ask for explicit confirmation before deleting any files",
      "- If you encounter errors, stop and report them immediately"
    ];

    if (riskAssessment.riskLevel === 'high' || riskAssessment.riskLevel === 'critical') {
      guidelines.push(
        "",
        "⚠️  HIGH-RISK OPERATION DETECTED:",
        ...riskAssessment.reasons.map(reason => `- ${reason}`),
        "",
        "ADDITIONAL PRECAUTIONS:",
        "- Create a backup of any files before modifying them",
        "- Double-check all commands before execution",
        "- If unsure about any operation, ask for human confirmation"
      );
    }

    return guidelines.join('\n');
  }

  isPathAllowed(path: string): boolean {
    const allowed = this.config.allowedPaths.some(allowedPath => 
      path.startsWith(allowedPath)
    );
    const blocked = this.config.blockedPaths.some(blockedPath => 
      path.match(new RegExp(blockedPath.replace('*', '.*')))
    );
    
    return allowed && !blocked;
  }

  updateConfig(updates: Partial<SafetyConfig>): void {
    this.config = { ...this.config, ...updates };
    this.saveConfig();
  }

  getConfig(): SafetyConfig {
    return { ...this.config };
  }
}