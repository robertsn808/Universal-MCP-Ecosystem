#!/bin/bash

# UPP MCP Agents Startup Script
# Coordinates startup of all MCP servers and agents

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_ROOT/logs"
PID_DIR="$PROJECT_ROOT/.pids"

# Create directories
mkdir -p "$LOG_DIR" "$PID_DIR"

# Load environment variables
if [ -f "$PROJECT_ROOT/.env" ]; then
    source "$PROJECT_ROOT/.env"
fi

# Logging function
log() {
    local level=$1
    local message=$2
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case $level in
        "INFO")
            echo -e "${GREEN}[INFO]${NC} $timestamp - $message"
            ;;
        "WARN")
            echo -e "${YELLOW}[WARN]${NC} $timestamp - $message"
            ;;
        "ERROR")
            echo -e "${RED}[ERROR]${NC} $timestamp - $message"
            ;;
        "DEBUG")
            if [ "${DEBUG:-false}" = "true" ]; then
                echo -e "${BLUE}[DEBUG]${NC} $timestamp - $message"
            fi
            ;;
    esac
    
    echo "$timestamp [$level] $message" >> "$LOG_DIR/startup.log"
}

# Health check function
health_check() {
    local service=$1
    local url=$2
    local timeout=${3:-30}
    
    log "INFO" "Checking health of $service..."
    
    for i in $(seq 1 $timeout); do
        if curl -sf "$url" > /dev/null 2>&1; then
            log "INFO" "$service is healthy"
            return 0
        fi
        sleep 1
    done
    
    log "ERROR" "$service health check failed after ${timeout}s"
    return 1
}

# Start service function
start_service() {
    local service_name=$1
    local command=$2
    local log_file="$LOG_DIR/${service_name}.log"
    local pid_file="$PID_DIR/${service_name}.pid"
    
    log "INFO" "Starting $service_name..."
    
    # Kill existing process if running
    if [ -f "$pid_file" ]; then
        local old_pid=$(cat "$pid_file")
        if kill -0 "$old_pid" 2>/dev/null; then
            log "WARN" "Stopping existing $service_name process (PID: $old_pid)"
            kill "$old_pid"
            sleep 2
        fi
        rm -f "$pid_file"
    fi
    
    # Start new process
    nohup bash -c "$command" > "$log_file" 2>&1 &
    local pid=$!
    echo $pid > "$pid_file"
    
    log "INFO" "Started $service_name (PID: $pid)"
    sleep 2
    
    # Verify process is running
    if ! kill -0 "$pid" 2>/dev/null; then
        log "ERROR" "Failed to start $service_name"
        return 1
    fi
    
    return 0
}

# Stop service function
stop_service() {
    local service_name=$1
    local pid_file="$PID_DIR/${service_name}.pid"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            log "INFO" "Stopping $service_name (PID: $pid)"
            kill "$pid"
            sleep 2
            
            # Force kill if still running
            if kill -0 "$pid" 2>/dev/null; then
                log "WARN" "Force killing $service_name"
                kill -9 "$pid"
            fi
        fi
        rm -f "$pid_file"
    fi
}

# Main startup function
start_all() {
    log "INFO" "Starting UPP MCP Agents ecosystem..."
    
    # Start infrastructure services first
    if [ "${USE_DOCKER:-true}" = "true" ]; then
        log "INFO" "Starting Docker infrastructure..."
        docker-compose -f "$PROJECT_ROOT/docker-compose.yml" up -d postgres redis localstack
        sleep 5
        
        # Wait for databases to be ready
        health_check "PostgreSQL" "postgres://localhost:5432" 30
        health_check "Redis" "redis://localhost:6379" 30
        
        if [ "${AWS_LOCALSTACK:-false}" = "true" ]; then
            health_check "LocalStack" "http://localhost:4566/health" 60
        fi
    fi
    
    # Start AWS MCP servers if enabled
    if [ "${ENABLE_AWS_INTEGRATION:-false}" = "true" ]; then
        log "INFO" "Starting AWS MCP servers..."
        
        start_service "dynamodb-mcp" "cd '$PROJECT_ROOT/servers/aws/dynamodb-mcp-server' && python -m awslabs.dynamodb_mcp_server"
        start_service "lambda-mcp" "cd '$PROJECT_ROOT/servers/aws/lambda-tool-mcp-server' && python -m awslabs.lambda_tool_mcp_server"
        start_service "cloudwatch-mcp" "cd '$PROJECT_ROOT/servers/aws/cloudwatch-mcp-server' && python -m awslabs.cloudwatch_mcp_server"
    fi
    
    # Start database MCP server
    log "INFO" "Starting database MCP server..."
    start_service "postgres-mcp" "cd '$PROJECT_ROOT/servers/database/postgres-mcp-server' && python -m awslabs.postgres_mcp_server"
    
    # Start N8N automation server
    if [ "${ENABLE_AUTOMATION:-false}" = "true" ]; then
        log "INFO" "Starting N8N automation server..."
        if [ "${USE_DOCKER:-true}" = "true" ]; then
            docker-compose -f "$PROJECT_ROOT/docker-compose.yml" up -d n8n
            health_check "N8N" "http://localhost:5678" 60
        fi
    fi
    
    # Start core UPP agents
    log "INFO" "Starting UPP core agents..."
    start_service "upp-payment-processor" "cd '$PROJECT_ROOT' && npx tsx agents/upp/payment-processor/server.ts"
    
    # Start business application agents
    log "INFO" "Starting business application agents..."
    start_service "alii-menu-management" "cd '$PROJECT_ROOT' && npx tsx agents/alii/menu-management/server.ts"
    
    # Start main MCP agent manager
    log "INFO" "Starting main MCP Agent Manager..."
    start_service "mcp-manager" "cd '$PROJECT_ROOT' && npm run start:dev"
    
    # Health check main service
    health_check "MCP Agent Manager" "http://localhost:3000/health" 30
    
    log "INFO" "All services started successfully!"
    log "INFO" "MCP Agent Manager: http://localhost:3000"
    log "INFO" "MCP Status: http://localhost:3000/mcp/status"
    
    if [ "${ENABLE_AUTOMATION:-false}" = "true" ]; then
        log "INFO" "N8N Automation: http://localhost:5678"
    fi
}

# Stop all services
stop_all() {
    log "INFO" "Stopping all MCP services..."
    
    # Stop individual services
    stop_service "mcp-manager"
    stop_service "alii-menu-management"
    stop_service "upp-payment-processor"
    stop_service "postgres-mcp"
    stop_service "cloudwatch-mcp"
    stop_service "lambda-mcp"
    stop_service "dynamodb-mcp"
    
    # Stop Docker services
    if [ "${USE_DOCKER:-true}" = "true" ]; then
        log "INFO" "Stopping Docker services..."
        docker-compose -f "$PROJECT_ROOT/docker-compose.yml" down
    fi
    
    log "INFO" "All services stopped"
}

# Status check
status() {
    log "INFO" "Checking status of all services..."
    
    local services=(
        "mcp-manager"
        "alii-menu-management"
        "upp-payment-processor"
        "postgres-mcp"
        "dynamodb-mcp"
        "lambda-mcp"
        "cloudwatch-mcp"
    )
    
    for service in "${services[@]}"; do
        local pid_file="$PID_DIR/${service}.pid"
        if [ -f "$pid_file" ]; then
            local pid=$(cat "$pid_file")
            if kill -0 "$pid" 2>/dev/null; then
                log "INFO" "$service is running (PID: $pid)"
            else
                log "WARN" "$service is not running (stale PID file)"
                rm -f "$pid_file"
            fi
        else
            log "WARN" "$service is not running"
        fi
    done
    
    # Check Docker services
    if [ "${USE_DOCKER:-true}" = "true" ]; then
        log "INFO" "Docker services status:"
        docker-compose -f "$PROJECT_ROOT/docker-compose.yml" ps
    fi
}

# Show help
show_help() {
    echo "UPP MCP Agents Management Script"
    echo
    echo "Usage: $0 [command]"
    echo
    echo "Commands:"
    echo "  start     Start all MCP agents and servers"
    echo "  stop      Stop all MCP agents and servers"
    echo "  restart   Restart all services"
    echo "  status    Show status of all services"
    echo "  logs      Show logs from all services"
    echo "  health    Run health checks on all services"
    echo "  help      Show this help message"
    echo
    echo "Environment variables:"
    echo "  USE_DOCKER=true|false           Use Docker for infrastructure (default: true)"
    echo "  ENABLE_AWS_INTEGRATION=true     Enable AWS MCP servers"
    echo "  ENABLE_AUTOMATION=true          Enable N8N automation"
    echo "  DEBUG=true                      Enable debug logging"
}

# Show logs
show_logs() {
    if [ -n "$1" ]; then
        tail -f "$LOG_DIR/$1.log"
    else
        echo "Available log files:"
        ls -la "$LOG_DIR"/*.log 2>/dev/null || echo "No log files found"
    fi
}

# Health check all services
health_check_all() {
    log "INFO" "Running health checks on all services..."
    
    local services=(
        "MCP Agent Manager:http://localhost:3000/health"
    )
    
    if [ "${ENABLE_AUTOMATION:-false}" = "true" ]; then
        services+=("N8N:http://localhost:5678")
    fi
    
    if [ "${USE_DOCKER:-true}" = "true" ]; then
        services+=(
            "PostgreSQL:http://localhost:5432"
            "Redis:http://localhost:6379"
        )
    fi
    
    local all_healthy=true
    for service_info in "${services[@]}"; do
        IFS=':' read -r name url <<< "$service_info"
        if ! health_check "$name" "$url" 10; then
            all_healthy=false
        fi
    done
    
    if [ "$all_healthy" = true ]; then
        log "INFO" "All services are healthy!"
        exit 0
    else
        log "ERROR" "Some services are unhealthy"
        exit 1
    fi
}

# Main script logic
case "${1:-start}" in
    start)
        start_all
        ;;
    stop)
        stop_all
        ;;
    restart)
        stop_all
        sleep 3
        start_all
        ;;
    status)
        status
        ;;
    logs)
        show_logs "$2"
        ;;
    health)
        health_check_all
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo "Unknown command: $1"
        show_help
        exit 1
        ;;
esac