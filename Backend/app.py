import os
import sys
import json
import sqlite3
from datetime import datetime

# Reconfigure stdout/stderr to UTF-8 to prevent encoding errors on Windows when printing emojis
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

import tensorflow as tf
from io import BytesIO
from xhtml2pdf import pisa
from flask import Flask, render_template, request, jsonify, make_response
from groq import Groq  # pip install groq

# --- 0. SILENCE TENSORFLOW WARNINGS ---
# This hides the oneDNN and technical info logs you saw in your terminal
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'

# --- 1. ROBUST PATH CONFIGURATION ---
base_dir = os.path.dirname(os.path.abspath(__file__))  # .../Backend
root_dir = os.path.abspath(os.path.join(base_dir, '..'))  # .../Project Root

if root_dir not in sys.path:
    sys.path.append(root_dir)

# Importing your custom prediction logic from the root folder
from predict import prepare_image, get_prediction

# --- 2. INITIALIZATION ---
app = Flask(
    __name__,
    template_folder=os.path.join(root_dir, 'Frontend', 'templates'),
    static_folder=os.path.join(root_dir, 'Frontend', 'static'),
)

# GROQ API CONFIGURATION - read from environment
# Set GROQ_API_KEY in your environment before running:
#   Linux/macOS: export GROQ_API_KEY="your-key"
#   Windows (PowerShell): setx GROQ_API_KEY "your-key"
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
if not GROQ_API_KEY:
    print(
        "⚠️  GROQ_API_KEY not set. "
        "AI treatment advice will fall back to a generic message."
    )
    groq_client = None
else:
    groq_client = Groq(api_key=GROQ_API_KEY)

# --- 3. AI ASSETS & HISTORY DB ---
MODEL_PATH = os.path.join(root_dir, 'Model_Assets', 'plant_cnn_model.h5')
LABEL_PATH = os.path.join(root_dir, 'Model_Assets', 'class_names.json')
HISTORY_DB_PATH = os.path.join(root_dir, 'prediction_history.db')


def init_history_db():
    """Ensure the SQLite DB and predictions table exist."""
    try:
        conn = sqlite3.connect(HISTORY_DB_PATH)
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS predictions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                disease_name TEXT NOT NULL,
                confidence REAL NOT NULL
            )
            """
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"History DB init error: {e}")


print("--- AgriGuard System Startup ---")
init_history_db()

try:
    print("Loading CNN Model...")
    MODEL = tf.keras.models.load_model(MODEL_PATH)
    with open(LABEL_PATH, 'r') as f:
        LABELS = json.load(f)
    print("✅ AI Assets Loaded Successfully.")
except Exception as e:
    print(f"❌ CRITICAL ERROR: Could not load assets. {e}")
    sys.exit(1)

# --- 4. CORE LOGIC FUNCTIONS ---

def clean_label(raw_name):
    """Converts 'Grape___Black_rot' -> 'Grape: Black Rot'"""
    friendly_name = raw_name.replace("___", ": ").replace("_", " ")
    return friendly_name.title()

def get_ai_consultation(disease_name):
    """Fetches professional treatment advice from Groq using Llama 3.3.

    Falls back to a generic message if GROQ_API_KEY is not configured
    or the API call fails.
    """

    if groq_client is None:
        return (
            "Advice currently unavailable because the Groq API key is not "
            "configured on this server. Please follow standard organic "
            "farming quarantine procedures and consult a local agronomist."
        )

    prompt = f"""
    The plant disease '{disease_name}' has been detected. 
    As an expert agronomist, provide:
    1. A brief, simple description of the disease.
    2. Top 3 organic treatment steps.
    3. Preventive measures for next season.
    
    IMPORTANT: Format your response in Markdown with bullet points.
    """
    
    try:
        # Using Llama 3.3 70B for high-quality agronomist advice
        completion = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are a helpful, expert agronomist."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=1024
        )
        return completion.choices[0].message.content
    except Exception as e:
        print(f"Groq API Error: {e}")
        return "Advice currently unavailable. Please follow standard organic farming quarantine procedures."


def log_prediction(disease_name: str, confidence_pct: float) -> None:
    """Persist a single prediction in the history database."""
    try:
        conn = sqlite3.connect(HISTORY_DB_PATH)
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO predictions (created_at, disease_name, confidence) VALUES (?, ?, ?)",
            (datetime.utcnow().isoformat(), disease_name, float(confidence_pct)),
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"History logging error: {e}")

# --- 5. ROUTES ---

@app.route('/')
def home():
    """Renders the main Dashboard."""
    return render_template('index.html')

@app.route('/predict', methods=['POST'])
def predict():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    
    file = request.files['file']
    try:
        # Step A: Local CNN Detection
        img_array = prepare_image(file)
        raw_disease, confidence = get_prediction(MODEL, img_array, LABELS)
        
        # Step B: Human-Friendly Labeling
        friendly_disease = clean_label(raw_disease)

        # Step C: Persist in history (store confidence as percentage)
        confidence_pct = round(float(confidence) * 100.0, 1)
        log_prediction(friendly_disease, confidence_pct)

        return jsonify(
            {
                'disease_name': friendly_disease,
                'confidence': round(float(confidence), 2),
            }
        )
    except Exception as e:
        print(f"Prediction logic error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/get-advice', methods=['POST'])
def get_advice():
    """Fetches agronomist treatment advice for a specific disease."""
    data = request.get_json()
    if not data or 'disease_name' not in data:
        return jsonify({'error': 'disease_name is required'}), 400
    
    try:
        disease_name = data['disease_name']
        advice = get_ai_consultation(disease_name)
        return jsonify({'treatment_advice': advice})
    except Exception as e:
        print(f"Advice consultation error: {e}")
        return jsonify({'error': str(e)}), 500



@app.route('/history', methods=['GET'])
def history():
    """Return recent prediction history as JSON (most recent first)."""
    try:
        conn = sqlite3.connect(HISTORY_DB_PATH)
        cur = conn.cursor()
        cur.execute(
            "SELECT created_at, disease_name, confidence "
            "FROM predictions ORDER BY id DESC LIMIT 50"
        )
        rows = cur.fetchall()
        conn.close()

        payload = [
            {
                'timestamp': created_at,
                'disease_name': disease_name,
                'confidence': confidence,  # already in percentage units
            }
            for (created_at, disease_name, confidence) in rows
        ]
        return jsonify(payload)
    except Exception as e:
        print(f"History fetch error: {e}")
        return jsonify([]), 500

@app.route('/download-report', methods=['POST'])
def download_report():
    data = request.json
    
    html_content = f"""
    <html>
    <head><style>
        body {{ font-family: Helvetica, Arial, sans-serif; padding: 30px; color: #1b4332; }}
        .header {{ text-align: center; border-bottom: 2px solid #2d6a4f; padding-bottom: 10px; }}
        .result-box {{ background: #f0f4f3; padding: 20px; border-radius: 10px; margin-top: 20px; }}
        .label {{ font-weight: bold; color: #2d6a4f; }}
        .advice-box {{ margin-top: 20px; line-height: 1.6; }}
    </style></head>
    <body>
        <div class="header"><h1>AgriGuard AI: Diagnostic Report</h1></div>
        <div class="result-box">
            <p><span class="label">Detected Condition:</span> {data['disease_name']}</p>
            <p><span class="label">Analysis Confidence:</span> {data['confidence']}%</p>
        </div>
        <div class="advice-box">
            <h3>Treatment & Prevention Plan</h3>
            {data['treatment_advice']}
        </div>
    </body>
    </html>
    """
    
    pdf_buffer = BytesIO()
    pisa.CreatePDF(BytesIO(html_content.encode("utf-8")), dest=pdf_buffer)
    
    response = make_response(pdf_buffer.getvalue())
    response.headers['Content-Type'] = 'application/pdf'
    response.headers['Content-Disposition'] = f"attachment; filename=Report_{data['disease_name'].replace(' ', '_')}.pdf"
    return response

if __name__ == '__main__':
    # Running on port 5000
    debug_mode = os.environ.get("FLASK_DEBUG", "1") == "1"
    app.run(debug=debug_mode, port=5000)