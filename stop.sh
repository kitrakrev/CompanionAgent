#!/bin/bash

# Companion Agent Canvas Interface Stop Script

echo "🛑 Stopping Companion Agent Canvas Interface..."

# Function to stop processes on a port
stop_port() {
    local port=$1
    local name=$2
    
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null ; then
        echo "🛑 Stopping $name on port $port..."
        lsof -ti:$port | xargs kill -9
        echo "✅ Stopped $name"
    else
        echo "ℹ️  $name not running on port $port"
    fi
}

# Stop all services
echo "🧹 Stopping all services..."

stop_port 8000 "Main Application"
stop_port 12001 "Ollama Host Agent"
stop_port 11001 "Ollama Search Agent"

echo ""
echo "✅ All services stopped"
echo "🎨 Companion Agent Canvas Interface shutdown complete" 