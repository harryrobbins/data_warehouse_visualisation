/**
 * @typedef {Object} GraphNode
 * @property {string} id
 * @property {string} label
 * @property {string} group
 * @property {number} level
 * @property {string} [title]
 * @property {Object} [color]
 * @property {Object} [font]
 * @property {number} [x]
 * @property {number} [y]
 * @property {boolean|Object} [fixed]
 */

/**
 * @typedef {Object} Edge
 * @property {string} id
 * @property {string} from
 * @property {string} to
 * @property {number} [width]
 * @property {boolean} [hidden]
 * @property {Object} [color]
 * @property {number} [opacity]
 * @property {boolean} [smooth]
 */

/**
 * @typedef {Object} GraphStateData
 * @property {GraphNode[]} nodes
 * @property {Edge[]} edges
 */

/**
 * @typedef {Object.<string, GraphStateData>} FullGraphData
 */

/**
 * @typedef {Object} AppState
 * @property {FullGraphData} graphData
 * @property {any} network
 * @property {string} selectedState
 * @property {string} selectedLayout
 * @property {string} searchTerm
 * @property {boolean} isPhysicsEnabled
 * @property {any} stabilizationTimeout
 * @property {boolean} isClustered
 * @property {string} viewMode
 * @property {boolean} showDebug
 * @property {boolean} isLoading
 * @property {string[]} logs
 * @property {any} logInterval
 * @property {GraphNode[]} currentNodes
 * @property {GraphNode[]} filteredNodes
 * @property {number} nodeCount
 * @property {number} edgeCount
 * @property {function(): any} getLayoutOptions
 * @property {function(GraphNode[]): GraphNode[]} optimizeNodeRendering
 * @property {function(GraphNode[]): void} applyRoughPositioning
 * @property {function(): void} drawGraph
 * @property {function(GraphNode[]): void} applyManualLTRLayout
 * @property {function(): void} togglePhysics
 * @property {function(string[]): void} applyHighlight
 * @property {function(): void} resetNodeStyles
 * @property {function(string): void} searchNodes
 * @property {function(): Promise<void>} fetchLogs
 * @property {function(): void} refreshLogs
 * @property {function(): void} toggleDebugPanel
 * @property {Object.<string, string[]>} connectionMap
 * @property {Object.<string, GraphNode>} nodeIdMap
 * @property {function(): void} calculateConnectivity
 * @property {function(string): {count: number, labels: string[]}} getNodeConnections
 * @property {Object.<string, Object.<string, {x: number, y: number}>>} layoutCache
 */

// static/js/app.js - Optimized for large graphs (500+ nodes) with Type Checking via JSDoc

const App = {
    data() {
        return {
            /** @type {FullGraphData} */
            graphData: window.graphData,
            /** @type {any} */
            network: null,
            selectedState: 'past',
            selectedLayout: 'clusteredForce',
            searchTerm: '',
            isPhysicsEnabled: true,
            stabilizationTimeout: null,
            isClustered: false,
            
            // New Robustness Features
            viewMode: 'graph', // 'graph' | 'table'
            showDebug: false,
            isLoading: false,
            logs: [],
            logInterval: null,
            
            // Connection Data Cache
            /** @type {Object.<string, string[]>} */
            connectionMap: {},
            /** @type {Object.<string, GraphNode>} */
            nodeIdMap: {},
            
            // Layout Position Cache
            /** @type {Object.<string, Object.<string, {x: number, y: number}>>} */
            layoutCache: {}
        };
    },
    computed: {
        /** @this {AppState} */
        nodeCount() {
            if (this.viewMode === 'graph' && this.network) {
                return this.network.body.data.nodes.length;
            }
            return this.currentNodes.length;
        },
        /** @this {AppState} */
        edgeCount() {
            if (this.viewMode === 'graph' && this.network) {
                return this.network.body.data.edges.length;
            }
            // Fallback for table mode or before network init
            return this.graphData[this.selectedState]?.edges?.length || 0;
        },
        /**
         * Returns the list of nodes for the currently selected state.
         * @this {AppState}
         * @returns {GraphNode[]}
         */
        currentNodes() {
            return this.graphData[this.selectedState]?.nodes || [];
        },
        /**
         * Returns filtered nodes for the Table View.
         * @this {AppState}
         * @returns {GraphNode[]}
         */
        filteredNodes() {
            const query = this.searchTerm.toLowerCase().trim();
            if (!query) {
                return this.currentNodes;
            }
            return this.currentNodes.filter(node => 
                node.label.toLowerCase().includes(query) || 
                node.id.toLowerCase().includes(query) ||
                node.group.toLowerCase().includes(query)
            );
        }
    },
    watch: {
        selectedState() {
            /** @type {AppState} */
            // @ts-ignore
            const self = this;
            self.calculateConnectivity();
            if (self.viewMode === 'graph') {
                self.drawGraph();
            }
        },
        selectedLayout() {
            /** @type {AppState} */
            // @ts-ignore
            const self = this;
            if (self.viewMode === 'graph') {
                self.drawGraph();
            }
        },
        /**
         * @param {string} newValue 
         */
        searchTerm(newValue) {
            /** @type {AppState} */
            // @ts-ignore
            const self = this;
            if (self.viewMode === 'graph') {
                self.searchNodes(newValue);
            }
        },
        /**
         * @param {string} newMode 
         */
        viewMode(newMode) {
            /** @type {AppState} */
            // @ts-ignore
            const self = this;

            if (newMode === 'graph') {
                // Give Vue a tick to render the container div before initializing Vis.js
                // @ts-ignore
                self.$nextTick(() => {
                    self.drawGraph();
                });
            } else {
                // Clean up network instance to save memory when switching to table
                if (self.network) {
                    self.network.destroy();
                    self.network = null;
                }
            }
        },
        /**
         * @param {boolean} newVal 
         */
        showDebug(newVal) {
            /** @type {AppState} */
            // @ts-ignore
            const self = this;
            if (newVal) {
                self.fetchLogs();
                self.logInterval = setInterval(self.fetchLogs, 5000);
            } else {
                if (self.logInterval) {
                    clearInterval(self.logInterval);
                    self.logInterval = null;
                }
            }
        }
    },
    mounted() {
        /** @type {AppState} */
        // @ts-ignore
        const self = this;
        self.calculateConnectivity();
        if (self.viewMode === 'graph') {
            self.drawGraph();
        }
    },
    methods: {
        /** @this {AppState} */
        getLayoutOptions() {
            // Optimized physics settings for large graphs (500+ nodes)
            const basePhysics = {
                solver: 'forceAtlas2Based', // Better performance for large graphs
                forceAtlas2Based: {
                    gravitationalConstant: -50,
                    centralGravity: 0.01,
                    springLength: 100,
                    springConstant: 0.08,
                    damping: 0.4,
                    avoidOverlap: 0.5
                },
                stabilization: {
                    enabled: false, // Disable stabilization so nodes start moving immediately
                    iterations: 500,
                    updateInterval: 50,
                    fit: true
                },
                adaptiveTimestep: true, // Let vis.js optimize timestep
                timestep: 0.5, // Larger timestep = faster but less precise
                minVelocity: 2.0, // Higher threshold to stop physics sooner
            };

            // Stable physics for manual LTR layout - prevents jiggling
            const stablePhysics = {
                solver: 'barnesHut',
                barnesHut: {
                    gravitationalConstant: -8000, // Much lower to reduce forces
                    centralGravity: 0.1,
                    springLength: 150,
                    springConstant: 0.02, // Lower spring constant for stability
                    damping: 0.15, // Higher damping to reduce oscillations
                    avoidOverlap: 0.3
                },
                stabilization: {
                    enabled: false, // Disable stabilization
                    iterations: 300,
                    updateInterval: 100,
                    fit: true
                },
                adaptiveTimestep: true,
                timestep: 0.3, // Smaller timestep for stability
                minVelocity: 0.5, // Lower threshold for more precise stopping
            };

            const commonOptions = {
                interaction: {
                    hover: true, // ENABLED per robustness plan
                    tooltipDelay: 200, // Slight delay to prevent flickering
                    hideEdgesOnDrag: true,
                    hideEdgesOnZoom: true,
                    navigationButtons: true,
                    keyboard: true
                },
                edges: {
                    smooth: false // Disable smooth edges globally for performance
                }
            };

            switch (this.selectedLayout) {
                case 'hierarchicalLR':
                    return {
                        ...commonOptions,
                        layout: {
                            hierarchical: { enabled: false }
                        },
                        physics: stablePhysics
                    };
                case 'hierarchicalUD':
                    return {
                        ...commonOptions,
                        layout: {
                            hierarchical: {
                                enabled: true,
                                direction: 'UD',
                                sortMethod: 'directed',
                                nodeSpacing: 150,
                                treeSpacing: 200,
                            }
                        },
                        physics: false
                    };
                case 'clusteredForce':
                default:
                    return {
                        ...commonOptions,
                        layout: {
                            hierarchical: {
                                enabled: false
                            }
                        },
                        physics: basePhysics
                    };
            }
        },

        /**
         * Optimizes node visual properties for performance.
         * @param {GraphNode[]} nodes 
         * @returns {GraphNode[]}
         */
        optimizeNodeRendering(nodes) {
            return nodes.map(node => ({
                ...node,
                font: {
                    size: Math.min(node.font?.size || 14, 12),
                    color: node.font?.color || '#343434'
                },
                borderWidth: 1,
                shadow: false,
                // Ensure labels are strings to prevent crashing
                label: String(node.label || ''),
                // Keep original colors but ensure they're optimized
                color: node.color || { background: '#97C2FC', border: '#2B7CE9' }
            }));
        },

        /** @this {AppState} */
        applyRoughPositioning(nodes) {
            // Pre-position nodes by group to reduce physics calculation time
            const groups = {};
            nodes.forEach(node => {
                if (!groups[node.group]) groups[node.group] = [];
                groups[node.group].push(node);
            });

            // Rough positioning by group - spread them out initially
            const groupPositions = {
                feed: { x: 0, y: 0 },
                warehouse: { x: 400, y: 0 },
                datalake: { x: 400, y: 300 },
                virtualisation: { x: 800, y: 150 },
                logical_dw: { x: 1200, y: 150 }
            };

            Object.keys(groups).forEach(groupName => {
                const basePos = groupPositions[groupName] || { x: 0, y: 0 };
                const nodesInGroup = groups[groupName];
                const cols = Math.ceil(Math.sqrt(nodesInGroup.length));

                nodesInGroup.forEach((node, index) => {
                    const row = Math.floor(index / cols);
                    const col = index % cols;
                    node.x = basePos.x + col * 80;
                    node.y = basePos.y + row * 80;
                });
            });
        },

        /** @this {AppState} */
        drawGraph() {
            // Set loading state immediately
            this.isLoading = true;

            // Use requestAnimationFrame to allow the UI to render the loading spinner
            // before blocking the main thread with graph generation.
            requestAnimationFrame(() => {
                // Use a minimal timeout to ensure the render cycle completes
                setTimeout(() => {
                    this._drawGraphInternal();
                }, 10);
            });
        },

        /** 
         * Internal method for graph drawing to be called async
         * @this {AppState} 
         */
        _drawGraphInternal() {
            // Clean up previous network instance and timers
            if (this.network) {
                this.network.destroy();
                this.network = null;
            }
            if (this.stabilizationTimeout) {
                clearTimeout(this.stabilizationTimeout);
            }

            const container = document.getElementById('network-graph');
            if (!container) {
                this.isLoading = false;
                return; // Guard clause if viewMode switched rapidly
            }

            // Deep copy data for modifications
            const rawData = this.graphData[this.selectedState];
            if (!rawData) {
                console.error(`No data for state: ${this.selectedState}`);
                this.isLoading = false;
                return;
            }
            const data = JSON.parse(JSON.stringify(rawData));

            // Optimize node rendering for performance
            // @ts-ignore
            data.nodes = this.optimizeNodeRendering(data.nodes);

            // Optimize edge rendering
            // @ts-ignore
            data.edges = data.edges.map(edge => ({
                ...edge,
                smooth: false, // Disable smooth edges for performance
                width: Math.min(edge.width || 1, 2), // Limit edge width
            }));

            // --- Hide Disconnected Nodes ---
            // Create a set of all node IDs that have at least one edge in this view
            const connectedNodeIds = new Set();
            data.edges.forEach(edge => {
                connectedNodeIds.add(edge.from);
                connectedNodeIds.add(edge.to);
            });

            // Filter nodes to keep only those that are connected
            data.nodes = data.nodes.filter(node => connectedNodeIds.has(node.id));

            // Check for cached layout positions
            const cacheKey = `${this.selectedState}_${this.selectedLayout}`;
            /** @type {Object.<string, {x: number, y: number}>} */
            // @ts-ignore
            const cachedPositions = this.layoutCache[cacheKey];

            if (cachedPositions) {
                // Apply cached positions
                data.nodes = data.nodes.map(node => {
                    if (cachedPositions[node.id]) {
                        node.x = cachedPositions[node.id].x;
                        node.y = cachedPositions[node.id].y;
                    }
                    return node;
                });
            } else {
                // Pre-position nodes based on layout ONLY if no cache
                if (this.selectedLayout === 'hierarchicalLR') {
                    this.applyManualLTRLayout(data.nodes);
                } else if (this.selectedLayout === 'clusteredForce') {
                    this.applyRoughPositioning(data.nodes);
                }
            }

            // @ts-ignore
            const options = this.getLayoutOptions();

            // If we have cached positions, we can disable stabilization to load instantly
            if (cachedPositions && options.physics) {
                options.physics.stabilization = { enabled: false };
            }

            // Sync the physics button with the layout's default state
            this.isPhysicsEnabled = options.physics !== false;

            // Use Vue.markRaw to prevent Vue from making the vis.Network instance reactive.
            // This fixes the "TypeError: Private element is not present on this object" error.
            this.network = Vue.markRaw(new vis.Network(container, data, options));

            // Optimized event listeners for large graphs
            this.network.once('stabilizationIterationsDone', () => {
                // Save stable positions to cache
                const positions = this.network.getPositions();
                // @ts-ignore
                this.layoutCache[cacheKey] = positions;

                // Auto-disable physics after stabilization for better performance
                this.stabilizationTimeout = setTimeout(() => {
                    if (this.network) {
                        this.network.setOptions({ physics: false });
                        this.isPhysicsEnabled = false;
                    }
                }, this.selectedLayout === 'hierarchicalLR' ? 2000 : 3000);
            });

            // Update cache when user manually moves nodes
            this.network.on("dragEnd", () => {
                 const positions = this.network.getPositions();
                 // @ts-ignore
                 this.layoutCache[cacheKey] = positions;
            });

            this.network.on("selectNode", (params) => {
                this.applyHighlight(params.nodes);
            });

            this.network.on("deselectNode", () => {
                this.resetNodeStyles();
            });

            // Re-apply search highlight if needed after redraw
            if (this.searchTerm) {
                // @ts-ignore
                this.searchNodes(this.searchTerm);
            }
            
            // Turn off loading state
            this.isLoading = false;
        },

        applyManualLTRLayout(nodes) {
            // Optimized manual layout with better spacing
            const groups = {};
            nodes.forEach(node => {
                if (!groups[node.group]) {
                    groups[node.group] = [];
                }
                groups[node.group].push(node);
            });

            const xSpacing = 200;
            const ySpacing = 100;
            let currentX = 0;
            let levelWidths = [];

            // Level 0: Feeds
            if (groups.feed && groups.feed.length > 0) {
                const feeds = groups.feed;
                const numColumns = 8;
                feeds.forEach((node, index) => {
                    node.x = (index % numColumns) * xSpacing;
                    node.fixed = { x: true, y: false };
                });
                const levelWidth = (Math.min(feeds.length, numColumns)) * xSpacing;
                levelWidths.push(levelWidth);
            } else {
                levelWidths.push(0);
            }

            currentX = levelWidths[0];

            // Level 1: Warehouses OR Data Lake
            const level1Nodes = [].concat(groups.warehouse || [], groups.datalake || []);
            if (level1Nodes.length > 0) {
                const numColumns = 3;
                level1Nodes.forEach((node, index) => {
                    node.x = currentX + (index % numColumns) * xSpacing;
                    if (node.group === 'datalake') {
                        node.y = Math.floor(index / numColumns) * ySpacing;
                        node.fixed = true;
                    } else {
                        node.fixed = { x: true, y: false };
                    }
                });
                const levelWidth = (Math.min(level1Nodes.length, numColumns)) * xSpacing;
                levelWidths.push(levelWidth);
            } else {
                levelWidths.push(0);
            }
            currentX += levelWidths[1];

            // Level 2: Virtualisation
            if (groups.virtualisation && groups.virtualisation.length > 0) {
                groups.virtualisation.forEach((node, index) => {
                    node.x = currentX;
                    node.y = index * ySpacing * 1.5;
                    node.fixed = true;
                });
                levelWidths.push(xSpacing);
            } else {
                levelWidths.push(0);
            }
            currentX += levelWidths[2];

            // Level 3: Logical DWs
            if (groups.logical_dw && groups.logical_dw.length > 0) {
                groups.logical_dw.forEach((node, index) => {
                    node.x = currentX;
                    node.fixed = { x: true, y: false };
                });
            }
        },

        /** @this {AppState} */
        togglePhysics() {
            if (!this.network) return;

            this.isPhysicsEnabled = !this.isPhysicsEnabled;
            this.network.setOptions({ physics: { enabled: this.isPhysicsEnabled } });

            // Clear auto-disable timer when manually toggling
            if (this.isPhysicsEnabled && this.stabilizationTimeout) {
                clearTimeout(this.stabilizationTimeout);
                this.stabilizationTimeout = null;
            }

            // For LTR layout, auto-disable physics after a short time
            if (this.isPhysicsEnabled && this.selectedLayout === 'hierarchicalLR') {
                this.stabilizationTimeout = setTimeout(() => {
                    if (this.network && this.isPhysicsEnabled) {
                        this.network.setOptions({ physics: false });
                        this.isPhysicsEnabled = false;
                    }
                }, 3000);
            }
        },

        /** @this {AppState} */
        applyHighlight(selectedIds) {
            if (!this.network || !this.graphData[this.selectedState]) return;

            const originalNodes = this.graphData[this.selectedState].nodes;
            const nodesToUpdate = [];
            const edgesToUpdate = [];

            const allNodes = this.network.body.data.nodes.get();
            const allEdges = this.network.body.data.edges.get();

            if (selectedIds.length === 0) {
                this.resetNodeStyles();
                return;
            }

            const nodesToHighlight = new Set(selectedIds);
            selectedIds.forEach(nodeId => {
                this.network.getConnectedNodes(nodeId).forEach(connectedId => nodesToHighlight.add(connectedId));
            });

            allNodes.forEach(node => {
                const originalNode = originalNodes.find(n => n.id === node.id);
                if (!originalNode) return;

                if (nodesToHighlight.has(node.id)) {
                    nodesToUpdate.push({
                        id: node.id,
                        color: originalNode.color,
                        opacity: 1,
                        // @ts-ignore
                        font: { color: '#343434' }
                    });
                } else {
                    nodesToUpdate.push({
                        id: node.id,
                        color: { background: '#f0f0f0', border: '#d3d3d3' },
                        opacity: 0.2, // Dim the node significantly
                        // @ts-ignore
                        font: { color: '#d3d3d3' }
                    });
                }
            });

            allEdges.forEach(edge => {
                if (nodesToHighlight.has(edge.from) && nodesToHighlight.has(edge.to)) {
                    edgesToUpdate.push({
                        id: edge.id,
                        color: { color: '#2B7CE9', highlight: '#2B7CE9' },
                        opacity: 1.0,
                        hidden: false
                    });
                } else {
                    edgesToUpdate.push({
                        id: edge.id,
                        color: { color: '#e0e0e0', highlight: '#e0e0e0' },
                        opacity: 0.1,
                        hidden: true // Hide irrelevant edges for clarity
                    });
                }
            });

            this.network.body.data.nodes.update(nodesToUpdate);
            this.network.body.data.edges.update(edgesToUpdate);
        },

        /** @this {AppState} */
        resetNodeStyles() {
            if (!this.network || !this.graphData[this.selectedState]) return;
            
            // Re-render completely to ensure clean state
            // It's often faster and cleaner than updating individual properties for all nodes
            this.drawGraph(); 
        },

        /** @this {AppState} */
        searchNodes(query) {
            if(!this.network) return;

            const lowerCaseQuery = query.toLowerCase().trim();
            if (lowerCaseQuery === '') {
                this.resetNodeStyles();
                this.network.unselectAll();
                return;
            }

            const allNodes = this.graphData[this.selectedState].nodes;
            const matchedNodes = allNodes.filter(node =>
                String(node.label).toLowerCase().includes(lowerCaseQuery) ||
                String(node.id).toLowerCase().includes(lowerCaseQuery)
            );
            
            const nodesToSelect = matchedNodes.map(node => node.id);

            if (nodesToSelect.length > 0) {
                this.network.selectNodes(nodesToSelect);
                this.applyHighlight(nodesToSelect);

                // Focus on the first matched node to orient the user
                this.network.focus(nodesToSelect[0], {
                    scale: 1.0,
                    animation: {
                        duration: 500,
                        easingFunction: 'easeInOutQuad'
                    }
                });
            } else {
                // If no match, maybe reset or show feedback?
                // For now, let's reset so they know nothing matched in this view
                this.network.unselectAll();
                this.resetNodeStyles();
            }
        },

        /** @this {AppState} */
        async fetchLogs() {
            try {
                const response = await fetch('/logs');
                if (response.ok) {
                    const data = await response.json();
                    this.logs = data.logs;
                }
            } catch (error) {
                console.error("Failed to fetch logs:", error);
            }
        },
        
        /** @this {AppState} */
        refreshLogs() {
            this.fetchLogs();
        },
        
        /** @this {AppState} */
        toggleDebugPanel() {
            this.showDebug = !this.showDebug;
        },

        /** @this {AppState} */
        calculateConnectivity() {
            // Reset maps
            this.connectionMap = {};
            this.nodeIdMap = {};

            const nodes = this.currentNodes;
            const edges = this.graphData[this.selectedState]?.edges || [];

            // Populate Node ID Map for Label Lookup
            nodes.forEach(node => {
                this.nodeIdMap[node.id] = node;
                this.connectionMap[node.id] = [];
            });

            // Populate Connection Map (Adjacency List)
            edges.forEach(edge => {
                if (this.connectionMap[edge.from] && this.connectionMap[edge.to]) {
                    // Store IDs initially
                    // Avoid duplicates if edges are defined multiple times (though graph data shouldn't have them)
                    if (!this.connectionMap[edge.from].includes(edge.to)) {
                        this.connectionMap[edge.from].push(edge.to);
                    }
                    if (!this.connectionMap[edge.to].includes(edge.from)) {
                        this.connectionMap[edge.to].push(edge.from);
                    }
                }
            });
        },

        /** 
         * @this {AppState} 
         * @param {string} nodeId
         * @returns {{count: number, labels: string[]}}
         */
        getNodeConnections(nodeId) {
            const connectedIds = this.connectionMap[nodeId] || [];
            const labels = connectedIds
                .map(id => this.nodeIdMap[id]?.label || 'Unknown')
                .sort();
            
            return {
                count: connectedIds.length,
                labels: labels
            };
        }
    }
};

Vue.createApp(App).mount('#app');
