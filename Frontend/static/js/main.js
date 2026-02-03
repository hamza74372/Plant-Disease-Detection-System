const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');

const uploadStage = document.getElementById('upload-section');
const loadingStage = document.getElementById('loading-stage');
const resultsGrid = document.getElementById('results-grid');
const downloadBtn = document.getElementById('download-btn');
const newAnalysisBtn = document.getElementById('new-analysis-btn');

const historySection = document.getElementById('history-section');
const historyList = document.getElementById('history-list');
const historyEmpty = document.getElementById('history-empty');
const navItems = document.querySelectorAll('.nav-item');

// 2. State Management
let currentAnalysisData = null;
let analysisHistory = [];

// 3. Navigation (Dashboard / History)
navItems.forEach((item) => {
    item.addEventListener('click', () => {
        navItems.forEach((i) => i.classList.remove('active'));
        item.classList.add('active');

        const section = item.dataset.section;

        if (section === 'history') {
            uploadStage.classList.add('hidden');
            loadingStage.classList.add('hidden');
            resultsGrid.classList.add('hidden');
            historySection.classList.remove('hidden');
            renderHistory();
        } else {
            historySection.classList.add('hidden');
            uploadStage.classList.remove('hidden');
        }
    });
});

// 4. Event Listeners
dropZone.onclick = () => fileInput.click();

// Drag & drop support
['dragenter', 'dragover'].forEach((eventName) => {
    dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('drag-over');
    });
});

['dragleave', 'drop'].forEach((eventName) => {
    dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over');
    });
});

dropZone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) startAnalysis(file);
});

fileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (file) startAnalysis(file);
};

newAnalysisBtn.onclick = () => {
    // Reset view back to upload for another test
    currentAnalysisData = null;
    fileInput.value = '';
    document.getElementById('preview').src = '';
    document.getElementById('disease-name').innerText = 'Detecting...';
    document.getElementById('conf-label').innerText = '0%';
    document.getElementById('conf-fill').style.width = '0%';
    document.getElementById('advice-content').innerHTML = '';

    resultsGrid.classList.add('hidden');
    loadingStage.classList.add('hidden');
    historySection.classList.add('hidden');
    uploadStage.classList.remove('hidden');

    // Ensure Dashboard tab looks active
    navItems.forEach((i) => i.classList.remove('active'));
    const dashboardItem = document.querySelector('.nav-item[data-section="dashboard"]');
    if (dashboardItem) {
        dashboardItem.classList.add('active');
    }
};

// 5. Main Analysis Logic
async function startAnalysis(file) {
    // UI Setup: Switch to Loading State
    uploadStage.classList.add('hidden');
    loadingStage.classList.remove('hidden');
    resultsGrid.classList.add('hidden');
    historySection.classList.add('hidden');

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
        const adviceHtml = marked.parse(data.treatment_advice || 'No advice found.');
        document.getElementById('advice-content').innerHTML = adviceHtml;

        // Record in local history
        const previewSrc = document.getElementById('preview').src;
        analysisHistory.unshift({
            timestamp: new Date().toISOString(),
            disease_name: data.disease_name,
            confidence,
            previewSrc,
        });

        // Step D: Show Results
        loadingStage.classList.add('hidden');
        resultsGrid.classList.remove('hidden');
    } catch (err) {
        console.error('Analysis Error:', err);
        alert('System encountered an error. Please try again.');
        location.reload();
    }
}

// 6. History Rendering
function renderHistory() {
    if (!analysisHistory.length) {
        historyEmpty.classList.remove('hidden');
        historyList.innerHTML = '';
        return;
    }

    historyEmpty.classList.add('hidden');

    historyList.innerHTML = analysisHistory
        .map((item) => {
            const when = new Date(item.timestamp).toLocaleString();
            const hasPreview = !!item.previewSrc;
            const thumb = hasPreview
                ? `<div class="history-thumb"><img src="${item.previewSrc}" alt="Leaf snapshot" /></div>`
                : `<div class="history-thumb history-thumb-placeholder"><i class="fas fa-leaf"></i></div>`;
            return `
                <div class="history-item">
                    ${thumb}
                    <div class="history-main">
                        <div class="history-title">${item.disease_name}</div>
                        <div class="history-meta">
                            <span class="history-confidence">${item.confidence}% match</span>
                            <span class="history-time">${when}</span>
                        </div>
                    </div>
                </div>
            `;
        })
        .join('');
}

// 8. Load persisted history from backend on first load
async function loadInitialHistory() {
    try {
        const res = await fetch('/history');
        if (!res.ok) return;
        const serverHistory = await res.json();
        if (Array.isArray(serverHistory)) {
            analysisHistory = serverHistory.map((item) => ({
                timestamp: item.timestamp,
                disease_name: item.disease_name,
                confidence: item.confidence,
                previewSrc: null,
            }));
        }
    } catch (err) {
        console.error('Failed to load history', err);
    }
}

loadInitialHistory();

// 7. PDF Download Logic
downloadBtn.onclick = async () => {
    if (!currentAnalysisData) return;

    downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';

    try {
        const response = await fetch('/download-report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentAnalysisData),
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
        alert('Failed to download PDF.');
    } finally {
        downloadBtn.innerHTML = '<i class="fas fa-download"></i> PDF Report';
    }
};