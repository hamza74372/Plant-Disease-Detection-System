const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const resultDisplay = document.getElementById('result-display');
const processingState = document.getElementById('processing-state');

// Click to upload
dropZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        handleUpload(file);
    }
});

async function handleUpload(file) {
    // UI Transitions
    dropZone.classList.add('hidden');
    processingState.classList.remove('hidden');

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/predict', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        // Small delay for "Professional feel"
        setTimeout(() => {
            showResult(data, file);
        }, 1500);

    } catch (error) {
        alert("Server Error. Ensure Backend/app.py is running.");
        location.reload();
    }
}

function showResult(data, file) {
    console.log("Data received from Backend:", data); // DEBUG: Check your console (F12)

    // 1. Hide the loader, show the card
    document.getElementById('processing-state').classList.add('hidden');
    document.getElementById('result-display').classList.remove('hidden');

    // 2. Update the Text
    const diseaseNameElement = document.getElementById('disease-name');
    diseaseNameElement.innerText = data.disease_name;

    // 3. Update the Confidence Bar
    const confPercent = (data.confidence * 100).toFixed(1);
    document.getElementById('confidence-text').innerText = `Match Accuracy: ${confPercent}%`;
    document.getElementById('confidence-bar').style.width = `${confPercent}%`;
}