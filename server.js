const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");
const ytdl = require('@distube/ytdl-core');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

// Middleware for parsing JSON
app.use(express.json());
// Middleware for parsing URL-encoded form data
app.use(express.urlencoded({ extended: true }));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Endpoint to get video info
app.post('/info', async (req, res) => {
    try {
        const { url } = req.body;
        if (!ytdl.validateURL(url)) {
            return res.status(400).json({ success: false, error: '无效的YouTube URL' });
        }
        const info = await ytdl.getInfo(url);
        const videoDetails = info.videoDetails;

        // Find the best format with both video and audio
        const format = ytdl.chooseFormat(info.formats, { 
            quality: 'highest',
            filter: (f) => f.hasVideo && f.hasAudio,
        });

        if (!format) {
            return res.status(404).json({ success: false, error: '找不到合适的视频格式。' });
        }
        
        const contentLength = format.contentLength;
        const fileSize = contentLength ? (contentLength / 1024 / 1024).toFixed(2) + ' MB' : '未知大小';

        res.json({
            success: true,
            title: videoDetails.title,
            description: videoDetails.description || '无描述',
            thumbnail: videoDetails.thumbnails[videoDetails.thumbnails.length - 1].url,
            uploadDate: new Date(videoDetails.uploadDate).toLocaleDateString('zh-CN'),
            size: fileSize,
        });
    } catch (error) {
        console.error('Error fetching video info:', error);
        res.status(500).json({ success: false, error: '解析视频信息失败' });
    }
});

app.post('/download', (req, res) => {
    try {
        const { url, socketId } = req.body;
        if (!ytdl.validateURL(url)) {
            // 虽然前端应该已经验证过，但后端再验证一次更安全
            return res.status(400).send('无效的URL');
        }

        const video = ytdl(url, {
            quality: 'highest',
            filter: (f) => f.hasVideo && f.hasAudio,
        });
        
        // 设置响应头，告诉浏览器这是一个要下载的文件
        video.on('info', (info) => {
            const title = info.videoDetails.title;
            // 替换掉Windows和macOS都不允许的文件名字符
            const sanitizedTitle = title.replace(/[\\/:\*\?"<>\|]/g, '-');
            // RFC 5987 格式，可以更好地处理非ASCII字符
            const disposition = `attachment; filename*=UTF-8''${encodeURIComponent(sanitizedTitle)}.mp4`;
            res.setHeader('Content-Disposition', disposition);
        });

        let lastEmit = 0;
        video.on('progress', (chunkLength, downloaded, total) => {
            const percent = downloaded / total;
            const now = Date.now();
             // 每秒最多发送一次进度更新，避免过于频繁
            if (now - lastEmit > 1000) {
                 if (socketId && io.sockets.sockets.get(socketId)) {
                    io.to(socketId).emit('downloadProgress', { progress: Math.round(percent * 100) });
                    lastEmit = now;
                }
            }
        });

        video.on('end', () => {
             if (socketId && io.sockets.sockets.get(socketId)) {
                io.to(socketId).emit('downloadProgress', { progress: 100 });
            }
        });

        video.pipe(res);

    } catch (error) {
        console.error('下载视频时出错:', error);
        res.status(500).send('下载过程中发生错误。');
    }
});

io.on('connection', (socket) => {
  console.log('一个用户连接了');
  socket.on('disconnect', () => {
    console.log('用户断开连接');
  });
});


server.listen(PORT, () => {
  console.log(`服务器正在运行，请访问 http://localhost:${PORT}`);
});
