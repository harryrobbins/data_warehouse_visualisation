# main.py

import json
import jinja2
import math
import sys
import os
from pathlib import Path
from typing import List, Dict, Any, Union

import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field, ConfigDict, field_validator
from loguru import logger

# --- Load Environment Variables ---
load_dotenv()

# --- Logger Setup ---
# Configure loguru to intercept standard logging and output to stdout (which we can capture if needed)
# and also setup a sink for our WebSocket to stream logs to the frontend.

class WebSocketSink:
    def __init__(self) -> None:
        self.connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.connections.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.connections:
            self.connections.remove(websocket)

    async def broadcast(self, message: str) -> None:
        for connection in self.connections:
            try:
                await connection.send_text(message)
            except Exception:
                # If sending fails, assume connection is dead and remove it
                self.disconnect(connection)
    
    def write(self, message: str) -> None:
        # This method is called by loguru
        # Since loguru calls this synchronously, but we need to await send_text,
        # we have to schedule it on the event loop.
        # However, for simplicity in this synchronous bridge, we might need a workaround
        # or just use a standard queue.
        # For now, let's just print to console, and we'll handle the websocket 
        # separately via an API endpoint that polls logs or a slightly more complex setup.
        # EDIT: Simplest way for 'live' logs in this context: 
        # Just use a global list for recent logs and poll, or use a proper async sink.
        pass

# We'll use a simple in-memory buffer for the logs to show in the frontend
# for the initial load, and a websocket for live updates.
log_buffer: List[str] = []

def memory_sink(message: str) -> None:
    log_buffer.append(message)
    if len(log_buffer) > 1000:
        log_buffer.pop(0)

logger.remove() # Remove default handler
logger.add(sys.stderr, level="INFO") # Add standard stderr handler
logger.add(memory_sink, level="DEBUG", format="{time:HH:mm:ss} | {level} | {message}")


# --- Pydantic Models for Type Hinting and Validation ---

class Node(BaseModel):
    """Represents a single node in the graph."""
    id: str
    label: str
    level: int
    group: str
    title: Union[str, None] = None  # Used for hover tooltips
    color: Union[Dict[str, str], None] = None
    x: Union[int, None] = None  # For pre-defined layout positioning
    y: Union[int, None] = None  # For pre-defined layout positioning
    # The 'fixed' property tells vis.js whether to respect the x/y coordinates
    # We use default=False so it's not required in the constructor
    fixed: Union[bool, Dict[str, bool]] = Field(default=False, exclude=True)

    @field_validator('label')
    @classmethod
    def ensure_label_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            return "Unknown"
        return v


class Edge(BaseModel):
    """Represents a connection (edge) between two nodes."""
    model_config = ConfigDict(
        populate_by_name=True,
    )
    # Using alias for 'from' and 'to' because 'from' is a reserved keyword
    # We must construct using the field names 'source' and 'target' unless populate_by_name=True
    source: str = Field(..., alias='from')
    target: str = Field(..., alias='to')


class GraphData(BaseModel):
    """Container for a set of nodes and edges."""
    nodes: List[Node]
    edges: List[Edge]


# --- FastAPI Application Setup ---

app = FastAPI(
    title="Data Lineage Visualizer API",
    description="Serves data for the data lineage visualization tool.",
)

# Mount static files directory
static_path = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=static_path), name="static")

# Setup Jinja2 templates with custom delimiters to avoid Vue.js conflicts
templates_path = Path(__file__).parent / "templates"
jinja_env = jinja2.Environment(
    loader=jinja2.FileSystemLoader(templates_path),
    variable_start_string='[[',
    variable_end_string=']]',
    block_start_string='[%',
    block_end_string='%]',
)
# Passing env to use custom delimiters.
# type: ignore[call-arg] is needed because mypy expects 'directory' as a positional arg based on some stubs
templates = Jinja2Templates(env=jinja_env) # type: ignore[call-arg]

# --- Data Processing and Graph Generation Logic ---

NODE_GROUPS = {
    "feed": {"color": {"background": "#e0f2fe", "border": "#38bdf8"}},
    "warehouse": {"color": {"background": "#ffedd5", "border": "#fb923c"}},
    "datalake": {"color": {"background": "#dcfce7", "border": "#4ade80"}},
    "virtualisation": {"color": {"background": "#ede9fe", "border": "#a78bfa"}},
    "logical_dw": {"color": {"background": "#fee2e2", "border": "#f87171"}},
}


def get_graph_data() -> Dict[str, GraphData]:
    """
    Reads data, generates unique IDs for all nodes, and builds the graph data.
    """
    logger.info("Starting graph data generation...")
    
    # Resolve Data Path from Environment Variable or Defaults
    env_data_path = os.getenv("DATA_FILE_PATH")
    if env_data_path:
        # Check if the env var is an absolute path or relative to CWD
        possible_path = Path(env_data_path)
        if possible_path.exists():
            excel_path = possible_path
            logger.info(f"Using data file from DATA_FILE_PATH: {excel_path}")
        else:
             # Try relative to the app directory if not found directly
            possible_path = Path(__file__).parent / env_data_path
            if possible_path.exists():
                excel_path = possible_path
                logger.info(f"Using data file from DATA_FILE_PATH (relative): {excel_path}")
            else:
                logger.warning(f"DATA_FILE_PATH set to '{env_data_path}' but file not found. Falling back to defaults.")
                excel_path = Path(__file__).parent / "data" / "Warehouse Feeds Matrix.xlsx"
    else:
        excel_path = Path(__file__).parent / "data" / "Warehouse Feeds Matrix.xlsx"

    csv_path = Path(__file__).parent / "data" / "warehouse_feeds.csv"

    # Load Data
    if excel_path.exists():
        try:
            logger.info(f"Reading Excel file: {excel_path}")
            df = pd.read_excel(excel_path, sheet_name=0, engine='openpyxl') # Use first sheet by default if specific name fails? kept explicit for now but safer
        except Exception as e:
             # Fallback to specifically named sheet might fail if user provides custom file
            try:
                logger.warning(f"Failed to read specific sheet. Trying first sheet. Error: {e}")
                df = pd.read_excel(excel_path, sheet_name=0, engine='openpyxl')
            except Exception as e2:
                logger.error(f"Could not read Excel file at {excel_path}. Error: {e2}")
                raise FileNotFoundError(f"Could not read Excel file at {excel_path}. Error: {e2}")

    elif csv_path.exists():
        logger.info(f"Reading CSV file: {csv_path}")
        df = pd.read_csv(csv_path)
    else:
        logger.error(f"No data file found. Looked for {excel_path} and {csv_path}")
        raise FileNotFoundError(f"No data file found. Looked for {excel_path} and {csv_path}")

    # Data Cleaning: Replace all NaNs with empty strings immediately
    df = df.fillna("")
    logger.debug(f"Dataframe shape after cleaning: {df.shape}")

    feed_name_col = df.columns[0]
    feed_full_name_col = df.columns[-1]
    dw_cols = df.columns[1:-1].tolist()
    logger.debug(f"Columns identified - Feed: {feed_name_col}, Full Name: {feed_full_name_col}, Warehouses: {len(dw_cols)}")

    node_counter = 0
    id_map = {}  # Maps a stable identifier to the new, unique node ID

    # --- Create Master lists of nodes with unique IDs ---
    feed_nodes = []
    for index, row in df.iterrows():
        # Use the dataframe index to create a temporary, stable key for the map
        feed_name = str(row[feed_name_col]).strip()
        if not feed_name:
            continue # Skip empty rows

        stable_feed_key = f"feed_{index}"
        new_id = f"{node_counter}-{feed_name}"
        id_map[stable_feed_key] = new_id

        # Fallback logic for title: use full name if available, else use feed name
        full_feed_name = str(row[feed_full_name_col]).strip()
        display_title = full_feed_name if full_feed_name else feed_name

        feed_nodes.append(
            Node(id=new_id, label=feed_name, level=0, group="feed",
                 title=f"Feed: {display_title}", color=NODE_GROUPS["feed"]["color"])
        )
        node_counter += 1
    
    logger.info(f"Processed {len(feed_nodes)} feed nodes.")

    warehouse_nodes = []
    # Arrange warehouses in a circle to give the physics engine a better start and reduce initial overlap.
    num_warehouses = len(dw_cols)
    radius = num_warehouses * 50  # Make radius dependent on number of nodes to spread them out
    for i, dw_name in enumerate(dw_cols):
        stable_wh_key = dw_name.replace(" ", "_")
        new_id = f"{node_counter}-{stable_wh_key}"
        id_map[stable_wh_key] = new_id

        # Calculate circular position
        angle = (2 * math.pi / num_warehouses) * i if num_warehouses > 0 else 0
        x_pos = int(radius * math.cos(angle))
        y_pos = int(radius * math.sin(angle))

        warehouse_nodes.append(
            Node(
                id=new_id,
                label=dw_name,
                level=1,
                group="warehouse",
                title=f"Legacy Warehouse: {dw_name}",
                color=NODE_GROUPS["warehouse"]["color"],
                x=x_pos,
                y=y_pos,
                fixed=False  # Let physics engine move them from this starting position
            )
        )
        node_counter += 1
    
    logger.info(f"Processed {len(warehouse_nodes)} warehouse nodes.")

    # Generate unique IDs for static nodes
    new_dl_id = f"{node_counter}-dl"
    id_map["dl"] = new_dl_id
    data_lake_node = Node(id=new_dl_id, label="Data Lake", level=1, group="datalake", title="Central Data Lake", color=NODE_GROUPS["datalake"]["color"])
    node_counter += 1

    new_dv_id = f"{node_counter}-dv"
    id_map["dv"] = new_dv_id
    dv_node = Node(id=new_dv_id, label="Data Virtualisation", level=2, group="virtualisation", title="Data Virtualisation Layer", color=NODE_GROUPS["virtualisation"]["color"])
    node_counter += 1

    logical_dws = []
    for i, ldw_name in enumerate(["Sales", "Marketing", "Finance"]):
        stable_ldw_key = f"ldw{i+1}"
        new_id = f"{node_counter}-{stable_ldw_key}"
        id_map[stable_ldw_key] = new_id
        logical_dws.append(
            Node(id=new_id, label=f"LDW: {ldw_name}", level=3, group="logical_dw", title=f"Logical DW for {ldw_name}", color=NODE_GROUPS["logical_dw"]["color"])
        )
        node_counter += 1

    # --- Build State 1: Past ---
    past_nodes = feed_nodes + warehouse_nodes
    past_edges = []
    for index, row in df.iterrows():
        stable_feed_key = f"feed_{index}"
        if stable_feed_key not in id_map: # Skip if feed was skipped
            continue
            
        source_id = id_map[stable_feed_key]
        for dw_name in dw_cols:
            raw_val = str(row[dw_name]).strip()
            val = raw_val.upper()
            
            is_connected = False
            if val == 'Y':
                is_connected = True
            elif val in ('N', '0', ''):
                is_connected = False
            else:
                # Unexpected value - log warning and default to False
                logger.warning(
                    f"Unexpected value '{raw_val}' in column '{dw_name}' for feed '{feed_name}'. "
                    "Expected Y/N/0/Blank. Treating as False."
                )
                is_connected = False

            if is_connected:
                stable_wh_key = dw_name.replace(" ", "_")
                if stable_wh_key in id_map:
                    target_id = id_map[stable_wh_key]
                    past_edges.append(Edge(source=source_id, target=target_id))
    
    logger.info(f"Generated {len(past_edges)} edges for 'Past' state.")
    past_graph = GraphData(nodes=past_nodes, edges=past_edges)

    # --- Build State 2: Current ---
    current_nodes = feed_nodes + warehouse_nodes + [dv_node] + logical_dws
    current_edges = past_edges.copy()
    warehouses_to_virtualise_keys = [dw.replace(" ", "_") for dw in dw_cols[:4]]
    current_edges.extend([Edge(source=id_map[wh_key], target=id_map["dv"]) for wh_key in warehouses_to_virtualise_keys if wh_key in id_map])
    current_edges.extend([Edge(source=id_map["dv"], target=ldw.id) for ldw in logical_dws])
    current_graph = GraphData(nodes=current_nodes, edges=current_edges)

    # --- Build State 3: Future ---
    future_nodes = feed_nodes + [data_lake_node, dv_node] + logical_dws
    future_edges = [Edge(source=feed.id, target=id_map["dl"]) for feed in feed_nodes]
    future_edges.append(Edge(source=id_map["dl"], target=id_map["dv"]))
    future_edges.extend([Edge(source=id_map["dv"], target=ldw.id) for ldw in logical_dws])
    future_graph = GraphData(nodes=future_nodes, edges=future_edges)

    logger.info("Graph generation complete.")
    return {"past": past_graph, "current": current_graph, "future": future_graph}


# --- API Endpoint ---

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request) -> Any:
    """Main endpoint that renders the HTML page with the graph data."""
    try:
        all_graphs = get_graph_data()
        graph_data_dict = {k: v.model_dump(by_alias=True, exclude_none=True) for k, v in all_graphs.items()}
        graph_data_json = json.dumps(graph_data_dict)
        return templates.TemplateResponse(
            "index.html",
            {"request": request, "graph_data": graph_data_json}
        )
    except Exception as e:
        logger.exception("An unexpected error occurred during request handling.")
        return HTMLResponse(content=f"<h1>An unexpected error occurred</h1><pre>{e}</pre>", status_code=500)

@app.get("/logs")
async def get_logs() -> Dict[str, List[str]]:
    """Returns the recent logs."""
    return {"logs": log_buffer}

# Simple websocket for logs (optional expansion)
websocket_sink = WebSocketSink()
@app.websocket("/ws/logs")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await websocket_sink.connect(websocket)
    try:
        while True:
            await websocket.receive_text() # Keep connection open
    except WebSocketDisconnect:
        websocket_sink.disconnect(websocket)
