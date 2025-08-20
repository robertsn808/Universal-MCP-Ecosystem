# Multi-stage build for UPP MCP Agents
FROM node:18-alpine AS base

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    py3-pip \
    python3-dev \
    build-base \
    curl \
    git

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install Node.js dependencies
RUN npm ci --only=production && npm cache clean --force

# Development stage
FROM base AS development
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# Build stage
FROM base AS build
RUN npm install
COPY . .
RUN npm run build

# Production stage
FROM base AS production

# Install Python dependencies for MCP servers
COPY requirements.txt ./
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy built application
COPY --from=build /app/dist ./dist
COPY --from=build /app/config ./config
COPY --from=build /app/servers ./servers
COPY --from=build /app/agents ./agents

# Create non-root user
RUN addgroup -g 1001 -S mcp && \
    adduser -S mcp -u 1001

# Create necessary directories and set permissions
RUN mkdir -p logs && \
    chown -R mcp:mcp /app

USER mcp

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

EXPOSE 3000

CMD ["npm", "start"]