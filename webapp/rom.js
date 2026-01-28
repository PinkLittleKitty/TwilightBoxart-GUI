class RomParser {
    static async parse(file) {
        const buffer = await this.readFile(file);
        const header = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 512));

        const filename = file.name;
        const ext = filename.split('.').pop().toLowerCase();

        let sha1 = await this.computeSha1(buffer);

        let titleId = null;
        let title = null;
        let consoleType = this.guessConsoleType(ext);
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
            file,
            filename,
            ext,
            sha1,
            titleId,
            title,
            consoleType,
            regionId
        };
    }

    static readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    static async computeSha1(buffer) {
        const hashBuffer = await crypto.subtle.digest('SHA-1', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    static guessConsoleType(ext) {
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
}
