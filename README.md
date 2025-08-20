# Universal MCP Ecosystem

Unified Model Context Protocol (MCP) agents and servers for the Universal Payment Protocol ecosystem.

## Overview

This repository contains all MCP servers and agents used across the UPP ecosystem:
- **Universal Payment Protocol (UPP)** - Core payment processing
- **Ali'i Fish Market** - POS system and automation
- **Seller Funnel** - Real estate lead generation
- **General Business Applications** - Shared services

## Architecture

```
universal-mcp-ecosystem/
├── servers/
│   ├── aws/              # AWS service integrations
│   ├── database/         # Database MCP servers
│   ├── payments/         # Payment processing agents
│   ├── automation/       # N8N workflows and automation
│   └── business/         # Business logic agents
├── agents/
│   ├── alii/            # Ali'i Fish Market specific agents
│   ├── upp/             # UPP core agents
│   └── seller/          # Real estate seller agents
├── shared/
│   ├── schemas/         # Common data schemas
│   ├── utils/           # Shared utilities
│   └── config/          # Configuration templates
└── docs/
    ├── setup/           # Installation guides
    ├── api/             # API documentation
    └── examples/        # Usage examples
```

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.9+
- Docker (optional)

### Installation

```bash
# Clone repository
git clone https://github.com/robertsn808/universal-mcp-ecosystem.git
cd universal-mcp-ecosystem

# Install dependencies
npm install
pip install -r requirements.txt

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Start MCP servers
npm run start:all
```

## MCP Servers

### AWS Integration Servers
- **Amazon Kendra Index** - Search and indexing
- **Amazon Keyspaces** - Cassandra-compatible database
- **Amazon Neptune** - Graph database
- **AWS API Gateway** - API management
- **CloudWatch** - Monitoring and logging
- **DynamoDB** - NoSQL database
- **Lambda Functions** - Serverless computing
- **S3 Tables** - Data lake operations

### Database Servers
- **PostgreSQL MCP** - Relational database operations
- **SQLite MCP** - Lightweight database
- **Redis MCP** - Caching and session storage

### Payment Processing
- **Stripe Integration** - Payment processing
- **UPP Core Agent** - Universal payment protocols
- **Fraud Detection** - AI-powered fraud prevention

### Business Automation
- **N8N Workflows** - Visual automation
- **Email Marketing** - Campaign management
- **CRM Integration** - Customer relationship management
- **Analytics Agent** - Business intelligence

## Application-Specific Agents

### Ali'i Fish Market
- **Menu Management** - Dynamic menu updates
- **Order Processing** - Real-time order handling
- **Inventory Tracking** - Stock management
- **Customer Analytics** - Behavior analysis

### Universal Payment Protocol
- **Device Registration** - Multi-device support
- **Transaction Processing** - Payment flows
- **Security Monitoring** - Fraud detection
- **Compliance Reporting** - Regulatory compliance

### Seller Funnel
- **Lead Generation** - Marketing automation
- **Content Creation** - AI-powered content
- **Property Management** - Real estate operations
- **Facebook Ads** - Advertising integration

## Development

### Adding New Agents

1. Create agent directory:
```bash
mkdir -p agents/your-app/your-agent
```

2. Implement MCP server:
```typescript
// agents/your-app/your-agent/server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
// Implementation details...
```

3. Add configuration:
```json
// agents/your-app/your-agent/config.json
{
  "name": "your-agent",
  "version": "1.0.0",
  "description": "Your agent description"
}
```

4. Register in main config:
```json
// config/agents.json
{
  "agents": {
    "your-agent": "./agents/your-app/your-agent"
  }
}
```

### Testing

```bash
# Run all tests
npm test

# Test specific agent
npm test -- agents/alii/menu-management

# Integration tests
npm run test:integration
```

## Deployment

### Local Development
```bash
npm run dev
```

### Production
```bash
# Docker
docker-compose up -d

# Manual
npm run build
npm run start:prod
```

### Cloud Deployment
- **AWS**: Use provided CloudFormation templates
- **Google Cloud**: Use Cloud Run configuration
- **Azure**: Use Container Instances

## Configuration

### Environment Variables

```bash
# Core Configuration
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://user:pass@host:5432/db
REDIS_URL=redis://localhost:6379

# AWS Services
AWS_REGION=us-west-2
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret

# Payment Processing
STRIPE_SECRET_KEY=sk_live_...
UPP_API_KEY=upp_...

# Business Applications
ALII_DB_URL=postgresql://...
SELLER_CRM_API=https://...
```

### Claude Code Integration

Add to your Claude Code configuration:

```json
{
  "mcpServers": {
    "upp-agents": {
      "command": "node",
      "args": ["dist/servers/main.js"],
      "env": {
        "NODE_ENV": "development"
      }
    }
  }
}
```

## API Documentation

### Core MCP Methods

#### Database Operations
```javascript
// Query database
await mcp.call('database/query', {
  query: 'SELECT * FROM orders WHERE status = ?',
  params: ['pending']
});

// Transaction management
await mcp.call('database/transaction', {
  operations: [
    { type: 'insert', table: 'orders', data: {...} },
    { type: 'update', table: 'inventory', data: {...} }
  ]
});
```

#### Payment Processing
```javascript
// Process payment
await mcp.call('payments/process', {
  amount: 1695,
  currency: 'USD',
  paymentMethod: 'nfc',
  merchantId: 'alii_fish_market'
});

// Check transaction status
await mcp.call('payments/status', {
  transactionId: 'txn_123456789'
});
```

#### Business Automation
```javascript
// Trigger workflow
await mcp.call('automation/trigger', {
  workflow: 'new-order-notification',
  data: { orderId: '12345', customerEmail: 'customer@example.com' }
});

// Get analytics
await mcp.call('analytics/report', {
  type: 'sales',
  period: 'daily',
  startDate: '2025-01-01'
});
```

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

### Code Standards
- TypeScript for all new agents
- ESLint + Prettier configuration
- Jest for testing
- MCP SDK compliance

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/robertsn808/universal-mcp-ecosystem/issues)
- **Discussions**: [GitHub Discussions](https://github.com/robertsn808/universal-mcp-ecosystem/discussions)
- **Email**: support@upp.dev

## Changelog

### v1.0.0 (2025-01-19)
- Initial release
- AWS MCP servers integration
- Ali'i Fish Market agents
- UPP core payment agents
- N8N automation workflows

---

Built with ❤️ for the Universal Payment Protocol ecosystem
