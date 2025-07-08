# main.py

import json
import jinja2
from pathlib import Path
from typing import List, Dict, Any

import pandas as pd
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field, ConfigDict


# --- Pydantic Models for Type Hinting and Validation ---

class Node(BaseModel):
    """Represents a single node in the graph."""
    id: str
    label: str
    level: int
    group: str
    title: str | None = None  # Used for hover tooltips
    color: Dict[str, str] | None = None


class Edge(BaseModel):
    """Represents a connection (edge) between two nodes."""
    model_config = ConfigDict(
        populate_by_name=True,
    )
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
)
templates = Jinja2Templates(env=jinja_env)

# --- Data Processing and Graph Generation Logic ---

# Define constants for node groups and styling
NODE_GROUPS = {
    "feed": {"color": {"background": "#e0f2fe", "border": "#38bdf8"}},  # sky-100, sky-400
    "warehouse": {"color": {"background": "#ffedd5", "border": "#fb923c"}},  # orange-100, orange-400
    "datalake": {"color": {"background": "#dcfce7", "border": "#4ade80"}},  # green-100, green-400
    "virtualisation": {"color": {"background": "#ede9fe", "border": "#a78bfa"}},  # violet-100, violet-400
    "logical_dw": {"color": {"background": "#fee2e2", "border": "#f87171"}},  # red-100, red-400
}


def get_graph_data() -> Dict[str, GraphData]:
    """
    Reads the legacy data CSV and generates graph data for all three states.

    Returns:
        A dictionary containing the graph data for 'past', 'current', and 'future' states.
    """
    data_path = Path(__file__).parent / "data" / "legacy_data.csv"
    if not data_path.exists():
        raise FileNotFoundError(f"Data file not found at {data_path}")

    df = pd.read_csv(data_path)

    # --- Base Nodes and Edges from CSV ---
    base_nodes = []
    base_edges = []

    feed_cols = [col for col in df.columns if col.startswith('Feed')]
    dw_cols = [col for col in df.columns if col.startswith('Data Warehouse')]

    # Add Feed nodes
    for _, row in df.iterrows():
        feed_id = row['Feed ID']
        feed_title = row['Feed Full Title']
        base_nodes.append(Node(
            id=feed_id,
            label=feed_id,
            level=0,
            group="feed",
            title=f"Feed: {feed_title}",
            color=NODE_GROUPS["feed"]["color"]
        ))

    # Add Data Warehouse nodes and edges from feeds
    for dw_name in dw_cols:
        dw_id = dw_name.replace(" ", "_")
        base_nodes.append(Node(
            id=dw_id,
            label=dw_name,
            level=1,
            group="warehouse",
            title=f"Legacy Warehouse: {dw_name}",
            color=NODE_GROUPS["warehouse"]["color"]
        ))

        # Create edges
        for _, row in df.iterrows():
            if pd.notna(row[dw_name]) and row[dw_name] == 'Y':
                # Instantiate using field names 'source' and 'target'
                base_edges.append(Edge(source=row['Feed ID'], target=dw_id))

    # --- Define Additional Nodes for Current and Future States ---
    data_lake_node = Node(id="dl", label="Data Lake", level=1, group="datalake", title="Central Data Lake",
                          color=NODE_GROUPS["datalake"]["color"])
    dv_node = Node(id="dv", label="Data Virtualisation", level=2, group="virtualisation",
                   title="Data Virtualisation Layer", color=NODE_GROUPS["virtualisation"]["color"])

    logical_dws = [
        Node(id="ldw1", label="LDW: Sales", level=3, group="logical_dw", title="Logical DW for Sales",
             color=NODE_GROUPS["logical_dw"]["color"]),
        Node(id="ldw2", label="LDW: Marketing", level=3, group="logical_dw", title="Logical DW for Marketing",
             color=NODE_GROUPS["logical_dw"]["color"]),
        Node(id="ldw3", label="LDW: Finance", level=3, group="logical_dw", title="Logical DW for Finance",
             color=NODE_GROUPS["logical_dw"]["color"]),
    ]

    # --- Build State 1: Past ---
    past_graph = GraphData(nodes=base_nodes, edges=base_edges)

    # --- Build State 2: Current ---
    current_nodes = base_nodes.copy()
    current_edges = base_edges.copy()

    # Add DV and Logical DWs
    current_nodes.append(dv_node)
    current_nodes.extend(logical_dws)

    # Connect some warehouses to DV
    warehouses_to_virtualise = ["Data_Warehouse_1", "Data_Warehouse_2", "Data_Warehouse_7", "Data_Warehouse_15"]
    for wh_id in warehouses_to_virtualise:
        current_edges.append(Edge(source=wh_id, target="dv"))

    # Connect DV to all logical DWs
    for ldw in logical_dws:
        current_edges.append(Edge(source="dv", target=ldw.id))

    current_graph = GraphData(nodes=current_nodes, edges=current_edges)

    # --- Build State 3: Future ---
    future_nodes = []
    future_edges = []

    # Add only Feed nodes from the base set
    future_nodes.extend([n for n in base_nodes if n.group == 'feed'])

    # Add Data Lake, DV, and Logical DWs
    future_nodes.append(data_lake_node)
    future_nodes.append(dv_node)
    future_nodes.extend(logical_dws)

    # Connect all feeds to Data Lake
    for feed_node in future_nodes:
        if feed_node.group == 'feed':
            future_edges.append(Edge(source=feed_node.id, target="dl"))

    # Connect Data Lake to DV
    future_edges.append(Edge(source="dl", target="dv"))

    # Connect DV to all logical DWs
    for ldw in logical_dws:
        future_edges.append(Edge(source="dv", target=ldw.id))

    future_graph = GraphData(nodes=future_nodes, edges=future_edges)

    return {
        "past": past_graph,
        "current": current_graph,
        "future": future_graph,
    }


# --- API Endpoint ---

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    """
    Main endpoint that renders the HTML page with the graph data.
    """
    try:
        all_graphs = get_graph_data()

        # Convert Pydantic models to JSON-serializable dicts using model_dump (Pydantic V2)
        graph_data_dict = {
            "past": all_graphs["past"].model_dump(by_alias=True),
            "current": all_graphs["current"].model_dump(by_alias=True),
            "future": all_graphs["future"].model_dump(by_alias=True),
        }

        # Serialize to a JSON string for injection into the template
        graph_data_json = json.dumps(graph_data_dict)

        return templates.TemplateResponse(
            "index.html",
            {"request": request, "graph_data": graph_data_json}
        )
    except FileNotFoundError as e:
        return HTMLResponse(content=f"<h1>Error</h1><p>{e}</p>", status_code=500)
    except Exception as e:
        # Log the error for debugging
        print(f"An unexpected error occurred: {e}")
        return HTMLResponse(content=f"<h1>An unexpected error occurred</h1>", status_code=500)

# --- To run the application:
# 1. Install necessary packages: pip install "fastapi[all]" "pandas>=2.0" "pydantic>=2.0" jinja2
# 2. Save this file as main.py
# 3. Run from your terminal: uvicorn main:app --reload
