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
 *    hash value modulo the length of the XOR-processed string plus 7.
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

    for (let i = 0, len = secretAndNonce.length; i < len; i++) {
        hashValue += hashValue * 173n + BigInt(secretAndNonce.charCodeAt(i));
    }

    const maximum64BitSignedIntegerValue = 0x7fffffffffffffffn;
    const hashValueModuloMax = hashValue % maximum64BitSignedIntegerValue;

    const xorProcessedCharacters = new Array(secretAndNonce.length);
    const xorMask = 15835827 & 0xff;
    for (let i = 0; i < secretAndNonce.length; i++) {
        xorProcessedCharacters[i] = String.fromCharCode(secretAndNonce.charCodeAt(i) ^ xorMask);
    }
    const xorProcessedString = xorProcessedCharacters.join('');

    const xorLen = xorProcessedString.length;
    const shiftAmount = (Number(hashValueModuloMax) % xorLen) + 7;
    const rotatedString = xorProcessedString.slice(shiftAmount) + xorProcessedString.slice(0, shiftAmount);

    const reversedNonceString = nonce.split('').reverse().join('');

    const maxLen = Math.max(rotatedString.length, reversedNonceString.length);
    let interleavedArr = new Array(maxLen * 2);
    for (let i = 0, idx = 0; i < maxLen; i++) {
        if (i < rotatedString.length) interleavedArr[idx++] = rotatedString[i];
        if (i < reversedNonceString.length) interleavedArr[idx++] = reversedNonceString[i];
    }
    const interleavedString = interleavedArr.join('');

    const length = 96 + (Number(hashValueModuloMax) % 33);
    const partialString = interleavedString.substring(0, length);

    let resultArr = new Array(partialString.length);
    for (let i = 0; i < partialString.length; i++) {
        resultArr[i] = String.fromCharCode((partialString.charCodeAt(i) % 95) + 32);
    }
    return resultArr.join('');
}

/**
 * Encrypts a given text using a columnar transposition cipher with a given key.
 * The key is used to determine the column order of the grid, and the text is
 * written into the grid column by column, row by row. The resulting ciphertext
 * is the concatenation of the characters in the grid, read row by row.
 * @param {string} text The text to encrypt.
 * @param {string} key The key to use for the cipher.
 * @returns {string} The encrypted ciphertext.
 */
function columnarCipher(text, key) {
    const columns = key.length;
    const rows = Math.ceil(text.length / columns);

    const columnOrder = [...key]
        .map((char, idx) => ({ char, idx }))
        .sort((a, b) => a.char.charCodeAt(0) - b.char.charCodeAt(0))
        .map(obj => obj.idx);

    const result = new Array(rows * columns).fill('');
    let charIdx = 0;

    for (let col = 0; col < columns; col++) {
        const columnIndex = columnOrder[col];
        for (let row = 0; row < rows; row++) {
            const gridIdx = row * columns + columnIndex;
            result[gridIdx] = text[charIdx++] || '';
        }
    }

    return result.join('');
}

/**
 * Deterministically unshuffles an array of characters based on a given key phrase.
 * 
 * The function simulates a pseudo-random shuffling using a numeric seed derived
 * from the key phrase. This ensures that the same character array and key phrase
 * will always produce the same output, allowing for deterministic "unshuffling".
 * 
 * @param {Array} characters - The array of characters to unshuffle.
 * @param {string} keyPhrase - The key phrase used to generate the seed for the 
 *                             pseudo-random number generator.
 * @returns {Array} A new array representing the deterministically unshuffled characters.
 */
function deterministicUnshuffle(characters, keyPhrase) {
    let seed = 0n;
    for (let i = 0; i < keyPhrase.length; i++) {
        seed = (seed * 31n + BigInt(keyPhrase.charCodeAt(i))) & 0xffffffffn;
    }

    const randomNumberGenerator = (upperLimit) => {
        seed = (seed * 1103515245n + 12345n) & 0x7fffffffn;
        return Number(seed % BigInt(upperLimit));
    };

    const shuffledCharacters = characters.slice();
    for (let i = shuffledCharacters.length - 1; i > 0; i--) {
        const j = randomNumberGenerator(i + 1);
        const temp = shuffledCharacters[i];
        shuffledCharacters[i] = shuffledCharacters[j];
        shuffledCharacters[j] = temp;
    }

    return shuffledCharacters;
}

/**
 * Decrypts an encrypted text using the provided secret key and nonce.
 * The function runs a total of 3 rounds of decryption, using the given key
 * phrase and a varying round number to generate a seed for the pseudo-random
 * number generator for each round. The seed is used to shuffle the characters
 * of the given character set in a deterministic manner. The shuffled character
 * set is then used to perform a substitution cipher on the encrypted text.
 * The decrypted text is then fed into a columnar transposition cipher, which
 * rearranges the characters based on the key phrase. The resulting text is
 * returned as the final decrypted result.
 * @param {string} secretKey - The secret key used for decryption.
 * @param {string} nonce - The nonce used for decryption.
 * @param {string} encryptedText - The encrypted text to decrypt.
 * @param {number} rounds - The number of decryption rounds to run. Defaults to 3.
 * @returns {string} The decrypted text.
 */
function decrypt(secretKey, nonce, encryptedText, rounds = 3) {
    let decryptedText = Buffer.from(encryptedText, 'base64').toString('utf-8');
    const keyPhrase = computeKey(secretKey, nonce);

    for (let round = rounds; round >= 1; round--) {
        const encryptionPassphrase = keyPhrase + round;

        let encryptionSeed = 0n;
        for (let i = 0; i < encryptionPassphrase.length; i++) {
            encryptionSeed = (encryptionSeed * 31n + BigInt(encryptionPassphrase.charCodeAt(i))) & 0xffffffffn;
        }
        const randomGenerator = (limit) => {
            encryptionSeed = (encryptionSeed * 1103515245n + 12345n) & 0x7fffffffn;
            return Number(encryptionSeed % BigInt(limit));
        };

        let tempArr = new Array(decryptedText.length);
        for (let i = 0; i < decryptedText.length; i++) {
            const char = decryptedText[i];
            const charIndex = CHARSET.indexOf(char);
            if (charIndex === -1) {
                tempArr[i] = char;
            } else {
                const offset = randomGenerator(95);
                tempArr[i] = CHARSET[(charIndex - offset + 95) % 95];
            }
        }
        decryptedText = tempArr.join('');

        decryptedText = columnarCipher(decryptedText, encryptionPassphrase);

        const shuffledCharset = deterministicUnshuffle(CHARSET, encryptionPassphrase);
        let mappingArr = new Array(95);
        for (let i = 0; i < 95; i++) {
            mappingArr[shuffledCharset[i].charCodeAt(0) - 32] = CHARSET[i];
        }
        tempArr = new Array(decryptedText.length);
        for (let i = 0; i < decryptedText.length; i++) {
            const code = decryptedText.charCodeAt(i) - 32;
            tempArr[i] = mappingArr[code] || decryptedText[i];
        }
        decryptedText = tempArr.join('');
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