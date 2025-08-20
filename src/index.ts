#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createLogger, format, transports } from 'winston';

// Load environment configuration
dotenv.config();

// Initialize logger
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [
    new transports.Console(),
    ...(process.env.LOG_TO_FILE === 'true' 
      ? [new transports.File({ filename: 'mcp-agents.log' })]
      : []
    ),
  ],
});

/**
 * Main MCP Agent Manager
 * Coordinates all MCP servers and agents for the UPP ecosystem
 */
class MCPAgentManager {
  private server: Server;
  private app: express.Application;

  constructor() {
    this.server = new Server(
      {
        name: 'upp-mcp-agents',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );

    this.app = express();
    this.setupExpress();
    this.setupMCPHandlers();
  }

  private setupExpress() {
    this.app.use(helmet());
    this.app.use(cors({
      origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true,
    }));
    this.app.use(express.json());

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      });
    });

    // MCP server status endpoint
    this.app.get('/mcp/status', (req, res) => {
      res.json({
        servers: {
          aws: process.env.ENABLE_AWS_INTEGRATION === 'true',
          database: true,
          payments: process.env.ENABLE_PAYMENT_PROCESSING === 'true',
          automation: process.env.ENABLE_AUTOMATION === 'true',
          analytics: process.env.ENABLE_ANALYTICS === 'true',
        },
        uptime: process.uptime(),
      });
    });
  }

  private setupMCPHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = [];

      // AWS Integration Tools
      if (process.env.ENABLE_AWS_INTEGRATION === 'true') {
        tools.push({
          name: 'aws_query',
          description: 'Query AWS services and resources',
          inputSchema: {
            type: 'object',
            properties: {
              service: { type: 'string', description: 'AWS service name' },
              action: { type: 'string', description: 'Action to perform' },
              parameters: { type: 'object', description: 'Action parameters' },
            },
            required: ['service', 'action'],
          },
        });
      }

      // Database Tools
      tools.push({
        name: 'database_query',
        description: 'Execute database queries across all applications',
        inputSchema: {
          type: 'object',
          properties: {
            database: { type: 'string', enum: ['upp', 'alii', 'seller'] },
            query: { type: 'string', description: 'SQL query to execute' },
            parameters: { type: 'array', description: 'Query parameters' },
          },
          required: ['database', 'query'],
        },
      });

      // Payment Processing Tools
      if (process.env.ENABLE_PAYMENT_PROCESSING === 'true') {
        tools.push({
          name: 'process_payment',
          description: 'Process payments through UPP',
          inputSchema: {
            type: 'object',
            properties: {
              amount: { type: 'number', description: 'Payment amount in cents' },
              currency: { type: 'string', default: 'USD' },
              paymentMethod: { 
                type: 'string', 
                enum: ['nfc', 'qr', 'voice', 'card'],
                description: 'Payment method type'
              },
              merchantId: { type: 'string', description: 'Merchant identifier' },
              metadata: { type: 'object', description: 'Additional payment metadata' },
            },
            required: ['amount', 'paymentMethod', 'merchantId'],
          },
        });
      }

      // Automation Tools
      if (process.env.ENABLE_AUTOMATION === 'true') {
        tools.push({
          name: 'trigger_workflow',
          description: 'Trigger N8N automation workflows',
          inputSchema: {
            type: 'object',
            properties: {
              workflow: { type: 'string', description: 'Workflow name or ID' },
              data: { type: 'object', description: 'Workflow input data' },
              async: { type: 'boolean', default: false, description: 'Run asynchronously' },
            },
            required: ['workflow'],
          },
        });
      }

      // Analytics Tools
      if (process.env.ENABLE_ANALYTICS === 'true') {
        tools.push({
          name: 'generate_report',
          description: 'Generate business analytics reports',
          inputSchema: {
            type: 'object',
            properties: {
              type: { 
                type: 'string', 
                enum: ['sales', 'transactions', 'customers', 'inventory'],
                description: 'Report type'
              },
              period: { 
                type: 'string', 
                enum: ['daily', 'weekly', 'monthly', 'custom'],
                description: 'Time period'
              },
              startDate: { type: 'string', format: 'date' },
              endDate: { type: 'string', format: 'date' },
              filters: { type: 'object', description: 'Report filters' },
            },
            required: ['type', 'period'],
          },
        });
      }

      return { tools };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'aws_query':
            return await this.handleAWSQuery(args);
          case 'database_query':
            return await this.handleDatabaseQuery(args);
          case 'process_payment':
            return await this.handlePaymentProcessing(args);
          case 'trigger_workflow':
            return await this.handleWorkflowTrigger(args);
          case 'generate_report':
            return await this.handleReportGeneration(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        logger.error('Tool execution error', { tool: name, error: error.message });
        return {
          content: [{
            type: 'text' as const,
            text: `Error executing ${name}: ${error.message}`,
          }],
          isError: true,
        };
      }
    });
  }

  private async handleAWSQuery(args: any) {
    // AWS service integration will be implemented by individual AWS MCP servers
    logger.info('AWS query requested', { service: args.service, action: args.action });
    
    return {
      content: [{
        type: 'text' as const,
        text: `AWS ${args.service} query: ${args.action} - This will be routed to the appropriate AWS MCP server`,
      }],
    };
  }

  private async handleDatabaseQuery(args: any) {
    // Database queries will be routed to appropriate database MCP servers
    logger.info('Database query requested', { database: args.database });
    
    return {
      content: [{
        type: 'text' as const,
        text: `Database query for ${args.database}: ${args.query} - This will be executed by the database MCP server`,
      }],
    };
  }

  private async handlePaymentProcessing(args: any) {
    // Payment processing will be handled by UPP payment agents
    logger.info('Payment processing requested', { 
      amount: args.amount, 
      method: args.paymentMethod, 
      merchant: args.merchantId 
    });
    
    return {
      content: [{
        type: 'text' as const,
        text: `Payment processing: $${(args.amount / 100).toFixed(2)} via ${args.paymentMethod} for ${args.merchantId} - This will be processed by the UPP payment agent`,
      }],
    };
  }

  private async handleWorkflowTrigger(args: any) {
    // Workflow triggers will be handled by automation agents
    logger.info('Workflow trigger requested', { workflow: args.workflow });
    
    return {
      content: [{
        type: 'text' as const,
        text: `Triggering workflow: ${args.workflow} - This will be executed by the automation agent`,
      }],
    };
  }

  private async handleReportGeneration(args: any) {
    // Report generation will be handled by analytics agents
    logger.info('Report generation requested', { type: args.type, period: args.period });
    
    return {
      content: [{
        type: 'text' as const,
        text: `Generating ${args.type} report for ${args.period} - This will be processed by the analytics agent`,
      }],
    };
  }

  async start() {
    // Start HTTP server for health checks and status
    const port = parseInt(process.env.PORT || '3000');
    this.app.listen(port, () => {
      logger.info(`MCP Agent Manager HTTP server running on port ${port}`);
    });

    // Start MCP server on stdio
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('MCP Agent Manager started successfully');
  }
}

// Start the MCP Agent Manager
if (require.main === module) {
  const manager = new MCPAgentManager();
  manager.start().catch((error) => {
    logger.error('Failed to start MCP Agent Manager', { error: error.message });
    process.exit(1);
  });
}

export { MCPAgentManager };