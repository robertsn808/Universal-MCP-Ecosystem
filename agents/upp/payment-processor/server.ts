#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

/**
 * UPP Payment Processing Agent
 * Handles universal payment protocol operations across all devices and payment methods
 */
class UPPPaymentAgent {
  private server: Server;
  private uppApiUrl: string;
  private uppApiKey: string;

  constructor() {
    this.server = new Server(
      {
        name: 'upp-payment-processor',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.uppApiUrl = process.env.UPP_API_URL || 'http://localhost:9000/api';
    this.uppApiKey = process.env.UPP_API_KEY || 'dev-api-key';
    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'process_payment',
            description: 'Process payment through UPP system',
            inputSchema: {
              type: 'object',
              properties: {
                amount: { type: 'number', description: 'Payment amount in cents' },
                currency: { type: 'string', default: 'USD', description: 'Payment currency' },
                paymentMethod: { 
                  type: 'string', 
                  enum: ['nfc', 'qr', 'voice', 'card', 'tap'],
                  description: 'Payment method type'
                },
                merchantId: { type: 'string', description: 'Merchant identifier' },
                deviceId: { type: 'string', description: 'Processing device ID' },
                customerData: { 
                  type: 'object',
                  properties: {
                    email: { type: 'string' },
                    phone: { type: 'string' },
                    name: { type: 'string' },
                  },
                  description: 'Customer information (optional)'
                },
                metadata: { type: 'object', description: 'Additional payment metadata' },
              },
              required: ['amount', 'paymentMethod', 'merchantId'],
            },
          },
          {
            name: 'get_payment_status',
            description: 'Check status of a payment transaction',
            inputSchema: {
              type: 'object',
              properties: {
                transactionId: { type: 'string', description: 'Transaction ID' },
              },
              required: ['transactionId'],
            },
          },
          {
            name: 'register_device',
            description: 'Register a new device for payment processing',
            inputSchema: {
              type: 'object',
              properties: {
                deviceType: { 
                  type: 'string',
                  enum: ['smartphone', 'tablet', 'iot', 'tv', 'pos'],
                  description: 'Device type'
                },
                capabilities: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: ['nfc', 'camera', 'display', 'microphone', 'speaker', 'touch']
                  },
                  description: 'Device capabilities'
                },
                merchantId: { type: 'string', description: 'Merchant ID for this device' },
                deviceName: { type: 'string', description: 'Human-readable device name' },
                location: { type: 'string', description: 'Device location (optional)' },
              },
              required: ['deviceType', 'capabilities', 'merchantId'],
            },
          },
          {
            name: 'generate_qr_code',
            description: 'Generate QR code for payment',
            inputSchema: {
              type: 'object',
              properties: {
                amount: { type: 'number', description: 'Payment amount in cents' },
                merchantId: { type: 'string', description: 'Merchant identifier' },
                orderInfo: { 
                  type: 'object',
                  description: 'Order details to encode in QR'
                },
                expiresIn: { 
                  type: 'number', 
                  default: 300,
                  description: 'QR code expiration in seconds'
                },
              },
              required: ['amount', 'merchantId'],
            },
          },
          {
            name: 'process_refund',
            description: 'Process refund for a completed transaction',
            inputSchema: {
              type: 'object',
              properties: {
                originalTransactionId: { type: 'string', description: 'Original transaction ID' },
                refundAmount: { type: 'number', description: 'Refund amount in cents (partial refunds allowed)' },
                reason: { type: 'string', description: 'Refund reason' },
                metadata: { type: 'object', description: 'Additional refund metadata' },
              },
              required: ['originalTransactionId', 'refundAmount', 'reason'],
            },
          },
          {
            name: 'get_merchant_analytics',
            description: 'Get payment analytics for merchant',
            inputSchema: {
              type: 'object',
              properties: {
                merchantId: { type: 'string', description: 'Merchant identifier' },
                period: { 
                  type: 'string', 
                  enum: ['today', 'yesterday', 'week', 'month', 'custom'],
                  default: 'today',
                  description: 'Analytics period'
                },
                startDate: { type: 'string', format: 'date', description: 'Start date for custom period' },
                endDate: { type: 'string', format: 'date', description: 'End date for custom period' },
                includeDeviceBreakdown: { 
                  type: 'boolean', 
                  default: false,
                  description: 'Include per-device analytics'
                },
              },
              required: ['merchantId'],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'process_payment':
            return await this.processPayment(args);
          case 'get_payment_status':
            return await this.getPaymentStatus(args);
          case 'register_device':
            return await this.registerDevice(args);
          case 'generate_qr_code':
            return await this.generateQRCode(args);
          case 'process_refund':
            return await this.processRefund(args);
          case 'get_merchant_analytics':
            return await this.getMerchantAnalytics(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error: ${error.message}`,
          }],
          isError: true,
        };
      }
    });
  }

  private async processPayment(args: any) {
    try {
      const response = await axios.post(`${this.uppApiUrl}/payments/process`, {
        amount: args.amount,
        currency: args.currency || 'USD',
        paymentMethod: args.paymentMethod,
        merchantId: args.merchantId,
        deviceId: args.deviceId,
        customerData: args.customerData,
        metadata: args.metadata,
      }, {
        headers: {
          'X-API-Key': this.uppApiKey,
          'Content-Type': 'application/json',
        },
      });

      const payment = response.data;
      return {
        content: [{
          type: 'text' as const,
          text: `Payment processed successfully:
- Transaction ID: ${payment.transactionId}
- Amount: $${(args.amount / 100).toFixed(2)}
- Method: ${args.paymentMethod}
- Status: ${payment.status}
- Merchant: ${args.merchantId}
${payment.receiptUrl ? `- Receipt: ${payment.receiptUrl}` : ''}`,
        }],
      };
    } catch (error) {
      throw new Error(`Payment processing failed: ${error.response?.data?.message || error.message}`);
    }
  }

  private async getPaymentStatus(args: any) {
    try {
      const response = await axios.get(`${this.uppApiUrl}/payments/${args.transactionId}`, {
        headers: {
          'X-API-Key': this.uppApiKey,
        },
      });

      const payment = response.data;
      return {
        content: [{
          type: 'text' as const,
          text: `Payment Status:
- Transaction ID: ${payment.transactionId}
- Status: ${payment.status}
- Amount: $${(payment.amount / 100).toFixed(2)}
- Created: ${new Date(payment.createdAt).toLocaleString()}
- Method: ${payment.paymentMethod}
${payment.completedAt ? `- Completed: ${new Date(payment.completedAt).toLocaleString()}` : ''}
${payment.errorMessage ? `- Error: ${payment.errorMessage}` : ''}`,
        }],
      };
    } catch (error) {
      throw new Error(`Failed to get payment status: ${error.response?.data?.message || error.message}`);
    }
  }

  private async registerDevice(args: any) {
    try {
      const response = await axios.post(`${this.uppApiUrl}/devices/register`, {
        deviceType: args.deviceType,
        capabilities: args.capabilities,
        merchantId: args.merchantId,
        deviceName: args.deviceName,
        location: args.location,
      }, {
        headers: {
          'X-API-Key': this.uppApiKey,
          'Content-Type': 'application/json',
        },
      });

      const device = response.data;
      return {
        content: [{
          type: 'text' as const,
          text: `Device registered successfully:
- Device ID: ${device.deviceId}
- Name: ${args.deviceName || args.deviceType}
- Type: ${args.deviceType}
- Capabilities: ${args.capabilities.join(', ')}
- Merchant: ${args.merchantId}
- Status: Active`,
        }],
      };
    } catch (error) {
      throw new Error(`Device registration failed: ${error.response?.data?.message || error.message}`);
    }
  }

  private async generateQRCode(args: any) {
    try {
      const response = await axios.post(`${this.uppApiUrl}/payments/qr-generate`, {
        amount: args.amount,
        merchantId: args.merchantId,
        orderInfo: args.orderInfo,
        expiresIn: args.expiresIn,
      }, {
        headers: {
          'X-API-Key': this.uppApiKey,
          'Content-Type': 'application/json',
        },
      });

      const qr = response.data;
      return {
        content: [{
          type: 'text' as const,
          text: `QR Code generated:
- Payment Amount: $${(args.amount / 100).toFixed(2)}
- QR Code Data: ${qr.qrData}
- Expires: ${new Date(qr.expiresAt).toLocaleString()}
- Payment Link: ${qr.paymentUrl}

Customers can scan this QR code to complete payment on their device.`,
        }],
      };
    } catch (error) {
      throw new Error(`QR code generation failed: ${error.response?.data?.message || error.message}`);
    }
  }

  private async processRefund(args: any) {
    try {
      const response = await axios.post(`${this.uppApiUrl}/payments/${args.originalTransactionId}/refund`, {
        refundAmount: args.refundAmount,
        reason: args.reason,
        metadata: args.metadata,
      }, {
        headers: {
          'X-API-Key': this.uppApiKey,
          'Content-Type': 'application/json',
        },
      });

      const refund = response.data;
      return {
        content: [{
          type: 'text' as const,
          text: `Refund processed successfully:
- Refund ID: ${refund.refundId}
- Original Transaction: ${args.originalTransactionId}
- Refund Amount: $${(args.refundAmount / 100).toFixed(2)}
- Reason: ${args.reason}
- Status: ${refund.status}
- Processing Time: ${refund.estimatedProcessingTime || '3-5 business days'}`,
        }],
      };
    } catch (error) {
      throw new Error(`Refund processing failed: ${error.response?.data?.message || error.message}`);
    }
  }

  private async getMerchantAnalytics(args: any) {
    try {
      const params: any = {
        period: args.period,
        includeDeviceBreakdown: args.includeDeviceBreakdown,
      };

      if (args.period === 'custom') {
        params.startDate = args.startDate;
        params.endDate = args.endDate;
      }

      const response = await axios.get(`${this.uppApiUrl}/merchants/${args.merchantId}/analytics`, {
        params,
        headers: {
          'X-API-Key': this.uppApiKey,
        },
      });

      const analytics = response.data;
      return {
        content: [{
          type: 'text' as const,
          text: `Merchant Analytics (${args.period}):
- Total Transactions: ${analytics.totalTransactions}
- Total Volume: $${(analytics.totalVolume / 100).toFixed(2)}
- Average Transaction: $${(analytics.averageTransaction / 100).toFixed(2)}
- Success Rate: ${(analytics.successRate * 100).toFixed(2)}%

Payment Methods:
${Object.entries(analytics.paymentMethodBreakdown || {})
  .map(([method, count]) => `- ${method}: ${count} transactions`)
  .join('\n')}

${args.includeDeviceBreakdown && analytics.deviceBreakdown ? 
  `\nDevice Breakdown:\n${Object.entries(analytics.deviceBreakdown)
    .map(([device, stats]: [string, any]) => `- ${device}: ${stats.transactions} transactions, $${(stats.volume / 100).toFixed(2)}`)
    .join('\n')}` : ''}`,
        }],
      };
    } catch (error) {
      throw new Error(`Failed to get analytics: ${error.response?.data?.message || error.message}`);
    }
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

const agent = new UPPPaymentAgent();
agent.start().catch(console.error);