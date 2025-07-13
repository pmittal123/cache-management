let hits = 0, misses = 0;

const hitsChartCtx = document.getElementById('hitsChart').getContext('2d');
const hitsChart = new Chart(hitsChartCtx, {
    type: 'bar',
    data: {
        labels: ['Hits', 'Misses'],
        datasets: [{
            label: 'Cache Requests',
            data: [0, 0],
            backgroundColor: ['#4caf50', '#f44336'],
        }]
    },
    options: {
        responsive: true,
        scales: {
            y: { beginAtZero: true }
        }
    }
});

function getTotalUsedSize() {
    let total = 0;
    for (let entry of cache.map.values()) {
        total += getFileSize(entry.file);
    }
    return total;
}


const filesChartCtx = document.getElementById('filesChart').getContext('2d');
const filesChart = new Chart(filesChartCtx, {
    type: 'doughnut',
    data: {
        labels: ['Used', 'Free'],
        datasets: [{
            label: 'Cache Usage',
            data: [0, 1],
            backgroundColor: ['#2196f3', '#9e9e9e']
        }]
    },
    options: {
        responsive: true,
        cutout: '60%',
    }
});






// Theme toggle functionality with smooth transitions



document.addEventListener('DOMContentLoaded', () => {
    const themeSwitch = document.getElementById('theme-switch');
    const body = document.body;

    // Helper: set theme class on body
    function setTheme(isDark) {
        if (isDark) {
            body.classList.add('dark-theme');
            body.classList.remove('light-theme');
            localStorage.setItem('theme', 'dark');
        } else {
            body.classList.add('light-theme');
            body.classList.remove('dark-theme');
            localStorage.setItem('theme', 'light');
        }
    }

    // On load: set theme from localStorage or system preference
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
        themeSwitch.checked = true;
        setTheme(true);
    } else {
        themeSwitch.checked = false;
        setTheme(false);
    }

    // Toggle event
    themeSwitch.addEventListener('change', (e) => {
        setTheme(e.target.checked);
    });

    // Optional: smooth transition for theme changes
    body.style.transition = 'background 0.4s, color 0.4s';
});

// =========================
// CACHE SYSTEM WITH TTL
// =========================

class CacheFile {
    constructor(file, ttl) {
        this.name = file.name;
        this.file = file;
        this.ttl = ttl;
        this.addedAt = Date.now();
        this.timerId = null;
    }
}

class FileCache {



    constructor() {
        this.map = new Map(); // name -> CacheFile
        this.hits = 0;
        this.misses = 0;
        this.onEvict = null;
        this.accessOrder = []; // Array to track access order for LRU
    }

    // Update add method to use LRU eviction
    add(file, ttl) {
        this.remove(file.name); // remove duplicate

        this.evictIfNeeded(file.size);

        // Recompute current size after eviction
        let currentSize = 0;
        for (const entry of this.map.values()) {
            currentSize += entry.file.size;
        }

        if (currentSize + file.size > cacheSizeLimit) {
            console.log(`Not enough space for ${file.name} even after eviction`);
            return false;
        }

        const cacheFile = new CacheFile(file, ttl);
        cacheFile.timerId = setTimeout(() => {
            this.remove(file.name);
            if (this.onEvict) this.onEvict(file.name);
        }, ttl);

        this.map.set(file.name, cacheFile);
        this.updateAccessOrder(file.name);
        return true;
    }


    get(name) {
        const entry = this.map.get(name);
        if (entry) {
            // Check TTL
            if (Date.now() - entry.addedAt < entry.ttl) {
                this.hits++;
                // Move this file to the end of accessOrder (most recently used)
                this.updateAccessOrder(name);
                this.updateStats();
                return entry.file;
            } else {
                this.remove(name);
                this.misses++;
                this.updateStats();
                return null;
            }
        } else {
            this.misses++;
            this.updateStats();
            return null;
        }
    }

    updateAccessOrder(name) {
        // Remove from current position if exists
        this.accessOrder = this.accessOrder.filter(n => n !== name);
        // Add to end (most recently used)
        this.accessOrder.push(name);
    }

    // Implement LRU eviction
    evictIfNeeded(fileSize = 0) {
        let currentSize = 0;
        for (const entry of this.map.values()) {
            currentSize += entry.file.size;
        }

        // Evict until there's enough space
        while (currentSize + fileSize > cacheSizeLimit && this.accessOrder.length > 0) {
            const lruKey = this.accessOrder.shift(); // Least recently used
            if (this.map.has(lruKey)) {
                const entry = this.map.get(lruKey);
                currentSize -= entry.file.size;
                this.remove(lruKey);
                console.log(`Evicted LRU file: ${lruKey}`);
                if (this.onEvict) this.onEvict(lruKey); // triggers UI/log update
            }
        }
    }





    remove(name) {
        const entry = this.map.get(name);
        if (entry) {
            clearTimeout(entry.timerId);
            this.map.delete(name);
            this.accessOrder = this.accessOrder.filter(n => n !== name);
        }
    }

    updateStats() {
        const hitElem = document.querySelector('.hit');
        const missElem = document.querySelector('.miss');
        const ratioElem = document.querySelector('.ratio');
        console.log(`Hits: ${this.hits}, Misses: ${this.misses}`); // Log hits and misses
        if (hitElem) hitElem.textContent = this.hits;
        if (missElem) missElem.textContent = this.misses;
        const total = this.hits + this.misses;
        ratioElem.textContent = total ? `${Math.round((this.hits / total) * 100)}%` : '0%';
    }
}



const cache = new FileCache();

// ✅ Hook to handle UI and log update when a file is evicted


cache.onEvict = function (fileName) {
    // 1. Log the eviction
    updateOperationLog(fileName, 'DELETE', 'Evicted (LRU)', new Date());

    // 2. Remove from cache UI (panel)
    const fileElem = document.querySelector(`[data-filename="${fileName}"]`);
    if (fileElem) fileElem.remove();

    // 3. Update cache panel "empty state" if needed
    const cachePanel = document.querySelector('.cache-panel .panel-content');
    const fileList = cachePanel?.querySelector('.cache-file-list');
    if (fileList && fileList.children.length === 0) {
        cachePanel.innerHTML = '<p class="empty-state">No files currently cached</p>';
    }

    // 4. Update the Recently Evicted (LRU) list
    const evictedList = document.getElementById('evicted-list');
    if (evictedList) {
        // Remove 'No evicted files' message
        const empty = evictedList.querySelector('.empty-state');
        if (empty) empty.remove();

        // Create new list item
        const li = document.createElement('li');
        li.textContent = `${fileName} (${new Date().toLocaleTimeString()})`;

        // Limit to last 5 evictions
        while (evictedList.children.length >= 5) {
            evictedList.removeChild(evictedList.firstChild);
        }

        evictedList.appendChild(li);
        updateFilesChart(getTotalUsedSize(), cacheSizeLimit);  // ✅ track new usage

    }
};



// ========== HOOK INTO FILE UPLOAD ==========
const fileInput = document.getElementById('file-upload');
const ttlInput = document.getElementById('ttl');
const uploadBtn = document.getElementById('upload-button');

// Enable upload button when file is chosen (TTL can be empty or 0)
function checkUploadReady() {
    uploadBtn.disabled = !(fileInput.files.length);
}
fileInput.addEventListener('change', checkUploadReady);
ttlInput.addEventListener('input', checkUploadReady);

// Upload file to cache
uploadBtn.addEventListener('click', () => {
    const file = fileInput.files[0];
    const ttl = parseInt(ttlInput.value, 10) * 1000; // 1000 seconds to ms
    if (file) {
        // Check if file already exists and is still valid (cache hit)
        const entry = cache.map.get(file.name);
        const isHit = entry && (Date.now() - entry.addedAt < entry.ttl);

        startSimulation(isHit);

        searchFileInCache(file.name); // Log hit/miss and update stats

        console.log("File uploaded:", file.name);
        // Only add to UI and cache if not a hit (i.e., not present or expired)
        if (!isHit) {
            const ttlToUse = ttl > 0 ? ttl : 60000;
            const added = cache.add(file, ttlToUse);

            if (added !== null && added !== false) {
                updateOperationLog(file.name, 'POST', 'Active', new Date(), file.size);
                handleFileUploadUI(file, ttlToUse);
                console.log(`File ${file.name} added to cache with TTL: ${ttlToUse}ms`);
            } else {
                // Even if not added to cache, still log and show in UI
                updateOperationLog(file.name, 'POST', 'Too large for cache', new Date(), file.size);
                handleFileUploadUI(file, 0);  // Show it with 0 TTL
                console.log(`File ${file.name} was too large to cache but shown in UI and log`);
            }
        }


        fileInput.value = '';
        uploadBtn.disabled = true;
        cache.updateStats();
    }
});

// ========== FILE SEARCH (CACHE HIT/MISS DEMO) ==========
// Search for a file in the cache by name and update frontend/console
function searchFileInCache(name) {
    if (!name || typeof name !== "string") {
        console.log("Please provide a valid file name to search.");
        return;
    }
    // Use the cache Map directly for searching
    if (cache.map.has(name)) {
        const entry = cache.map.get(name);
        if (Date.now() - entry.addedAt < entry.ttl) {
            cache.hits++;
            cache.updateStats();
            updateHitMissChart(true);  // ✅ chart update
            console.log(`Cache Hit: ${name}`);
            return entry.file;
        } else {
            cache.map.delete(name);
            cache.misses++;
            cache.updateStats();
            updateHitMissChart(false);  // ✅ chart update
            console.log(`Cache Miss (expired): ${name}`);
            return null;
        }
    } else {
        cache.misses++;
        cache.updateStats();
        updateHitMissChart(false);  // ✅ chart update
        console.log(`Cache Miss: ${name}`);
        return null;
    }

}

// Example usage: searchFileInCache('yourfilename.txt');
// You can call this function from your UI (e.g., on a button click or input field)

// Optionally: update stats on load
cache.updateStats();

// Call this function after a file is uploaded and added to cache
function handleFileUploadUI(file, ttlMs) {
    // 1. Update panel-header with file name and TTL countdown
    const cachePanel = document.querySelector('.cache-panel .panel-content');
    let fileList = cachePanel.querySelector('ul');
    if (!fileList) {
        cachePanel.innerHTML = '';
        fileList = document.createElement('ul');
        fileList.className = 'cache-file-list';
        cachePanel.appendChild(fileList);
    }

    // Remove empty state if present
    const emptyState = cachePanel.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    // Create file entry
    const li = document.createElement('li');
    li.className = 'cache-file-entry';
    li.dataset.filename = file.name;

    // TTL countdown span
    const ttlSpan = document.createElement('span');
    ttlSpan.className = 'ttl-countdown';
    let remaining = Math.floor(ttlMs / 1000);
    ttlSpan.textContent = ttlMs > 0 ? `TTL: ${remaining}s` : 'Not Cached';

    if (ttlMs > 0) {
        const intervalId = setInterval(() => {
            remaining--;
            if (remaining > 0) {
                ttlSpan.textContent = `TTL: ${remaining}s`;
            } else {
                ttlSpan.textContent = `Expired`;
                clearInterval(intervalId);
                li.remove();
                cache.remove(file.name);
                updateOperationLog(file.name, 'Delete', 'Expired', new Date());
                if (!fileList.querySelector('li')) {
                    cachePanel.innerHTML = '<p class="empty-state">No files currently cached</p>';
                }
            }
        }, 1000);
    }


    li.innerHTML = `<strong>${file.name}</strong> `;
    li.appendChild(ttlSpan);
    fileList.appendChild(li);

    // 2. Update operation log table
}

// Helper to update the operation log table
function updateOperationLog(fileName, operation, status, time, fileSize) {
    const tbody = document.querySelector('.logs-panel tbody');
    if (!tbody) return;

    // Remove empty state row if present
    const emptyRow = tbody.querySelector('.empty-state');
    if (emptyRow) emptyRow.remove();

    // Add new row
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td>${fileName}</td>
        <td>${operation}</td>
        <td>${status}</td>
        <td>${fileSize ? formatSize(fileSize) : '-'}</td>
        <td>${time.toLocaleTimeString()}</td>
    `;
    tbody.appendChild(tr);
}

// =========================
// CACHE SIZE SLIDER FUNCTIONALITY
// =========================

function formatSize(bytes) {
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(1) + 'KB';
    return bytes + 'B';
}

let cacheSizeLimit = 1024 * 1024; // 1MB default

const cacheSlider = document.getElementById('cache-slider');
const currentSizeElem = document.querySelector('.current-size');
const submitCacheBtn = document.getElementById('submit-cache');
const sizeDescription = document.querySelector('.size-description');

// Set slider attributes and update .current-size in real time as slider moves
if (cacheSlider) {
    cacheSlider.min = 10 * 1024; // 10KB
    cacheSlider.max = 40 * 1024 * 1024; // 40MB
    cacheSlider.value = cacheSizeLimit;
    currentSizeElem.textContent = formatSize(cacheSizeLimit);

    cacheSlider.addEventListener('input', () => {
        currentSizeElem.textContent = formatSize(Number(cacheSlider.value));
    });
}

// Show a temporary message above .size-description
function showCacheMessage(msg) {
    let msgElem = document.getElementById('cache-msg');
    if (!msgElem) {
        msgElem = document.createElement('div');
        msgElem.id = 'cache-msg';
        msgElem.style.cssText = 'margin-bottom:8px;color:#2196f3;font-weight:600;text-align:center;';
        sizeDescription.parentNode.insertBefore(msgElem, sizeDescription);
    }
    msgElem.textContent = msg;
    msgElem.style.display = 'block';
    clearTimeout(msgElem._timeout);
    msgElem._timeout = setTimeout(() => {
        msgElem.style.display = 'none';
    }, 2500);
}

// Helper to get file size in bytes
function getFileSize(file) {
    return file && file.size ? file.size : 0;
}

// Update cache usage info in slider-panel
function updateCacheUsageInfo() {
    const usedElem = document.querySelector('.cache-used');
    const leftElem = document.querySelector('.cache-left');
    let used = 0;
    for (let entry of cache.map.values()) {
        used += getFileSize(entry.file);
    }
    if (usedElem) usedElem.textContent = `Used: ${formatSize(used)}`;
    if (leftElem) leftElem.textContent = `Left: ${formatSize(Math.max(0, cacheSizeLimit - used))}`;
}
updateCacheUsageInfo();

const originalAdd = cache.add.bind(cache);
cache.add = function (file, ttl) {
    if (getFileSize(file) > cacheSizeLimit) {
        alert('File too large for current cache size!');
        return null;
    }
    let totalSize = 0;
    for (let entry of this.map.values()) {
        totalSize += getFileSize(entry.file);
    }
    if (totalSize + getFileSize(file) > cacheSizeLimit) {
        this.evictIfNeeded && this.evictIfNeeded(getFileSize(file));
        // Recalculate total size after eviction
        totalSize = 0;
        for (let entry of this.map.values()) {
            totalSize += getFileSize(entry.file);
        }
        if (totalSize + getFileSize(file) > cacheSizeLimit) {
            alert('Cache size limit exceeded! File not added.');
            return null;
        }
    }
    const result = originalAdd(file, ttl);
    updateCacheUsageInfo();
    return result;
};
const originalRemove = cache.remove.bind(cache);
cache.remove = function (name) {
    const result = originalRemove(name);
    updateCacheUsageInfo();
    return result;
};

// Apply cache size and clear cache on submit-cache button click
if (submitCacheBtn) {
    submitCacheBtn.addEventListener('click', () => {
        cacheSizeLimit = Number(cacheSlider.value);
        currentSizeElem.textContent = formatSize(cacheSizeLimit);

        // Remove all cached files and UI
        cache.map.forEach((entry, name) => cache.remove(name));
        cache.hits = 0;
        cache.misses = 0;
        cache.updateStats();

        // Clear UI panels
        const cachePanel = document.querySelector('.cache-panel .panel-content');
        if (cachePanel) cachePanel.innerHTML = '<p class="empty-state">No files currently cached</p>';
        const tbody = document.querySelector('.logs-panel tbody');
        if (tbody) tbody.innerHTML = '<tr class="empty-state"><td colspan="5">No operations yet</td></tr>';

        showCacheMessage(`Cache size set to ${formatSize(cacheSizeLimit)}`);
        updateCacheUsageInfo();
        updateFilesChart(getTotalUsedSize(), cacheSizeLimit);

    });
}


// Attach clear cache button event
const clearBtn = document.querySelector('.clear-btn');
if (clearBtn) {
    clearBtn.addEventListener('click', () => {
        cache.map.forEach((entry, name) => cache.remove(name));
        cache.hits = 0;
        cache.misses = 0;
        cache.updateStats();



        // Clear UI panels
        const cachePanel = document.querySelector('.cache-panel .panel-content');
        if (cachePanel) cachePanel.innerHTML = '<p class="empty-state">No files currently cached</p>';
        const tbody = document.querySelector('.logs-panel tbody');
        if (tbody) tbody.innerHTML = '<tr class="empty-state"><td colspan="5">No operations yet</td></tr>';

        updateCacheUsageInfo();
        showCacheMessage('Cache cleared!');
        resetCharts();  // ✅ reset both charts
    });
}

// --- Simulation Animation Logic ---
function connectElements(elem1, elem2, line, container) {
    const containerRect = container.getBoundingClientRect();
    const rect1 = elem1.getBoundingClientRect();
    const rect2 = elem2.getBoundingClientRect();

    const x1 = rect1.left + rect1.width / 2 - containerRect.left;
    const y1 = rect1.top + rect1.height / 2 - containerRect.top;
    const x2 = rect2.left + rect2.width / 2 - containerRect.left;
    const y2 = rect2.top + rect2.height / 2 - containerRect.top;

    const deltaX = x2 - x1;
    const deltaY = y2 - y1;
    const length = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);

    line.style.width = length + "px";
    line.style.transform = `rotate(${angle}deg)`;
    line.style.left = x1 + "px";
    line.style.top = y1 + "px";

    return { x1, y1, x2, y2, angle, distance: length };
}

function updateLines() {
    const container = document.querySelector('.animation-container');
    if (!container) return;
    connectElements(
        document.getElementById('cpu'),
        document.getElementById('cache'),
        document.getElementById('cpu-cache-line'),
        container
    );
    connectElements(
        document.getElementById('cpu'),
        document.getElementById('memory'),
        document.getElementById('cpu-memory-line'),
        container
    );
}

window.startSimulation = function (hit) {
    const status = document.getElementById('status');
    const container = document.querySelector('.animation-container');
    const cpu = document.getElementById('cpu');
    const cache = document.getElementById('cache');
    const memory = document.getElementById('memory');
    const lineCache = document.getElementById('cpu-cache-line');
    const lineMemory = document.getElementById('cpu-memory-line');
    const hFile = document.getElementById('h-file');

    if (hit) {
        status.textContent = 'Status: Cache Hit';

        // CPU → Cache
        const step1 = connectElements(cpu, cache, lineCache, container);
        hFile.classList.remove('animate');
        lineCache.classList.add('green');
        hFile.style.left = `${step1.x1 - 10}px`;
        hFile.style.top = `${step1.y1 - 10}px`;
        hFile.style.transform = `rotate(${step1.angle}deg) translateX(0px)`;

        requestAnimationFrame(() => {
            hFile.classList.add('animate');
            hFile.style.transform = `rotate(${step1.angle}deg) translateX(${step1.distance}px)`;
        });

        // Cache → CPU (back)
        setTimeout(() => {
            hFile.classList.remove('animate');
            hFile.style.transform = `rotate(${step1.angle}deg) translateX(${step1.distance}px)`;

            requestAnimationFrame(() => {
                hFile.classList.add('animate');
                hFile.style.transform = `rotate(${step1.angle}deg) translateX(0px)`;
            });
        }, 2000);

        // Reset after animation
        setTimeout(() => {
            hFile.classList.remove('animate');
            lineCache.classList.remove('green');
            hFile.style.transform = `rotate(${step1.angle}deg) translateX(0px)`;
        }, 4000);

    } else {
        status.textContent = 'Status: Cache Miss';

        // Step 1: CPU → Cache
        const step1 = connectElements(cpu, cache, lineCache, container);
        hFile.classList.remove('animate');
        lineCache.classList.add('green');
        hFile.style.left = `${step1.x1 - 10}px`;
        hFile.style.top = `${step1.y1 - 10}px`;
        hFile.style.transform = `rotate(${step1.angle}deg) translateX(0px)`;

        requestAnimationFrame(() => {
            hFile.classList.add('animate');
            hFile.style.transform = `rotate(${step1.angle}deg) translateX(${step1.distance}px)`;
        });

        // Step 2: Cache → CPU (MISS return) — RED LINE
        setTimeout(() => {
            hFile.classList.remove('animate');
            lineCache.classList.remove('green');
            lineCache.classList.add('red');

            hFile.style.transform = `rotate(${step1.angle}deg) translateX(${step1.distance}px)`;

            requestAnimationFrame(() => {
                hFile.classList.add('animate');
                hFile.style.transform = `rotate(${step1.angle}deg) translateX(0px)`;
            });
        }, 2000);

        // Step 3: CPU → Main Memory (RED LINE)
        setTimeout(() => {
            hFile.classList.remove('animate');
            lineCache.classList.remove('red');

            const step3 = connectElements(cpu, memory, lineMemory, container);
            lineMemory.classList.add('red');

            // Set both top and left to align the start position
            hFile.style.top = `${step3.y1 - 10}px`;
            hFile.style.left = `${step3.x1 - 10}px`;
            hFile.style.transform = `rotate(${step3.angle}deg) translateX(0px)`;

            requestAnimationFrame(() => {
                hFile.classList.add('animate');
                hFile.style.transform = `rotate(${step3.angle}deg) translateX(${step3.distance}px)`;
            });
        }, 4000);


        // Step 4: Main Memory → CPU (GREEN LINE)
        setTimeout(() => {
            hFile.classList.remove('animate');
            lineMemory.classList.remove('red');

            const step4 = connectElements(memory, cpu, lineMemory, container);
            lineMemory.classList.add('green');

            hFile.style.left = `${step4.x1 - 10}px`;
            hFile.style.top = `${step4.y1 - 10}px`;
            hFile.style.transform = `rotate(${step4.angle}deg) translateX(0px)`;

            requestAnimationFrame(() => {
                hFile.classList.add('animate');
                hFile.style.transform = `rotate(${step4.angle}deg) translateX(${step4.distance}px)`;
            });
        }, 6000);

        // Reset everything
        setTimeout(() => {
            hFile.classList.remove('animate');
            hFile.style.transform = `translateX(0px)`;
            lineMemory.classList.remove('green');
        }, 8000);
    }
}

// Modal open/close logic


window.addEventListener('resize', updateLines);



function updateHitMissChart(isHit) {
    if (isHit) hits++;
    else misses++;
    hitsChart.data.datasets[0].data = [hits, misses];
    hitsChart.update();
}


function updateFilesChart(usedBytes, maxBytes) {
    // Prevent divide-by-zero or negative values
    // Clamp minimum visual percentage
    if (usedBytes > 0 && usedBytes / maxBytes < 0.02) {
        usedBytes = maxBytes * 0.02;
    }

    usedBytes = Math.max(0, usedBytes);
    maxBytes = Math.max(usedBytes + 1, maxBytes); // avoid 0 division or used > max

    filesChart.data.datasets[0].data = [usedBytes, maxBytes - usedBytes];
    filesChart.update();
}


function resetCharts() {
    hits = 0;
    misses = 0;
    hitsChart.data.datasets[0].data = [0, 0];
    hitsChart.update();
    updateFilesChart(0, cache.maxSize);
}
