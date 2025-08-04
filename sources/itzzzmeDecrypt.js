// Fallback method 1, itzzzme/zenanime

async function itzzzmeDecrypt(embedUrl) {
    // It takes it with the ?z= param, but not consistently, hence the need to remove it and replace it with the expected value for this api service
    const embedUrlWithoutParams = embedUrl.split('?')[0];
    const response = await fetch(`https://decrypt.zenime.site/extract?embed_url=${ embedUrlWithoutParams }?k=1&autoPlay=0&oa=0&asi=1`);
    const decryptedSource = await response.json();

    if(
        decryptedSource?.success == false ||
        decryptedSource?.error != null ||
        decryptedSource?.data?.sources?.[0]?.file == null
    ) {
        return null;
    }

    return decryptedSource.data.sources[0].file;
}

module.exports = { itzzzmeDecrypt };