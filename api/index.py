import os
from flask import Flask, send_from_directory

app = Flask(__name__)

ROOT = os.path.join(os.path.dirname(__file__), '..')

@app.route('/')
def index():
    return send_from_directory(ROOT, 'index.html')

@app.route('/<path:path>')
def static_files(path):
    full = os.path.join(ROOT, path)
    if os.path.isfile(full):
        return send_from_directory(ROOT, path)
    return send_from_directory(ROOT, 'index.html')
