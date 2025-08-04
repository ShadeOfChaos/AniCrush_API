// Fallback method 1, itzzzme/zenime

async function itzzzmeDecrypt(embedUrl) {
    try {
        // It takes it with the ?z= param, but not consistently, hence the need to remove it and replace it with the expected value for this api service
        const embedUrlWithoutParams = embedUrl.split('?')[0];
        const response = await fetch(`https://decrypt.zenime.site/extract?embed_url=${embedUrlWithoutParams}?k=1&autoPlay=0&oa=0&asi=1`, { timeout: 10000 });
        if (!response.ok) {
            throw new Error('Failed to connect to server');
        }
        const decryptedSource = await response.json();

        if (
            decryptedSource?.success == false ||
            decryptedSource?.error != null ||
            decryptedSource?.data?.sources?.[0]?.file == null
        ) {
            throw new Error('Error returned from zenime server: ', decryptedSource);
        }

        return decryptedSource.data.sources;
    } catch (e) {
        console.log('An error occured in itzzzmeDecrypt:', e);
        return null;
    }
}

module.exports = { itzzzmeDecrypt };