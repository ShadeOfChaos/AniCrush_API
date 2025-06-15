const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { getCommonHeaders } = require('./mapper');
const { getHlsLink } = require('./hls');
const { getGenericHlsLink } = require('./genericHls');
const { decryptSources } = require('./sources/getEmbedSource');
require('dotenv').config();

const app = express();

const PORT = process.env.PORT;

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

app.get('/', async(req, res) => {
    res.writeHead(403, {'Content-Type': 'text/plain'});
    res.end();
});

app.get('/api/anime/search', async (req, res) => {
    try {
        const { keyword, page = 1, limit = 24 } = req.query;

        if (!keyword) {
            return res.status(400).json({ error: 'Search keyword is required' });
        }

        const headers = getCommonHeaders();

        const response = await axios({
            method: 'GET',
            url: `https://api.anicrush.to/shared/v2/movie/list`,
            params: {
                keyword,
                page,
                limit
            },
            headers
        });

        res.json(response.data);
    } catch (error) {
        console.error('Error searching anime:', error);
        res.status(500).json({
            error: 'Failed to search anime',
            message: error.message
        });
    }
});

app.get('/api/anime/info/:movieId', async (req, res) => {
    try {
        const { movieId } = req.params;

        if (!movieId) {
            return res.status(400).json({ error: 'Movie ID is required' });
        }

        const headers = getCommonHeaders();

        const response = await axios({
            method: 'GET',
            url: `https://api.anicrush.to/shared/v2/movie/getById/${ movieId }`,
            headers
        });

        res.json(response.data);
    } catch (error) {
        console.error('Error searching anime:', error);
        res.status(500).json({
            error: 'Failed to search anime',
            message: error.message
        });
    }
});

app.get('/api/anime/episodes', async (req, res) => {
    try {
        const { movieId } = req.query;

        if (!movieId) {
            return res.status(400).json({ error: 'Movie ID is required' });
        }

        const headers = getCommonHeaders();

        const response = await axios({
            method: 'GET',
            url: `https://api.anicrush.to/shared/v2/episode/list`,
            params: {
                _movieId: movieId
            },
            headers
        });

        res.json(response.data);
    } catch (error) {
        console.error('Error fetching episode list:', error);
        res.status(500).json({
            error: 'Failed to fetch episode list',
            message: error.message
        });
    }
});

app.get('/api/anime/servers/:movieId', async (req, res) => {
    try {
        const { movieId } = req.params;
        const { episode } = req.query;

        if (!movieId) {
            return res.status(400).json({ error: 'Movie ID is required' });
        }

        const headers = getCommonHeaders();

        const response = await axios({
            method: 'GET',
            url: `https://api.anicrush.to/shared/v2/episode/servers`,
            params: {
                _movieId: movieId,
                ep: episode || 1
            },
            headers
        });

        res.json(response.data);
    } catch (error) {
        console.error('Error fetching servers:', error);
        res.status(500).json({
            error: 'Failed to fetch servers',
            message: error.message
        });
    }
});

app.get('/api/anime/sources', async (req, res) => {
    try {
        const { movieId, episode, server, format } = req.query;

        if (!movieId) {
            return res.status(400).json({ error: 'Movie ID is required' });
        }

        const headers = getCommonHeaders();

        const episodeListResponse = await axios({
            method: 'GET',
            url: `https://api.anicrush.to/shared/v2/episode/list`,
            params: {
                _movieId: movieId
            },
            headers
        });

        if (!episodeListResponse.data || episodeListResponse.data.status === false) {
            return res.status(404).json({ error: 'Episode list not found' });
        }

        const serversResponse = await axios({
            method: 'GET',
            url: `https://api.anicrush.to/shared/v2/episode/servers`,
            params: {
                _movieId: movieId,
                ep: episode || 1
            },
            headers
        });

        if (!serversResponse.data || serversResponse.data.status === false) {
            return res.status(404).json({ error: 'Servers not found' });
        }

        const sourcesResponse = await axios({
            method: 'GET',
            url: `https://api.anicrush.to/shared/v2/episode/sources`,
            params: {
                _movieId: movieId,
                ep: episode || 1,
                sv: server || 4,
                sc: format || 'sub'
            },
            headers
        });

        res.json(sourcesResponse.data);
    } catch (error) {
        console.error('Error fetching anime sources:', error);
        res.status(500).json({
            error: 'Failed to fetch anime sources',
            message: error.message
        });
    }
});

app.get('/api/anime/hls/:movieId', async (req, res) => {
    try {
        const { movieId } = req.params;
        const { episode = 1, server = 4, format = 'sub' } = req.query;

        if (!movieId) {
            return res.status(400).json({ error: 'Movie ID is required' });
        }

        const headers = getCommonHeaders();

        const embedResponse = await axios({
            method: 'GET',
            url: `https://api.anicrush.to/shared/v2/episode/sources`,
            params: {
                _movieId: movieId,
                ep: episode,
                sv: server,
                sc: format
            },
            headers
        });

        if (!embedResponse.data || embedResponse.data.status === false) {
            return res.status(404).json({ error: 'Embed link not found' });
        }

        const embedUrl = embedResponse.data.result.link;
        
        const hlsData = await getHlsLink(embedUrl);
        res.json(hlsData);

    } catch (error) {
        console.error('Error fetching HLS link:', error);
        res.status(500).json({
            error: 'Failed to fetch HLS link',
            message: error.message
        });
    }
});

// Retained in case MegaCloud returns to a similar encryption method
app.get('/api/anime/embed/convert', async (req, res) => {
    try {
        const { embedUrl, host } = req.query;

        if (!embedUrl || !embedUrl.startsWith('http')) {
            return res.status(400).json({ error: 'Embed URL is required' });
        }
        if(!host) {
            return res.status(400).json({ error: 'Host is required' });
        }
        
        const hlsData = await getGenericHlsLink(embedUrl, host);
        res.json(hlsData);

    } catch (error) {
        console.error('Error fetching HLS link:', error);
        res.status(500).json({
            error: 'Failed to fetch HLS link',
            message: error.message
        });
    }
});

// 2025-06-15 - Updated decryption method
app.get('/api/anime/embed/convert/v2', async (req, res) => {
    try {
        const { embedUrl } = req.query;

        if (!embedUrl || !embedUrl.startsWith('http')) {
            return res.status(400).json({ error: 'Embed URL is required' });
        }
        
        const hlsData = await decryptSources(embedUrl);
        res.json(hlsData);

    } catch (error) {
        console.error('Error fetching HLS link:', error);
        console.log(error);
        if(error == 'Malformed UTF-8 data') {
            return res.status(500).json({
                error: 'Failed to fetch HLS link',
                message: "MegaCloud decryption key is invalid"
            });
        }
        res.status(500).json({
            error: 'Failed to fetch HLS link',
            message: error.message
        });
    }
});

app.head('/', async (req, res) => {
    res.sendStatus(200);
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});