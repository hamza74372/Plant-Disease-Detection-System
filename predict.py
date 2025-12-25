import numpy as np
import tensorflow as tf
from PIL import Image
import json

# Configuration
IMAGE_SIZE = (256, 256)

def load_plant_model(model_path):
    """Loads the trained .h5 model."""
    return tf.keras.models.load_model(model_path)

def load_labels(json_path):
    """Loads the class names mapping."""
    with open(json_path, 'r') as f:
        return json.load(f)

def prepare_image(image_file):
    """Preprocesses the image to match training (Resizing & Normalization)."""
    img = Image.open(image_file).convert('RGB')
    img = img.resize(IMAGE_SIZE)
    img_array = np.array(img) / 255.0  # Normalization
    img_array = np.expand_dims(img_array, axis=0) # Add batch dimension
    return img_array

def get_prediction(model, img_array, class_names):
    """Runs inference and returns human-readable results."""
    predictions = model.predict(img_array)
    predicted_class_index = np.argmax(predictions[0])
    confidence = np.max(predictions[0])
    
    # Map index to name using your JSON
    disease_name = class_names[str(predicted_class_index)]
    return disease_name, float(confidence)