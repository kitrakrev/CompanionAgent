// Agent Management System
class AgentManager {
    constructor() {
        this.agents = new Map();
        this.activeAgent = null;
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.loadDefaultAgents();
    }
    
    setupEventListeners() {
        // Add agent button
        document.getElementById('add-agent-btn').addEventListener('click', () => {
            this.showAddAgentModal();
        });
        
        // Discover agents button
        document.getElementById('discover-agents-btn').addEventListener('click', () => {
            this.discoverAgents();
        });
        
        // Add agent form
        document.getElementById('agent-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addAgent();
        });
        
        // Edit agent form
        document.getElementById('edit-agent-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.updateAgent();
        });
        
        // Modal close buttons
        document.querySelectorAll('.close').forEach(closeBtn => {
            closeBtn.addEventListener('click', () => {
                this.closeAllModals();
            });
        });
        
        // Cancel buttons
        document.getElementById('cancel-agent').addEventListener('click', () => {
            this.closeAllModals();
        });
        
        document.getElementById('cancel-edit-agent').addEventListener('click', () => {
            this.closeAllModals();
        });
        
        // Mermaid modal
        document.getElementById('add-mermaid').addEventListener('click', () => {
            this.showMermaidModal();
        });
        
        document.getElementById('mermaid-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addMermaidDiagram();
        });
        
        document.getElementById('cancel-mermaid').addEventListener('click', () => {
            this.closeAllModals();
        });
    }
    
    loadDefaultAgents() {
        // Auto-discover agents instead of hardcoding
        this.discoverAgents();
    }
    
    async discoverAgents() {
        try {
            // Send discovery request via WebSocket
            if (window.websocketManager) {
                window.websocketManager.sendMessage({
                    type: 'discover_agents'
                });
            }
            
            // Also try REST API as fallback
            const response = await fetch('/api/discover-agents', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log('Discovered agents:', result);
            }
        } catch (error) {
            console.error('Failed to discover agents:', error);
        }
    }
    
    showAddAgentModal() {
        document.getElementById('agent-modal').style.display = 'block';
        document.getElementById('agent-form').reset();
    }
    
    showEditAgentModal(agentId) {
        const agent = this.agents.get(agentId);
        if (!agent) return;
        
        // Populate form
        document.getElementById('edit-agent-id').value = agent.id;
        document.getElementById('edit-agent-name').value = agent.name;
        document.getElementById('edit-agent-description').value = agent.description;
        document.getElementById('edit-agent-color').value = agent.color;
        document.getElementById('edit-agent-server-url').value = agent.server_url;
        
        // Set tool checkboxes
        const checkboxes = document.querySelectorAll('#edit-tool-checkboxes input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = agent.tools.includes(checkbox.value);
        });
        
        document.getElementById('edit-agent-modal').style.display = 'block';
    }
    
    showMermaidModal() {
        document.getElementById('mermaid-modal').style.display = 'block';
        document.getElementById('mermaid-form').reset();
    }
    
    closeAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.style.display = 'none';
        });
    }
    
    addAgent() {
        const formData = new FormData(document.getElementById('agent-form'));
        const tools = Array.from(document.querySelectorAll('#agent-form input[type="checkbox"]:checked'))
            .map(cb => cb.value);
        
        const agent = {
            id: crypto.randomUUID(),
            name: formData.get('agent-name') || document.getElementById('agent-name').value,
            description: formData.get('agent-description') || document.getElementById('agent-description').value,
            color: document.getElementById('agent-color').value,
            tools: tools,
            server_url: formData.get('agent-server-url') || document.getElementById('agent-server-url').value,
            is_active: true
        };
        
        // Send to WebSocket
        if (window.websocketManager) {
            window.websocketManager.sendMessage({
                type: 'add_agent',
                agent: agent
            });
        }
        
        this.closeAllModals();
    }
    
    updateAgent() {
        const agentId = document.getElementById('edit-agent-id').value;
        const tools = Array.from(document.querySelectorAll('#edit-tool-checkboxes input[type="checkbox"]:checked'))
            .map(cb => cb.value);
        
        const agent = {
            id: agentId,
            name: document.getElementById('edit-agent-name').value,
            description: document.getElementById('edit-agent-description').value,
            color: document.getElementById('edit-agent-color').value,
            tools: tools,
            server_url: document.getElementById('edit-agent-server-url').value,
            is_active: true
        };
        
        // Send to WebSocket
        if (window.websocketManager) {
            window.websocketManager.sendMessage({
                type: 'update_agent',
                agent: agent
            });
        }
        
        this.closeAllModals();
    }
    
    addMermaidDiagram() {
        const content = document.getElementById('mermaid-content').value;
        const x = parseInt(document.getElementById('mermaid-position-x').value);
        const y = parseInt(document.getElementById('mermaid-position-y').value);
        
        if (content.trim()) {
            canvasManager.addMermaidDiagram(content, { x, y });
        }
        
        this.closeAllModals();
    }
    
    addAgentToUI(agent) {
        this.agents.set(agent.id, agent);
        
        const agentCard = document.createElement('div');
        agentCard.className = 'agent-card';
        agentCard.id = `agent-${agent.id}`;
        
        agentCard.innerHTML = `
            <div class="agent-card-header">
                <div class="agent-name">
                    <div class="agent-color-indicator" style="background-color: ${agent.color}"></div>
                    ${agent.name}
                </div>
                <div class="agent-controls">
                    <button class="btn btn-small btn-secondary" onclick="agentManager.showEditAgentModal('${agent.id}')">Edit</button>
                    <button class="btn btn-small btn-danger" onclick="agentManager.removeAgent('${agent.id}')">Remove</button>
                </div>
            </div>
            <div class="agent-description">${agent.description}</div>
            <div class="agent-tools">
                ${agent.tools.map(tool => `<span class="agent-tool">${tool}</span>`).join('')}
            </div>
            <div class="agent-layer-info">
                <span class="layer-count">Layer objects: <span id="layer-count-${agent.id}">0</span></span>
                <span class="layer-status">Layer: <span class="layer-status-indicator" id="layer-status-${agent.id}">Empty</span></span>
            </div>
            <div class="agent-status">
                <span>Status: ${agent.is_active ? 'Active' : 'Inactive'}</span>
                <div class="agent-status-toggle ${agent.is_active ? 'active' : ''}" 
                     onclick="agentManager.toggleAgentStatus('${agent.id}')"></div>
            </div>
            <div class="agent-actions">
                <button class="btn btn-small btn-secondary" onclick="agentManager.clearAgentLayer('${agent.id}')">Clear Layer</button>
                <button class="btn btn-small btn-primary" onclick="agentManager.setAgentDrawingMode('${agent.id}')">Draw Mode</button>
                <button class="btn btn-small btn-warning" onclick="agentManager.showModificationRequestModal('${agent.id}')">Request Mod</button>
            </div>
        `;
        
        document.getElementById('agent-list').appendChild(agentCard);
    }
    
    updateAgentInUI(agent) {
        this.agents.set(agent.id, agent);
        const agentCard = document.getElementById(`agent-${agent.id}`);
        
        if (agentCard) {
            agentCard.innerHTML = `
                <div class="agent-card-header">
                    <div class="agent-name">
                        <div class="agent-color-indicator" style="background-color: ${agent.color}"></div>
                        ${agent.name}
                    </div>
                    <div class="agent-controls">
                        <button class="btn btn-small btn-secondary" onclick="agentManager.showEditAgentModal('${agent.id}')">Edit</button>
                        <button class="btn btn-small btn-danger" onclick="agentManager.removeAgent('${agent.id}')">Remove</button>
                    </div>
                </div>
                <div class="agent-description">${agent.description}</div>
                <div class="agent-tools">
                    ${agent.tools.map(tool => `<span class="agent-tool">${tool}</span>`).join('')}
                </div>
                <div class="agent-layer-info">
                    <span class="layer-count">Layer objects: <span id="layer-count-${agent.id}">0</span></span>
                    <span class="layer-status">Layer: <span class="layer-status-indicator" id="layer-status-${agent.id}">Empty</span></span>
                </div>
                <div class="agent-status">
                    <span>Status: ${agent.is_active ? 'Active' : 'Inactive'}</span>
                    <div class="agent-status-toggle ${agent.is_active ? 'active' : ''}" 
                         onclick="agentManager.toggleAgentStatus('${agent.id}')"></div>
                </div>
                <div class="agent-actions">
                    <button class="btn btn-small btn-secondary" onclick="agentManager.clearAgentLayer('${agent.id}')">Clear Layer</button>
                    <button class="btn btn-small btn-primary" onclick="agentManager.setAgentDrawingMode('${agent.id}')">Draw Mode</button>
                    <button class="btn btn-small btn-warning" onclick="agentManager.showModificationRequestModal('${agent.id}')">Request Mod</button>
                </div>
            `;
        }
        
        // Update layer information
        this.updateLayerInfo(agent.id);
    }
    
    // Update layer information for an agent
    updateLayerInfo(agentId) {
        const layerInfo = canvasManager.getLayerInfo();
        const agentInfo = layerInfo[agentId];
        
        if (agentInfo) {
            const countElement = document.getElementById(`layer-count-${agentId}`);
            const statusElement = document.getElementById(`layer-status-${agentId}`);
            
            if (countElement) {
                countElement.textContent = agentInfo.object_count;
            }
            
            if (statusElement) {
                statusElement.textContent = agentInfo.object_count > 0 ? 'Has Content' : 'Empty';
                statusElement.className = `layer-status-indicator ${agentInfo.object_count > 0 ? 'has-content' : 'empty'}`;
            }
        }
    }
    
    // Show modification request modal
    showModificationRequestModal(targetAgentId) {
        const targetAgent = this.agents.get(targetAgentId);
        if (!targetAgent) return;
        
        // Create modal for modification request
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'modification-request-modal';
        
        const activeAgents = this.getActiveAgents().filter(agent => agent.id !== targetAgentId);
        
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Request Modification from ${targetAgent.name}</h3>
                    <span class="close" onclick="this.closest('.modal').remove()">&times;</span>
                </div>
                <div class="modal-body">
                    <form id="modification-request-form">
                        <div class="form-group">
                            <label for="requesting-agent">Requesting Agent:</label>
                            <select id="requesting-agent" required>
                                ${activeAgents.map(agent => 
                                    `<option value="${agent.id}">${agent.name}</option>`
                                ).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="modification-description">Modification Description:</label>
                            <textarea id="modification-description" required 
                                placeholder="Describe what modification you want from this agent..."></textarea>
                        </div>
                        <div class="form-group">
                            <label for="modification-type">Modification Type:</label>
                            <select id="modification-type" required>
                                <option value="adjust">Adjust drawing</option>
                                <option value="remove">Remove specific elements</option>
                                <option value="add">Add elements</option>
                                <option value="reposition">Reposition elements</option>
                                <option value="other">Other</option>
                            </select>
                        </div>
                        <div class="form-actions">
                            <button type="submit" class="btn btn-primary">Send Request</button>
                            <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Handle form submission
        document.getElementById('modification-request-form').addEventListener('submit', (e) => {
            e.preventDefault();
            
            const requestingAgentId = document.getElementById('requesting-agent').value;
            const description = document.getElementById('modification-description').value;
            const type = document.getElementById('modification-type').value;
            
            this.requestModification(requestingAgentId, targetAgentId, {
                description: description,
                type: type,
                timestamp: Date.now()
            });
            
            modal.remove();
        });
    }
    
    removeAgent(agentId) {
        if (confirm('Are you sure you want to remove this agent?')) {
            // Send to WebSocket
            if (window.websocketManager) {
                window.websocketManager.sendMessage({
                    type: 'remove_agent',
                    agent_id: agentId
                });
            }
            
            // Remove from UI
            const agentCard = document.getElementById(`agent-${agentId}`);
            if (agentCard) {
                agentCard.remove();
            }
            
            this.agents.delete(agentId);
            
            // Clear agent's canvas layer
            canvasManager.clearAgentLayer(agentId);
        }
    }
    
    toggleAgentStatus(agentId) {
        const agent = this.agents.get(agentId);
        if (agent) {
            agent.is_active = !agent.is_active;
            this.updateAgentInUI(agent);
            
            // Send to WebSocket
            if (window.websocketManager) {
                window.websocketManager.sendMessage({
                    type: 'update_agent',
                    agent: agent
                });
            }
        }
    }
    
    clearAgentLayer(agentId) {
        canvasManager.clearAgentLayer(agentId);
        
        // Send to WebSocket
        if (window.websocketManager) {
            window.websocketManager.sendMessage({
                type: 'clear_agent_layer',
                agent_id: agentId
            });
        }
    }
    
    setAgentDrawingMode(agentId) {
        const agent = this.agents.get(agentId);
        if (agent) {
            canvasManager.setAgentDrawingMode(agentId, agent.color);
            this.activeAgent = agentId;
            
            // Visual feedback
            document.querySelectorAll('.agent-card').forEach(card => {
                card.classList.remove('active');
            });
            document.getElementById(`agent-${agentId}`).classList.add('active');
        }
    }
    
    // Request modification from another agent
    requestModification(fromAgentId, toAgentId, requestData) {
        const fromAgent = this.agents.get(fromAgentId);
        const toAgent = this.agents.get(toAgentId);
        
        if (!fromAgent || !toAgent) {
            console.error('Agent not found for modification request');
            return null;
        }
        
        const request = canvasManager.requestModification(fromAgentId, toAgentId, requestData);
        
        // Add to conversation
        conversationManager.addSystemMessage(
            `${fromAgent.name} has requested a modification from ${toAgent.name}: ${requestData.description || 'No description provided'}`
        );
        
        return request;
    }
    
    // Handle modification request
    handleModificationRequest(request) {
        const fromAgent = this.agents.get(request.from_agent_id);
        const toAgent = this.agents.get(request.to_agent_id);
        
        if (!fromAgent || !toAgent) {
            console.error('Agent not found for modification request');
            return;
        }
        
        // Add to conversation
        conversationManager.addSystemMessage(
            `${fromAgent.name} is requesting ${toAgent.name} to modify their layer: ${request.data.description || 'No description provided'}`
        );
        
        // Highlight the target agent's card
        const targetCard = document.getElementById(`agent-${request.to_agent_id}`);
        if (targetCard) {
            targetCard.style.borderColor = '#f59e0b';
            targetCard.style.boxShadow = '0 0 10px rgba(245, 158, 11, 0.5)';
            
            // Remove highlight after 5 seconds
            setTimeout(() => {
                targetCard.style.borderColor = '';
                targetCard.style.boxShadow = '';
            }, 5000);
        }
    }
    
    // Get layer statistics for all agents
    getLayerStats() {
        const layerInfo = canvasManager.getLayerInfo();
        const stats = {};
        
        for (const [agentId, info] of Object.entries(layerInfo)) {
            const agent = this.agents.get(agentId);
            stats[agentId] = {
                name: agent ? agent.name : `Agent ${agentId}`,
                color: agent ? agent.color : '#666',
                ...info
            };
        }
        
        return stats;
    }
    
    getActiveAgents() {
        return Array.from(this.agents.values()).filter(agent => agent.is_active);
    }
    
    getAgentById(agentId) {
        return this.agents.get(agentId);
    }
}

// Initialize agent manager
const agentManager = new AgentManager();
window.agentManager = agentManager; 