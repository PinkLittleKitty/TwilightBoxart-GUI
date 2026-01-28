self.onmessage = async (e) => {
    const { file, id } = e.data;

    try {
        const result = await parseRom(file);
        self.postMessage({ id, status: 'success', result });
    } catch (err) {
        self.postMessage({ id, status: 'error', error: err.message });
    }
};

async function parseRom(file) {
    const buffer = await readFile(file);
    const header = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 512));

    const filename = file.name;
    const ext = filename.split('.').pop().toLowerCase();

    const sha1 = await computeSha1(buffer);

    let titleId = null;
    let title = null;
    let consoleType = guessConsoleType(ext);
    let regionId = 'O';

    if (consoleType === 'NintendoDS' || consoleType === 'NintendoDSi') {
        const decoder = new TextDecoder("utf-8");
        title = decoder.decode(header.slice(0, 12)).replace(/\0/g, '');
        titleId = decoder.decode(header.slice(12, 16)).replace(/\0/g, '');
        regionId = String.fromCharCode(header[15]);
    }
    else if (consoleType === 'GameBoyAdvance') {
        const decoder = new TextDecoder("utf-8");
        titleId = decoder.decode(header.slice(0xAC, 0xAC + 4)).replace(/\0/g, '');
    }

    return {
        filename,
        ext,
        sha1,
        titleId,
        title,
        consoleType,
        regionId
    };
}

function readFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

async function computeSha1(buffer) {
    const hashBuffer = await crypto.subtle.digest('SHA-1', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function guessConsoleType(ext) {
    const map = {
        'nds': 'NintendoDS',
        'ds': 'NintendoDS',
        'dsi': 'NintendoDSi',
        'gba': 'GameBoyAdvance',
        'gb': 'GameBoy',
        'gbc': 'GameBoyColor',
        'nes': 'NintendoEntertainmentSystem',
        'snes': 'SuperNintendoEntertainmentSystem',
        'sfc': 'SuperNintendoEntertainmentSystem',
        'smc': 'SuperNintendoEntertainmentSystem',
        'gen': 'SegaGenesis',
        'md': 'SegaGenesis',
        'sms': 'SegaMasterSystem',
        'gg': 'SegaGameGear'
    };
    return map[ext] || 'Unknown';
}
