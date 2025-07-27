// Conversation Management System
class ConversationManager {
    constructor() {
        this.messages = [];
        this.maxMessages = 1000;
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.addSystemMessage('Welcome to the Companion Agent Canvas Interface! You can now interact with agents and collaborate on the canvas.');
    }
    
    setupEventListeners() {
        // Send user message
        document.getElementById('send-user-message').addEventListener('click', () => {
            this.sendUserMessage();
        });
        
        // Send query to all agents
        document.getElementById('send-query').addEventListener('click', () => {
            this.sendQueryToAgents();
        });
        
        // Enter key support
        document.getElementById('user-message').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendUserMessage();
            }
        });
        
        document.getElementById('query-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendQueryToAgents();
            }
        });
        
        // Clear conversation
        document.getElementById('clear-conversation').addEventListener('click', () => {
            this.clearConversation();
        });
        
        // Export conversation
        document.getElementById('export-conversation').addEventListener('click', () => {
            this.exportConversation();
        });
    }
    
    sendUserMessage() {
        const messageInput = document.getElementById('user-message');
        const message = messageInput.value.trim();
        
        if (message) {
            this.addUserMessage(message);
            messageInput.value = '';
            
            // Send to WebSocket for agent processing
            if (window.websocketManager) {
                window.websocketManager.sendMessage({
                    type: 'query_agents',
                    query: message
                });
            }
        }
    }
    
    sendQueryToAgents() {
        const queryInput = document.getElementById('query-input');
        const query = queryInput.value.trim();
        
        if (query) {
            this.addSystemMessage(`Query sent to all agents: "${query}"`);
            queryInput.value = '';
            
            // Send to WebSocket
            if (window.websocketManager) {
                window.websocketManager.sendMessage({
                    type: 'query_agents',
                    query: query
                });
            }
        }
    }
    
    addUserMessage(content) {
        const message = {
            id: crypto.randomUUID(),
            type: 'user',
            sender: 'You',
            content: content,
            timestamp: new Date(),
            agentId: null
        };
        
        this.addMessage(message);
    }
    
    addAgentMessage(agentId, content) {
        const agent = agentManager.getAgentById(agentId);
        const sender = agent ? agent.name : `Agent ${agentId}`;
        const color = agent ? agent.color : '#666';
        
        const message = {
            id: crypto.randomUUID(),
            type: 'agent',
            sender: sender,
            content: content,
            timestamp: new Date(),
            agentId: agentId,
            agentColor: color
        };
        
        this.addMessage(message);
    }
    
    addSystemMessage(content) {
        const message = {
            id: crypto.randomUUID(),
            type: 'system',
            sender: 'System',
            content: content,
            timestamp: new Date(),
            agentId: null
        };
        
        this.addMessage(message);
    }
    
    addMessage(message) {
        this.messages.push(message);
        
        // Limit message history
        if (this.messages.length > this.maxMessages) {
            this.messages.shift();
        }
        
        this.renderMessage(message);
        this.scrollToBottom();
    }
    
    renderMessage(message) {
        const messagesContainer = document.getElementById('conversation-messages');
        
        const messageElement = document.createElement('div');
        messageElement.className = `conversation-message ${message.type}`;
        messageElement.id = `message-${message.id}`;
        
        const timeString = message.timestamp.toLocaleTimeString();
        
        let senderElement = '';
        if (message.type === 'agent' && message.agentColor) {
            senderElement = `
                <div class="message-sender">
                    <div class="agent-color-indicator" style="background-color: ${message.agentColor}"></div>
                    ${message.sender}
                </div>
            `;
        } else {
            senderElement = `<div class="message-sender">${message.sender}</div>`;
        }
        
        messageElement.innerHTML = `
            <div class="message-header">
                ${senderElement}
                <div class="message-time">${timeString}</div>
            </div>
            <div class="message-content">${this.formatMessageContent(message.content)}</div>
        `;
        
        messagesContainer.appendChild(messageElement);
    }
    
    formatMessageContent(content) {
        // Convert URLs to links
        content = content.replace(
            /(https?:\/\/[^\s]+)/g, 
            '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
        );
        
        // Convert newlines to <br> tags
        content = content.replace(/\n/g, '<br>');
        
        // Highlight code blocks
        content = content.replace(
            /```(\w+)?\n([\s\S]*?)```/g,
            '<pre><code class="language-$1">$2</code></pre>'
        );
        
        // Highlight inline code
        content = content.replace(
            /`([^`]+)`/g,
            '<code>$1</code>'
        );
        
        return content;
    }
    
    scrollToBottom() {
        const messagesContainer = document.getElementById('conversation-messages');
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    
    clearConversation() {
        if (confirm('Are you sure you want to clear the conversation history?')) {
            this.messages = [];
            document.getElementById('conversation-messages').innerHTML = '';
            this.addSystemMessage('Conversation history cleared.');
        }
    }
    
    exportConversation() {
        const conversationData = {
            timestamp: new Date().toISOString(),
            messages: this.messages.map(msg => ({
                type: msg.type,
                sender: msg.sender,
                content: msg.content,
                timestamp: msg.timestamp.toISOString(),
                agentId: msg.agentId
            }))
        };
        
        const blob = new Blob([JSON.stringify(conversationData, null, 2)], {
            type: 'application/json'
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `conversation-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    // Handle agent responses from WebSocket
    handleAgentResponses(query, responses) {
        this.addSystemMessage(`Received responses from ${Object.keys(responses).length} agents for query: "${query}"`);
        
        Object.entries(responses).forEach(([agentId, response]) => {
            this.addAgentMessage(agentId, response);
        });
    }
    
    // Handle canvas actions from agents
    handleCanvasAction(action) {
        const agent = agentManager.getAgentById(action.agent_id);
        const agentName = agent ? agent.name : `Agent ${action.agent_id}`;
        
        let actionDescription = '';
        switch (action.action_type) {
            case 'draw':
                actionDescription = 'drew on the canvas';
                break;
            case 'mermaid':
                actionDescription = 'added a mermaid diagram';
                break;
            case 'clear':
                actionDescription = 'cleared the canvas';
                break;
            default:
                actionDescription = `performed action: ${action.action_type}`;
        }
        
        this.addSystemMessage(`${agentName} ${actionDescription}`);
    }
    
    // Handle agent status changes
    handleAgentStatusChange(agentId, isActive) {
        const agent = agentManager.getAgentById(agentId);
        const agentName = agent ? agent.name : `Agent ${agentId}`;
        const status = isActive ? 'activated' : 'deactivated';
        
        this.addSystemMessage(`${agentName} has been ${status}`);
    }
    
    // Get conversation statistics
    getStats() {
        const stats = {
            total: this.messages.length,
            user: this.messages.filter(m => m.type === 'user').length,
            agent: this.messages.filter(m => m.type === 'agent').length,
            system: this.messages.filter(m => m.type === 'system').length
        };
        
        return stats;
    }
}

// Initialize conversation manager
const conversationManager = new ConversationManager();
window.conversationManager = conversationManager; 