"""
Flask Web App Example — PyCode Sample Project

Start with: flask run examples/flask_app.py
Or just press F5 — Flask apps are auto-detected!
"""
from flask import Flask, jsonify

app = Flask(__name__)


@app.route('/')
def index():
    return '''<!DOCTYPE html>
<html>
<head>
    <title>PyCode Flask App</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
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
        h1 span { color: #4fc3f7; }
        p { color: #aaa; margin-bottom: 20px; }
        .links { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
        .links a {
            color: #4fc3f7;
            text-decoration: none;
            padding: 8px 16px;
            border: 1px solid #4fc3f7;
            border-radius: 8px;
            transition: all 0.2s;
        }
        .links a:hover {
            background: #4fc3f7;
            color: #1a1a2e;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Hello from <span>Flask</span>! 🐍</h1>
        <p>Running entirely in your browser via Pyodide</p>
        <div class="links">
            <a href="/pycode-server/hello/World">Greet World</a>
            <a href="/pycode-server/api/status">API Status</a>
            <a href="/pycode-server/api/data">Sample Data</a>
        </div>
    </div>
</body>
</html>'''


@app.route('/hello/<name>')
def hello(name):
    return f'''<!DOCTYPE html>
<html>
<head><title>Hello {name}</title>
<style>
    body {{
        font-family: sans-serif;
        background: #1a1a2e; color: #e0e0e0;
        display: flex; align-items: center; justify-content: center;
        min-height: 100vh; margin: 0;
    }}
    h1 {{ font-size: 3em; }}
    h1 span {{ color: #f48fb1; }}
    a {{ color: #4fc3f7; }}
</style>
</head>
<body>
    <div style="text-align:center">
        <h1>Hello, <span>{name}</span>! 👋</h1>
        <p><a href="/pycode-server/">← Back</a></p>
    </div>
</body>
</html>'''


@app.route('/api/status')
def api_status():
    return jsonify({
        'status': 'running',
        'server': 'PyCode Flask (Pyodide WSGI)',
        'python': 'Pyodide 0.27.4',
    })


@app.route('/api/data')
def api_data():
    return jsonify({
        'items': [
            {'id': 1, 'name': 'Widget A', 'price': 29.99},
            {'id': 2, 'name': 'Widget B', 'price': 49.99},
            {'id': 3, 'name': 'Gadget X', 'price': 79.99},
        ],
        'total': 3,
    })
