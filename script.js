// --- State Management ---
let apiKeys = JSON.parse(localStorage.getItem('gemini_api_keys')) || [];
let selectedImages = [];
let currentKeyIndex = 0;

// --- DOM Elements ---
const keysContainer = document.getElementById('keys-container');
const addKeyBtn = document.getElementById('add-key-btn');
const modelSelect = document.getElementById('model-select');
const refreshModelsBtn = document.getElementById('refresh-models-btn');
const fileInput = document.getElementById('file-input');
const dropZone = document.getElementById('drop-zone');
const previewContainer = document.getElementById('preview-container');
const processBtn = document.getElementById('process-btn');
const resultsContainer = document.getElementById('results-container');
const statusMessage = document.getElementById('status-message');
const copyAllBtn = document.getElementById('copy-all-btn');

// --- Initialization ---
function init() {
    renderApiKeys();
    updateProcessButton();
    if (apiKeys.length > 0) {
        fetchModels();
    }
}

// --- API Key Management ---
function renderApiKeys() {
    keysContainer.innerHTML = '';
    apiKeys.forEach((key, index) => {
        const div = document.createElement('div');
        div.className = 'key-card';
        div.innerHTML = `
            <div class="key-row">
                <input type="text" class="key-input" value="${key}" data-index="${index}" placeholder="کلید API را وارد کنید">
            </div>
            <div class="key-actions">
                <button class="btn small copy-btn" data-index="${index}" style="background: #9b59b6; color: white;">کپی</button>
                <button class="btn small delete-btn" data-index="${index}">حذف</button>
                <button class="btn small save-btn" data-index="${index}" style="background: #3498db; color: white;">ذخیره</button>
            </div>
        `;
        keysContainer.appendChild(div);
    });
}

addKeyBtn.addEventListener('click', () => {
    apiKeys.push('');
    renderApiKeys();
});

keysContainer.addEventListener('click', (e) => {
    const index = e.target.dataset.index;
    if (e.target.classList.contains('delete-btn')) {
        apiKeys.splice(index, 1);
        saveKeys();
    } else if (e.target.classList.contains('copy-btn')) {
        navigator.clipboard.writeText(apiKeys[index]);
        alert('کپی شد!');
    } else if (e.target.classList.contains('save-btn')) {
        const input = keysContainer.querySelector(`.key-input[data-index="${index}"]`);
        apiKeys[index] = input.value.trim();
        saveKeys();
        alert('ذخیره شد!');
        fetchModels();
    }
});

function saveKeys() {
    localStorage.setItem('gemini_api_keys', JSON.stringify(apiKeys.filter(k => k !== '')));
    renderApiKeys();
    updateProcessButton();
}

// --- Model Management ---
async function fetchModels() {
    if (apiKeys.length === 0) return;
    
    statusMessage.textContent = 'در حال دریافت لیست مدل‌ها...';
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKeys[0]}`);
        const data = await response.json();
        
        if (data.models) {
            modelSelect.innerHTML = '';
            data.models
                .filter(m => m.supportedGenerationMethods.includes('generateContent'))
                .forEach(m => {
                    const option = document.createElement('option');
                    option.value = m.name.replace('models/', '');
                    option.textContent = m.displayName || m.name;
                    if (option.value === 'gemini-1.5-flash') option.selected = true;
                    modelSelect.appendChild(option);
                });
            statusMessage.textContent = 'مدل‌ها با موفقیت دریافت شدند.';
        }
    } catch (error) {
        console.error('Error fetching models:', error);
        statusMessage.textContent = 'خطا در دریافت مدل‌ها. کلید API را چک کنید.';
    }
}

refreshModelsBtn.addEventListener('click', fetchModels);

// --- Image Management ---
dropZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', handleFiles);

function handleFiles(e) {
    const files = Array.from(e.target.files);
    const remainingSlots = 15 - selectedImages.length;
    const filesToAdd = files.slice(0, remainingSlots);

    filesToAdd.forEach(file => {
        const reader = new FileReader();
        reader.onload = (event) => {
            selectedImages.push({
                file: file,
                dataUrl: event.target.result,
                id: Date.now() + Math.random()
            });
            renderPreviews();
            updateProcessButton();
        };
        reader.readAsDataURL(file);
    });

    if (files.length > remainingSlots) {
        alert('حداکثر ۱۵ تصویر می‌توانید انتخاب کنید.');
    }
}

function renderPreviews() {
    previewContainer.innerHTML = '';
    selectedImages.forEach((img, index) => {
        const div = document.createElement('div');
        div.className = 'preview-item';
        div.innerHTML = `
            <img src="${img.dataUrl}">
            <div class="remove-img" data-index="${index}">×</div>
        `;
        previewContainer.appendChild(div);
    });
}

previewContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-img')) {
        const index = e.target.dataset.index;
        selectedImages.splice(index, 1);
        renderPreviews();
        updateProcessButton();
    }
});

function updateProcessButton() {
    processBtn.disabled = selectedImages.length === 0 || apiKeys.filter(k => k !== '').length === 0;
}

// --- OCR Logic ---
async function processOCR() {
    const activeKeys = apiKeys.filter(k => k !== '');
    if (activeKeys.length === 0) return;

    processBtn.disabled = true;
    resultsContainer.innerHTML = '';
    statusMessage.textContent = 'در حال پردازش...';

    for (let i = 0; i < selectedImages.length; i++) {
        const imgData = selectedImages[i];
        const resultCard = createResultCard(i, imgData.dataUrl);
        resultsContainer.appendChild(resultCard);

        const textElement = resultCard.querySelector('.result-body');
        const badge = resultCard.querySelector('.status-badge');

        badge.className = 'status-badge status-loading';
        badge.textContent = 'در حال پردازش...';

        let success = false;
        let attempts = 0;

        while (!success && attempts < activeKeys.length) {
            const currentKey = activeKeys[currentKeyIndex];
            try {
                const result = await callGeminiAPI(imgData.dataUrl, currentKey);
                textElement.textContent = result;
                badge.className = 'status-badge status-done';
                badge.textContent = 'تکمیل شد';
                success = true;
            } catch (error) {
                console.error(`Error with key ${currentKeyIndex}:`, error);
                if (error.status === 429) {
                    // Rate limit - rotate key
                    currentKeyIndex = (currentKeyIndex + 1) % activeKeys.length;
                    attempts++;
                    statusMessage.textContent = `محدودیت سرعت! سوئیچ به کلید بعدی (تلاش ${attempts})...`;
                } else {
                    textElement.textContent = `خطا: ${error.message}`;
                    badge.className = 'status-badge status-error';
                    badge.textContent = 'خطا';
                    success = true; // Stop trying for this image
                }
            }
        }

        if (!success) {
            textElement.textContent = 'تمامی کلیدهای API با محدودیت مواجه شدند. لطفا کمی صبر کنید.';
            badge.className = 'status-badge status-error';
            badge.textContent = 'خطا در همه کلیدها';
        }
    }

    statusMessage.textContent = 'پردازش تمام شد.';
    processBtn.disabled = false;
}

function createResultCard(index, thumbUrl) {
    const div = document.createElement('div');
    div.className = 'result-card';
    div.innerHTML = `
        <div class="result-header">
            <span>تصویر ${index + 1}</span>
            <span class="status-badge status-pending">در انتظار</span>
            <button class="btn small copy-result" style="background: #34495e; color: white;">کپی متن</button>
        </div>
        <div class="result-body">در حال آماده‌سازی...</div>
    `;
    
    div.querySelector('.copy-result').addEventListener('click', () => {
        const text = div.querySelector('.result-body').textContent;
        navigator.clipboard.writeText(text);
        alert('متن کپی شد!');
    });

    return div;
}

async function callGeminiAPI(base64Image, apiKey) {
    const model = modelSelect.value;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    // Extract base64 data and mime type
    const [header, data] = base64Image.split(',');
    const mimeType = header.match(/:(.*?);/)[1];

    const body = {
        contents: [{
            parts: [
                { text: "لطفا تمام متن‌های موجود در این تصویر را به دقت استخراج کن و به صورت مرتب و با حفظ ساختار نمایش بده. فقط متن استخراج شده را برگردان." },
                {
                    inline_data: {
                        mime_type: mimeType,
                        data: data
                    }
                }
            ]
        }]
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorData = await response.json();
        const err = new Error(errorData.error?.message || 'خطای نامشخص');
        err.status = response.status;
        throw err;
    }

    const result = await response.json();
    return result.candidates[0].content.parts[0].text;
}

processBtn.addEventListener('click', processOCR);

copyAllBtn.addEventListener('click', () => {
    const texts = Array.from(resultsContainer.querySelectorAll('.result-body'))
        .map((el, i) => `--- تصویر ${i + 1} ---\n${el.textContent}`)
        .join('\n\n');
    if (texts) {
        navigator.clipboard.writeText(texts);
        alert('تمام نتایج کپی شدند!');
    }
});

// --- Initialize ---
init();
