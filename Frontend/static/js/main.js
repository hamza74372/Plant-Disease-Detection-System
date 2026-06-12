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

    // Step B: Send to Flask Backend for CNN Detection
    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/predict', { method: 'POST', body: formData });
        const data = await response.json();

        if (data.error) throw new Error(data.error);

        // Save data for PDF generation (will be updated with treatment_advice later)
        currentAnalysisData = {
            disease_name: data.disease_name,
            confidence: (data.confidence * 100).toFixed(1),
            treatment_advice: null
        };

        // Step C: Update Result Cards (Instantly)
        document.getElementById('disease-name').innerText = data.disease_name;

        // Confidence Progress Bar
        const confidence = (data.confidence * 100).toFixed(1);
        document.getElementById('conf-label').innerText = `${confidence}% Match`;
        document.getElementById('conf-fill').style.width = `${confidence}%`;

        // Render Prompt for AI Advice
        downloadBtn.disabled = true;
        document.getElementById('advice-content').innerHTML = `
            <div class="advice-prompt-container">
                <div class="advice-icon-bg">
                    <i class="fas fa-robot"></i>
                </div>
                <h4>Consult AI Agronomist</h4>
                <p>Generate a customized, organic treatment checklist and seasonal prevention measures for <strong>${data.disease_name}</strong>.</p>
                <button id="get-advice-btn" class="advice-action-btn">
                    <i class="fas fa-wand-magic-sparkles"></i> Get Recommendations from AI
                </button>
            </div>
        `;

        // Record in local history
        const previewSrc = document.getElementById('preview').src;
        analysisHistory.unshift({
            timestamp: new Date().toISOString(),
            disease_name: data.disease_name,
            confidence,
            previewSrc,
        });

        // Step D: Show Results Grid & Hide Global Loader
        loadingStage.classList.add('hidden');
        resultsGrid.classList.remove('hidden');

        // Set up click handler for the AI recommendations button
        document.getElementById('get-advice-btn').onclick = async () => {
            const startTime = Date.now();

            // Render Shimmering Skeleton Loader
            document.getElementById('advice-content').innerHTML = `
                <div class="skeleton-loader">
                    <div class="skeleton-line title"></div>
                    <div class="skeleton-line body-1"></div>
                    <div class="skeleton-line body-2"></div>
                    <div class="skeleton-line body-3"></div>
                    <div class="skeleton-line body-4"></div>
                </div>
                <div class="advice-loading-status">
                    <i class="fas fa-spinner"></i>
                    <span>AI Agronomist is analyzing pathogens & preparing organic treatment plan...</span>
                </div>
            `;

            // Step E: Fetch AI Recommendations Asynchronously
            try {
                const adviceResponse = await fetch('/get-advice', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ disease_name: data.disease_name })
                });
                const adviceData = await adviceResponse.json();
                if (adviceData.error) throw new Error(adviceData.error);

                // Enforce a minimum delay of 3 seconds (3000 ms) to show the loading animation
                const elapsed = Date.now() - startTime;
                const remainingDelay = Math.max(0, 3000 - elapsed);
                if (remainingDelay > 0) {
                    await new Promise(resolve => setTimeout(resolve, remainingDelay));
                }

                // Update local state and HTML content
                currentAnalysisData.treatment_advice = adviceData.treatment_advice;
                document.getElementById('advice-content').innerHTML = marked.parse(adviceData.treatment_advice || 'No advice found.');
                downloadBtn.disabled = false;
            } catch (adviceErr) {
                console.error('Failed to get AI advice:', adviceErr);
                
                // Even on error, maintain the 3-second minimum load experience
                const elapsed = Date.now() - startTime;
                const remainingDelay = Math.max(0, 3000 - elapsed);
                if (remainingDelay > 0) {
                    await new Promise(resolve => setTimeout(resolve, remainingDelay));
                }

                document.getElementById('advice-content').innerHTML = `
                    <div class="advice-error">
                        <i class="fas fa-exclamation-triangle"></i>
                        <div>
                            <strong>Expert consultation unavailable</strong><br>
                            <span style="font-size: 0.85rem; opacity: 0.9;">
                                The AI was unable to generate recommendations. Please ensure your Groq API key is set.
                            </span>
                        </div>
                    </div>
                `;
                downloadBtn.disabled = true;
            }
        };

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