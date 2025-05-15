const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

class EmbedSource {
    constructor(file, sourceType) {
        this.file = file;
        this.type = sourceType;
    }
}

class Track {
    constructor(file, label, kind, isDefault = false) {
        this.file = file;
        this.label = label;
        this.kind = kind;
        if (isDefault) {
            this.default = isDefault;
        }
    }
}

class EmbedSources {
    constructor(sources = [], tracks = [], t = 0, server = 1, intro = null, outro = null) {
        this.sources = sources;
        this.tracks = tracks;
        this.t = t;
        this.server = server;
        if (intro) this.intro = intro;
        if (outro) this.outro = outro;
    }
}

const findRabbitScript = async () => {
    const possiblePaths = [
        path.join(__dirname, 'sources', 'rabbit.ts'),
        path.join(__dirname, 'sources', 'rabbit.js'),
        path.join(__dirname, 'rabbit.js'),
        path.join(process.cwd(), 'rabbit.js')
    ];

    for (const p of possiblePaths) {
        try {
            await fs.access(p);
            return p;
        } catch (error) {
            continue;
        }
    }
    throw new Error('rabbit.js not found in any expected locations');
};

const handleEmbed = async (embedUrl, referrer) => {
    return new Promise(async (resolve, reject) => {
        try {
            const rabbitPath = await findRabbitScript();
            const childProcess = spawn('node', [
                rabbitPath,
                `--embed-url=${embedUrl}`,
                `--referrer=${referrer}`
            ]);

            let outputData = '';
            let errorData = '';

            childProcess.stdout.on('data', (data) => {
                outputData += data.toString();
            });

            childProcess.stderr.on('data', (data) => {
                errorData += data.toString();
            });

            childProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Process exited with code ${code}: ${errorData}`));
                    return;
                }

                try {
                    const parsedOutput = JSON.parse(outputData.trim());
                    const embedSources = new EmbedSources(
                        parsedOutput.sources.map(s => new EmbedSource(s.file, s.type)),
                        parsedOutput.tracks.map(t => new Track(t.file, t.label, t.kind, t.default)),
                        parsedOutput.t,
                        parsedOutput.server,
                        parsedOutput.intro,
                        parsedOutput.outro
                    );
                    resolve(embedSources);
                } catch (error) {
                    reject(error);
                }
            });

            childProcess.on('error', (error) => {
                reject(error);
            });
        } catch (error) {
            reject(error);
        }
    });
};

module.exports = {
    handleEmbed,
    EmbedSource,
    Track,
    EmbedSources
}; 