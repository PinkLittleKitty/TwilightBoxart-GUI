const DB_URL = "NoIntro.db";

class BoxartDb {
    constructor() {
        this.roms = [];
        this.isLoaded = false;
    }

    async load() {
        try {
            console.log("Downloading DB from " + DB_URL);
            const response = await fetch(DB_URL);
            if (!response.ok) throw new Error("Failed to fetch database: " + response.statusText);

            const arrayBuffer = await response.arrayBuffer();
            const compressed = new Uint8Array(arrayBuffer);

            console.log("Decompressing DB...");
            const decompressed = pako.ungzip(compressed, { to: 'string' });

            this.roms = JSON.parse(decompressed);
            this.isLoaded = true;
            console.log(`DB Loaded: ${this.roms.length} entries.`);
            return this.roms.length;
        } catch (e) {
            console.error("DB Load Error:", e);
            throw e;
        }
    }

    find(sha1, titleId, type) {
        if (!this.isLoaded) return null;

        let result = null;

        if (sha1) {
            result = this.roms.find(r => r.Sha1 && r.Sha1.toLowerCase() === sha1.toLowerCase());
        }

        if (!result && titleId && type) {
            result = this.roms.find(r =>
                (r.Serial && r.Serial.toLowerCase() === titleId.toLowerCase()) ||
                (r.TitleId && r.TitleId.toLowerCase() === titleId.toLowerCase())
            );
        }

        return result;
    }
}

window.boxartDb = new BoxartDb();
