import asyncio
import json
import logging
import time
import uuid
from typing import Dict, List, Optional, Set
from uuid import uuid4

import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
from fastapi import Request
from pydantic import BaseModel
import aiofiles

# Import A2A client
from common.client.client import A2AClient
from common.types import Message, TextPart

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Companion Agent Canvas Interface")

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Data models
class AgentConfig(BaseModel):
    id: str
    name: str
    description: str
    color: str
    tools: List[str]
    server_url: str
    is_active: bool = True

class CanvasAction(BaseModel):
    agent_id: str
    action_type: str  # "draw", "mermaid", "clear"
    data: dict
    timestamp: float

class MermaidDiagram(BaseModel):
    id: str
    content: str
    position: dict
    agent_id: str

# Global state
agents: Dict[str, AgentConfig] = {}
canvas_actions: List[CanvasAction] = []
mermaid_diagrams: List[MermaidDiagram] = []
connected_clients: Set[WebSocket] = set()

# Agent server discovery
KNOWN_AGENT_SERVERS = [
    {
        "name": "Ollama Host Agent",
        "description": "Coordinates tasks between agents using Ollama",
        "url": "http://localhost:12001",
        "endpoint": "/ollama_host_agent",
        "color": "#3b82f6",
        "tools": ["coordination", "planning"]
    },
    {
        "name": "Ollama Search Agent", 
        "description": "Handles search and information retrieval",
        "url": "http://localhost:11001",
        "endpoint": "/ollama_simple_search_agent",
        "color": "#10b981",
        "tools": ["search", "text"]
    }
]

# A2A Client manager
class A2AClientManager:
    def __init__(self):
        self.clients: Dict[str, A2AClient] = {}
    
    async def add_agent(self, agent_config: AgentConfig):
        """Add a new agent and create A2A client for it"""
        try:
            # The A2A client from local a2a_servers only needs a URL
            client = A2AClient(url=agent_config.server_url)
            self.clients[agent_config.id] = client
            logger.info(f"Added A2A client for agent {agent_config.name}")
        except Exception as e:
            logger.error(f"Failed to create A2A client for {agent_config.name}: {e}")
            raise
    
    async def send_task_to_agent(self, agent_id: str, task_description: str) -> str:
        """Send a task to a specific agent via A2A"""
        if agent_id not in self.clients:
            raise ValueError(f"Agent {agent_id} not found")
        
        client = self.clients[agent_id]
        task_id = f"canvas-task-{uuid4().hex}"
        session_id = f"canvas-session-{uuid4().hex}"
        
        user_message = Message(
            message_id=f"msg-{uuid4().hex}",
            role="user",
            parts=[TextPart(text=task_description)]
        )
        
        # Ensure the message has the correct structure
        message_dict = user_message.model_dump()
        # Make sure message_id is present
        if "message_id" not in message_dict:
            message_dict["message_id"] = user_message.message_id
        
        send_params = {
            "id": task_id,
            "sessionId": session_id,
            "message": message_dict,
        }
        
        try:
            # Use the send_task method from local a2a_servers
            from common.types import TaskSendParams
            
            # Create the task request with proper message structure
            task_params = TaskSendParams(
                id=task_id,
                sessionId=session_id,
                message=user_message
            )
            
            # Convert to dictionary with proper field names
            task_dict = task_params.model_dump(by_alias=True)
            
            response = await client.send_task(task_dict)
            
            # Extract the response text and canvas actions
            response_text = "No response received"
            canvas_actions = []
            
            if hasattr(response, 'result') and response.result:
                if hasattr(response.result, 'status') and response.result.status:
                    if hasattr(response.result.status, 'message') and response.result.status.message:
                        if response.result.status.message.parts:
                            # Extract text from first part
                            first_part = response.result.status.message.parts[0]
                            if hasattr(first_part, 'text'):
                                response_text = first_part.text
                            
                            # Extract canvas actions from data parts
                            for part in response.result.status.message.parts:
                                if hasattr(part, 'data') and part.data:
                                    if 'canvas_action' in part.data:
                                        canvas_actions.append(part.data['canvas_action'])
            
            # Return both text and canvas actions
            return {
                "text": response_text,
                "canvas_actions": canvas_actions
            }
        except Exception as e:
            logger.error(f"Error sending task to agent {agent_id}: {e}")
            raise

a2a_manager = A2AClientManager()

async def discover_agent_servers():
    """Automatically discover and connect to running agent servers"""
    logger.info("🔍 Scanning for agent servers...")
    
    discovered_agents = []
    
    for server_info in KNOWN_AGENT_SERVERS:
        try:
            # Test if server is running
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{server_info['url']}/.well-known/agent.json", timeout=5.0)
                
                if response.status_code == 200:
                    logger.info(f"✅ Found agent server: {server_info['name']}")
                    
                    # Create agent config
                    agent_config = AgentConfig(
                        id=f"auto-{server_info['name'].lower().replace(' ', '-')}",
                        name=server_info['name'],
                        description=server_info['description'],
                        color=server_info['color'],
                        tools=server_info['tools'],
                        server_url=server_info['url'],  # Use base URL, not base + endpoint
                        is_active=True
                    )
                    
                    # Add to A2A manager
                    try:
                        await a2a_manager.add_agent(agent_config)
                        agents[agent_config.id] = agent_config
                        discovered_agents.append(agent_config)
                        logger.info(f"✅ Connected to {server_info['name']}")
                    except Exception as e:
                        logger.error(f"❌ Failed to connect to {server_info['name']}: {e}")
                        
        except Exception as e:
            logger.warning(f"⚠️  Agent server {server_info['name']} not available: {e}")
    
    logger.info(f"🎯 Discovered {len(discovered_agents)} agent servers")
    return discovered_agents

@app.get("/", response_class=HTMLResponse)
async def get_main_page(request: Request):
    """Serve the main interface page"""
    return templates.TemplateResponse("index.html", {"request": request})

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time communication"""
    await websocket.accept()
    connected_clients.add(websocket)
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            await handle_websocket_message(websocket, message)
    except WebSocketDisconnect:
        connected_clients.remove(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        connected_clients.remove(websocket)

async def handle_websocket_message(websocket: WebSocket, message: dict):
    """Handle incoming WebSocket messages"""
    message_type = message.get("type")
    
    if message_type == "add_agent":
        await handle_add_agent(websocket, message)
    elif message_type == "update_agent":
        await handle_update_agent(websocket, message)
    elif message_type == "remove_agent":
        await handle_remove_agent(websocket, message)
    elif message_type == "canvas_action":
        await handle_canvas_action(websocket, message)
    elif message_type == "query_agents":
        await handle_query_agents(websocket, message)
    elif message_type == "clear_agent_layer":
        await handle_clear_agent_layer(websocket, message)
    elif message_type == "modification_request":
        await handle_modification_request(websocket, message)
    elif message_type == "discover_agents":
        await handle_discover_agents(websocket, message)
    else:
        await websocket.send_text(json.dumps({
            "type": "error",
            "message": f"Unknown message type: {message_type}"
        }))

async def handle_add_agent(websocket: WebSocket, message: dict):
    """Handle adding a new agent"""
    try:
        agent_data = message.get("agent", {})
        agent_config = AgentConfig(
            id=agent_data.get("id", str(uuid4())),
            name=agent_data["name"],
            description=agent_data["description"],
            color=agent_data["color"],
            tools=agent_data.get("tools", []),
            server_url=agent_data["server_url"]
        )
        
        # Add to A2A manager
        await a2a_manager.add_agent(agent_config)
        
        # Store agent
        agents[agent_config.id] = agent_config
        
        # Broadcast to all clients
        await broadcast_to_clients({
            "type": "agent_added",
            "agent": agent_config.model_dump()
        })
        
        await websocket.send_text(json.dumps({
            "type": "success",
            "message": f"Agent {agent_config.name} added successfully"
        }))
        
    except Exception as e:
        await websocket.send_text(json.dumps({
            "type": "error",
            "message": f"Failed to add agent: {str(e)}"
        }))

async def handle_update_agent(websocket: WebSocket, message: dict):
    """Handle updating an existing agent"""
    try:
        agent_data = message.get("agent", {})
        agent_id = agent_data["id"]
        
        if agent_id not in agents:
            raise ValueError("Agent not found")
        
        # Update agent
        agents[agent_id].name = agent_data["name"]
        agents[agent_id].description = agent_data["description"]
        agents[agent_id].color = agent_data["color"]
        agents[agent_id].tools = agent_data.get("tools", [])
        agents[agent_id].is_active = agent_data.get("is_active", True)
        
        # Broadcast update
        await broadcast_to_clients({
            "type": "agent_updated",
            "agent": agents[agent_id].model_dump()
        })
        
    except Exception as e:
        await websocket.send_text(json.dumps({
            "type": "error",
            "message": f"Failed to update agent: {str(e)}"
        }))

async def handle_remove_agent(websocket: WebSocket, message: dict):
    """Handle removing an agent"""
    try:
        agent_id = message.get("agent_id")
        
        if agent_id not in agents:
            raise ValueError("Agent not found")
        
        # Remove from A2A manager
        if agent_id in a2a_manager.clients:
            del a2a_manager.clients[agent_id]
        
        # Remove agent
        del agents[agent_id]
        
        # Remove agent's canvas actions
        global canvas_actions
        canvas_actions = [action for action in canvas_actions if action.agent_id != agent_id]
        
        # Broadcast removal
        await broadcast_to_clients({
            "type": "agent_removed",
            "agent_id": agent_id
        })
        
    except Exception as e:
        await websocket.send_text(json.dumps({
            "type": "error",
            "message": f"Failed to remove agent: {str(e)}"
        }))

async def handle_canvas_action(websocket: WebSocket, message: dict):
    """Handle canvas drawing actions"""
    try:
        action_data = message.get("action", {})
        canvas_action = CanvasAction(
            agent_id=action_data["agent_id"],
            action_type=action_data["action_type"],
            data=action_data["data"],
            timestamp=action_data.get("timestamp", asyncio.get_event_loop().time())
        )
        
        # Store action
        canvas_actions.append(canvas_action)
        
        # Broadcast to all clients
        await broadcast_to_clients({
            "type": "canvas_action",
            "action": canvas_action.model_dump()
        })
        
    except Exception as e:
        await websocket.send_text(json.dumps({
            "type": "error",
            "message": f"Failed to process canvas action: {str(e)}"
        }))

async def handle_query_agents(websocket: WebSocket, message: dict):
    """Handle querying all agents and coordinating their responses"""
    try:
        query = message.get("query", "")
        if not query:
            raise ValueError("Query is required")
        
        # Send query to all active agents
        responses = {}
        tasks = []
        
        for agent_id, agent_config in agents.items():
            if agent_config.is_active:
                task = asyncio.create_task(
                    a2a_manager.send_task_to_agent(agent_id, query)
                )
                tasks.append((agent_id, task))
        
        # Wait for all responses
        all_canvas_actions = []
        for agent_id, task in tasks:
            try:
                response = await task
                if isinstance(response, dict) and "text" in response:
                    responses[agent_id] = response["text"]
                    # Process canvas actions
                    if "canvas_actions" in response and response["canvas_actions"]:
                        for canvas_action in response["canvas_actions"]:
                            # Add timestamp and agent info
                            canvas_action["timestamp"] = time.time()
                            canvas_action["agent_id"] = agent_id
                            all_canvas_actions.append(canvas_action)
                else:
                    responses[agent_id] = response
            except Exception as e:
                responses[agent_id] = f"Error: {str(e)}"
        
        # Broadcast canvas actions first
        for canvas_action in all_canvas_actions:
            await broadcast_to_clients({
                "type": "canvas_action",
                "action": canvas_action
            })
        
        # Broadcast responses
        await broadcast_to_clients({
            "type": "agent_responses",
            "query": query,
            "responses": responses
        })
        
    except Exception as e:
        await websocket.send_text(json.dumps({
            "type": "error",
            "message": f"Failed to query agents: {str(e)}"
        }))

async def handle_clear_agent_layer(websocket: WebSocket, message: dict):
    """Handle clearing a specific agent's layer"""
    try:
        agent_id = message.get("agent_id")
        
        # Remove agent's canvas actions
        global canvas_actions
        canvas_actions = [action for action in canvas_actions if action.agent_id != agent_id]
        
        # Broadcast clear action
        await broadcast_to_clients({
            "type": "layer_cleared",
            "agent_id": agent_id
        })
        
    except Exception as e:
        await websocket.send_text(json.dumps({
            "type": "error",
            "message": f"Failed to clear layer: {str(e)}"
        }))

async def handle_modification_request(websocket: WebSocket, message: dict):
    """Handle modification requests between agents"""
    try:
        request_data = message.get("request", {})
        
        # Validate request data
        if not all(key in request_data for key in ["from_agent_id", "to_agent_id", "data"]):
            raise ValueError("Invalid modification request format")
        
        # Broadcast modification request to all clients
        await broadcast_to_clients({
            "type": "modification_request",
            "request": request_data
        })
        
        # Log the request
        logger.info(f"Modification request from {request_data['from_agent_id']} to {request_data['to_agent_id']}: {request_data['data']}")
        
    except Exception as e:
        await websocket.send_text(json.dumps({
            "type": "error",
            "message": f"Failed to process modification request: {str(e)}"
        }))

async def handle_discover_agents(websocket: WebSocket, message: dict):
    """Handle agent discovery request"""
    try:
        discovered_agents = await discover_agent_servers()
        
        # Broadcast discovered agents to all clients
        for agent in discovered_agents:
            await broadcast_to_clients({
                "type": "agent_added",
                "agent": agent.model_dump()
            })
        
        await websocket.send_text(json.dumps({
            "type": "success",
            "message": f"Discovered {len(discovered_agents)} agents"
        }))
        
    except Exception as e:
        await websocket.send_text(json.dumps({
            "type": "error",
            "message": f"Failed to discover agents: {str(e)}"
        }))

async def broadcast_to_clients(message: dict):
    """Broadcast message to all connected clients"""
    message_text = json.dumps(message)
    disconnected = set()
    
    for client in connected_clients:
        try:
            await client.send_text(message_text)
        except Exception:
            disconnected.add(client)
    
    # Remove disconnected clients
    for client in disconnected:
        connected_clients.remove(client)

@app.get("/api/agents")
async def get_agents():
    """Get all agents"""
    return {"agents": [agent.model_dump() for agent in agents.values()]}

@app.post("/api/discover-agents")
async def discover_agents():
    """Manually trigger agent discovery"""
    discovered = await discover_agent_servers()
    return {
        "message": f"Discovered {len(discovered)} agents",
        "agents": [agent.model_dump() for agent in discovered]
    }

@app.get("/api/canvas-actions")
async def get_canvas_actions():
    """Get all canvas actions"""
    return {"actions": [action.model_dump() for action in canvas_actions]}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 