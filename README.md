# Data Lineage Visualizer

A robust, interactive web application for visualizing data lineage relationships (feeds, warehouses, data lakes, etc.) across different architectural states (Past, Current, Future).

Built with **FastAPI** (Python) and **Vis.js** / **Vue.js** (Frontend).

## Features

*   **Interactive Graph Visualization:**
    *   Visualize relationships between data feeds, warehouses, and downstream consumers.
    *   Three distinct states: **Past**, **Current**, and **Future**.
    *   Multiple layout algorithms: **Clustered Force**, **Left-to-Right** (Hierarchical), and **Top-to-Bottom**.
    *   Physics simulation with Pause/Resume capabilities.
*   **Tabular Data View:**
    *   Inspect raw node data in a sortable/filterable table.
    *   View connection counts and details (tooltip showing connected nodes).
*   **Robustness & Debugging:**
    *   **Live Application Logs:** View backend logs directly in the frontend UI.
    *   **Search:** Filter nodes in both Graph and Table views with highlighting.
    *   **Data Handling:** Gracefully handles missing data (`NaN`, empty strings) and validates input using Pydantic.
*   **Modern Tooling:**
    *   **Python:** Managed via `uv`, linted with `ruff`, type-checked with `mypy`.
    *   **JavaScript:** Type-checked via `tsc` (JSDoc), linted with `eslint`.
    *   **Scripts:** Unified command runner via `pnpm`.

## Prerequisites

*   **Python 3.10+**
*   **Node.js & npm** (for development scripts and linting)
*   **uv** (Python package manager - recommended)
*   **pnpm** (recommended script runner)

## Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd data_warehouse_graphs
    ```

2.  **Install dependencies:**

    Using `pnpm` (orchestrates both Python and JS setup):
    ```bash
    pnpm install       # Installs Node dev dependencies
    uv sync            # Creates virtualenv and installs Python dependencies
    ```

    *Alternatively, manually:*
    ```bash
    npm install
    uv venv
    uv pip install -r pyproject.toml
    # Or standard pip: pip install -r requirements.txt (generate first using 'pnpm run export:reqs')
    ```

## Running the Application

Start the development server with hot-reloading:

```bash
pnpm run dev
```

Or manually:
```bash
uv run uvicorn main:app --reload
```

Open your browser to **http://127.0.0.1:8000**.

## Development Commands

We enforce strict code quality standards. Run these commands before committing:

### Type Checking
Checks both Python (mypy) and JavaScript (TypeScript/JSDoc) code.
```bash
pnpm run typecheck
```

### Linting
Lints and formats both Python (ruff) and JavaScript (ESLint).
```bash
pnpm run lint
```

### Auto-Fix Linting Issues
```bash
pnpm run lint:fix
```

### Export Requirements
Generate a standard `requirements.txt` from `pyproject.toml` for legacy environment support:
```bash
pnpm run export:reqs
```

## Project Structure

```
/
├── main.py                 # FastAPI backend application & Pydantic models
├── pyproject.toml          # Python dependencies & tool configuration (Ruff, Mypy)
├── package.json            # Node scripts & dev dependencies
├── jsconfig.json           # JavaScript type checking configuration
├── .eslintrc.js            # ESLint configuration
├── data/
│   ├── Warehouse Feeds Matrix.xlsx  # Primary data source
│   └── warehouse_feeds.csv          # Fallback data source
├── static/
│   ├── css/
│   │   └── style.css       # Custom styling
│   └── js/
│       ├── app.js          # Main Vue.js application logic
│       └── globals.d.ts    # TypeScript definitions for global libraries
└── templates/
    └── index.html          # Main HTML entry point (Jinja2 template)
```

## Data Format

The application expects a Data Matrix (Excel or CSV) with the following structure:
*   **First Column:** Feed Name
*   **Middle Columns:** Warehouse/System Names (Values indicate connection presence)
*   **Last Column:** Full Feed Description

Rows represent Feeds, and Columns represent Warehouses/Systems.