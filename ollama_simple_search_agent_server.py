import asyncio
import os
from dotenv import load_dotenv, find_dotenv
from uuid import uuid4

# Create a FastAPI server that works with a2a-sdk
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
import uvicorn
import json
import httpx

load_dotenv(find_dotenv())

# Create FastAPI app
app = FastAPI(title="Ollama Search Agent", version="1.0.0")

# Agent configuration
AGENT_NAME = "ollama_simple_search_agent"
AGENT_DESCRIPTION = "A simple search agent that uses Ollama to answer questions about popular topics and monuments."
PORT = 11001
HOST = "0.0.0.0"

@app.get("/.well-known/agent.json")
async def get_agent_card():
    """Return agent card for A2A discovery"""
    return {
        "name": AGENT_NAME,
        "description": AGENT_DESCRIPTION,
        "version": "1.0.0",
        "url": f"http://{HOST}:{PORT}",
        "endpoint": "/ollama_simple_search_agent",
        "capabilities": {
            "text_input": True,
            "text_output": True,
            "streaming": False
        }
    }

@app.post("/")
async def handle_a2a_task(request: dict):
    """Handle A2A task requests at root endpoint"""
    # Handle JSON-RPC requests from A2A client
    if "jsonrpc" in request and request.get("method") == "tasks/send":
        # Extract params from JSON-RPC request
        params = request.get("params", {})
        return await handle_task(params)
    else:
        # Handle direct requests
        return await handle_task(request)

@app.post("/ollama_simple_search_agent/tasks")
async def handle_task(request: dict):
    """Handle A2A task requests"""
    try:
        # Extract task information
        task_id = request.get("id", "unknown")
        message = request.get("message", {})
        
        # Get the actual message text
        message_text = "No text provided"
        if message.get("parts") and len(message["parts"]) > 0:
            message_text = message["parts"][0].get("text", "No text provided")
        
        # Check for drawing requests
        if any(word in message_text.lower() for word in ["draw", "circle", "rectangle", "square", "triangle", "line"]):
            # Create a drawing action
            canvas_action = {
                "action_type": "draw",
                "agent_id": AGENT_NAME,
                "data": {
                    "path": [
                        {"x": 100, "y": 100, "type": "move"},
                        {"x": 200, "y": 100, "type": "line"},
                        {"x": 200, "y": 200, "type": "line"},
                        {"x": 100, "y": 200, "type": "line"},
                        {"x": 100, "y": 100, "type": "line"}
                    ],
                    "color": "#3b82f6",
                    "strokeWidth": 2
                }
            }
            
            response_text = f"I am the {AGENT_NAME}. I've drawn a rectangle for you based on your request: '{message_text}'. "
            response_text += "The drawing has been added to the canvas."
            
        # Check for Mermaid diagram requests
        elif any(word in message_text.lower() for word in ["mermaid", "diagram", "flowchart", "process flow"]):
            # Create a Mermaid diagram
            mermaid_content = """graph TD
    A[Start] --> B[Process]
    B --> C[Decision]
    C -->|Yes| D[Action 1]
    C -->|No| E[Action 2]
    D --> F[End]
    E --> F[End]"""
            
            canvas_action = {
                "action_type": "mermaid",
                "agent_id": AGENT_NAME,
                "data": {
                    "content": mermaid_content,
                    "position": {"x": 50, "y": 50}
                }
            }
            
            response_text = f"I am the {AGENT_NAME}. I've created a Mermaid flowchart diagram for you based on your request: '{message_text}'. "
            response_text += "The diagram has been added to the canvas."
            
        else:
            # Default search response
            response_text = f"I am the {AGENT_NAME}, a search specialist. I received your query: '{message_text}'. "
            
            # Add some knowledge about popular monuments
            if "monument" in message_text.lower() or "landmark" in message_text.lower():
                response_text += "The Statue of Liberty is one of the most iconic monuments in the US, located in New York Harbor. "
                response_text += "Other famous US landmarks include the Washington Monument, Mount Rushmore, and the Golden Gate Bridge. "
                response_text += "Each of these represents important aspects of American history and culture."
            else:
                response_text += "I can help you find information about popular topics, monuments, landmarks, and general knowledge questions. "
                response_text += "I have access to a wide range of information and can provide detailed, accurate responses."
        
        # Prepare response parts
        response_parts = [
            {
                "type": "text",
                "text": response_text
            }
        ]
        
        # Add canvas action if it exists
        if 'canvas_action' in locals():
            response_parts.append({
                "type": "data",
                "data": {
                    "canvas_action": canvas_action
                }
            })
        
        response = {
            "jsonrpc": "2.0",
            "id": task_id,
            "result": {
                "id": task_id,
                "sessionId": request.get("sessionId", "default-session"),
                "status": {
                    "state": "completed",
                    "message": {
                        "message_id": f"msg-{uuid4().hex}",
                        "role": "agent",
                        "parts": response_parts
                    },
                    "timestamp": "2024-01-01T00:00:00Z"
                }
            }
        }
        
        return JSONResponse(content=response)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "agent": AGENT_NAME}

if __name__ == "__main__":
    print(f"Starting {AGENT_NAME} A2A Server on http://{HOST}:{PORT}")
    uvicorn.run(app, host=HOST, port=PORT) 