// static/js/app.js

// This script replaces the Vue.js application with a plain JavaScript implementation
// to resolve reactivity conflicts with the Vis.js library.

document.addEventListener('DOMContentLoaded', () => {

    // --- Global State & Data ---
    const graphData = window.graphData || { past: {}, current: {}, future: {} };
    console.log('Graph data loaded:', graphData); // Debug log

    let allNodes = []; // This will be populated with non-reactive node data for searching
    const state = {
        selectedState: 'past',
        searchTerm: '',
        isPhysicsEnabled: true,
        selectedLayout: 'clusteredForce',
    };

    // --- Vis.js Network Setup (non-reactive) ---
    const container = document.getElementById('network-graph');
    if (!container) {
        console.error("Fatal Error: Could not find network-graph container.");
        return;
    }

    // Initialize datasets
    const nodes = new vis.DataSet();
    const edges = new vis.DataSet();

    // Create network with minimal initial options
    const data = {
        nodes: nodes,
        edges: edges
    };

    const initialOptions = {
        physics: {
            enabled: false,
            stabilization: false
        },
        interaction: {
            hover: true,
            tooltipDelay: 200,
            navigationButtons: false,
            keyboard: true
        },
        nodes: {
            shape: 'box',
            margin: 12,
            font: { size: 14, face: 'Inter, sans-serif', color: '#1e293b' },
            borderWidth: 2,
            shadow: { enabled: true, color: 'rgba(0,0,0,0.1)', size: 5, x: 3, y: 3 }
        },
        edges: {
            arrows: { to: { enabled: true, scaleFactor: 0.7 } },
            color: { color: '#94a3b8', highlight: '#0f172a', hover: '#475569' },
            smooth: { enabled: true, type: 'cubicBezier', forceDirection: 'horizontal', roundness: 0.6 },
            width: 1.5
        }
    };

    const network = new vis.Network(container, data, initialOptions);
    console.log('Network created'); // Debug log

    // --- DOM Element References ---
    const stateButtons = {
        past: document.querySelector('aside > div.mb-6:nth-of-type(1) button:nth-of-type(1)'),
        current: document.querySelector('aside > div.mb-6:nth-of-type(1) button:nth-of-type(2)'),
        future: document.querySelector('aside > div.mb-6:nth-of-type(1) button:nth-of-type(3)'),
    };
    const layoutButtons = {
        clusteredForce: document.querySelector('aside > div.mb-6:nth-of-type(2) button:nth-of-type(1)'),
        hierarchicalLR: document.querySelector('aside > div.mb-6:nth-of-type(2) button:nth-of-type(2)'),
        hierarchicalUD: document.querySelector('aside > div.mb-6:nth-of-type(2) button:nth-of-type(3)'),
    };
    const searchInput = document.getElementById('search');
    const physicsToggleButton = document.querySelector('aside > div.mb-6:nth-of-type(4) button');
    const nodeCountSpan = document.querySelector('aside > div:last-of-type p:nth-of-type(1) span');
    const edgeCountSpan = document.querySelector('aside > div:last-of-type p:nth-of-type(2) span');

    // --- Core Functions ---

    function populateAllNodes() {
        const allNodesMap = new Map();
        ['past', 'current', 'future'].forEach(key => {
            (graphData[key]?.nodes || []).forEach(n => {
                if (!allNodesMap.has(n.id)) {
                    allNodesMap.set(n.id, JSON.parse(JSON.stringify(n)));
                }
            });
        });
        allNodes = Array.from(allNodesMap.values());
        console.log('All nodes populated:', allNodes.length); // Debug log
    }

    function resetNodePositions() {
        const ids = nodes.getIds();
        if (ids.length) {
            const reset = ids.map(id => ({ id, x: undefined, y: undefined, fixed: false }));
            nodes.update(reset);
        }
    }

    function applyDenseLtrLayout() {
        const updates = [];
        const LTR_X = { 0: -900, 1: -200, 2: 500, 3: 1100 };
        const SPACING = 150, FEED_COLS = 3, FEED_W = 130;

        const all = nodes.get({ returnType: 'Array' });
        const feeds = all.filter(n => n.group === 'feed');
        const warehouses = all.filter(n => n.group === 'warehouse');
        const others = all.filter(n => !['feed','warehouse'].includes(n.group));

        feeds.forEach((n,i) => {
            const col = i % FEED_COLS;
            updates.push({ id: n.id, x: LTR_X[0] + col*FEED_W, fixed: { x: true, y: false } });
        });

        // Warehouses: all same x, initial y spread out, physics refines y
        if (warehouses.length) {
            const warehouseSpacing = 100; // Initial spacing between warehouses
            const startY = -(warehouses.length - 1) * warehouseSpacing / 2; // Center them vertically

            warehouses.forEach((n,i) => {
                updates.push({
                    id: n.id,
                    x: LTR_X[1],  // Same x for all warehouses
                    y: startY + (i * warehouseSpacing), // Initial y position spread out
                    fixed: { x: true, y: false }  // Let physics refine y positioning
                });
            });
        }
         others.forEach(node => {
            // Anchor the Data Virtualisation node to a fixed position
            if (node.group === 'virtualisation') {
                updates.push({
                    id: node.id,
                    x: LTR_X[node.level], // Use the predefined x for its level
                    y: 0,                      // Center it vertically
                    fixed: {x: true, y: true}  // Fix both x and y
                });
            } else if (LTR_X[node.level] !== undefined) {
                // Keep original logic for other nodes like datalake and logical_dw
                updates.push({
                    id: node.id,
                    x: LTR_X[node.level],
                    fixed: {x: true, y: false}
                });
            }
        });



        if (updates.length) nodes.update(updates);
    }

    function updateLayout() {
        console.log('Updating layout:', state.selectedLayout); // Debug log

        // Stop any ongoing physics simulation
        network.stopSimulation();

        // Reset positions before applying new layout
        resetNodePositions();

        let options;
        switch (state.selectedLayout) {
            case 'hierarchicalLR':
                // Apply custom positions first
                applyDenseLtrLayout();
                options = {
                    layout: {
                        hierarchical: { enabled: false },
                        improvedLayout: true
                    },
                    physics: {
                        enabled: state.isPhysicsEnabled,
                        stabilization: {
                            enabled: state.isPhysicsEnabled,
                            iterations: 2000,
                            updateInterval: 20,
                            onlyDynamicEdges: false,
                            fit: true
                        },
                        solver: 'barnesHut',
                        barnesHut: {
                            gravitationalConstant: -25000,
                            centralGravity: 0.2,
                            springLength: 180,
                            springConstant: 0.1,
                            damping: 0.5,
                            avoidOverlap: 0.8  // Increased to prevent overlap
                        },
                        repulsion: {
                            nodeDistance: 150,  // Minimum distance between nodes
                            centralGravity: 0.05,
                            springLength: 180,
                            springConstant: 0.1,
                            damping: 0.5
                        }
                    }
                };
                break;

            case 'hierarchicalUD':
                // For hierarchical layout, completely disable physics
                options = {
                    layout: {
                        hierarchical: {
                            enabled: true,
                            direction: 'UD',
                            sortMethod: 'directed',
                            shakeTowards: 'roots',
                            levelSeparation: 150,
                            nodeSpacing: 100,
                            treeSpacing: 200,
                            blockShifting: true,
                            edgeMinimization: true,
                            parentCentralization: true
                        },
                        improvedLayout: false
                    },
                    physics: {
                        enabled: false,
                        stabilization: { enabled: false }
                    }
                };
                // Force physics to be disabled for this layout
                state.isPhysicsEnabled = false;
                break;

            case 'clusteredForce':
            default:
                options = {
                    layout: {
                        hierarchical: { enabled: false },
                        improvedLayout: true,
                        randomSeed: 2
                    },
                    physics: {
                        enabled: state.isPhysicsEnabled,
                        stabilization: {
                            enabled: state.isPhysicsEnabled,
                            iterations: 100,
                            updateInterval: 50,
                            onlyDynamicEdges: false,
                            fit: true
                        },
                        solver: 'barnesHut',
                        barnesHut: {
                            gravitationalConstant: -10000,
                            centralGravity: 0.1,
                            springLength: 200,
                            springConstant: 0.05,
                            damping: 0.3,
                            avoidOverlap: 0.8  // Increased to prevent overlap
                        },
                        repulsion: {
                            nodeDistance: 150,  // Minimum distance between nodes
                            centralGravity: 0.1,
                            springLength: 200,
                            springConstant: 0.05,
                            damping: 0.3
                        },
                        maxVelocity: 1,
                        minVelocity: 0.1,
                        timestep: 0.5
                    }
                };
                break;
        }

        // Apply options
        network.setOptions(options);

        // Redraw the network
        network.redraw();
    }

    function handleSearch() {
        const term = state.searchTerm.toLowerCase().trim();
        const currentIds = new Set(nodes.getIds());
        if (!term) {
            const reset = allNodes
                .filter(n => currentIds.has(n.id))
                .map(n => ({ id: n.id, color: undefined, font: { color: '#1e293b' } }));
            if (reset.length) nodes.update(reset);
            return;
        }
        const updates = allNodes
            .filter(n => currentIds.has(n.id))
            .map(n => {
                const match = n.label.toLowerCase().includes(term)
                           || (n.title||'').toLowerCase().includes(term);
                return {
                    id: n.id,
                    color: match
                        ? { border: '#2563eb', background: '#eff6ff' }
                        : { border: '#e2e8f0', background: '#f8fafc' },
                    font: { color: match ? '#1e3a8a' : '#94a3b8' }
                };
            });
        if (updates.length) nodes.update(updates);
    }

    function updateUI() {
        Object.entries(stateButtons).forEach(([k,btn]) => {
            if (btn) {
                btn.className = state.selectedState === k
                    ? 'w-full text-left px-4 py-2 rounded-md transition-colors duration-200 bg-blue-600 text-white'
                    : 'w-full text-left px-4 py-2 rounded-md transition-colors duration-200 bg-slate-200 hover:bg-slate-300';
            }
        });
        Object.entries(layoutButtons).forEach(([k,btn]) => {
            if (btn) {
                btn.className = state.selectedLayout === k
                    ? 'w-full text-left px-4 py-2 rounded-md transition-colors duration-200 bg-blue-600 text-white'
                    : 'w-full text-left px-4 py-2 rounded-md transition-colors duration-200 bg-slate-200 hover:bg-slate-300';
            }
        });

        // Update physics button state
        if (physicsToggleButton) {
            if (state.selectedLayout === 'hierarchicalUD') {
                physicsToggleButton.disabled = true;
                physicsToggleButton.textContent = 'Physics Disabled (Hierarchical)';
                physicsToggleButton.className = 'w-full px-4 py-2 rounded-md transition-colors duration-200 bg-gray-400 text-gray-200 cursor-not-allowed';
            } else {
                physicsToggleButton.disabled = false;
                physicsToggleButton.textContent = state.isPhysicsEnabled ? 'Disable Physics' : 'Enable Physics';
                physicsToggleButton.className = state.isPhysicsEnabled
                    ? 'w-full px-4 py-2 rounded-md transition-colors duration-200 bg-green-600 text-white hover:bg-green-700'
                    : 'w-full px-4 py-2 rounded-md transition-colors duration-200 bg-amber-500 text-white hover:bg-amber-600';
            }
        }

        if (nodeCountSpan) nodeCountSpan.textContent = nodes.length;
        if (edgeCountSpan) edgeCountSpan.textContent = edges.length;
    }

    function updateGraphData() {
        console.log('Updating graph data for state:', state.selectedState); // Debug log

        // Get data for selected state
        const stateData = graphData[state.selectedState];
        if (!stateData || !stateData.nodes || !stateData.edges) {
            console.error('No data found for state:', state.selectedState);
            return;
        }

        // Stop any running simulations
        network.stopSimulation();

        // Clone the data to avoid mutations
        const nds = JSON.parse(JSON.stringify(stateData.nodes));
        const eds = JSON.parse(JSON.stringify(stateData.edges));

        console.log('Loading nodes:', nds.length, 'edges:', eds.length); // Debug log

        // Clear existing data
        nodes.clear();
        edges.clear();

        // Add new data
        nodes.add(nds);
        edges.add(eds);

        // Update layout after data is loaded
        updateLayout();

        // Fit view to show all nodes
        setTimeout(() => {
            network.fit({
                animation: {
                    duration: 800,
                    easingFunction: 'easeInOutQuad'
                }
            });

            // Force a redraw
            network.redraw();
        }, 200);

        // Stop physics after 5 seconds to prevent drift
        if (state.isPhysicsEnabled && state.selectedLayout !== 'hierarchicalUD') {
            setTimeout(() => {
                console.log('Stopping physics to prevent drift');
                network.stopSimulation();
                // Optionally disable physics entirely
                // network.setOptions({ physics: { enabled: false } });
                // state.isPhysicsEnabled = false;
                // updateUI();
            }, 5000);
        }

        // Update search and UI
        handleSearch();
        updateUI();
    }

    function setupEventListeners() {
        // State buttons
        Object.keys(stateButtons).forEach(k => {
            const btn = stateButtons[k];
            if (btn) {
                btn.addEventListener('click', () => {
                    console.log('State button clicked:', k); // Debug log
                    state.selectedState = k;
                    updateGraphData();
                });
            }
        });

        // Layout buttons
        Object.keys(layoutButtons).forEach(k => {
            const btn = layoutButtons[k];
            if (btn) {
                btn.addEventListener('click', () => {
                    console.log('Layout button clicked:', k); // Debug log
                    state.selectedLayout = k;

                    // Reset physics state for non-hierarchical layouts
                    if (k !== 'hierarchicalUD' && !state.isPhysicsEnabled) {
                        state.isPhysicsEnabled = true;
                    }

                    updateLayout();
                    setTimeout(() => {
                        network.fit({
                            animation: {
                                duration: 800,
                                easingFunction: 'easeInOutQuad'
                            }
                        });

                        // Stop physics after 5 seconds for layouts with physics
                        if (state.isPhysicsEnabled && k !== 'hierarchicalUD') {
                            setTimeout(() => {
                                console.log('Stopping physics to prevent drift');
                                network.stopSimulation();
                            }, 5000);
                        }
                    }, 200);
                    updateUI();
                });
            }
        });

        // Search input
        if (searchInput) {
            searchInput.addEventListener('input', e => {
                state.searchTerm = e.target.value;
                handleSearch();
            });
        }

        // Physics toggle button
        if (physicsToggleButton) {
            physicsToggleButton.addEventListener('click', () => {
                // Don't toggle if hierarchical UD is selected
                if (state.selectedLayout === 'hierarchicalUD') return;

                console.log('Physics toggle clicked'); // Debug log
                state.isPhysicsEnabled = !state.isPhysicsEnabled;
                network.setOptions({ physics: { enabled: state.isPhysicsEnabled } });

                // If enabling physics, run stabilization
                if (state.isPhysicsEnabled) {
                    network.stabilize(100);

                    // Stop physics after 5 seconds to prevent drift
                    setTimeout(() => {
                        console.log('Stopping physics to prevent drift');
                        network.stopSimulation();
                    }, 5000);
                }

                updateUI();
            });
        }

        // Network events for debugging
        network.on('stabilizationProgress', function(params) {
            // Prevent infinite stabilization
            if (params.iterations > 1000) {
                console.warn('Stopping long stabilization');
                network.stopSimulation();
            }
        });

        network.on('stabilizationIterationsDone', function() {
            console.log('Stabilization complete');
            network.stopSimulation();
        });

        // Add click event for debugging
        network.on('click', function(params) {
            console.log('Network clicked:', params);
        });
    }

    function init() {
        console.log('Initializing...'); // Debug log

        // Populate all nodes from graph data
        populateAllNodes();

        // Setup event listeners
        setupEventListeners();

        // Initial graph update with delay to ensure everything is ready
        setTimeout(() => {
            updateGraphData();

            // Force a resize in case container size changed
            network.redraw();
            network.fit();
        }, 300);
    }

    // Start initialization
    init();
});