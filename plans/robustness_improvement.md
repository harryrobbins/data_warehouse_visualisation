# Plan: Data Lineage Visualizer Robustness Improvements

## Objective
Improve the robustness, debugging capabilities, and user experience of the Data Lineage Visualizer. This includes fixing data handling issues (NaNs, incorrect connections), restoring UI functionality (hover labels, search), adding a new tabular view for data inspection, and enforcing code quality standards.

## Phase 0: Quality Assurance Tooling (Linting & Typing)

### 0.1 Python Standards
**Goal:** Enforce PEP 8 style, fix common bugs, and ensure type safety.
**Tools:** `ruff` (fast linting/formatting) and `mypy` (static type checking).
**Implementation:**
- Add `ruff` and `mypy` to `requirements.txt`.
- Create `pyproject.toml` to configure:
    - `ruff`: Line length (e.g., 100 or 120), ignore rules irrelevant to this project.
    - `mypy`: Strictness settings (disallow untyped defs, ignore missing imports where necessary).
- Run tools and fix immediate errors in `main.py`.

### 0.2 JavaScript Standards
**Goal:** Prevent runtime errors and enforce consistent style without adding a complex build step.
**Tools:** `eslint` (linting) and JSDoc (typing via `jsconfig.json` or `checkJs`).
**Implementation:**
- Initialize a minimal `package.json` for development dependencies only (`eslint`, `eslint-plugin-vue`).
- Create `.eslintrc.js` to enforce Vue/JS best practices.
- Add `jsconfig.json` with `"checkJs": true` to enable type checking in `app.js` using JSDoc annotations.
- Add JSDoc comments to `app.js` methods to define expected types for `nodes`, `edges`, and internal state.

## Phase 1: Backend Robustness (Python)

### 1.1 Data Sanitization in `main.py`
**Problem:** `NaN` values from pandas are propagating to the frontend, causing "NaN" text in the UI.
**Solution:**
- Apply `.fillna("")` to the pandas DataFrame immediately after loading.
- Explicitly replace `NaN` or `None` values with empty strings or default values before Pydantic model instantiation.

### 1.2 Strict Edge Creation Logic
**Problem:** Nodes are sometimes connected when they shouldn't be (e.g., if a cell contains "0", "No", or whitespace).
**Solution:**
- Refine the edge creation condition in `get_graph_data`.
- Instead of just checking `if val:`, check against a set of "truthy" values (e.g., not just non-empty, but potentially excluding explicit "0", "N", "False") or ensure strictly non-empty strings are treated as connections.
- Trim whitespace from cell values before checking.

### 1.3 Pydantic Model Validation
**Problem:** Weak validation allows bad data to pass through.
**Solution:**
- Update `Node` and `Edge` models in `main.py` to use `field_validator` (Pydantic v2) to strictly sanitize inputs (e.g., ensuring `label` is never None).

## Phase 2: Frontend Fixes (JavaScript)

### 2.1 Enable Hover Labels
**Problem:** Hover tooltips are not showing because they are explicitly disabled for performance.
**Solution:**
- In `static/js/app.js`, change `interaction: { hover: false }` to `true`.
- Adjust `tooltipDelay` if necessary to prevent flickering.

### 2.2 Fix Search Functionality
**Problem:** Search does not visually indicate results effectively or highlight connections reliably.
**Solution:**
- Ensure `applyHighlight` logic correctly handles the "dimming" of non-matching nodes.
- When a search match is found, ensure the camera focuses on the node (`network.focus`).
- Ensure the search logic filters based on the *current* state's nodes.

## Phase 3: New Feature - Tabular View

### 3.1 View Toggle Mechanism
**Goal:** Allow users to switch between the Network Graph and a Data Table.
**Implementation:**
- Add a new state variable `viewMode` ('graph' or 'table') to the Vue app.
- Add toggle buttons in the "Controls" sidebar in `index.html`.
- Use `v-if` / `v-show` to toggle visibility of `#network-graph` and the new table container.

### 3.2 Data Table Implementation
**Goal:** Show raw data to help debug connection issues.
**Implementation:**
- Create a responsive table layout in `index.html`.
- **Nodes Table:** Columns for ID, Label, Group, Level.
- **Edges Table:** Columns for Source, Target.
- Implement pagination or scrolling for large datasets.
- Highlight rows that match the global search term.

## Phase 4: Execution Steps

1.  **Tooling:** Initialize `package.json` and `pyproject.toml`. Install linters.
2.  **Lint/Type Fix:** Run `ruff`, `mypy`, and `eslint`. Fix existing code issues first.
3.  **Backend:** Modify `main.py` to implement strict data cleaning and edge logic.
4.  **Frontend Config:** Modify `app.js` to enable hover.
5.  **Frontend Feature:** Modify `index.html` and `app.js` to implement the Tabular View and toggle logic.
6.  **Verification:**
    - Run linters to ensure no new regressions.
    - Load bad data (with NaNs/empty cells) and verify UI handles it cleanly.
    - Check hover tooltips on nodes.
    - Test search function in both Graph and Table modes.