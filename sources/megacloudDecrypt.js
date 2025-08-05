const CHARSET = Array.from({ length: 95 }, (_, i) => String.fromCharCode(i + 32));

/**
 * Computes a key based on the given secret and nonce.
 * The key is used to "unlock" the encrypted data.
 * The computation of the key is based on the following steps:
 * 1. Concatenate the secret and nonce.
 * 2. Compute a hash value of the concatenated string using a simple
 *    hash function (similar to Java's String.hashCode()).
 * 3. Compute the remainder of the hash value divided by the maximum
 *    value of a 64-bit signed integer.
 * 4. Use the result as a XOR mask to process the characters of the
 *    concatenated string.
 * 5. Rotate the XOR-processed string by a shift amount equal to the
 *    hash value modulo the length of the XOR-processed string plus 5.
 * 6. Interleave the rotated string with the reversed nonce string.
 * 7. Take a substring of the interleaved string of length equal to 96
 *    plus the hash value modulo 33.
 * 8. Convert each character of the substring to a character code
 *    between 32 and 126 (inclusive) by taking the remainder of the
 *    character code divided by 95 and adding 32.
 * 9. Join the resulting array of characters into a string and return it.
 * @param {string} secret - The secret string
 * @param {string} nonce - The nonce string
 * @returns {string} The computed key
 */
function computeKey(secret, nonce) {
    const secretAndNonce = secret + nonce;
    let hashValue = 0n;

    for (const char of secretAndNonce) {
        hashValue = BigInt(char.charCodeAt(0)) + hashValue * 31n + (hashValue << 7n) - hashValue;
    }

    const maximum64BitSignedIntegerValue = 0x7fffffffffffffffn;
    const hashValueModuloMax = hashValue % maximum64BitSignedIntegerValue;

    const xorMask = 247;
    const xorProcessedString = [...secretAndNonce]
        .map(char => String.fromCharCode(char.charCodeAt(0) ^ xorMask))
        .join('');

    const xorLen = xorProcessedString.length;
    const shiftAmount = (Number(hashValueModuloMax) % xorLen) + 5;
    const rotatedString = xorProcessedString.slice(shiftAmount) + xorProcessedString.slice(0, shiftAmount);

    const reversedNonceString = nonce.split('').reverse().join('');

    let interleavedString = '';
    const maxLen = Math.max(rotatedString.length, reversedNonceString.length);
    for (let i = 0; i < maxLen; i++) {
        interleavedString += (rotatedString[i] || '') + (reversedNonceString[i] || '');
    }

    const length = 96 + (Number(hashValueModuloMax) % 33);
    const partialString = interleavedString.substring(0, length);

    return [...partialString]
        .map(ch => String.fromCharCode((ch.charCodeAt(0) % 95) + 32))
        .join('');
}

/**
 * Encrypts a given text using a columnar transposition cipher with a given key.
 * The function arranges the text into a grid of columns and rows determined by the key length,
 * fills the grid column by column based on the sorted order of the key characters,
 * and returns the encrypted text by reading the grid row by row.
 * 
 * @param {string} text - The text to be encrypted.
 * @param {string} key - The key that determines the order of columns in the grid.
 * @returns {string} The encrypted text.
 */
function columnarCipher(text, key) {
    const columns = key.length;
    const rows = Math.ceil(text.length / columns);

    const grid = Array.from({ length: rows }, () => Array(columns).fill(''));
    const columnOrder = [...key]
        .map((char, idx) => ({ char, idx }))
        .sort((a, b) => a.char.charCodeAt(0) - b.char.charCodeAt(0));

    let i = 0;
    for (const { idx } of columnOrder) {
        for (let row = 0; row < rows; row++) {
            grid[row][idx] = text[i++] || '';
        }
    }

    return grid.flat().join('');
}

/**
 * Deterministically unshuffles an array of characters based on a given key phrase.
 * The function simulates a pseudo-random shuffling using a numeric seed derived
 * from the key phrase. This ensures that the same character array and key phrase
 * will always produce the same output, allowing for deterministic "unshuffling".
 * @param {Array} characters - The array of characters to unshuffle.
 * @param {string} keyPhrase - The key phrase used to generate the seed for the 
 *                             pseudo-random number generator.
 * @returns {Array} A new array representing the deterministically unshuffled characters.
 */
function deterministicUnshuffle(characters, keyPhrase) {
    let seed = [...keyPhrase].reduce((acc, char) => (acc * 31n + BigInt(char.charCodeAt(0))) & 0xffffffffn, 0n);

    const randomNumberGenerator = (upperLimit) => {
        seed = (seed * 1103515245n + 12345n) & 0x7fffffffn;
        return Number(seed % BigInt(upperLimit));
    };

    const shuffledCharacters = characters.slice();
    for (let i = shuffledCharacters.length - 1; i > 0; i--) {
        const j = randomNumberGenerator(i + 1);
        [shuffledCharacters[i], shuffledCharacters[j]] = [shuffledCharacters[j], shuffledCharacters[i]];
    }

    return shuffledCharacters;
}

/**
 * Decrypts an encrypted text using a secret key and a nonce through multiple rounds of decryption.
 * The decryption process includes base64 decoding, character substitution using a pseudo-random 
 * number generator, a columnar transposition cipher, and deterministic unshuffling of the character set.
 * Finally, it extracts and parses the decrypted JSON string or verifies it using a regex pattern.
 * 
 * @param {string} secretKey - The key used to decrypt the text.
 * @param {string} nonce - A nonce for additional input to the decryption key.
 * @param {string} encryptedText - The text to be decrypted, encoded in base64.
 * @param {number} [rounds=3] - The number of decryption rounds to perform.
 * @returns {Object|null} The decrypted JSON object if successful, or null if parsing fails.
 */
function decrypt(secretKey, nonce, encryptedText, rounds = 3) {
    let decryptedText = Buffer.from(encryptedText, 'base64').toString('utf-8');
    const keyPhrase = computeKey(secretKey, nonce);

    for (let round = rounds; round >= 1; round--) {
        const encryptionPassphrase = keyPhrase + round;

        let seed = [...encryptionPassphrase].reduce((acc, char) => (acc * 31n + BigInt(char.charCodeAt(0))) & 0xffffffffn, 0n);
        const randomNumberGenerator = (upperLimit) => {
            seed = (seed * 1103515245n + 12345n) & 0x7fffffffn;
            return Number(seed % BigInt(upperLimit));
        };

        decryptedText = [...decryptedText]
            .map(char => {
                const charIndex = CHARSET.indexOf(char);
                if (charIndex === -1) return char;
                const offset = randomNumberGenerator(95);
                return CHARSET[(charIndex - offset + 95) % 95];
            })
            .join('');

        decryptedText = columnarCipher(decryptedText, encryptionPassphrase);

        const shuffledCharset = deterministicUnshuffle(CHARSET, encryptionPassphrase);
        const mappingArr = {};
        shuffledCharset.forEach((c, i) => (mappingArr[c] = CHARSET[i]));
        decryptedText = [...decryptedText].map(char => mappingArr[char] || char).join('');
    }
    const lengthString = decryptedText.slice(0, 4);
    let length = parseInt(lengthString, 10);
    if (isNaN(length) || length <= 0 || length > decryptedText.length - 4) {
        console.error('Invalid length in decrypted string');
        return decryptedText;
    }

    const decryptedString = decryptedText.slice(4, 4 + length);

    try {
        return JSON.parse(decryptedString);
    } catch(e) {
        console.warn('Could not parse decrypted string, unlikely to be valid. Using regex to verify');
        const regex = /"file":"(.*?)".*?"type":"(.*?)"/;
        const match = encryptedText.match(regex);
        const matchedFile = match?.[1];
        const matchType = match?.[2];
        
        if(!matchedFile || !matchType) {
            console.error('Could not match file or type in decrypted string');
            return null;
        }

        return decryptedString;
    }
}

module.exports = { decrypt };