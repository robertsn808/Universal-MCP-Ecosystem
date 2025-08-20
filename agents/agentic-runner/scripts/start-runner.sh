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
