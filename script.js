let video;
let canvas;
let ctx;
let subtitles = [];
let videoEncoder;
let audioEncoder;
let muxer;
let encodedVideoBlob = null;
let isEncoding = false;

window.onload = function () {
    video = document.getElementById('videoPlayer');
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');

    document.getElementById('videoInput').addEventListener('change', handleVideoUpload);

    video.addEventListener('loadedmetadata', function () {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
    });

    video.addEventListener('timeupdate', () => {
        if (!isEncoding) {
            drawSubtitleOverlay();
        }
    });
};

function handleVideoUpload(e) {
    const file = e.target.files[0];
    if (file) {
        const url = URL.createObjectURL(file);
        video.src = url;
    }
}

function addSubtitle() {
    const text = document.getElementById('subtitleText').value;

    if (!text) {
        alert('テロップテキストを入力してください');
        return;
    }

    const subtitle = {
        id: Date.now(),
        text,
    };

    subtitles.push(subtitle);
    updateSubtitleList();

    // 入力をクリア
    document.getElementById('subtitleText').value = '';
}

function updateSubtitleList() {
    const list = document.getElementById('subtitleList');
    list.innerHTML = '';

    subtitles.forEach(sub => {
        const item = document.createElement('div');
        item.className = 'subtitle-item';
        item.innerHTML = `
            <label>"${sub.text}"</label>
            <button onclick="removeSubtitle(${sub.id})">削除</button>
        `;
        list.appendChild(item);
    });
}

function removeSubtitle(id) {
    subtitles = subtitles.filter(sub => sub.id !== id);
    updateSubtitleList();
}

// オーバーレイとしてテロップを描画
function drawSubtitleOverlay() {
    // キャンバスをクリア（透明に）
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 該当するテロップを描画
    subtitles.forEach(sub => {
        ctx.font = `bold 100px Arial`;
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.textAlign = 'center';

        const x = canvas.width / 2;
        const y = canvas.height - 50;
        ctx.strokeText(sub.text, x, y);
        ctx.fillText(sub.text, x, y);
    });
}

// キャンバスにテロップを描画
function drawSubtitle() {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    subtitles.forEach(sub => {
        ctx.font = `bold 100px Arial`;
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.textAlign = 'center';

        const x = canvas.width / 2;
        const y = canvas.height - 50;
        ctx.strokeText(sub.text, x, y);
        ctx.fillText(sub.text, x, y);
    });
}

// エンコード開始（WebCodecs API使用）
async function startEncoding() {
    if (subtitles.length === 0) {
        alert('少なくとも1つのテロップを追加してください');
        return;
    }

    if (isEncoding) {
        alert('エンコード中です');
        return;
    }

    // WebCodecs APIのサポート確認
    if (!window.VideoEncoder || !window.AudioEncoder) {
        alert('お使いのブラウザはWebCodecs APIをサポートしていません。Chrome 94以降をご利用ください。');
        return;
    }

    const progress = document.getElementById('progress');

    isEncoding = true;
    let audioContext = null;
    let audioReader = null;

    try {
        video.currentTime = 0;
        await new Promise(resolve => {
            video.onseeked = resolve;
        });

        const width = video.videoWidth;
        const height = video.videoHeight;
        const fps = 30;
        const duration = video.duration;
        const totalFrames = Math.floor(duration * fps);

        // 解像度に応じて適切なAVCレベルを選択
        let codec;
        const pixelCount = width * height;
        if (pixelCount > 2073600) { // 1920x1080より大きい（4K等）
            codec = 'avc1.640033'; // High Profile, Level 5.1 (4K対応)
        } else if (pixelCount > 921600) { // 1280x720より大きい（1080p）
            codec = 'avc1.64001F'; // High Profile, Level 3.1
        } else {
            codec = 'avc1.42E01E'; // Baseline Profile, Level 3.0
        }

        console.log(`Video resolution: ${width}x${height}, Using codec: ${codec}`);

        // MP4 Muxerの初期化
        muxer = new Mp4Muxer.Muxer({
            target: new Mp4Muxer.ArrayBufferTarget(),
            video: {
                codec: 'avc',
                width: width,
                height: height
            },
            audio: {
                codec: 'aac',
                numberOfChannels: 2,
                sampleRate: 48000
            },
            firstTimestampBehavior: 'offset',
            fastStart: 'in-memory'
        });

        // VideoEncoderの設定
        let frameCount = 0;
        let videoEncoderError = null;
        videoEncoder = new VideoEncoder({
            output: (chunk, metadata) => {
                muxer.addVideoChunk(chunk, metadata);
            },
            error: (error) => {
                console.error('Video encoding error:', error);
                videoEncoderError = error;
            }
        });

        videoEncoder.configure({
            codec: codec,
            width: width,
            height: height,
            bitrate: 2_500_000,
            framerate: fps,
            latencyMode: 'quality'
        });

        // 音声の処理（オプショナル）
        let audioProcessingPromise = Promise.resolve();
        try {
            audioContext = new AudioContext({ sampleRate: 48000 });
            const audioSource = audioContext.createMediaElementSource(video);
            const audioDestination = audioContext.createMediaStreamDestination();
            audioSource.connect(audioDestination);
            audioSource.connect(audioContext.destination);

            // AudioEncoderの設定
            let audioEncoderError = null;
            audioEncoder = new AudioEncoder({
                output: (chunk, metadata) => {
                    muxer.addAudioChunk(chunk, metadata);
                },
                error: (error) => {
                    console.error('Audio encoding error:', error);
                    audioEncoderError = error;
                }
            });

            audioEncoder.configure({
                codec: 'mp4a.40.2', // AAC-LC
                numberOfChannels: 2,
                sampleRate: 48000,
                bitrate: 128_000
            });

            // 音声キャプチャの設定
            const audioStream = audioDestination.stream;
            const audioTrack = audioStream.getAudioTracks()[0];
            const audioProcessor = new MediaStreamTrackProcessor({ track: audioTrack });
            audioReader = audioProcessor.readable.getReader();

            // 音声データを非同期で読み取り
            audioProcessingPromise = (async () => {
                try {
                    while (isEncoding) {
                        const { done, value } = await audioReader.read();
                        if (done) break;

                        if (audioEncoder && audioEncoder.state === 'configured') {
                            audioEncoder.encode(value);
                            value.close();
                        } else {
                            value.close();
                            break;
                        }
                    }
                } catch (error) {
                    if (error.name !== 'AbortError') {
                        console.error('Audio processing error:', error);
                    }
                }
            })();
        } catch (audioError) {
            console.warn('Audio processing disabled:', audioError);
            // 音声エンコードに失敗しても続行
        }

        // フレーム単位でエンコード
        for (let i = 0; i < totalFrames; i++) {
            if (!isEncoding || videoEncoderError) break;

            const timestamp = (i / fps) * 1_000_000; // マイクロ秒
            const currentTime = i / fps;

            // ビデオの現在位置を設定
            video.currentTime = currentTime;
            await new Promise(resolve => {
                if (video.readyState >= 2) {
                    resolve();
                } else {
                    video.onseeked = resolve;
                }
            });

            // キャンバスにフレームを描画（テロップ付き）
            drawSubtitle();

            // エンコーダーのエラーチェック
            if (videoEncoderError) {
                throw new Error('Video encoder error occurred: ' + videoEncoderError.message);
            }

            // エンコーダーの状態確認
            if (videoEncoder.state !== 'configured') {
                throw new Error('Video encoder is not in configured state: ' + videoEncoder.state);
            }

            // エンコーダーのキューが一杯にならないよう待機
            while (videoEncoder.encodeQueueSize > 5) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            // キャンバスからVideoFrameを作成
            const videoFrame = new VideoFrame(canvas, {
                timestamp: timestamp,
                duration: 1_000_000 / fps
            });

            // エンコード
            const keyFrame = i % 30 === 0; // 1秒ごとにキーフレーム
            try {
                videoEncoder.encode(videoFrame, { keyFrame });
            } catch (e) {
                videoFrame.close();
                throw new Error('Failed to encode frame ' + i + ': ' + e.message);
            }
            videoFrame.close();

            frameCount++;

            // 進捗更新
            const progressValue = (frameCount / totalFrames) * 100;
            progress.textContent = Math.round(progressValue) + '%';

            // UIの更新を許可（キュー待機と統合）
            if (i % 5 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        // エラーチェック
        if (videoEncoderError) {
            throw new Error('Video encoding failed: ' + videoEncoderError.message);
        }

        // ビデオエンコーダーのflush
        if (videoEncoder.state === 'configured') {
            await videoEncoder.flush();
        }

        // 音声処理を停止
        isEncoding = false;
        if (audioReader) {
            await audioReader.cancel();
        }
        await audioProcessingPromise;

        // オーディオエンコーダーのflush
        if (audioEncoder.state === 'configured') {
            await audioEncoder.flush();
        }

        // エンコーダーを閉じる
        if (videoEncoder.state !== 'closed') {
            videoEncoder.close();
        }
        if (audioEncoder.state !== 'closed') {
            audioEncoder.close();
        }
        if (audioContext) {
            await audioContext.close();
        }

        // MP4ファイルを生成
        muxer.finalize();
        const { buffer } = muxer.target;
        encodedVideoBlob = new Blob([buffer], { type: 'video/mp4' });

        progress.textContent = '100%';
    } catch (error) {
        console.error('エンコードエラー:', error);
        alert('❌ エンコードに失敗しました: ' + error.message);

        // クリーンアップ
        if (videoEncoder && videoEncoder.state !== 'closed') {
            videoEncoder.close();
        }
        if (audioEncoder && audioEncoder.state !== 'closed') {
            audioEncoder.close();
        }
        if (audioContext && audioContext.state !== 'closed') {
            await audioContext.close();
        }
    } finally {
        isEncoding = false;
        video.pause();
    }

    downloadVideo();
}

// 動画をダウンロード
function downloadVideo() {
    if (!encodedVideoBlob) {
        alert('エンコードされた動画がありません');
        return;
    }

    const url = URL.createObjectURL(encodedVideoBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'edited-video-' + Date.now() + '.mp4';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
