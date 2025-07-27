// Main Application Initialization
class MainApp {
    constructor() {
        this.isPanelCollapsed = false;
        this.init();
    }
    
    init() {
        this.setupPanelToggle();
        this.setupKeyboardShortcuts();
        this.initializeMermaid();
        this.setupPeriodicUpdates();
        
        // Add welcome message
        setTimeout(() => {
            conversationManager.addSystemMessage(
                '💡 Tip: You can collapse the right panel by clicking the arrow button to get more canvas space!'
            );
        }, 2000);
        
        // Auto-discover agents when WebSocket connects
        setTimeout(() => {
            if (window.websocketManager && window.websocketManager.isConnected) {
                agentManager.discoverAgents();
            }
        }, 3000);
    }
    
    setupPanelToggle() {
        const panelToggle = document.getElementById('panel-toggle');
        const rightPanel = document.getElementById('right-panel');
        
        if (panelToggle && rightPanel) {
            panelToggle.addEventListener('click', () => {
                this.togglePanel();
            });
        }
    }
    
    togglePanel() {
        const rightPanel = document.getElementById('right-panel');
        this.isPanelCollapsed = !this.isPanelCollapsed;
        
        if (this.isPanelCollapsed) {
            rightPanel.classList.add('collapsed');
        } else {
            rightPanel.classList.remove('collapsed');
        }
        
        // Store preference
        localStorage.setItem('panelCollapsed', this.isPanelCollapsed);
    }
    
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + P to toggle panel
            if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
                e.preventDefault();
                this.togglePanel();
            }
            
            // Ctrl/Cmd + K to focus query input
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                document.getElementById('query-input').focus();
            }
            
            // Ctrl/Cmd + M to focus user message
            if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
                e.preventDefault();
                document.getElementById('user-message').focus();
            }
            
            // Escape to close modals
            if (e.key === 'Escape') {
                const modals = document.querySelectorAll('.modal');
                modals.forEach(modal => {
                    if (modal.style.display === 'block') {
                        modal.style.display = 'none';
                    }
                });
            }
        });
    }
    
    initializeMermaid() {
        // Initialize Mermaid with configuration
        mermaid.initialize({
            startOnLoad: true,
            theme: 'default',
            flowchart: {
                useMaxWidth: true,
                htmlLabels: true
            }
        });
    }
    
    setupPeriodicUpdates() {
        // Update layer information every 5 seconds
        setInterval(() => {
            agentManager.agents.forEach((agent, agentId) => {
                agentManager.updateLayerInfo(agentId);
            });
        }, 5000);
        
        // Update connection status
        setInterval(() => {
            if (websocketManager) {
                websocketManager.updateConnectionStatus(websocketManager.isConnected);
            }
        }, 10000);
    }
    
    // Load saved preferences
    loadPreferences() {
        const panelCollapsed = localStorage.getItem('panelCollapsed') === 'true';
        if (panelCollapsed) {
            this.isPanelCollapsed = true;
            document.getElementById('right-panel').classList.add('collapsed');
        }
    }
    
    // Save canvas state
    saveCanvasState() {
        const state = canvasManager.getCanvasState();
        localStorage.setItem('canvasState', JSON.stringify(state));
    }
    
    // Load canvas state
    loadCanvasState() {
        const savedState = localStorage.getItem('canvasState');
        if (savedState) {
            try {
                const state = JSON.parse(savedState);
                canvasManager.loadCanvasState(state);
            } catch (error) {
                console.error('Failed to load canvas state:', error);
            }
        }
    }
    
    // Export current session
    exportSession() {
        const sessionData = {
            timestamp: new Date().toISOString(),
            agents: Array.from(agentManager.agents.values()),
            canvas: canvasManager.getCanvasState(),
            conversation: conversationManager.messages,
            layerStats: agentManager.getLayerStats()
        };
        
        const blob = new Blob([JSON.stringify(sessionData, null, 2)], {
            type: 'application/json'
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `session-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    // Get application statistics
    getStats() {
        return {
            agents: agentManager.agents.size,
            activeAgents: agentManager.getActiveAgents().length,
            canvasLayers: canvasManager.layers.size,
            conversationMessages: conversationManager.messages.length,
            connectionStatus: websocketManager ? websocketManager.isConnected : false
        };
    }
}

// Initialize main application
const mainApp = new MainApp();
window.mainApp = mainApp;

// Load preferences on startup
document.addEventListener('DOMContentLoaded', () => {
    mainApp.loadPreferences();
    mainApp.loadCanvasState();
});

// Save canvas state before page unload
window.addEventListener('beforeunload', () => {
    mainApp.saveCanvasState();
});

// Add global utility functions
window.utils = {
    // Format timestamp
    formatTime: (timestamp) => {
        return new Date(timestamp).toLocaleTimeString();
    },
    
    // Generate random color
    randomColor: () => {
        const colors = [
            '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
            '#06b6d4', '#84cc16', '#f97316', '#ec4899', '#6366f1'
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    },
    
    // Debounce function
    debounce: (func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },
    
    // Throttle function
    throttle: (func, limit) => {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
};

// Add keyboard shortcuts help
console.log(`
🎨 Companion Agent Canvas Interface - Keyboard Shortcuts:
• Ctrl/Cmd + P: Toggle right panel
• Ctrl/Cmd + K: Focus query input
• Ctrl/Cmd + M: Focus user message
• Escape: Close modals

💡 Features:
• Layer-based collaboration - agents can't delete each other's work
• Modification requests - agents can request changes from each other
• Real-time canvas updates
• Mermaid diagram support
• Conversation history with export
• Agent tool management
`); 