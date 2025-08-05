const axios = require('axios');
const { decrypt } = require('./megacloudDecrypt');
const { itzzzmeDecrypt } = require('./itzzzmeDecrypt');

async function asyncGetKeys() {
    const resolution = await Promise.allSettled([
        require('../megacloud.json'), // If you don't have a locally produced key, remove this line
        fetchKey("yogesh", "https://raw.githubusercontent.com/yogesh-hacker/MegacloudKeys/refs/heads/main/keys.json"),
        // Below key is not up to date, somewhere between v2 and v3 as of 2025-08-04
        // fetchKey("esteven", "https://raw.githubusercontent.com/carlosesteven/e1-player-deobf/refs/heads/main/output/key.json"),
        // Below keys are not v3 keys, they are v2 as of 2025-07-31
        // fetchKey("arion", "https://justarion.github.io/keys/e1-player/src/data/keys.json"),
        // fetchKey("lunar", "https://api.lunaranime.ru/static/key.txt"),
        // fetchKey("itzzzme", "https://raw.githubusercontent.com/itzzzme/megacloud-keys/refs/heads/main/key.txt"),
        // fetchKey("poypoy", "https://raw.githubusercontent.com/poypoy252525/megacloud-keys/refs/heads/main/hianime_key.txt"),
        // fetchKey("zuhaz", "https://raw.githubusercontent.com/zuhaz/key-extractor/refs/heads/main/keys/key-1752248415.txt"),
    ]);

    const keys = resolution.filter(r => r.status === 'fulfilled' && r.value != null).reduce((obj, r) => {
        let rKey = Object.keys(r.value)[0];
        let rValue = Object.values(r.value)[0];
        
        if(typeof rValue === 'string') {
            obj[rKey] = rValue.trim();
            return obj;
        }

        obj[rKey] = rValue?.mega ?? rValue.decryptKey ?? rValue?.MegaCloud?.Anime?.Key ?? rValue?.megacloud?.key ?? rValue?.key ?? rValue.megacloud.anime.key;
        return obj;
    }, {});
    
    if(keys.length === 0) {
        throw new Error("Failed to fetch any decryption key");
    }

    return keys;
}

function fetchKey(name, url, timeout = 1000) {
    return new Promise(async (resolve) => {
        try {
            const { data: key } = await axios({ method: 'get', url: url, timeout: timeout });
            resolve({ [name]: key})
        } catch (error) {
            resolve(null);
        }
    });
}

async function getDecryptedSourceV3(encrypted, nonce) {
    let decrypted = null;
    const keys = await asyncGetKeys();

    for(let key in keys) {
        try {
            if (!encrypted) {
                console.log("Encrypted source missing in response")
                return null;
            }

            decrypted = decrypt(keys[key], nonce, encrypted);

            if(!Array.isArray(decrypted) || decrypted.length <= 0) {
                // Failed to decrypt source
                continue;
            }

            for(let source of decrypted) {
                if(source != null && source?.file?.startsWith('https://')) {
                    // Malformed decrypted source
                    continue;
                }
            }

            console.log("Functioning key:", key);
            return decrypted;

        } catch(error) {
            console.error('Error:', error);
            console.error(`[${ new Date().toLocaleString() }] Key did not work: ${ key }`);
            continue;
        }
    }

    return null;
}

/**
 * Decrypts the sources from a given embed URL by fetching the encryption key and raw source data.
 * The function first extracts the identifier from the embed URL, then retrieves the encryption key
 * and encrypted source data using HTTP GET requests. It decrypts the source data using AES decryption
 * and parses it as JSON. Returns an object indicating the status and result, including sources, tracks,
 * intro, outro, and server data if successful. Logs an error and returns a failure status if any step fails.
 *
 * @param {string} embedUrl - The URL containing the embed source to be decrypted.
 * @returns {Promise<Object>} - An object with status indicating success or failure, and result or error message.
 */
async function decryptSourcesV3(embedUrl) {
    const localDecryptServer = "https://mc.ofchaos.com/api?url=";
    const xraxParams = embedUrl.split('/').pop();
    const xrax = xraxParams.includes('?') ? xraxParams.split('?')[0] : xraxParams;
    const nonce = await getNonce(embedUrl);
    let decryptedSources = null;

    try {
        const { data: rawSourceData } = await axios.get(`https://megacloud.blog/embed-2/v3/e-1/getSources?id=${ xrax }&_k=${ nonce }`);
        const encrypted = rawSourceData?.sources;

        if(rawSourceData?.encrypted == false) {
            decryptedSources = rawSourceData.sources;
        }

        if(decryptedSources == null) {
            // Race fullfillment of methods, we don't care about the order of execution, just the result
            const resolvedSources = await Promise.any([
                // Original decryption method, no longer works, might fix at a later date
                new Promise(async(resolve, reject) => {
                    const result = await getDecryptedSourceV3(encrypted, nonce);
                    if(!result) reject(null);
                    resolve(result);
                }),
                // Fallback option 1, local fastapi server - thanks to https://github.com/carlosesteven/MC_API which isbased on https://github.com/cvznseoiuelsuirvse/megacloudpy
                new Promise(async(resolve, reject) => {
                    const { data: result } = await axios.get(`${ localDecryptServer }${ embedUrl }`);
                    if(!result?.sources) reject(null);
                    resolve(result?.sources);
                }),
                // Fallback option 2, itzzzme/zenime
                new Promise(async(resolve, reject) => {
                    const result = await itzzzmeDecrypt(embedUrl);
                    if(!result) reject(null);
                    resolve(result);
                })
            ]);

            if(!Array.isArray(resolvedSources) || resolvedSources.length <= 0) throw new Error("Failed to decrypt source");

            decryptedSources = [];
            for(let source of resolvedSources) {
                if(source != null && source?.file?.startsWith('https://')) {
                    decryptedSources.push(source);
                }
            }
            
            if(decryptedSources.length <= 0) throw new Error("Failed to decrypt source properly, malformed source");
        }

        return {
            status: true,
            result: {
                sources: decryptedSources,
                tracks: rawSourceData.tracks,
                intro: rawSourceData.intro ?? null,
                outro: rawSourceData.outro ?? null,
                server: rawSourceData.server ?? null
            }
        }
    } catch (error) {
        console.error(`[ERROR][decryptSources] Error decrypting ${ embedUrl }:`, error);
        return {
            status: false,
            error: error?.message || 'Failed to get HLS link'
        };
    }
}

/**
 * Tries to extract the MegaCloud nonce from the given embed URL.
 * 
 * Fetches the HTML of the page, and tries to extract the nonce from it.
 * If that fails, it sends a request with the "x-requested-with" header set to "XMLHttpRequest"
 * and tries to extract the nonce from that HTML.
 * 
 * If all else fails, it logs the HTML of both requests and returns null.
 * 
 * @param {string} embedUrl The URL of the MegaCloud embed
 * @returns {string|null} The extracted nonce, or null if it couldn't be found
 */
async function getNonce(embedUrl) {
    const res = await fetch(embedUrl, { headers: { "referer": "https://anicrush.to/", "x-requested-with": "XMLHttpRequest" } });
    const html = await res.text();

    const match0 = html.match(/\<meta[\s\S]*?name="_gg_fb"[\s\S]*?content="([\s\S]*?)">/);
    if(match0?.[1]) {
        return match0[1];
    }
    
    const match1 = html.match(/_is_th:(\S*?)\s/);
    if(match1?.[1]) {
        return match1[1];
    }

    const match2 = html.match(/data-dpi="([\s\S]*?)"/);
    if(match2?.[1]) {
        return match2[1];
    }

    const match3 = html.match(/_lk_db[\s]?=[\s\S]*?x:[\s]"([\S]*?)"[\s\S]*?y:[\s]"([\S]*?)"[\s\S]*?z:[\s]"([\S]*?)"/);
    if(match3?.[1] && match3?.[2] && match3?.[3]) {
        return "" + match3[1] + match3[2] + match3[3];
    }

    const match4 = html.match(/nonce="([\s\S]*?)"/);
    if(match4?.[1]) {
        if(match4[1].length >= 32) return match4[1];
    }

    const match5 = html.match(/_xy_ws = "(\S*?)"/);
    if(match5?.[1]) {
        return match5[1];
    }

    const match6 = html.match(/[a-zA-Z0-9]{48}]/);
    if(match6?.[1]) {
        return match6[1];
    }

    return null;
}

module.exports = { decryptSourcesV3 };