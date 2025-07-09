# main.py

import json
import jinja2
import math
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
    x: int | None = None  # For pre-defined layout positioning
    y: int | None = None  # For pre-defined layout positioning
    # The 'fixed' property tells vis.js whether to respect the x/y coordinates
    fixed: bool = Field(False, exclude=True)


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

# Setup Jinja2 templates with custom delimiters
templates_path = Path(__file__).parent / "templates"
jinja_env = jinja2.Environment(
    loader=jinja2.FileSystemLoader(templates_path),
    variable_start_string='[[',
    variable_end_string=']]',
)
templates = Jinja2Templates(env=jinja_env)

# --- Data Processing and Graph Generation Logic ---

NODE_GROUPS = {
    "feed": {"color": {"background": "#e0f2fe", "border": "#38bdf8"}},
    "warehouse": {"color": {"background": "#ffedd5", "border": "#fb923c"}},
    "datalake": {"color": {"background": "#dcfce7", "border": "#4ade80"}},
    "virtualisation": {"color": {"background": "#ede9fe", "border": "#a78bfa"}},
    "logical_dw": {"color": {"background": "#fee2e2", "border": "#f87171"}},
}


def get_graph_data() -> Dict[str, GraphData]:
    """Reads data and generates graph data for all three states."""
    data_path = Path(__file__).parent / "data" / "legacy_data.csv"
    if not data_path.exists():
        raise FileNotFoundError(f"Data file not found at {data_path}")

    df = pd.read_csv(data_path)
    dw_cols = [col for col in df.columns if col.startswith('Data Warehouse')]

    # --- Create Master lists of nodes ---
    feed_nodes = [
        Node(id=row['Feed ID'], label=row['Feed ID'], level=0, group="feed", title=f"Feed: {row['Feed Full Title']}",
             color=NODE_GROUPS["feed"]["color"])
        for _, row in df.iterrows()
    ]
    warehouse_nodes = [
        Node(id=dw_name.replace(" ", "_"), label=dw_name, level=1, group="warehouse",
             title=f"Legacy Warehouse: {dw_name}", color=NODE_GROUPS["warehouse"]["color"])
        for dw_name in dw_cols
    ]
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
    past_nodes = feed_nodes + warehouse_nodes
    past_edges = [
        Edge(source=row['Feed ID'], target=dw_name.replace(" ", "_"))
        for dw_name in dw_cols
        for _, row in df.iterrows()
        if pd.notna(row[dw_name]) and row[dw_name] == 'Y'
    ]
    past_graph = GraphData(nodes=past_nodes, edges=past_edges)

    # --- Build State 2: Current ---
    current_nodes = feed_nodes + warehouse_nodes + [dv_node] + logical_dws
    current_edges = past_edges.copy()
    warehouses_to_virtualise = ["Data_Warehouse_1", "Data_Warehouse_2", "Data_Warehouse_7", "Data_Warehouse_15"]
    current_edges.extend([Edge(source=wh_id, target="dv") for wh_id in warehouses_to_virtualise])
    current_edges.extend([Edge(source="dv", target=ldw.id) for ldw in logical_dws])
    current_graph = GraphData(nodes=current_nodes, edges=current_edges)

    # --- Build State 3: Future ---
    future_nodes = feed_nodes + [data_lake_node, dv_node] + logical_dws
    future_edges = [Edge(source=feed.id, target="dl") for feed in feed_nodes]
    future_edges.append(Edge(source="dl", target="dv"))
    future_edges.extend([Edge(source="dv", target=ldw.id) for ldw in logical_dws])
    future_graph = GraphData(nodes=future_nodes, edges=future_edges)

    return {"past": past_graph, "current": current_graph, "future": future_graph}


# --- API Endpoint ---

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    """Main endpoint that renders the HTML page with the graph data."""
    try:
        all_graphs = get_graph_data()
        # Use exclude_none=True to avoid sending null x/y/fixed values to the client
        graph_data_dict = {k: v.model_dump(by_alias=True, exclude_none=True) for k, v in all_graphs.items()}
        graph_data_json = json.dumps(graph_data_dict)
        return templates.TemplateResponse(
            "index.html",
            {"request": request, "graph_data": graph_data_json}
        )
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        return HTMLResponse(content=f"<h1>An unexpected error occurred</h1>", status_code=500)
