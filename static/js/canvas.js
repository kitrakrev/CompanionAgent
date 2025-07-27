// Canvas Management with Fabric.js
class CanvasManager {
    constructor() {
        this.canvas = null;
        this.isDrawing = false;
        this.currentAgent = null;
        this.layers = new Map(); // agent_id -> layer objects
        this.undoStack = [];
        this.maxUndoSteps = 50;
        
        this.init();
    }
    
    init() {
        // Initialize Fabric.js canvas
        this.canvas = new fabric.Canvas('main-canvas', {
            isDrawingMode: true,
            selection: false
        });
        
        // Set default drawing properties
        this.canvas.freeDrawingBrush.width = 5;
        this.canvas.freeDrawingBrush.color = '#000000';
        
        // Initialize human layer
        this.layers.set('human', []);
        
        this.setupEventListeners();
        this.setupDrawingControls();
    }
    
    setupEventListeners() {
        // Drawing events
        this.canvas.on('mouse:down', (e) => {
            this.isDrawing = true;
            this.currentAgent = 'human';
        });
        
        this.canvas.on('mouse:up', () => {
            this.isDrawing = false;
            this.saveToUndoStack();
        });
        
        this.canvas.on('path:created', (e) => {
            const path = e.path;
            path.data = {
                agent: this.currentAgent || 'human',
                timestamp: Date.now()
            };
            
            // Add to appropriate layer
            if (!this.layers.has(this.currentAgent)) {
                this.layers.set(this.currentAgent, []);
            }
            this.layers.get(this.currentAgent).push(path);
            
            // Send to WebSocket if not human
            if (this.currentAgent !== 'human') {
                this.sendCanvasAction({
                    agent_id: this.currentAgent,
                    action_type: 'draw',
                    data: {
                        path: path.toObject(),
                        color: path.stroke,
                        width: path.strokeWidth
                    }
                });
            }
        });
        
        // Prevent selection of other agents' objects
        this.canvas.on('mouse:down', (e) => {
            if (e.target && e.target.data && e.target.data.agent) {
                const objectAgent = e.target.data.agent;
                if (objectAgent !== this.currentAgent && this.currentAgent !== 'human') {
                    // Prevent interaction with other agents' objects
                    e.e.stopPropagation();
                    return false;
                }
            }
        });
        
        // Add layer information to canvas for agents
        this.canvas.layerInfo = this.getLayerInfo.bind(this);
        this.canvas.getLayerObjects = this.getLayerObjects.bind(this);
        this.canvas.hasLayerObjects = this.hasLayerObjects.bind(this);
        this.canvas.requestModification = this.requestModification.bind(this);
    }
    
    setupDrawingControls() {
        // Brush color control
        document.getElementById('brush-color').addEventListener('change', (e) => {
            this.canvas.freeDrawingBrush.color = e.target.value;
        });
        
        // Brush size control
        document.getElementById('brush-size').addEventListener('input', (e) => {
            this.canvas.freeDrawingBrush.width = parseInt(e.target.value);
        });
        
        // Clear canvas
        document.getElementById('clear-canvas').addEventListener('click', () => {
            this.clearCanvas();
        });
        
        // Undo last action
        document.getElementById('undo-last').addEventListener('click', () => {
            this.undoLastAction();
        });
    }
    
    setAgentDrawingMode(agentId, color) {
        this.currentAgent = agentId;
        this.canvas.freeDrawingBrush.color = color;
        
        // Create layer if it doesn't exist
        if (!this.layers.has(agentId)) {
            this.layers.set(agentId, []);
        }
    }
    
    addAgentDrawing(agentId, pathData) {
        fabric.util.enlivenObjects([pathData], (objects) => {
            const path = objects[0];
            path.data = {
                agent: agentId,
                timestamp: Date.now()
            };
            
            this.canvas.add(path);
            
            // Add to layer
            if (!this.layers.has(agentId)) {
                this.layers.set(agentId, []);
            }
            this.layers.get(agentId).push(path);
        });
    }
    
    clearAgentLayer(agentId) {
        if (this.layers.has(agentId)) {
            const layerObjects = this.layers.get(agentId);
            layerObjects.forEach(obj => {
                this.canvas.remove(obj);
            });
            this.layers.set(agentId, []);
            
            // Send clear action to WebSocket
            this.sendCanvasAction({
                agent_id: 'system',
                action_type: 'layer_cleared',
                data: { cleared_agent_id: agentId }
            });
        }
    }
    
    // Request modification from another agent
    requestModification(fromAgentId, toAgentId, requestData) {
        const request = {
            from_agent_id: fromAgentId,
            to_agent_id: toAgentId,
            request_type: 'modification',
            data: requestData,
            timestamp: Date.now()
        };
        
        // Send modification request
        this.sendCanvasAction({
            agent_id: fromAgentId,
            action_type: 'modification_request',
            data: request
        });
        
        return request;
    }
    
    // Get layer information for agents
    getLayerInfo() {
        const layerInfo = {};
        for (const [agentId, objects] of this.layers.entries()) {
            layerInfo[agentId] = {
                object_count: objects.length,
                object_types: objects.map(obj => obj.type || 'path'),
                last_modified: objects.length > 0 ? Math.max(...objects.map(obj => obj.data?.timestamp || 0)) : 0
            };
        }
        return layerInfo;
    }
    
    // Get objects from specific layer
    getLayerObjects(agentId) {
        return this.layers.get(agentId) || [];
    }
    
    // Check if agent has objects in their layer
    hasLayerObjects(agentId) {
        return this.layers.has(agentId) && this.layers.get(agentId).length > 0;
    }
    
    clearCanvas() {
        this.canvas.clear();
        this.layers.clear();
        this.layers.set('human', []);
        this.undoStack = [];
        
        // Send clear action
        this.sendCanvasAction({
            agent_id: 'system',
            action_type: 'clear',
            data: {}
        });
    }
    
    saveToUndoStack() {
        const canvasState = JSON.stringify(this.canvas.toJSON());
        this.undoStack.push(canvasState);
        
        if (this.undoStack.length > this.maxUndoSteps) {
            this.undoStack.shift();
        }
    }
    
    undoLastAction() {
        if (this.undoStack.length > 0) {
            const previousState = this.undoStack.pop();
            this.canvas.loadFromJSON(previousState, () => {
                this.canvas.renderAll();
            });
        }
    }
    
    sendCanvasAction(actionData) {
        if (window.websocketManager) {
            window.websocketManager.sendMessage({
                type: 'canvas_action',
                action: actionData
            });
        }
    }
    
    // Mermaid diagram management
    addMermaidDiagram(content, position = { x: 50, y: 50 }, agentId = 'human') {
        const diagramId = `mermaid-${Date.now()}`;
        
        // Create container for the diagram
        const container = document.createElement('div');
        container.id = diagramId;
        container.className = 'mermaid-diagram';
        container.style.position = 'absolute';
        container.style.left = `${position.x}px`;
        container.style.top = `${position.y}px`;
        container.style.zIndex = '1000';
        container.style.background = 'white';
        container.style.padding = '10px';
        container.style.border = '1px solid #ccc';
        container.style.borderRadius = '5px';
        container.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
        
        // Add mermaid content
        container.innerHTML = `
            <div class="mermaid">
                ${content}
            </div>
            <div class="diagram-controls">
                <button class="btn btn-small btn-danger" onclick="canvasManager.removeMermaidDiagram('${diagramId}')">Remove</button>
            </div>
        `;
        
        // Add to canvas container
        document.querySelector('.canvas-container').appendChild(container);
        
        // Render mermaid
        mermaid.init(undefined, container);
        
        // Store diagram info
        if (!this.layers.has(agentId)) {
            this.layers.set(agentId, []);
        }
        this.layers.get(agentId).push({
            type: 'mermaid',
            id: diagramId,
            content: content,
            position: position
        });
        
        return diagramId;
    }
    
    removeMermaidDiagram(diagramId) {
        const element = document.getElementById(diagramId);
        if (element) {
            element.remove();
        }
    }
    
    // Get canvas state for saving/loading
    getCanvasState() {
        return {
            canvas: this.canvas.toJSON(),
            layers: Array.from(this.layers.entries())
        };
    }
    
    loadCanvasState(state) {
        this.canvas.loadFromJSON(state.canvas, () => {
            this.canvas.renderAll();
        });
        
        this.layers = new Map(state.layers);
    }
}

// Initialize canvas manager
const canvasManager = new CanvasManager();
window.canvasManager = canvasManager; 