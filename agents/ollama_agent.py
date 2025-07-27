import asyncio
import httpx
import json
import uuid
from uuid import uuid4
from typing import List, Any, AsyncIterable, Dict

from common.client.card_resolver import A2ACardResolver
from common.types import AgentCard, TaskSendParams, Message, TextPart, TaskState, Task, Part, DataPart
from agents.utils.remote_agent_connection import TaskUpdateCallback, RemoteAgentConnections


class OllamaAgent:
    """An agent that uses Ollama instead of Google ADK."""

    SUPPORTED_CONTENT_TYPES = ["text", "text/plain"]

    def __init__(
        self,
        model: str,  # e.g., "gemma3:4b"
        name: str,
        description: str,
        instructions: str,
        tools: List[Any] = [],
        is_host_agent: bool = False,
        remote_agent_addresses: List[str] = None,
        ollama_url: str = "http://localhost:11434",
        task_callback: TaskUpdateCallback | None = None
    ):
        """
        Initialize the Ollama agent with the given parameters.
        :param model: The Ollama model to use (e.g., "gemma3:4b")
        :param name: The name of the agent.
        :param description: The description of the agent.
        :param instructions: The instructions for the agent.
        :param tools: The tools the agent can use.
        :param is_host_agent: Whether this is a host agent that can delegate to other agents.
        :param remote_agent_addresses: The addresses of the remote agents.
        :param ollama_url: The URL of the Ollama server.
        :param task_callback: Callback for task updates.
        """
        self.model = model
        self.name = name
        self.description = description
        self.instructions = instructions
        self.tools = tools
        self.is_host_agent = is_host_agent
        self.remote_agent_addresses = remote_agent_addresses or []
        self.ollama_url = ollama_url
        self.task_callback = task_callback

        if is_host_agent:
            self.remote_agent_connections: dict[str, RemoteAgentConnections] = {}
            self.cards: dict[str, AgentCard] = {}
            for address in self.remote_agent_addresses:
                print(f'loading remote agent {address}')
                card_resolver = A2ACardResolver(address)
                print(f'loaded card resolver for {card_resolver.base_url}')
                card = card_resolver.get_agent_card()
                remote_connection = RemoteAgentConnections(card)
                self.remote_agent_connections[card.name] = remote_connection
                self.cards[card.name] = card
            agent_info = []
            for ra in self.list_remote_agents():
                agent_info.append(json.dumps(ra))
            self.agents = '\n'.join(agent_info)
            tools = tools + [
                self.list_remote_agents,
                self.send_task,
            ]
            instructions = self.root_instruction()
            description = "This agent orchestrates the decomposition of the user request into tasks that can be performed by the child agents."

    async def invoke(self, query: str, session_id: str) -> str:
        """
        Invoke the Ollama model with the given query.
        :param query: The query to send to the agent.
        :param session_id: The session ID to use for the agent.
        :return: The response from the agent.
        """
        if self.is_host_agent:
            # For host agents, use tool calling to delegate to appropriate agent
            try:
                # Build a prompt that includes tool definitions for Qwen
                tools_definition = """
Available tools:
1. send_task(agent_name: string, message: string) - Send a task to a remote agent
2. list_remote_agents() - List available remote agents

Available agents:
- ollama_simple_search_agent: For answering questions about people, places, events, and general knowledge

Instructions: Use the send_task tool to delegate user requests to the appropriate agent.
"""
                
                prompt = f"{self.instructions}\n\n{tools_definition}\n\nUser: {query}\nAssistant:"
                
                async with httpx.AsyncClient() as client:
                    response = await client.post(
                        f"{self.ollama_url}/api/generate",
                        json={
                            "model": self.model,
                            "prompt": prompt,
                            "stream": False,
                            "options": {
                                "temperature": 0.1,
                                "top_p": 0.9
                            }
                        },
                        timeout=60.0
                    )
                    response.raise_for_status()
                    result = response.json()
                    response_text = result.get("response", "")
                    
                    # Check if the response contains a tool call
                    if "send_task" in response_text.lower():
                        # Extract agent name and message from the response
                        # Look for patterns like "send_task(agent_name, message)" or similar
                        import re
                        
                        # Try to extract agent name and message
                        agent_match = re.search(r'ollama_simple_search_agent', response_text, re.IGNORECASE)
                        if agent_match:
                            # Delegate to search agent
                            if 'ollama_simple_search_agent' in self.remote_agent_connections:
                                client = self.remote_agent_connections['ollama_simple_search_agent']
                                taskId = str(uuid.uuid4())
                                sessionId = str(uuid.uuid4())
                                metadata = {"conversation_id": sessionId}

                                request = TaskSendParams(
                                    id=taskId,
                                    sessionId=sessionId,
                                    message=Message(
                                        message_id=f"msg-{uuid4().hex}",
                                        role="user",
                                        parts=[TextPart(text=query)],
                                        metadata=metadata,
                                    ),
                                    acceptedOutputModes=["text", "text/plain", "image/png"],
                                    metadata={'conversation_id': sessionId},
                                )
                                
                                task = await client.send_task(request, self.task_callback)
                                
                                if task.status.message and task.status.message.parts:
                                    response_text = ""
                                    for part in task.status.message.parts:
                                        if part.text:
                                            response_text += part.text
                                    return f"Response from ollama_simple_search_agent:\n{response_text}"
                                else:
                                    return "The search agent processed your request but didn't return a response."
                            else:
                                return "I would delegate this to the search agent, but it's not available."
                    
                    return response_text
                    
            except Exception as e:
                return f"Error processing request: {str(e)}"
        
        # For non-host agents, use direct response
        prompt = f"{self.instructions}\n\nUser: {query}\nAssistant:"
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.ollama_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.7,
                        "top_p": 0.9
                    }
                },
                timeout=60.0
            )
            response.raise_for_status()
            result = response.json()
            return result.get("response", "")

    async def stream(self, query: str, session_id: str) -> AsyncIterable[Dict[str, Any]]:
        """
        Stream responses from Ollama.
        :param query: The query to send to the agent.
        :param session_id: The session ID to use for the agent.
        :return: An async iterable of the response from the agent.
        """
        prompt = f"{self.instructions}\n\nUser: {query}\nAssistant:"
        
        async with httpx.AsyncClient() as client:
            async with client.stream(
                "POST",
                f"{self.ollama_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "stream": True
                },
                timeout=60.0
            ) as response:
                full_response = ""
                async for line in response.aiter_lines():
                    if line.strip():
                        try:
                            data = json.loads(line)
                            if data.get("done"):
                                yield {"is_task_complete": True, "content": full_response}
                            else:
                                chunk = data.get("response", "")
                                full_response += chunk
                                yield {"is_task_complete": False, "updates": chunk}
                        except json.JSONDecodeError:
                            continue

    def list_remote_agents(self):
        """List the available remote agents you can use to delegate the task."""
        if not self.remote_agent_connections:
            return []

        remote_agent_info = []
        for card in self.cards.values():
            remote_agent_info.append(
                {"name": card.name, "description": card.description}
            )
        return remote_agent_info

    async def send_task(
        self,
        agent_name: str,
        message: str,
        tool_context: Any
    ):
        """Send a task to a remote agent."""
        if agent_name not in self.remote_agent_connections:
            raise ValueError(f"Agent {agent_name} not found")

        client = self.remote_agent_connections[agent_name]
        taskId = str(uuid.uuid4())
        sessionId = str(uuid.uuid4())
        metadata = {"conversation_id": sessionId}

        request: TaskSendParams = TaskSendParams(
            id=taskId,
            sessionId=sessionId,
            message=Message(
                message_id=f"msg-{uuid4().hex}",
                role="user",
                parts=[TextPart(text=message)],
                metadata=metadata,
            ),
            acceptedOutputModes=["text", "text/plain", "image/png"],
            metadata={'conversation_id': sessionId},
        )
        
        task = await client.send_task(request, self.task_callback)
        
        # Handle task state
        if task.status.state == TaskState.INPUT_REQUIRED:
            tool_context.actions.skip_summarization = True
            tool_context.actions.escalate = True
        elif task.status.state == TaskState.CANCELED:
            raise ValueError(f"Agent {agent_name} task {task.id} is cancelled")
        elif task.status.state == TaskState.FAILED:
            raise ValueError(f"Agent {agent_name} task {task.id} failed")
        
        response = []
        if task.status.message:
            response.extend(self.convert_parts(task.status.message.parts, tool_context))
        if task.artifacts:
            for artifact in task.artifacts:
                response.extend(self.convert_parts(artifact.parts, tool_context))
        
        return response

    def convert_parts(self, parts: List[Part], tool_context: Any) -> List[str]:
        """Convert message parts to text responses."""
        responses = []
        for part in parts:
            if part.text:
                responses.append(part.text)
            elif part.function_response:
                if isinstance(part.function_response.response, dict) and 'result' in part.function_response.response:
                    result = part.function_response.response['result']
                    if isinstance(result, list):
                        responses.extend(result)
                    else:
                        responses.append(str(result))
        return responses

    def root_instruction(self) -> str:
        return f"""You are a expert delegator that can delegate the user request to the
appropriate remote agents.

Discovery:
- You can use `list_remote_agents` to list the available remote agents you
can use to delegate the task.

Execution:
- For actionable tasks, you can use `send_task` to assign tasks to remote agents to perform.
- The send_task function takes two parameters: agent_name (string) and message (string).
- Be sure to include the remote agent name when you respond to the user.

Available agents:
{self.agents}

When asked about popular monuments, landmarks, or general knowledge questions, use send_task to delegate to the ollama_simple_search_agent.

Please rely on tools to address the request, don't make up the response. If you are not sure, please ask the user for more details.
Focus on the most recent parts of the conversation primarily.
""" 