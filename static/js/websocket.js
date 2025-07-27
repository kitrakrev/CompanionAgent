// WebSocket Manager for Real-time Communication
class WebSocketManager {
    constructor() {
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.isConnected = false;
        
        this.init();
    }
    
    init() {
        this.connect();
        this.setupConnectionStatus();
    }
    
    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        
        try {
            this.ws = new WebSocket(wsUrl);
            this.setupEventListeners();
        } catch (error) {
            console.error('Failed to create WebSocket connection:', error);
            this.handleConnectionError();
        }
    }
    
    setupEventListeners() {
        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.updateConnectionStatus(true);
            
            // Trigger agent discovery when connected
            setTimeout(() => {
                if (window.agentManager) {
                    window.agentManager.discoverAgents();
                }
            }, 1000);
        };
        
        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleMessage(message);
            } catch (error) {
                console.error('Failed to parse WebSocket message:', error);
            }
        };
        
        this.ws.onclose = (event) => {
            console.log('WebSocket disconnected:', event.code, event.reason);
            this.isConnected = false;
            this.updateConnectionStatus(false);
            
            if (!event.wasClean) {
                this.handleConnectionError();
            }
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.handleConnectionError();
        };
    }
    
    handleConnectionError() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            
            setTimeout(() => {
                this.connect();
            }, this.reconnectDelay * this.reconnectAttempts);
        } else {
            console.error('Max reconnection attempts reached');
            this.updateConnectionStatus(false, 'Max reconnection attempts reached');
        }
    }
    
    setupConnectionStatus() {
        // Update status every 5 seconds
        setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.updateConnectionStatus(true);
            } else {
                this.updateConnectionStatus(false);
            }
        }, 5000);
    }
    
    updateConnectionStatus(connected, message = null) {
        const statusElement = document.getElementById('connection-status');
        
        if (connected) {
            statusElement.textContent = 'Online';
            statusElement.className = 'status-online';
        } else {
            statusElement.textContent = message || 'Offline';
            statusElement.className = 'status-offline';
        }
    }
    
    sendMessage(message) {
        if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(JSON.stringify(message));
                return true;
            } catch (error) {
                console.error('Failed to send message:', error);
                return false;
            }
        } else {
            console.warn('WebSocket not connected, message not sent:', message);
            return false;
        }
    }
    
    handleMessage(message) {
        const messageType = message.type;
        
        switch (messageType) {
            case 'agent_added':
                agentManager.addAgentToUI(message.agent);
                conversationManager.addSystemMessage(`Agent "${message.agent.name}" has been added.`);
                break;
                
            case 'agent_updated':
                agentManager.updateAgentInUI(message.agent);
                conversationManager.addSystemMessage(`Agent "${message.agent.name}" has been updated.`);
                break;
                
            case 'agent_removed':
                const agentCard = document.getElementById(`agent-${message.agent_id}`);
                if (agentCard) {
                    agentCard.remove();
                }
                agentManager.agents.delete(message.agent_id);
                conversationManager.addSystemMessage('An agent has been removed.');
                break;
                
            case 'canvas_action':
                this.handleCanvasAction(message.action);
                break;
                
            case 'modification_request':
                agentManager.handleModificationRequest(message.action.data);
                break;
                
            case 'agent_responses':
                conversationManager.handleAgentResponses(message.query, message.responses);
                break;
                
            case 'layer_cleared':
                canvasManager.clearAgentLayer(message.agent_id);
                const agent = agentManager.getAgentById(message.agent_id);
                const agentName = agent ? agent.name : `Agent ${message.agent_id}`;
                conversationManager.addSystemMessage(`${agentName}'s layer has been cleared.`);
                break;
                
            case 'success':
                console.log('Success:', message.message);
                break;
                
            case 'error':
                console.error('Error:', message.message);
                conversationManager.addSystemMessage(`Error: ${message.message}`);
                break;
                
            default:
                console.log('Unknown message type:', messageType, message);
        }
    }
    
    handleCanvasAction(action) {
        const actionType = action.action_type;
        const agentId = action.agent_id;
        
        switch (actionType) {
            case 'draw':
                if (action.data && action.data.path) {
                    canvasManager.addAgentDrawing(agentId, action.data.path);
                }
                break;
                
            case 'mermaid':
                if (action.data && action.data.content) {
                    const position = action.data.position || { x: 50, y: 50 };
                    canvasManager.addMermaidDiagram(action.data.content, position, agentId);
                }
                break;
                
            case 'clear':
                canvasManager.clearCanvas();
                break;
                
            case 'layer_cleared':
                if (action.data && action.data.cleared_agent_id) {
                    const clearedAgent = agentManager.getAgentById(action.data.cleared_agent_id);
                    const clearedAgentName = clearedAgent ? clearedAgent.name : `Agent ${action.data.cleared_agent_id}`;
                    conversationManager.addSystemMessage(`${clearedAgentName}'s layer has been cleared.`);
                }
                break;
                
            default:
                console.log('Unknown canvas action type:', actionType);
        }
        
        // Add to conversation
        conversationManager.handleCanvasAction(action);
        
        // Update layer information for all agents
        setTimeout(() => {
            agentManager.agents.forEach((agent, agentId) => {
                agentManager.updateLayerInfo(agentId);
            });
        }, 100);
    }
    
    // Utility methods for specific message types
    sendAddAgent(agent) {
        return this.sendMessage({
            type: 'add_agent',
            agent: agent
        });
    }
    
    sendUpdateAgent(agent) {
        return this.sendMessage({
            type: 'update_agent',
            agent: agent
        });
    }
    
    sendRemoveAgent(agentId) {
        return this.sendMessage({
            type: 'remove_agent',
            agent_id: agentId
        });
    }
    
    sendCanvasAction(actionData) {
        return this.sendMessage({
            type: 'canvas_action',
            action: actionData
        });
    }
    
    sendQuery(query) {
        return this.sendMessage({
            type: 'query_agents',
            query: query
        });
    }
    
    sendClearAgentLayer(agentId) {
        return this.sendMessage({
            type: 'clear_agent_layer',
            agent_id: agentId
        });
    }
    
    // Disconnect and cleanup
    disconnect() {
        if (this.ws) {
            this.ws.close();
        }
        this.isConnected = false;
        this.updateConnectionStatus(false);
    }
}

// Initialize WebSocket manager
const websocketManager = new WebSocketManager();
window.websocketManager = websocketManager; 