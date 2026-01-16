const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

// ミドルウェア
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

let browser = null;

// Puppeteerブラウザの初期化
async function initBrowser() {
    if (!browser) {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        console.log('Puppeteerブラウザを起動しました');
    }
    return browser;
}

// DOM要素を画像化するエンドポイント
app.post('/api/capture-element', async (req, res) => {
    try {
        const { html, css, width, height, selector } = req.body;

        if (!html) {
            return res.status(400).json({ error: 'HTMLコンテンツが必要です' });
        }

        await initBrowser();
        const page = await browser.newPage();

        // ビューポートを設定
        await page.setViewport({
            width: width || 1920,
            height: height || 1080,
            deviceScaleFactor: 1
        });

        // HTMLコンテンツを設定
        const fullHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body {
                        margin: 0;
                        padding: 0;
                        background: transparent;
                    }
                    ${css || ''}
                </style>
            </head>
            <body>
                ${html}
            </body>
            </html>
        `;

        await page.setContent(fullHtml, { waitUntil: 'networkidle0' });

        // 要素をキャプチャ
        let screenshot;
        if (selector) {
            const element = await page.$(selector);
            if (!element) {
                await page.close();
                return res.status(404).json({ error: '指定された要素が見つかりません' });
            }
            screenshot = await element.screenshot({
                type: 'png',
                omitBackground: true
            });
        } else {
            screenshot = await page.screenshot({
                type: 'png',
                omitBackground: true,
                fullPage: false
            });
        }

        await page.close();

        // Base64エンコードして返す
        const base64Image = screenshot.toString('base64');
        res.json({
            success: true,
            image: `data:image/png;base64,${base64Image}`
        });

    } catch (error) {
        console.error('キャプチャエラー:', error);
        res.status(500).json({
            error: 'キャプチャに失敗しました',
            message: error.message
        });
    }
});

// 複数フレームを一括キャプチャするエンドポイント
app.post('/api/capture-frames', async (req, res) => {
    try {
        const { frames } = req.body;

        if (!frames || !Array.isArray(frames)) {
            return res.status(400).json({ error: 'framesパラメータが必要です' });
        }

        await initBrowser();
        const results = [];

        for (let i = 0; i < frames.length; i++) {
            const { html, css, width, height, selector, frameNumber } = frames[i];

            const page = await browser.newPage();

            await page.setViewport({
                width: width || 1920,
                height: height || 1080,
                deviceScaleFactor: 1
            });

            const fullHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <style>
                        body {
                            margin: 0;
                            padding: 0;
                            background: transparent;
                        }
                        ${css || ''}
                    </style>
                </head>
                <body>
                    ${html}
                </body>
                </html>
            `;

            await page.setContent(fullHtml, { waitUntil: 'networkidle0' });

            let screenshot;
            if (selector) {
                const element = await page.$(selector);
                if (element) {
                    screenshot = await element.screenshot({
                        type: 'png',
                        omitBackground: true
                    });
                }
            } else {
                screenshot = await page.screenshot({
                    type: 'png',
                    omitBackground: true,
                    fullPage: false
                });
            }

            await page.close();

            if (screenshot) {
                const base64Image = screenshot.toString('base64');
                results.push({
                    frameNumber: frameNumber || i,
                    image: `data:image/png;base64,${base64Image}`
                });
            }
        }

        res.json({
            success: true,
            frames: results
        });

    } catch (error) {
        console.error('一括キャプチャエラー:', error);
        res.status(500).json({
            error: '一括キャプチャに失敗しました',
            message: error.message
        });
    }
});

// ヘルスチェック
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', puppeteer: browser ? 'ready' : 'not initialized' });
});

// サーバー起動
app.listen(PORT, async () => {
    console.log(`サーバーが起動しました: http://localhost:${PORT}`);
    console.log('Puppeteerを初期化中...');
    await initBrowser();
});

// クリーンアップ
process.on('SIGINT', async () => {
    console.log('\nサーバーを終了しています...');
    if (browser) {
        await browser.close();
    }
    process.exit(0);
});
