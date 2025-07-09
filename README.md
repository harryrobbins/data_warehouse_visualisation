/data-lineage-visualizer
|
├── main.py                 # FastAPI application
|
├── static/
|   ├── js/
|   |   ├── vue.min.js      # Vue.js library
|   |   ├── vis-network.min.js # Vis.js for graphing
|   |   └── app.js          # Custom Vue application logic
|   |
|   └── css/
|       └── style.css       # Custom styles
|
├── templates/
|   └── index.html          # The main HTML template
|
└── data/
    └── legacy_data.csv     # The source data file



# --- To run the application:
# 1. Install necessary packages: pip install "fastapi[all]" "pandas>=2.0" "pydantic>=2.0" jinja2
# 2. Save this file as main.py
# 3. Run from your terminal: uvicorn main:app --reload
