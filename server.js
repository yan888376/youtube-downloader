const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");
const play = require('play-dl');

// -- 设置YouTube Cookie (仅在生产环境) --
if (process.env.YOUTUBE_COOKIE) {
  play.setToken({
    youtube: {
      cookie: process.env.YOUTUBE_COOKIE,
    },
  });
  console.log("YouTube Cookie已设置。");
} else {
  console.log("未检测到YouTube Cookie，将以普通模式运行。");
}

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
        if (!url) {
            return res.status(400).json({ success: false, error: '无效的YouTube URL' });
        }
        
        const videoInfo = await play.video_info(url);
        const videoDetails = videoInfo.video_details;

        // 直接从获取到的信息中找到最佳格式和大小
        const format = videoInfo.format.find(f => f.qualityLabel && f.url);
        const fileSize = format && format.content_length ? (format.content_length / 1024 / 1024).toFixed(2) + ' MB' : '未知大小';

        res.json({
            success: true,
            title: videoDetails.title,
            description: videoDetails.description || '无描述',
            thumbnail: videoDetails.thumbnails[videoDetails.thumbnails.length - 1].url,
            uploadDate: videoDetails.uploadedAt,
            size: fileSize,
        });
    } catch (error) {
        console.error('Error fetching video info:', error);
        res.status(500).json({ success: false, error: '解析视频信息失败' });
    }
});

app.post('/download', async (req, res) => {
    try {
        const { url, socketId } = req.body;
        if (!url) {
            return res.status(400).send('无效的URL');
        }

        const stream = await play.stream(url, {
            // 在这里直接请求视频信息，避免二次调用
            discordPlayerCompatibility: true 
        });
        
        const title = stream.video_details.title;
        const sanitizedTitle = title.replace(/[\\/:\*\?"<>\|]/g, '-');
        const disposition = `attachment; filename*=UTF-8''${encodeURIComponent(sanitizedTitle)}.mp4`;
        res.setHeader('Content-Disposition', disposition);
        
        let downloaded = 0;
        let total = stream.size;
        let lastEmit = 0;

        stream.stream.on('data', (chunk) => {
            downloaded += chunk.length;
            const percent = downloaded / total;
            const now = Date.now();
            if (now - lastEmit > 1000) {
                 if (socketId && io.sockets.sockets.get(socketId)) {
                    io.to(socketId).emit('downloadProgress', { progress: Math.round(percent * 100) });
                    lastEmit = now;
                }
            }
        });

        stream.stream.on('end', () => {
             if (socketId && io.sockets.sockets.get(socketId)) {
                io.to(socketId).emit('downloadProgress', { progress: 100 });
            }
        });

        stream.stream.pipe(res);

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
