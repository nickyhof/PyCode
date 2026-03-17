"""
FastAPI Web App Example — PyCode Sample Project

Start with: flask run examples/fastapi_app.py
Or just press F5 — ASGI apps are auto-detected!
"""
from fastapi import FastAPI
from fastapi.responses import HTMLResponse, JSONResponse

app = FastAPI()


@app.get('/', response_class=HTMLResponse)
async def index():
    return '''<!DOCTYPE html>
<html>
<head>
    <title>PyCode FastAPI App</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #0d1b2a 0%, #1b2838 50%, #1a472a 100%);
            color: #e0e0e0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            text-align: center;
            padding: 40px;
            background: rgba(255,255,255,0.05);
            border-radius: 16px;
            border: 1px solid rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            max-width: 500px;
        }
        h1 { font-size: 2em; margin-bottom: 8px; }
        h1 span { color: #81c784; }
        p { color: #aaa; margin-bottom: 20px; }
        .links { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
        .links a {
            color: #81c784;
            text-decoration: none;
            padding: 8px 16px;
            border: 1px solid #81c784;
            border-radius: 8px;
            transition: all 0.2s;
        }
        .links a:hover {
            background: #81c784;
            color: #0d1b2a;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Hello from <span>FastAPI</span>! ⚡</h1>
        <p>Running entirely in your browser via Pyodide</p>
        <div class="links">
            <a href="/pycode-server/hello/World">Greet World</a>
            <a href="/pycode-server/api/status">API Status</a>
            <a href="/pycode-server/api/items">Items API</a>
        </div>
    </div>
</body>
</html>'''


@app.get('/hello/{name}', response_class=HTMLResponse)
async def hello(name: str):
    return f'''<!DOCTYPE html>
<html>
<head><title>Hello {name}</title>
<style>
    body {{
        font-family: sans-serif;
        background: #0d1b2a; color: #e0e0e0;
        display: flex; align-items: center; justify-content: center;
        min-height: 100vh; margin: 0;
    }}
    h1 {{ font-size: 3em; }}
    h1 span {{ color: #ce93d8; }}
    a {{ color: #81c784; }}
</style>
</head>
<body>
    <div style="text-align:center">
        <h1>Hello, <span>{name}</span>! 👋</h1>
        <p><a href="/pycode-server/">← Back</a></p>
    </div>
</body>
</html>'''


@app.get('/api/status')
async def api_status():
    return {
        'status': 'running',
        'server': 'PyCode FastAPI (Pyodide ASGI)',
        'framework': 'FastAPI',
        'python': 'Pyodide 0.27.4',
    }


@app.get('/api/items')
async def list_items():
    return {
        'items': [
            {'id': 1, 'name': 'Alpha', 'category': 'tools', 'price': 19.99},
            {'id': 2, 'name': 'Beta', 'category': 'widgets', 'price': 34.99},
            {'id': 3, 'name': 'Gamma', 'category': 'tools', 'price': 59.99},
            {'id': 4, 'name': 'Delta', 'category': 'gadgets', 'price': 89.99},
        ],
        'total': 4,
    }
