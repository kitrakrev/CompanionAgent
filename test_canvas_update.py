#!/usr/bin/env python3
import asyncio
import websockets
import json
import time

async def test_canvas_update():
    """Test if agents can update the canvas through WebSocket"""
    uri = "ws://localhost:8000/ws"
    
    try:
        async with websockets.connect(uri) as websocket:
            print("Connected to WebSocket")
            
            # Send a query to agents
            test_message = {
                "type": "query_agents",
                "query": "Tell me about famous monuments",
                "timestamp": time.time()
            }
            
            await websocket.send(json.dumps(test_message))
            print(f"Sent query message: {test_message}")
            
            # Wait for response
            try:
                response = await asyncio.wait_for(websocket.recv(), timeout=30.0)
                print(f"Received response: {response}")
                
                # Parse the response
                response_data = json.loads(response)
                print(f"Parsed response: {json.dumps(response_data, indent=2)}")
                
            except asyncio.TimeoutError:
                print("Timeout waiting for response")
                
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_canvas_update()) 