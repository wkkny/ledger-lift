const fileInput = document.querySelector('#file-input');
const zone = document.querySelector('#upload-zone');
const previewWrap = document.querySelector('#preview-wrap');
const previewImage = document.querySelector('#preview-image');
const fileName = document.querySelector('#file-name');
const extractButton = document.querySelector('#extract-button');
const message = document.querySelector('#message');
const modelInput = document.querySelector('#model-name');
const resultsSection = document.querySelector('#results');
const entriesBody = document.querySelector('#entries-body');
const entryCount = document.querySelector('#entry-count');
const reviewSummary = document.querySelector('#review-summary');
let selectedFile = null;
let previewUrl = null;

const fields = [
  { key: 'date', label: 'Date', placeholder: 'Date' },
  { key: 'item', label: 'Item or description', placeholder: 'Item or description' },
  { key: 'quantity', label: 'Quantity', placeholder: 'Quantity' },
  { key: 'amount', label: 'Amount', placeholder: 'Amount' },
];

async function refreshStatus() {
  const dot = document.querySelector('#status-dot');
  const text = document.querySelector('#status-text');
  try {
    const response = await fetch('/api/status');
    const status = await response.json();
    dot.className = `status-dot ${status.ollama ? 'online' : 'offline'}`;
    text.textContent = status.ollama ? 'Local model ready' : 'Ollama not running';
    if (!modelInput.dataset.edited) modelInput.value = status.defaultModel || modelInput.value;
    const installed = status.models?.some((name) => name === modelInput.value || name.startsWith(`${modelInput.value}:`));
    document.querySelector('#model-hint').textContent = !status.ollama
      ? 'Start Ollama, then try again. Your image stays on this computer.'
      : installed
        ? 'Ollama runs the model locally. No image is uploaded to a website.'
        : `That model is not installed yet. In a terminal, run: ollama pull ${modelInput.value}`;
  } catch {
    dot.className = 'status-dot offline';
    text.textContent = 'Local server unavailable';
  }
}

function chooseFile(file) {
  if (!file) return;
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) {
    showMessage('Choose a JPEG, PNG, or WebP image.');
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    showMessage('This image is over 12 MB. Choose a smaller photo.');
    return;
  }
  selectedFile = file;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  previewImage.src = previewUrl;
  fileName.textContent = file.name;
  previewWrap.hidden = false;
  zone.classList.add('has-image');
  extractButton.disabled = false;
  clearMessage();
}

function clearSelection() {
  selectedFile = null;
  fileInput.value = '';
  previewWrap.hidden = true;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  extractButton.disabled = true;
  zone.classList.remove('has-image');
}

function showMessage(text) { message.textContent = text; }
function clearMessage() { message.textContent = ''; }

function renderEntries(entries) {
  entriesBody.replaceChildren();
  entries.forEach((entry, index) => {
    const uncertain = new Set(entry.uncertain_fields || []);
    const hasMissing = fields.some(({ key }) => !entry[key]);
    const needsReview = hasMissing || uncertain.size > 0;
    const row = document.createElement('tr');
    row.className = `entry-row${needsReview ? ' needs-review' : ''}`;
    row.dataset.index = index;
    row.dataset.reviewed = 'false';
    for (const { key, label, placeholder } of fields) {
      const cell = document.createElement('td');
      const input = document.createElement('input');
      input.value = entry[key] || '';
      input.placeholder = placeholder;
      input.setAttribute('aria-label', `${label}, row ${index + 1}`);
      input.dataset.field = key;
      if (uncertain.has(key) || !input.value) input.classList.add('uncertain');
      input.addEventListener('input', () => {
        input.classList.remove('uncertain');
        row.dataset.reviewed = 'false';
        row.classList.remove('reviewed');
        row.querySelector('.review-checkbox').checked = false;
        const current = [...row.querySelectorAll('input')];
        row.classList.toggle('needs-review', current.slice(0, 4).some((control) => !control.value || control.classList.contains('uncertain')));
        updateReviewSummary();
      });
      cell.append(input);
      row.append(cell);
    }
    const status = document.createElement('td');
    status.className = 'row-status';
    const reviewLabel = document.createElement('label');
    reviewLabel.className = 'review-control';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'review-checkbox';
    checkbox.setAttribute('aria-label', `Mark row ${index + 1} reviewed`);
    checkbox.addEventListener('change', () => {
      row.dataset.reviewed = String(checkbox.checked);
      row.classList.toggle('reviewed', checkbox.checked);
      updateReviewSummary();
    });
    const reviewText = document.createElement('span');
    reviewText.textContent = 'Reviewed';
    reviewLabel.append(checkbox, reviewText);
    status.append(reviewLabel);
    row.append(status);
    entriesBody.append(row);
  });
  entryCount.textContent = `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`;
  resultsSection.hidden = false;
  updateReviewSummary();
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function updateReviewSummary() {
  const rows = [...entriesBody.querySelectorAll('tr')];
  const remaining = rows.filter((row) => row.dataset.reviewed !== 'true').length;
  reviewSummary.textContent = remaining
    ? `Review and mark ${remaining} ${remaining === 1 ? 'row' : 'rows'} before downloading.`
    : 'Every row is marked reviewed and ready to download.';
  document.querySelector('#download-button').disabled = remaining > 0;
}

async function extract() {
  if (!selectedFile) return;
  extractButton.disabled = true;
  extractButton.querySelector('span:first-child').textContent = 'Reading page…';
  clearMessage();
  resultsSection.hidden = true;
  try {
    const { image, mimeType } = await prepareImage(selectedFile);
    const response = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, mimeType, model: modelInput.value.trim() }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not read this page.');
    if (!result.entries.length) throw new Error('No sales rows found. Try a closer, brighter photo.');
    renderEntries(result.entries);
  } catch (error) {
    showMessage(error.message || 'Something went wrong while reading this page.');
  } finally {
    extractButton.disabled = !selectedFile;
    extractButton.querySelector('span:first-child').textContent = 'Read this page';
  }
}

// A full-size phone photo is thousands of image tokens, which overflows the model's context and
// slows it down. 1600 px on the long edge read every row correctly in testing.
const MAX_IMAGE_EDGE = 1600;

async function prepareImage(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1) {
    bitmap.close();
    return { image: await fileAsBase64(file), mimeType: file.type };
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!blob) throw new Error('Could not prepare that image.');
  return { image: await fileAsBase64(blob), mimeType: 'image/jpeg' };
}

function fileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('Could not read that image file.'));
    reader.readAsDataURL(file);
  });
}

function downloadCsv() {
  const lines = [['Date', 'Item or description', 'Quantity', 'Amount']];
  for (const row of entriesBody.querySelectorAll('tr')) {
    lines.push([...row.querySelectorAll('input')].map((input) => input.value));
  }
  const csv = lines.map((line) => line.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ledger-entries-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

fileInput.addEventListener('change', (event) => chooseFile(event.target.files[0]));
document.querySelector('#remove-image').addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); clearSelection(); });
document.querySelector('#extract-button').addEventListener('click', extract);
document.querySelector('#download-button').addEventListener('click', downloadCsv);
document.querySelector('#start-over').addEventListener('click', () => { resultsSection.hidden = true; clearSelection(); clearMessage(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
modelInput.addEventListener('input', () => { modelInput.dataset.edited = 'true'; refreshStatus(); });
for (const eventName of ['dragenter', 'dragover']) zone.addEventListener(eventName, (event) => { event.preventDefault(); zone.classList.add('drag-over'); });
for (const eventName of ['dragleave', 'drop']) zone.addEventListener(eventName, (event) => { event.preventDefault(); zone.classList.remove('drag-over'); });
zone.addEventListener('drop', (event) => chooseFile(event.dataTransfer.files[0]));

refreshStatus();
