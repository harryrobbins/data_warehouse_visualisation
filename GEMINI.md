# Data Lineage Visualizer

## Project Overview

This is a Python-based web application built with **FastAPI** that visualizes data lineage relationships (feeds, warehouses, data lakes, etc.) using interactive graphs. The application processes data from a CSV or Excel file and renders three distinct states of the data architecture: Past, Current, and Future.

The frontend utilizes **Vis.js** for graph rendering and **Vue.js** for application logic, served via a Jinja2 template.

## Architecture

*   **Backend:** FastAPI (`main.py`)
    *   Reads source data from `data/warehouse_feeds.csv` (or `.xlsx`).
    *   Processes data into Nodes and Edges using Pydantic models.
    *   Serves the main HTML page with pre-computed graph data injected as JSON.
*   **Frontend:**
    *   **Template:** `templates/index.html` (Jinja2 with custom delimiters `[[ ]]` and `[% %]` to avoid Vue conflicts).
    *   **Logic:** `static/js/app.js` (Vue.js application).
    *   **Visualization:** `vis-network.min.js`.
    *   **Styling:** `static/css/style.css`.
*   **Data Models:** Defined in `main.py` using Pydantic (`Node`, `Edge`, `GraphData`).

## Building and Running

### Prerequisites

*   Python 3.x
*   Dependencies listed in `requirements.txt`

### Installation

1.  Create a virtual environment (optional but recommended):
    ```bash
    python -m venv .venv
    source .venv/bin/activate  # On Windows: .venv\Scripts\activate
    ```
2.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```
    *Note: Ensure `openpyxl` is installed if using Excel data files.*

### Running the Application

Start the development server using Uvicorn:

```bash
uvicorn main:app --reload
```

The application will be accessible at `http://127.0.0.1:8000`.

## Development Conventions

*   **Templating:** Jinja2 delimiters are customized to `[[ variable ]]` and `[% block %]` to coexist with Vue.js's `{{ }}` syntax.
*   **Data Source:** The app looks for `data/Warehouse Feeds Matrix.xlsx` first, then falls back to `data/warehouse_feeds.csv`.
*   **Graph Logic:**
    *   Nodes are categorized into groups (feed, warehouse, datalake, virtualisation, logical_dw) with specific styling in `main.py`.
    *   Warehouses are initially positioned in a circle layout.
*   **Static Files:** Served from the `static/` directory.

## Key Files

*   `main.py`: The core FastAPI application, data processing logic, and Pydantic models.
*   `requirements.txt`: Python package dependencies.
*   `templates/index.html`: The main entry point for the frontend.
*   `static/js/app.js`: Frontend logic for initializing and managing the Vis.js graph.
*   `data/`: Directory containing the source data files.
