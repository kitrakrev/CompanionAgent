#!/bin/bash

# Companion Agent Canvas Interface Startup Script

echo "🎨 Starting Companion Agent Canvas Interface..."

# Function to check if a port is in use
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null ; then
        echo "⚠️  Port $port is already in use. Stopping existing process..."
        lsof -ti:$port | xargs kill -9
        sleep 2
    fi
}

# Function to start agent server
start_agent_server() {
    local script=$1
    local port=$2
    local name=$3
    
    echo "🤖 Starting $name on port $port..."
    check_port $port
    
    # Start the agent server in background
    uv run python $script &
    local pid=$!
    echo "✅ $name started with PID: $pid"
    
    # Wait a bit for the server to start
    sleep 3
    
    # Check if server started successfully
    if curl -s http://localhost:$port >/dev/null 2>&1; then
        echo "✅ $name is running on http://localhost:$port"
    else
        echo "❌ Failed to start $name on port $port"
    fi
    
    return $pid
}

# Kill any existing processes on our ports
echo "🧹 Cleaning up existing processes..."
check_port 8000  # Main app
check_port 12001 # Ollama host agent
check_port 11001 # Ollama search agent

# Start agent servers
echo ""
echo "🚀 Starting Agent Servers..."

# Start Ollama Host Agent Server
start_agent_server "ollama_host_agent_server.py" 12001 "Ollama Host Agent"

# Start Ollama Search Agent Server  
start_agent_server "ollama_simple_search_agent_server.py" 11001 "Ollama Search Agent"

# Wait for agents to fully start
echo ""
echo "⏳ Waiting for agents to initialize..."
sleep 5

# Check agent status
echo ""
echo "🔍 Checking agent status..."
if curl -s http://localhost:12001 >/dev/null 2>&1; then
    echo "✅ Ollama Host Agent: http://localhost:12001"
else
    echo "❌ Ollama Host Agent: Not responding"
fi

if curl -s http://localhost:11001 >/dev/null 2>&1; then
    echo "✅ Ollama Search Agent: http://localhost:11001"
else
    echo "❌ Ollama Search Agent: Not responding"
fi

# Start the main application
echo ""
echo "🚀 Starting main application on http://localhost:8000"
echo "📱 Open your browser and navigate to: http://localhost:8000"
echo "🛑 Press Ctrl+C to stop all servers"
echo ""

# Start the main application
uv run python app.py 