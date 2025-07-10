// static/js/app.js - Optimized for large graphs (500+ nodes)

const App = {
    data() {
        return {
            graphData: window.graphData,
            network: null,
            selectedState: 'past',
            selectedLayout: 'clusteredForce',
            searchTerm: '',
            isPhysicsEnabled: true,
            stabilizationTimeout: null,
            isClustered: false,
        };
    },
    computed: {
        nodeCount() {
            return this.network ? this.network.body.data.nodes.length : 0;
        },
        edgeCount() {
            return this.network ? this.network.body.data.edges.length : 0;
        },
    },
    watch: {
        selectedState() {
            this.drawGraph();
        },
        selectedLayout() {
            this.drawGraph();
        },
        searchTerm(newValue) {
            this.searchNodes(newValue);
        }
    },
    mounted() {
        this.drawGraph();
    },
    methods: {
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
                    enabled: true,
                    iterations: 500, // Reduced from 2000 for faster initial layout
                    updateInterval: 50, // Update UI less frequently
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
                    enabled: true,
                    iterations: 300, // Fewer iterations for faster stabilization
                    updateInterval: 100,
                    fit: true
                },
                adaptiveTimestep: true,
                timestep: 0.3, // Smaller timestep for stability
                minVelocity: 0.5, // Lower threshold for more precise stopping
            };

            switch (this.selectedLayout) {
                case 'hierarchicalLR':
                    return {
                        layout: {
                            hierarchical: { enabled: false }
                        },
                        physics: stablePhysics // Use stable physics for manual layouts
                    };
                case 'hierarchicalUD':
                    return {
                        layout: {
                            hierarchical: {
                                enabled: true,
                                direction: 'UD',
                                sortMethod: 'directed',
                                nodeSpacing: 150, // Reduced for performance
                                treeSpacing: 200, // Reduced for performance
                            }
                        },
                        physics: false
                    };
                case 'clusteredForce':
                default:
                    return {
                        layout: {
                            hierarchical: {
                                enabled: false
                            }
                        },
                        physics: basePhysics
                    };
            }
        },

        optimizeNodeRendering(nodes) {
            // Optimize visual properties for performance
            return nodes.map(node => ({
                ...node,
                font: {
                    size: Math.min(node.font?.size || 14, 12), // Smaller fonts
                    color: node.font?.color || '#343434'
                },
                borderWidth: 1, // Thinner borders
                shadow: false, // Disable shadows for performance
                smooth: false, // Disable smooth curves
                // Keep original colors but ensure they're optimized
                color: node.color || { background: '#97C2FC', border: '#2B7CE9' }
            }));
        },

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

        drawGraph() {
            // Clean up previous network instance and timers
            if (this.network) {
                this.network.destroy();
            }
            if (this.stabilizationTimeout) {
                clearTimeout(this.stabilizationTimeout);
            }

            const container = document.getElementById('network-graph');
            // Deep copy data for modifications
            const data = JSON.parse(JSON.stringify(this.graphData[this.selectedState]));

            if (!data) {
                console.error(`No data for state: ${this.selectedState}`);
                return;
            }

            // Optimize node rendering for performance
            data.nodes = this.optimizeNodeRendering(data.nodes);

            // Optimize edge rendering
            data.edges = data.edges.map(edge => ({
                ...edge,
                smooth: false, // Disable smooth edges for performance
                width: Math.min(edge.width || 1, 2), // Limit edge width
            }));

            // Pre-position nodes based on layout
            if (this.selectedLayout === 'hierarchicalLR') {
                this.applyManualLTRLayout(data.nodes);
            } else if (this.selectedLayout === 'clusteredForce') {
                this.applyRoughPositioning(data.nodes);
            }

            const options = this.getLayoutOptions();

            // Add performance-focused rendering options
            options.interaction = {
                ...options.interaction,
                hover: false, // Disable hover for performance
                tooltipDelay: 300,
                hideEdgesOnDrag: true, // Hide edges while dragging
                hideEdgesOnZoom: true, // Hide edges while zooming
            };

            options.edges = {
                ...options.edges,
                smooth: false, // Disable smooth edges globally
            };

            // Sync the physics button with the layout's default state
            this.isPhysicsEnabled = options.physics !== false;

            this.network = new vis.Network(container, data, options);

            // Optimized event listeners for large graphs
            this.network.once('stabilizationIterationsDone', () => {
                // Auto-disable physics after stabilization for better performance
                this.stabilizationTimeout = setTimeout(() => {
                    if (this.network) {
                        this.network.setOptions({ physics: false });
                        this.isPhysicsEnabled = false;
                    }
                }, this.selectedLayout === 'hierarchicalLR' ? 2000 : 3000); // Faster for LTR
            });

            this.network.on("selectNode", (params) => {
                this.applyHighlight(params.nodes);
            });

            this.network.on("deselectNode", () => {
                this.resetNodeStyles();
            });
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

            const xSpacing = 200; // Slightly reduced for performance
            const ySpacing = 100; // Slightly reduced for performance
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
                    node.y = index * ySpacing * 1.5; // Reduced spacing
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

        togglePhysics() {
            if (!this.network) return;

            this.isPhysicsEnabled = !this.isPhysicsEnabled;
            this.network.setOptions({ physics: { enabled: this.isPhysicsEnabled } });

            // Clear auto-disable timer when manually toggling
            if (this.isPhysicsEnabled && this.stabilizationTimeout) {
                clearTimeout(this.stabilizationTimeout);
                this.stabilizationTimeout = null;
            }

            // For LTR layout, auto-disable physics after a short time to prevent jiggling
            if (this.isPhysicsEnabled && this.selectedLayout === 'hierarchicalLR') {
                this.stabilizationTimeout = setTimeout(() => {
                    if (this.network && this.isPhysicsEnabled) {
                        this.network.setOptions({ physics: false });
                        this.isPhysicsEnabled = false;
                    }
                }, 3000);
            }
        },

        enableClustering() {
            // Optional clustering for very large graphs
            if (!this.network || this.isClustered) return;

            const clusterOptionsByData = {
                processProperties: function(clusterOptions, childNodes) {
                    let totalMass = 0;
                    let x = 0, y = 0;
                    for (let i = 0; i < childNodes.length; i++) {
                        totalMass += childNodes[i].mass || 1;
                        x += childNodes[i].x || 0;
                        y += childNodes[i].y || 0;
                    }
                    clusterOptions.mass = totalMass;
                    clusterOptions.x = x / childNodes.length;
                    clusterOptions.y = y / childNodes.length;
                    clusterOptions.label = `Cluster (${childNodes.length})`;
                    return clusterOptions;
                }
            };

            // Cluster by node type for initial layout
            ['feed', 'warehouse', 'datalake'].forEach(group => {
                if (this.graphData[this.selectedState].nodes.some(n => n.group === group)) {
                    this.network.cluster({
                        joinCondition: function(nodeOptions) {
                            return nodeOptions.group === group;
                        },
                        clusterNodeProperties: clusterOptionsByData
                    });
                }
            });

            this.isClustered = true;
        },

        disableClustering() {
            if (!this.network || !this.isClustered) return;
            this.network.openCluster();
            this.isClustered = false;
        },

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

            // Batch update for better performance
            allNodes.forEach(node => {
                const originalNode = originalNodes.find(n => n.id === node.id);
                if (!originalNode) return;

                if (nodesToHighlight.has(node.id)) {
                    nodesToUpdate.push({
                        id: node.id,
                        color: originalNode.color,
                        font: { color: '#343434' }
                    });
                } else {
                    nodesToUpdate.push({
                        id: node.id,
                        color: { background: '#f0f0f0', border: '#d3d3d3' },
                        font: { color: '#d3d3d3' }
                    });
                }
            });

            allEdges.forEach(edge => {
                if (nodesToHighlight.has(edge.from) && nodesToHighlight.has(edge.to)) {
                    edgesToUpdate.push({
                        id: edge.id,
                        color: { color: '#2B7CE9', highlight: '#2B7CE9' },
                        opacity: 1.0
                    });
                } else {
                    edgesToUpdate.push({
                        id: edge.id,
                        color: { color: '#e0e0e0', highlight: '#e0e0e0' },
                        opacity: 0.2
                    });
                }
            });

            // Batch updates for better performance
            this.network.body.data.nodes.update(nodesToUpdate);
            this.network.body.data.edges.update(edgesToUpdate);
        },

        resetNodeStyles() {
            if (!this.network || !this.graphData[this.selectedState]) return;

            // More efficient reset - just restore original data
            const data = JSON.parse(JSON.stringify(this.graphData[this.selectedState]));
            data.nodes = this.optimizeNodeRendering(data.nodes);

            if (this.selectedLayout === 'hierarchicalLR') {
                this.applyManualLTRLayout(data.nodes);
            } else if (this.selectedLayout === 'clusteredForce') {
                this.applyRoughPositioning(data.nodes);
            }

            this.network.setData(data);
        },

        searchNodes(query) {
            const lowerCaseQuery = query.toLowerCase().trim();
            if (lowerCaseQuery === '') {
                this.resetNodeStyles();
                this.network.unselectAll();
                return;
            }

            const allNodes = this.graphData[this.selectedState].nodes;
            const nodesToSelect = allNodes
                .filter(node =>
                    node.label.toLowerCase().includes(lowerCaseQuery) ||
                    node.id.toLowerCase().includes(lowerCaseQuery)
                )
                .map(node => node.id);

            if (nodesToSelect.length > 0) {
                this.network.selectNodes(nodesToSelect);
                this.applyHighlight(nodesToSelect);

                // Focus on first found node for better UX
                this.network.focus(nodesToSelect[0], {
                    scale: 1.0,
                    animation: {
                        duration: 500,
                        easingFunction: 'easeInOutQuad'
                    }
                });
            }
        },
    }
};

Vue.createApp(App).mount('#app');