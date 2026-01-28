const romInput = document.getElementById('romInput');
const folderInput = document.getElementById('folderInput');
const selectRomsBtn = document.getElementById('selectRomsBtn');
const selectFolderBtn = document.getElementById('selectFolderBtn');
const downloadAllBtn = document.getElementById('downloadAllBtn');
const statusDiv = document.getElementById('status');
const resultsDiv = document.getElementById('results');

const optWidth = document.getElementById('optWidth');
const optHeight = document.getElementById('optHeight');
const optAspectRatio = document.getElementById('optAspectRatio');
const optBorder = document.getElementById('optBorder');
const optBorderColor = document.getElementById('optBorderColor');

const dropZone = document.getElementById('dropZone');

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, highlight, false);
});

['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, unhighlight, false);
});

function highlight(e) {
    dropZone.classList.add('drag-over');
}

function unhighlight(e) {
    dropZone.classList.remove('drag-over');
}

dropZone.addEventListener('drop', handleDrop, false);

async function handleDrop(e) {
    statusDiv.innerText = "Scanning dropped items...";
    const dt = e.dataTransfer;
    const files = [];

    const items = dt.items;
    if (items) {
        const queue = [];
        for (let i = 0; i < items.length; i++) {
            const entry = items[i].webkitGetAsEntry();
            if (entry) queue.push(entry);
        }

        await scanEntries(queue, files);
    } else {
        const droppedFiles = dt.files;
        for (let i = 0; i < droppedFiles.length; i++) {
            files.push(droppedFiles[i]);
        }
    }

    handleFiles(files);
}

async function scanEntries(queue, files) {
    while (queue.length > 0) {
        const entry = queue.shift();
        if (entry.isFile) {
            await new Promise(resolve => {
                entry.file(f => {
                    if (f.name.match(/\.(nds|gba|gbc|gb|nes|sfc|smc|snes|ds|dsi)$/i)) {
                        files.push(f);
                    }
                    resolve();
                }, err => resolve());
            });
        } else if (entry.isDirectory) {
            const reader = entry.createReader();
            const entries = await new Promise(resolve => {
                const all = [];
                const readBatch = () => {
                    reader.readEntries(res => {
                        if (res.length > 0) {
                            all.push(...res);
                            readBatch();
                        } else {
                            resolve(all);
                        }
                    }, err => resolve(all));
                };
                readBatch();
            });

            queue.push(...entries);
        }
    }
}

(async () => {
    statusDiv.innerText = "Loading database... (this may take a moment)";

    try {
        const count = await window.boxartDb.load();
        statusDiv.innerText = `Database loaded! ${count} games found. Add ROMs to start.`;

        selectRomsBtn.disabled = false;
        selectFolderBtn.disabled = false;

        selectRomsBtn.classList.remove('secondary');
        selectRomsBtn.classList.add('primary');
        selectFolderBtn.classList.remove('secondary');
        selectFolderBtn.classList.add('primary');

    } catch (e) {
        statusDiv.innerText = "Error loading database: " + e.message;
        console.error(e);
    }
})();

selectRomsBtn.addEventListener('click', () => {
    romInput.click();
});

selectFolderBtn.addEventListener('click', async () => {
    if ('showDirectoryPicker' in window) {
        try {
            const dirHandle = await window.showDirectoryPicker();
            statusDiv.innerText = "Scanning folder...";
            const files = [];

            async function getFilesRecursively(entry) {
                if (entry.kind === 'file') {
                    const file = await entry.getFile();
                    if (file.name.match(/\.(nds|gba|gbc|gb|nes|sfc|smc|snes|ds|dsi)$/i)) {
                        files.push(file);
                    }
                } else if (entry.kind === 'directory') {
                    for await (const handle of entry.values()) {
                        await getFilesRecursively(handle);
                    }
                }
            }

            await getFilesRecursively(dirHandle);
            handleFiles(files);
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error("Directory picker error:", err);
                statusDiv.innerText = "Error accessing folder. Trying fallback...";
                folderInput.click();
            }
        }
    } else {
        folderInput.click();
    }
});

class WorkerPool {
    constructor(script, size) {
        this.script = script;
        this.size = size || navigator.hardwareConcurrency || 4;
        this.workers = [];
        this.queue = [];
        this.active = 0;

        for (let i = 0; i < this.size; i++) {
            this.workers.push({
                id: i,
                worker: new Worker(script),
                busy: false
            });
        }
    }

    run(data) {
        return new Promise((resolve, reject) => {
            const task = { data, resolve, reject };
            this.queue.push(task);
            this.processNext();
        });
    }

    processNext() {
        if (this.queue.length === 0) return;

        const availableWorker = this.workers.find(w => !w.busy);
        if (!availableWorker) return;

        const task = this.queue.shift();
        availableWorker.busy = true;
        this.active++;

        availableWorker.worker.onmessage = (e) => {
            availableWorker.busy = false;
            this.active--;

            if (e.data.status === 'success') {
                task.resolve(e.data.result);
            } else {
                task.reject(new Error(e.data.error));
            }

            this.processNext();
        };

        availableWorker.worker.postMessage({ ...task.data, id: availableWorker.id });
    }
}

const romWorkerPool = new WorkerPool('worker.js');


const handleFiles = async (files) => {
    const validFiles = files.filter(f => f.name.match(/\.(nds|gba|gbc|gb|nes|sfc|smc|snes|ds|dsi)$/i));

    if (validFiles.length === 0) {
        statusDiv.innerText = "No supported ROM files found in selection.";
        return;
    }

    statusDiv.innerText = `Adding ${validFiles.length} files to queue...`;

    let processedCount = 0;

    validFiles.forEach(async (file) => {
        const itemUI = createPendingUI(file);
        resultsDiv.appendChild(itemUI.element);

        try {
            const romData = await romWorkerPool.run({ file });

            const rom = { ...romData, file };

            updateUIState(itemUI, "Searching...", romData.title || romData.filename);

            const dbMatch = window.boxartDb.find(rom.sha1, rom.titleId, rom.consoleType);

            const resolved = await resolveBoxartImage(rom, dbMatch, itemUI);
            processedItems.push(resolved);

        } catch (err) {
            console.error("Error processing " + file.name, err);
            updateUIState(itemUI, "Error", file.name, "missing");
        } finally {
            processedCount++;
            statusDiv.innerText = `Processed ${processedCount}/${validFiles.length} files...`;
            if (processedItems.some(i => i.found)) {
                downloadAllBtn.disabled = false;
            }
        }
    });
};

romInput.addEventListener('change', (e) => handleFiles(Array.from(e.target.files)));
folderInput.addEventListener('change', (e) => handleFiles(Array.from(e.target.files)));

let processedItems = [];

function createPendingUI(file) {
    const el = document.createElement('div');
    el.className = 'boxart-item';

    const imgContainer = document.createElement('div');
    imgContainer.className = 'boxart-image-container';

    const img = document.createElement('img');
    img.alt = file.name;
    img.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Ctext x='50' y='50' font-family='Arial' font-size='12' text-anchor='middle' dy='.3em' fill='%23777'%3EHashing...%3C/text%3E%3C/svg%3E";

    imgContainer.appendChild(img);

    const nameEl = document.createElement('div');
    nameEl.className = 'boxart-name';
    nameEl.innerText = file.name;

    const statusEl = document.createElement('div');
    statusEl.className = 'boxart-status';
    statusEl.innerText = "Reading...";

    el.appendChild(imgContainer);
    el.appendChild(nameEl);
    el.appendChild(statusEl);

    return {
        element: el,
        img: img,
        nameEl: nameEl,
        statusEl: statusEl
    };
}

function updateUIState(ui, statusText, nameText, statusClass) {
    ui.statusEl.innerText = statusText;
    if (nameText) ui.nameEl.innerText = nameText;
    if (statusClass) ui.statusEl.classList.add(statusClass);
}


async function resolveBoxartImage(rom, dbMatch, ui) {
    const candidates = getBoxartCandidates(rom, dbMatch);
    let finalUrl = null;
    let found = false;

    const tryLoad = (url) => {
        return new Promise((resolve, reject) => {
            const tempImg = new Image();
            tempImg.crossOrigin = "Anonymous";
            tempImg.onload = () => resolve(url);
            tempImg.onerror = () => reject();
            tempImg.src = url;
        });
    };

    if (candidates.length > 0) {
        for (const rawUrl of candidates) {
            try {
                const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(rawUrl)}&output=png`;
                await tryLoad(proxyUrl);
                finalUrl = proxyUrl;
                found = true;
                break;
            } catch (e) { }
        }
    }

    if (found) {
        ui.img.src = finalUrl;
        ui.img.crossOrigin = "Anonymous";
        ui.statusEl.innerText = "Found";
        ui.statusEl.classList.add('found');
    } else {
        ui.img.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Ctext x='50' y='50' font-family='Arial' font-size='20' text-anchor='middle' dy='.3em' fill='%23555'%3E?%3C/text%3E%3C/svg%3E";
        ui.statusEl.innerText = "Missing";
        ui.statusEl.classList.add('missing');
    }

    return {
        ...ui,
        url: finalUrl,
        found
    };
}

function getBoxartCandidates(rom, dbMatch) {
    const urls = [];

    if (dbMatch && dbMatch.Name) {
        const consoleStr = mapConsoleTypeToLibRetro(rom.consoleType);
        if (consoleStr) {
            const cleanName = sanitizeLibRetroName(dbMatch.Name);
            const encodedName = encodeURIComponent(cleanName).replace(/%3B/g, ';');
            urls.push(`https://github.com/libretro-thumbnails/${consoleStr}/raw/master/Named_Boxarts/${encodedName}.png`);
        }
    }

    if ((rom.consoleType === 'NintendoDS' || rom.consoleType === 'NintendoDSi') && rom.titleId) {
        const region = getGameTdbRegion(rom.regionId);
        urls.push(`https://art.gametdb.com/ds/coverHQ/${region}/${rom.titleId}.png`);
    }

    return urls;
}

function getGameTdbRegion(regionId) {
    switch (regionId) {
        case 'E': case 'T': return 'US';
        case 'J': return 'JA';
        case 'K': return 'KO';
        case 'O': case 'P': case 'U': return 'EN';
        case 'D': return 'DE';
        case 'F': return 'FR';
        case 'H': return 'NL';
        case 'I': return 'IT';
        case 'R': return 'RU';
        case 'S': return 'ES';
        default: return 'EN';
    }
}

function mapConsoleTypeToLibRetro(type) {
    const map = {
        'NintendoDS': 'Nintendo_-_Nintendo_DS',
        'NintendoDSi': 'Nintendo_-_Nintendo_DSi',
        'GameBoyAdvance': 'Nintendo_-_Game_Boy_Advance',
        'GameBoy': 'Nintendo_-_Game_Boy',
        'GameBoyColor': 'Nintendo_-_Game_Boy_Color',
        'NintendoEntertainmentSystem': 'Nintendo_-_Nintendo_Entertainment_System',
        'SuperNintendoEntertainmentSystem': 'Nintendo_-_Super_Nintendo_Entertainment_System',
        'SegaGenesis': 'Sega_-_Mega_Drive_-_Genesis'
    };
    return map[type];
}

function sanitizeLibRetroName(name) {
    return name.replace(/[&*/:`<>?\|]/g, '_');
}

async function processImage(imgUrl, options) {
    let proxyUrl = imgUrl;
    if (!imgUrl.includes("images.weserv.nl")) {
        proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(imgUrl)}&output=png`;
    }

    const img = new Image();
    img.crossOrigin = "Anonymous";
    await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = proxyUrl;
    });

    const targetW = parseInt(options.width);
    const targetH = parseInt(options.height);

    let drawW = targetW;
    let drawH = targetH;
    let offsetX = 0;
    let offsetY = 0;

    if (options.keepAspectRatio) {
        const ratio = Math.min(targetW / img.width, targetH / img.height);
        drawW = img.width * ratio;
        drawH = img.height * ratio;
    }

    const canvas = document.createElement('canvas');
    canvas.width = drawW;
    canvas.height = drawH;
    const ctx = canvas.getContext('2d');

    ctx.drawImage(img, 0, 0, drawW, drawH);

    if (options.border && options.border !== 'None') {
        await applyBorder(ctx, canvas, options.border, options.borderColor);
    }

    return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

async function applyBorder(ctx, canvas, borderType, borderColor) {
    if (borderType === 'Line') {
        const w = canvas.width;
        const h = canvas.height;
        const thickness = 2;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, w - 2, h - 2);
    } else if (borderType === 'DSi' && ImgLib.DSi) {
        const original = ctx.getImageData(0, 0, canvas.width, canvas.height);

        const newCanvas = document.createElement('canvas');
        newCanvas.width = canvas.width + 8;
        newCanvas.height = canvas.height + 8;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        tempCanvas.getContext('2d').drawImage(canvas, 0, 0);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.drawImage(tempCanvas, 4, 4, canvas.width - 8, canvas.height - 8);

        await drawImgLibBorder(ctx, canvas.width, canvas.height, ImgLib.DSi);

    } else if (borderType === '3DS' && ImgLib.N3DS) {

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        tempCanvas.getContext('2d').drawImage(canvas, 0, 0);

        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.drawImage(tempCanvas, 6, 4, canvas.width - 12, canvas.height - 11);

        await drawImgLibBorder(ctx, canvas.width, canvas.height, ImgLib.N3DS);
    }
}

async function drawImgLibBorder(ctx, canvasW, canvasH, data) {
    const borderImg = new Image();
    await new Promise(r => { borderImg.onload = r; borderImg.src = "data:image/png;base64," + data.Data; });

    const drawSlice = (sx, sy, sw, sh, dx, dy) => {
        ctx.drawImage(borderImg, sx, sy, sw, sh, dx, dy, sw, sh);
    };

    const getCornerCanvas = (coords) => {
        const c = document.createElement('canvas');
        c.width = data.CornerWidth;
        c.height = data.CornerHeight;
        const cctx = c.getContext('2d');
        cctx.drawImage(borderImg, coords.CornerX, coords.CornerY);
        return c;
    }

    const corners = data.Coords.map(getCornerCanvas);

    ctx.drawImage(corners[0], 0, 0);
    ctx.drawImage(corners[1], canvasW - data.CornerWidth, 0);
    ctx.drawImage(corners[2], canvasW - data.CornerWidth, canvasH - data.CornerHeight);
    ctx.drawImage(corners[3], 0, canvasH - data.CornerHeight);

    const getEdgeTile = (cycle, horizontal) => {
        const coords = data.Coords[cycle];
        const w = horizontal ? data.BorderWidth : data.BorderHeight;
        const h = horizontal ? data.BorderHeight : data.BorderWidth;

        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const cctx = c.getContext('2d');
        cctx.drawImage(borderImg, coords.BorderX, coords.BorderY);
        return c;
    };

    const topTile = getEdgeTile(0, true);
    for (let x = data.CornerWidth; x < canvasW - data.CornerWidth; x++) ctx.drawImage(topTile, x, 0);

    const rightTile = getEdgeTile(1, false);
    for (let y = data.CornerHeight; y < canvasH - data.CornerHeight; y++) ctx.drawImage(rightTile, canvasW - data.BorderHeight, y); // Width swapped?

    const botTile = getEdgeTile(2, true);
    for (let x = data.CornerWidth; x < canvasW - data.CornerWidth; x++) ctx.drawImage(botTile, x, canvasH - data.BorderHeight);

    const leftTile = getEdgeTile(3, false);
    for (let y = data.CornerHeight; y < canvasH - data.CornerHeight; y++) ctx.drawImage(leftTile, 0, y);
}

downloadAllBtn.addEventListener('click', async () => {
    const zip = new JSZip();
    const folder = zip.folder("boxart");

    let counting = 0;
    statusDiv.innerText = "Processing images and zipping... (This might take a while)";

    const options = {
        width: optWidth.value,
        height: optHeight.value,
        keepAspectRatio: optAspectRatio.checked,
        border: optBorder.value,
        borderColor: optBorderColor.value
    };

    for (const item of processedItems) {
        if (item.url) {
            try {
                const blob = await processImage(item.url, options);

                const filename = item.rom.filename + ".png";
                folder.file(filename, blob);
                counting++;
            } catch (e) {
                console.warn("Failed to process " + item.url, e);
            }
        }
    }

    if (counting > 0) {
        const content = await zip.generateAsync({ type: "blob" });
        saveAs(content, "boxart_processed.zip");
        statusDiv.innerText = `Downloaded ${counting} covers!`;
    } else {
        statusDiv.innerText = "No covers could be downloaded.";
    }
});
