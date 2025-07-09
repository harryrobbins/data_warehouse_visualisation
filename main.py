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

# Setup Jinja2 templates with custom delimiters to avoid Vue.js conflicts
templates_path = Path(__file__).parent / "templates"
jinja_env = jinja2.Environment(
    loader=jinja2.FileSystemLoader(templates_path),
    variable_start_string='[[',
    variable_end_string=']]',
    block_start_string='[%',
    block_end_string='%]',
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
    """
    Reads data, generates unique IDs for all nodes, and builds the graph data.
    """
    data_dir = Path(__file__).parent / "data"
    excel_path = data_dir / "Warehouse Feeds Matrix.xlsx"
    csv_path = data_dir / "warehouse_feeds.csv"

    if excel_path.exists():
        try:
            df = pd.read_excel(excel_path, sheet_name="Warehouse Feeds Matrix", engine='openpyxl')
        except Exception as e:
            raise FileNotFoundError(f"Could not read Excel file at {excel_path}. Error: {e}")
    elif csv_path.exists():
        df = pd.read_csv(csv_path)
    else:
        raise FileNotFoundError(f"No data file found. Looked for {excel_path} and {csv_path}")

    feed_name_col = df.columns[0]
    feed_full_name_col = df.columns[-1]
    dw_cols = df.columns[1:-1].tolist()

    node_counter = 0
    id_map = {}  # Maps a stable identifier to the new, unique node ID

    # --- Create Master lists of nodes with unique IDs ---
    feed_nodes = []
    for index, row in df.iterrows():
        # Use the dataframe index to create a temporary, stable key for the map
        stable_feed_key = f"feed_{index}"
        new_id = f"{node_counter}-{row[feed_name_col]}"
        id_map[stable_feed_key] = new_id
        feed_nodes.append(
            Node(id=new_id, label=row[feed_name_col], level=0, group="feed",
                 title=f"Feed: {row[feed_full_name_col]}", color=NODE_GROUPS["feed"]["color"])
        )
        node_counter += 1

    warehouse_nodes = []
    for dw_name in dw_cols:
        stable_wh_key = dw_name.replace(" ", "_")
        new_id = f"{node_counter}-{stable_wh_key}"
        id_map[stable_wh_key] = new_id
        warehouse_nodes.append(
            Node(id=new_id, label=dw_name, level=1, group="warehouse",
                 title=f"Legacy Warehouse: {dw_name}", color=NODE_GROUPS["warehouse"]["color"])
        )
        node_counter += 1

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
        source_id = id_map[stable_feed_key]
        for dw_name in dw_cols:
            if pd.notna(row[dw_name]) and str(row[dw_name]).strip() != '':
                stable_wh_key = dw_name.replace(" ", "_")
                target_id = id_map[stable_wh_key]
                past_edges.append(Edge(source=source_id, target=target_id))
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

    return {"past": past_graph, "current": current_graph, "future": future_graph}


# --- API Endpoint ---

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
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
        print(f"An unexpected error occurred: {e}")
        return HTMLResponse(content=f"<h1>An unexpected error occurred</h1>", status_code=500)
