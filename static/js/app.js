// static/js/app.js

// Wait for the DOM to be fully loaded before initializing the Vue app
document.addEventListener('DOMContentLoaded', () => {

    // Define the main Vue application component
    const App = {
        // Data properties for the component
        data() {
            return {
                // The raw graph data injected by the backend
                graphData: window.graphData || { past: {}, current: {}, future: {} },
                // The currently selected state ('past', 'current', 'future')
                selectedState: 'past',
                // The search term entered by the user
                searchTerm: '',
                // The vis.js network instance
                network: null,
                // Datasets for vis.js (nodes and edges)
                nodes: new vis.DataSet(),
                edges: new vis.DataSet(),
                // Flag to control the physics simulation
                isPhysicsEnabled: true,
                // The currently selected layout algorithm
                selectedLayout: 'hierarchicalLR', // 'hierarchicalLR', 'hierarchicalUD', 'force'
                // A copy of all unique nodes across all states for efficient searching
                allNodes: [],
            };
        },
        // Computed properties derive their value from other data properties
        computed: {
            // Get the nodes for the currently selected state
            activeNodes() {
                return this.graphData[this.selectedState]?.nodes || [];
            },
            // Get the edges for the currently selected state
            activeEdges() {
                return this.graphData[this.selectedState]?.edges || [];
            },
            // Count of currently displayed nodes
            nodeCount() {
                return this.nodes.length;
            },
            // Count of currently displayed edges
            edgeCount() {
                return this.edges.length;
            },
        },
        // Methods for handling events and business logic
        methods: {
            /**
             * Initializes the vis.js network graph.
             */
            initializeGraph() {
                const container = document.getElementById('network-graph');
                const data = {
                    nodes: this.nodes,
                    edges: this.edges,
                };

                // Configuration options for the graph
                const options = {
                    // Physics engine settings for layout
                    physics: {
                        enabled: true,
                        solver: 'hierarchicalRepulsion',
                        hierarchicalRepulsion: {
                            centralGravity: 0.0,
                            springLength: 200,
                            springConstant: 0.01,
                            nodeDistance: 150,
                            damping: 0.15,
                        },
                        stabilization: {
                            iterations: 200,
                            fit: true,
                        },
                    },
                    // Interaction settings (hover, zoom, etc.)
                    interaction: {
                        hover: true,
                        tooltipDelay: 200,
                        navigationButtons: false,
                        keyboard: true,
                    },
                    // Layout settings for a left-to-right hierarchical structure
                    layout: {
                        hierarchical: {
                            enabled: true,
                            direction: 'LR', // Left-to-Right
                            sortMethod: 'directed',
                            levelSeparation: 250,
                            nodeSpacing: 120,
                        },
                    },
                    // Default node appearance
                    nodes: {
                        shape: 'box',
                        margin: 12,
                        font: {
                            size: 14,
                            face: 'Inter, sans-serif',
                            color: '#1e293b' // slate-800
                        },
                        borderWidth: 2,
                        shadow: {
                            enabled: true,
                            color: 'rgba(0,0,0,0.1)',
                            size: 5,
                            x: 3,
                            y: 3
                        },
                    },
                    // Default edge appearance
                    edges: {
                        arrows: {
                            to: { enabled: true, scaleFactor: 0.7 }
                        },
                        color: {
                            color: '#94a3b8', // slate-400
                            highlight: '#0f172a', // slate-900
                            hover: '#475569', // slate-600
                        },
                        smooth: {
                            enabled: true,
                            type: 'cubicBezier',
                            forceDirection: 'horizontal',
                            roundness: 0.6,
                        },
                        width: 1.5,
                    },
                };

                this.network = new vis.Network(container, data, options);

                // Create a comprehensive list of all unique nodes from all states for searching
                this.populateAllNodes();

                // Set the initial data
                this.updateGraphData();
            },

            /**
             * Aggregates and de-duplicates nodes from all states to create a master list for searching.
             */
            populateAllNodes() {
                const allNodesMap = new Map();
                ['past', 'current', 'future'].forEach(state => {
                    this.graphData[state].nodes.forEach(node => {
                        if (!allNodesMap.has(node.id)) {
                            allNodesMap.set(node.id, node);
                        }
                    });
                });
                this.allNodes = Array.from(allNodesMap.values());
            },

            /**
             * Updates the graph with data from the currently selected state.
             */
            updateGraphData() {
                if (!this.network) return;

                // By updating the DataSet objects, the graph will automatically update.
                this.nodes.clear();
                this.edges.clear();
                this.nodes.add(this.activeNodes);
                this.edges.add(this.activeEdges);

                // Animate the camera to fit the new nodes in the view
                this.network.fit({
                    animation: {
                        duration: 800,
                        easingFunction: 'easeInOutQuad'
                    }
                });

                // Re-apply search highlighting if there's an active search term
                if (this.searchTerm) {
                    this.handleSearch();
                }
            },

            /**
             * Toggles the physics simulation on and off.
             */
            togglePhysics() {
                this.isPhysicsEnabled = !this.isPhysicsEnabled;
                this.network.setOptions({ physics: { enabled: this.isPhysicsEnabled } });
            },

            /**
             * Applies new layout and physics options to the network.
             */
            updateLayout() {
                if (!this.network) return;
                let options = {};
                switch (this.selectedLayout) {
                    case 'hierarchicalUD': // Top-to-Bottom
                        options = {
                            layout: {
                                hierarchical: { enabled: true, direction: 'UD', sortMethod: 'directed' }
                            },
                            physics: { solver: 'hierarchicalRepulsion' }
                        };
                        break;
                    case 'force': // Force-directed
                        options = {
                            layout: {
                                hierarchical: { enabled: false }
                            },
                            physics: {
                                solver: 'barnesHut',
                                barnesHut: {
                                    gravitationalConstant: -8000,
                                    springConstant: 0.04,
                                    springLength: 95
                                }
                            }
                        };
                        break;
                    case 'hierarchicalLR': // Left-to-Right (default)
                    default:
                        options = {
                            layout: {
                                hierarchical: { enabled: true, direction: 'LR', sortMethod: 'directed' }
                            },
                            physics: { solver: 'hierarchicalRepulsion' }
                        };
                        break;
                }
                this.network.setOptions(options);
            },

            /**
             * Handles the search input to highlight nodes.
             */
            handleSearch() {
                const term = this.searchTerm.toLowerCase().trim();

                // Get the IDs of nodes currently in the view
                const current_node_ids = new Set(this.nodes.getIds());

                // If the search term is empty, reset all visible nodes
                if (term === '') {
                    const nodesToReset = this.allNodes
                        .filter(node => current_node_ids.has(node.id))
                        .map(node => ({
                            id: node.id,
                            color: undefined, // Reset to default group color
                            font: { color: '#1e293b' }
                        }));
                    if(nodesToReset.length > 0) this.nodes.update(nodesToReset);
                    return;
                }

                // Create a list of nodes to update based on the search
                const nodesToUpdate = this.allNodes
                    .filter(node => current_node_ids.has(node.id))
                    .map(node => {
                        const label = node.label.toLowerCase();
                        const title = node.title ? node.title.toLowerCase() : '';
                        const isMatch = label.includes(term) || title.includes(term);

                        // Dim non-matching nodes, highlight matching ones
                        return {
                            id: node.id,
                            color: isMatch ? {
                                border: '#2563eb', // blue-600
                                background: '#eff6ff', // blue-50
                            } : {
                                border: '#e2e8f0', // gray-200
                                background: '#f8fafc', // slate-50
                            },
                            font: {
                                color: isMatch ? '#1e3a8a' : '#94a3b8' // blue-900 or slate-400
                            }
                        };
                });

                if(nodesToUpdate.length > 0) this.nodes.update(nodesToUpdate);
            }
        },
        // Watchers observe changes in data properties and react to them
        watch: {
            // When the selected state changes, update the graph
            selectedState(newState, oldState) {
                if (newState !== oldState) {
                    this.updateGraphData();
                }
            },
            // When the search term changes, perform the search
            searchTerm() {
                this.handleSearch();
            },
            // When the layout selection changes, update the network options
            selectedLayout() {
                this.updateLayout();
            }
        },
        // Lifecycle hook that runs after the component is mounted to the DOM
        mounted() {
            this.initializeGraph();
        },
    };

    // Create and mount the Vue application
    Vue.createApp(App).mount('#app');
});
