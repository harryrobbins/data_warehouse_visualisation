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
                selectedLayout: 'clusteredForce', // 'clusteredForce', 'hierarchicalLR', 'hierarchicalUD'
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

                // Base configuration options for the graph
                const options = {
                    physics: {
                        stabilization: { iterations: 200, fit: true },
                    },
                    interaction: {
                        hover: true,
                        tooltipDelay: 200,
                        navigationButtons: false,
                        keyboard: true,
                    },
                    nodes: {
                        shape: 'box',
                        margin: 12,
                        font: { size: 14, face: 'Inter, sans-serif', color: '#1e293b' },
                        borderWidth: 2,
                        shadow: { enabled: true, color: 'rgba(0,0,0,0.1)', size: 5, x: 3, y: 3 },
                    },
                    edges: {
                        arrows: { to: { enabled: true, scaleFactor: 0.7 } },
                        color: { color: '#94a3b8', highlight: '#0f172a', hover: '#475569' },
                        smooth: { enabled: true, type: 'cubicBezier', forceDirection: 'horizontal', roundness: 0.6 },
                        width: 1.5,
                    },
                };

                this.network = new vis.Network(container, data, options);

                this.populateAllNodes();
                this.updateLayout(); // Apply initial layout settings
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

                this.nodes.clear();
                this.edges.clear();
                this.nodes.add(this.activeNodes);
                this.edges.add(this.activeEdges);

                this.network.fit({
                    animation: { duration: 800, easingFunction: 'easeInOutQuad' }
                });

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
                    case 'hierarchicalLR': // Left-to-Right
                        options = {
                            layout: { hierarchical: { enabled: true, direction: 'LR', sortMethod: 'directed' } },
                            physics: { enabled: true, solver: 'hierarchicalRepulsion' }
                        };
                        break;
                    case 'hierarchicalUD': // Top-to-Bottom
                        options = {
                            layout: { hierarchical: { enabled: true, direction: 'UD', sortMethod: 'directed' } },
                            physics: { enabled: true, solver: 'hierarchicalRepulsion' }
                        };
                        break;
                    case 'clusteredForce':
                    default:
                        options = {
                            layout: { hierarchical: { enabled: false } },
                            physics: {
                                enabled: true,
                                solver: 'barnesHut',
                                barnesHut: {
                                    gravitationalConstant: -10000,
                                    centralGravity: 0.1,
                                    springLength: 200,
                                    springConstant: 0.05,
                                    damping: 0.3
                                }
                            }
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
                const current_node_ids = new Set(this.nodes.getIds());

                if (term === '') {
                    const nodesToReset = this.allNodes
                        .filter(node => current_node_ids.has(node.id))
                        .map(node => ({ id: node.id, color: undefined, font: { color: '#1e293b' } }));
                    if(nodesToReset.length > 0) this.nodes.update(nodesToReset);
                    return;
                }

                const nodesToUpdate = this.allNodes
                    .filter(node => current_node_ids.has(node.id))
                    .map(node => {
                        const label = node.label.toLowerCase();
                        const title = node.title ? node.title.toLowerCase() : '';
                        const isMatch = label.includes(term) || title.includes(term);
                        return {
                            id: node.id,
                            color: isMatch ? { border: '#2563eb', background: '#eff6ff' } : { border: '#e2e8f0', background: '#f8fafc' },
                            font: { color: isMatch ? '#1e3a8a' : '#94a3b8' }
                        };
                });
                if(nodesToUpdate.length > 0) this.nodes.update(nodesToUpdate);
            }
        },
        // Watchers observe changes in data properties and react to them
        watch: {
            selectedState(newState, oldState) {
                if (newState !== oldState) this.updateGraphData();
            },
            searchTerm() {
                this.handleSearch();
            },
            selectedLayout() {
                this.updateLayout();
            }
        },
        mounted() {
            this.initializeGraph();
        },
    };

    Vue.createApp(App).mount('#app');
});
