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
 * Alii Fish Market Menu Management Agent
 * Handles menu operations, inventory tracking, and availability updates
 */
class AliiMenuAgent {
  private server: Server;
  private apiUrl: string;

  constructor() {
    this.server = new Server(
      {
        name: 'alii-menu-management',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.apiUrl = process.env.ALII_API_URL || 'http://localhost:8080/api';
    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'get_menu',
            description: 'Get current menu with availability status',
            inputSchema: {
              type: 'object',
              properties: {
                category: { 
                  type: 'string', 
                  enum: ['all', 'poke_bowls', 'fresh_fish', 'appetizers', 'drinks'],
                  description: 'Menu category to retrieve'
                },
                includeUnavailable: { 
                  type: 'boolean', 
                  default: false,
                  description: 'Include out-of-stock items'
                },
              },
            },
          },
          {
            name: 'update_item_availability',
            description: 'Update menu item availability status',
            inputSchema: {
              type: 'object',
              properties: {
                itemId: { type: 'string', description: 'Menu item ID' },
                available: { type: 'boolean', description: 'Availability status' },
                reason: { type: 'string', description: 'Reason for unavailability (optional)' },
              },
              required: ['itemId', 'available'],
            },
          },
          {
            name: 'update_item_price',
            description: 'Update menu item price',
            inputSchema: {
              type: 'object',
              properties: {
                itemId: { type: 'string', description: 'Menu item ID' },
                newPrice: { type: 'number', description: 'New price in dollars' },
                reason: { type: 'string', description: 'Reason for price change' },
              },
              required: ['itemId', 'newPrice'],
            },
          },
          {
            name: 'add_daily_special',
            description: 'Add or update daily special item',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Special item name' },
                description: { type: 'string', description: 'Item description' },
                price: { type: 'number', description: 'Price in dollars' },
                category: { type: 'string', description: 'Menu category' },
                expiresAt: { type: 'string', format: 'date-time', description: 'When special expires' },
              },
              required: ['name', 'description', 'price', 'category'],
            },
          },
          {
            name: 'get_inventory_status',
            description: 'Get current inventory levels and alerts',
            inputSchema: {
              type: 'object',
              properties: {
                alertsOnly: { 
                  type: 'boolean', 
                  default: false,
                  description: 'Return only items with low stock alerts'
                },
              },
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'get_menu':
            return await this.getMenu(args);
          case 'update_item_availability':
            return await this.updateItemAvailability(args);
          case 'update_item_price':
            return await this.updateItemPrice(args);
          case 'add_daily_special':
            return await this.addDailySpecial(args);
          case 'get_inventory_status':
            return await this.getInventoryStatus(args);
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

  private async getMenu(args: any) {
    try {
      const response = await axios.get(`${this.apiUrl}/menu`, {
        params: {
          category: args.category,
          includeUnavailable: args.includeUnavailable,
        },
      });

      return {
        content: [{
          type: 'text' as const,
          text: `Current menu (${args.category || 'all categories'}):\n${JSON.stringify(response.data, null, 2)}`,
        }],
      };
    } catch (error) {
      throw new Error(`Failed to retrieve menu: ${error.message}`);
    }
  }

  private async updateItemAvailability(args: any) {
    try {
      const response = await axios.put(`${this.apiUrl}/menu/items/${args.itemId}/availability`, {
        available: args.available,
        reason: args.reason,
      });

      return {
        content: [{
          type: 'text' as const,
          text: `Successfully updated item ${args.itemId} availability to ${args.available ? 'available' : 'unavailable'}${args.reason ? ` (${args.reason})` : ''}`,
        }],
      };
    } catch (error) {
      throw new Error(`Failed to update item availability: ${error.message}`);
    }
  }

  private async updateItemPrice(args: any) {
    try {
      const response = await axios.put(`${this.apiUrl}/menu/items/${args.itemId}/price`, {
        price: args.newPrice,
        reason: args.reason,
      });

      return {
        content: [{
          type: 'text' as const,
          text: `Successfully updated item ${args.itemId} price to $${args.newPrice.toFixed(2)}${args.reason ? ` (${args.reason})` : ''}`,
        }],
      };
    } catch (error) {
      throw new Error(`Failed to update item price: ${error.message}`);
    }
  }

  private async addDailySpecial(args: any) {
    try {
      const response = await axios.post(`${this.apiUrl}/menu/daily-specials`, {
        name: args.name,
        description: args.description,
        price: args.price,
        category: args.category,
        expiresAt: args.expiresAt,
      });

      return {
        content: [{
          type: 'text' as const,
          text: `Successfully added daily special: ${args.name} - $${args.price.toFixed(2)}`,
        }],
      };
    } catch (error) {
      throw new Error(`Failed to add daily special: ${error.message}`);
    }
  }

  private async getInventoryStatus(args: any) {
    try {
      const response = await axios.get(`${this.apiUrl}/inventory/status`, {
        params: {
          alertsOnly: args.alertsOnly,
        },
      });

      const status = response.data;
      let message = args.alertsOnly 
        ? 'Low stock alerts:\n' 
        : 'Current inventory status:\n';
      
      message += JSON.stringify(status, null, 2);

      return {
        content: [{
          type: 'text' as const,
          text: message,
        }],
      };
    } catch (error) {
      throw new Error(`Failed to get inventory status: ${error.message}`);
    }
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

const agent = new AliiMenuAgent();
agent.start().catch(console.error);