const axios = require('axios');
const CryptoJS = require("crypto-js");

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

async function decryptSources(embedUrl) {
    const xraxParams = embedUrl.split('/').pop();
    const xrax = xraxParams.includes('?') ? xraxParams.split('?')[0] : xraxParams;

    try {
        const { data: key } = await axios.get("https://raw.githubusercontent.com/itzzzme/megacloud-keys/refs/heads/main/key.txt");
        const { data: rawSourceData } = await axios.get(`https://megacloud.blog/embed-2/v2/e-1/getSources?id=${ xrax }`);
        const encrypted = rawSourceData?.sources;
        let decryptedSources;

        if (!encrypted) throw new Error("Encrypted source missing in response");
        const decrypted = CryptoJS.AES.decrypt(encrypted, key).toString(
            CryptoJS.enc.Utf8
        );

        if (!decrypted) throw new Error("Failed to decrypt source");

        try {
            decryptedSources = JSON.parse(decrypted);
        } catch (e) {
            throw new Error("Decrypted data is not valid JSON");
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
            error: error.message || 'Failed to get HLS link'
        };
    }
}

module.exports = { decryptSources };