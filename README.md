# Companion Agent Canvas Interface

A collaborative canvas interface where multiple AI agents can work together on drawing tasks, with layer-based collaboration and real-time communication.

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- `uv` package manager
- Ollama (for AI agents)

### Installation
```bash
# Clone the repository
git clone <repository-url>
cd CompanionAgent

# Install dependencies
uv sync
```

### Running the System

**Important**: The agents need to be run separately from the main application.

#### Step 1: Start the Agent Servers

Open **three separate terminal windows** and run:

**Terminal 1 - Host Agent:**
```bash
uv run python ollama_host_agent_server.py
```

**Terminal 2 - Search Agent:**
```bash
uv run python ollama_simple_search_agent_server.py
```

**Terminal 3 - Main Application:**
```bash
uv run python app.py
```

#### Step 2: Access the Interface

Open your browser and go to: **http://localhost:8000**

The application will automatically discover and connect to the running agent servers.

### Alternative: Using the Startup Script

You can also use the provided startup script which will start all services:

```bash
./start.sh
```

To stop all services:
```bash
./stop.sh
```

## 🎨 Features

### Canvas & Drawing
- Interactive canvas with Fabric.js
- Layer-based collaboration (agents can't delete each other's work)
- Brush controls (color, size)
- Undo/Redo functionality
- Agent drawing modes

### Agent Management
- Add agents dynamically
- Configure tools per agent
- Color coding for each agent
- Status toggle (active/inactive)
- Layer information display

### Collaboration Features
- Modification requests between agents
- Layer protection system
- Real-time WebSocket communication
- Conversation history with export
- Agent coordination

### Mermaid Diagrams
- Add Mermaid charts to canvas
- Position diagrams anywhere
- Agent attribution tracking

### A2A Integration
- Connect to your existing A2A agent servers
- Task distribution across agents
- Response aggregation
- Error handling

## 🏗️ Architecture

### Layer Protection System

The key innovation is that **agents cannot delete each other's work**:

1. **Agent Isolation**: Each agent works on their own layer
2. **No Cross-Deletion**: Agents cannot modify each other's drawings
3. **Modification Requests**: Formal system for requesting changes
4. **Visual Feedback**: Target agent highlighting for requests
5. **Layer Statistics**: Real-time object counts and status

### Components

- **Frontend**: HTML5 Canvas with Fabric.js, WebSocket communication
- **Backend**: FastAPI with WebSocket support
- **Agents**: A2A-compatible agent servers
- **Communication**: Real-time WebSocket messaging

## 🛠️ Development

### Project Structure
```
CompanionAgent/
├── app.py                          # Main FastAPI application
├── ollama_host_agent_server.py     # Host agent server
├── ollama_simple_search_agent_server.py  # Search agent server
├── templates/                      # HTML templates
├── static/                         # Static assets (CSS, JS)
├── start.sh                        # Startup script
├── stop.sh                         # Stop script
└── README.md                       # This file
```

### Adding New Agents

1. Create a new agent server file (e.g., `my_agent_server.py`)
2. Follow the pattern of existing agent servers
3. Add the agent to `KNOWN_AGENT_SERVERS` in `app.py`
4. Start the new agent server in a separate terminal

### Customizing Agent Behavior

Each agent server can be customized by modifying:
- Response logic in the `handle_task` function
- Agent capabilities in the agent card
- Integration with external services (Ollama, APIs, etc.)

## 🎯 Usage Examples

### Basic Drawing
1. Open the interface at http://localhost:8000
2. Use the brush tools to draw on the canvas
3. Add agents using the "Add Agent" button
4. Send queries to agents to have them draw

### Agent Collaboration
1. Add multiple agents with different capabilities
2. Send a complex query that requires coordination
3. Watch agents collaborate and draw on their respective layers
4. Use modification requests to ask agents to change their work

### Mermaid Diagrams
1. Use the "Add Mermaid" button to add diagrams
2. Position diagrams on the canvas
3. Have agents reference and work around the diagrams

## 🔧 Troubleshooting

### Common Issues

**Agents not discovered:**
- Ensure agent servers are running on the correct ports
- Check that the main application can reach the agent servers
- Verify the agent card endpoints are accessible

**WebSocket connection issues:**
- Check that the main application is running on port 8000
- Ensure no firewall is blocking the connection
- Check browser console for WebSocket errors

**Agent communication failures:**
- Verify A2A client initialization
- Check agent server logs for errors
- Ensure proper message format

### Logs

Check the terminal outputs for:
- Agent server startup messages
- WebSocket connection status
- Agent discovery logs
- Error messages

## 📝 License

This project is licensed under the MIT License.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 🆘 Support

For issues and questions:
1. Check the troubleshooting section
2. Review the logs
3. Open an issue with detailed information
