import os
import sys
import json
import tensorflow as tf
from flask import Flask, render_template, request, jsonify

# --- PATH CONFIGURATION ---
# This ensures Backend can see predict.py in the root folder
base_dir = os.path.dirname(os.path.abspath(__file__))
root_dir = os.path.abspath(os.path.join(base_dir, '..'))
if root_dir not in sys.path:
    sys.path.append(root_dir)

# Now we can safely import your custom helper functions
from predict import prepare_image, get_prediction

# --- FLASK CONFIGURATION ---
# We point Flask to the correctly named 'Frontend' folders
app = Flask(__name__, 
            template_folder=os.path.join(root_dir, 'Frontend/templates'),
            static_folder=os.path.join(root_dir, 'Frontend/static'))

# --- LOAD AI ASSETS ---
# Load the model and labels once when the server starts to save time/memory
MODEL_PATH = os.path.join(root_dir, 'Model_Assets/plant_cnn_model.h5')
LABEL_PATH = os.path.join(root_dir, 'Model_Assets/class_names.json')

print("Loading AI Model... please wait.")
MODEL = tf.keras.models.load_model(MODEL_PATH)

with open(LABEL_PATH, 'r') as f:
    LABELS = json.load(f)
print("Model and Labels loaded successfully!")

# --- ROUTES ---

@app.route('/')
def home():
    """Renders the main Professional Dashboard."""
    return render_template('index.html')

@app.route('/predict', methods=['POST'])
def predict():
    """Handles image upload, runs AI inference, and returns JSON."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file part in the request'}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({'error': 'No file selected for uploading'}), 400

    try:
        # 1. Preprocess the image (Resizing/Normalization)
        processed_img = prepare_image(file)
        
        # 2. Run inference using the loaded MODEL and LABELS
        disease_name, confidence = get_prediction(MODEL, processed_img, LABELS)
        
        # 3. Return results as JSON for the Frontend to display
        return jsonify({
            'disease_name': disease_name,
            'confidence': float(confidence)
        })

    except Exception as e:
        print(f"Prediction Error: {e}")
        return jsonify({'error': 'An error occurred during analysis. Check server logs.'}), 500

if __name__ == '__main__':
    # Using debug=True allows the server to auto-reload when you save changes
    app.run(debug=True, port=5000)