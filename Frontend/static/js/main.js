const dropZone = document.getElementById('drop-zone');

const fileInput = document.getElementById('file-input');

const uploadStage = document.getElementById('upload-section');

const loadingStage = document.getElementById('loading-stage');

const resultsGrid = document.getElementById('results-grid');

const downloadBtn = document.getElementById('download-btn');



// 2. State Management for PDF Report

let currentAnalysisData = null;



// 3. Event Listeners

dropZone.onclick = () => fileInput.click();



fileInput.onchange = (e) => {

    const file = e.target.files[0];

    if (file) startAnalysis(file);

};



// 4. Main Analysis Logic

async function startAnalysis(file) {

    // UI Setup: Switch to Loading State

    uploadStage.classList.add('hidden');

    loadingStage.classList.remove('hidden');

    resultsGrid.classList.add('hidden');



    // Step A: Preview Image Immediately (Base64)

    const reader = new FileReader();

    reader.onload = (e) => {

        document.getElementById('preview').src = e.target.result;

    };

    reader.readAsDataURL(file);



    // Step B: Send to Flask Backend

    const formData = new FormData();

    formData.append('file', file);



    try {

        const response = await fetch('/predict', { method: 'POST', body: formData });

        const data = await response.json();



        if (data.error) throw new Error(data.error);



        // Save data for PDF generation

        currentAnalysisData = data;



        // Step C: Update Result Cards

        document.getElementById('disease-name').innerText = data.disease_name;

       

        // Confidence Progress Bar

        const confidence = (data.confidence * 100).toFixed(1);

        document.getElementById('conf-label').innerText = `${confidence}% Match`;

        document.getElementById('conf-fill').style.width = `${confidence}%`;



        // Render Markdown Advice

        const adviceHtml = marked.parse(data.treatment_advice || "No advice found.");

        document.getElementById('advice-content').innerHTML = adviceHtml;



        // Step D: Show Results

        loadingStage.classList.add('hidden');

        resultsGrid.classList.remove('hidden');



    } catch (err) {

        console.error("Analysis Error:", err);

        alert("System encountered an error. Please try again.");

        location.reload();

    }

}



// 5. PDF Download Logic

downloadBtn.onclick = async () => {

    if (!currentAnalysisData) return;

   

    downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';

   

    try {

        const response = await fetch('/download-report', {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify(currentAnalysisData)

        });



        const blob = await response.blob();

        const url = window.URL.createObjectURL(blob);

        const a = document.createElement('a');

        a.href = url;

        a.download = `AgriGuard_Report_${Date.now()}.pdf`;

        document.body.appendChild(a);

        a.click();

        a.remove();

    } catch (err) {

        alert("Failed to download PDF.");

    } finally {

        downloadBtn.innerHTML = '<i class="fas fa-download"></i> PDF Report';

    }

};