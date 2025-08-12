document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    const urlInput = document.getElementById('youtube-url');
    const fetchBtn = document.getElementById('fetch-video-info');
    const videoInfoContainer = document.getElementById('video-info-container');
    const videoThumbnail = document.getElementById('video-thumbnail');
    const videoTitle = document.getElementById('video-title');
    const videoDescription = document.getElementById('video-description');
    const uploadDate = document.getElementById('upload-date');
    const videoSize = document.getElementById('video-size');
    const downloadBtn = document.getElementById('download-video');
    const progressContainer = document.getElementById('download-progress-container');
    const progressBar = document.getElementById('download-progress-bar');
    const successAlert = document.getElementById('download-success-alert');
    const historyList = document.getElementById('history-list');
    
    let currentUrl = '';
    let currentTitle = '';
    let currentDirectUrl = ''; // 新增变量来存储直接下载链接

    // -- 历史记录相关函数 --
    const MAX_HISTORY = 10;
    function getHistory() {
        return JSON.parse(localStorage.getItem('youtubeDownloaderHistory')) || [];
    }

    function saveToHistory(title, url) {
        let history = getHistory();
        // 避免重复添加
        history = history.filter(item => item.url !== url);
        // 添加到最前面
        history.unshift({ title, url });
        // 保持最大数量限制
        if (history.length > MAX_HISTORY) {
            history = history.slice(0, MAX_HISTORY);
        }
        localStorage.setItem('youtubeDownloaderHistory', JSON.stringify(history));
        renderHistory();
    }

    function renderHistory() {
        historyList.innerHTML = '';
        const history = getHistory();
        if (history.length === 0) {
            historyList.innerHTML = '<li class="list-group-item text-muted">暂无历史记录</li>';
            return;
        }
        history.forEach(item => {
            const li = document.createElement('li');
            li.className = 'list-group-item list-group-item-action';
            li.textContent = item.title;
            li.style.cursor = 'pointer';
            li.addEventListener('click', () => {
                urlInput.value = item.url;
                fetchBtn.click(); // 自动触发解析
            });
            historyList.appendChild(li);
        });
    }


    // -- UI更新相关的函数 --
    function showLoadingState() {
        fetchBtn.disabled = true;
        fetchBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 解析中...';
    }

    function hideLoadingState() {
        fetchBtn.disabled = false;
        fetchBtn.innerHTML = '解析视频';
    }

    function resetDownloadState() {
        progressContainer.style.display = 'none';
        progressBar.style.width = '0%';
        progressBar.textContent = '0%';
        successAlert.style.display = 'none';
    }

    function resetVideoInfo() {
        videoInfoContainer.style.display = 'none';
        videoThumbnail.src = '';
        videoTitle.textContent = '';
        videoDescription.textContent = '';
        uploadDate.textContent = '';
        videoSize.textContent = '';
        downloadBtn.disabled = true;
        resetDownloadState();
    }

    // -- 事件监听器 --
    fetchBtn.addEventListener('click', async () => {
        const url = urlInput.value.trim();
        if (!url) {
            alert('请输入YouTube URL！');
            return;
        }

        currentUrl = url; // 保存当前URL
        currentTitle = ''; // 重置标题
        currentDirectUrl = ''; // 重置直接下载链接
        resetVideoInfo();
        showLoadingState();

        try {
            const response = await fetch('/info', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url }),
            });

            const data = await response.json();

            if (data.success) {
                videoThumbnail.src = data.thumbnail;
                videoTitle.textContent = data.title;
                currentTitle = data.title;
                currentDirectUrl = data.directUrl; // 获取并存储直接下载链接
                videoDescription.textContent = data.description;
                uploadDate.textContent = data.uploadDate;
                videoSize.textContent = data.size;
                videoInfoContainer.style.display = 'block';
                downloadBtn.disabled = false;
                // 保存到历史记录
                saveToHistory(data.title, currentUrl);
            } else {
                alert(`解析失败: ${data.error}`);
            }
        } catch (error) {
            console.error('Error fetching video info:', error);
            alert('发生网络错误或服务器内部错误。');
        } finally {
            hideLoadingState();
        }
    });

    downloadBtn.addEventListener('click', () => {
        if (!currentDirectUrl || !currentTitle || !socket.id) {
            alert('无法开始下载，请先解析一个有效的URL。');
            return;
        }
        
        resetDownloadState();
        progressContainer.style.display = 'block';

        // 使用表单提交来触发下载
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = '/download';
        
        const directUrlField = document.createElement('input'); // 改为发送直接链接
        directUrlField.type = 'hidden';
        directUrlField.name = 'directUrl';
        directUrlField.value = currentDirectUrl;
        form.appendChild(directUrlField);
        
        const titleField = document.createElement('input');
        titleField.type = 'hidden';
        titleField.name = 'title';
        titleField.value = currentTitle;
        form.appendChild(titleField);

        const socketIdField = document.createElement('input');
        socketIdField.type = 'hidden';
        socketIdField.name = 'socketId';
        socketIdField.value = socket.id;
        form.appendChild(socketIdField);
        
        document.body.appendChild(form);
        form.submit();
        document.body.removeChild(form);
    });

    socket.on('connect', () => {
        console.log('成功连接到服务器');
    });

    socket.on('downloadProgress', (data) => {
        const percent = data.progress;
        progressBar.style.width = `${percent}%`;
        progressBar.textContent = `${percent}%`;

        if (percent === 100) {
            successAlert.style.display = 'block';
            setTimeout(() => {
                resetDownloadState();
            }, 5000); // 5秒后自动隐藏
        }
    });

    socket.on('disconnect', () => {
        console.log('与服务器断开连接');
    });

    // 初始化：页面加载时渲染历史记录
    renderHistory();
});
