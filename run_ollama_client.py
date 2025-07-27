import asyncio
import logging
import traceback
import sys
from uuid import uuid4

# Import the client for A2A communication
from common.client.client import A2AClient
from common.types import Message, TextPart

# Configure basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SERVER_URL = "http://localhost:12001/ollama_host_agent/tasks"

async def main():
    # The A2A client from local a2a_servers only needs a URL
    client = A2AClient(url=SERVER_URL)

    task_id = f"ollama-task-{uuid4().hex}"
    session_id = f"ollama-session-{uuid4().hex}"
    
    # Handle input from stdin if available, otherwise prompt
    if not sys.stdin.isatty():
        user_text = sys.stdin.read().strip()
    else:
        user_text = input("Enter your query: ")

    user_message = Message(
        message_id=f"msg-{uuid4().hex}",
        role="user",
        parts=[TextPart(text=user_text)]
    )

    send_params = {
        "id": task_id,
        "sessionId": session_id,
        "message": user_message.model_dump(),
    }

    try:
        logger.info(f"Sending task {task_id} to {SERVER_URL}...")
        
        # Use the send_task method from local a2a_servers
        from common.types import TaskSendParams
        
        # Create the task request
        task_params = TaskSendParams(
            id=task_id,
            sessionId=session_id,
            message=user_message
        )
        
        response = await client.send_task(task_params.model_dump())
        
        # Extract the response text
        if hasattr(response, 'result') and response.result:
            if hasattr(response.result, 'status') and response.result.status:
                if hasattr(response.result.status, 'message') and response.result.status.message:
                    if response.result.status.message.parts:
                        print(response.result.status.message.parts[0].text)
                        return
        print("No response received")

    except Exception as e:
        logger.error(traceback.format_exc())
        logger.error(f"An error occurred while communicating with the agent: {e}")

if __name__ == "__main__":
    asyncio.run(main()) 