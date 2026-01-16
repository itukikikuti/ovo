const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const puppeteer = require('puppeteer');

let mainWindow;
let browser = null;

// Puppeteerブラウザの初期化
async function initPuppeteer() {
    if (!browser) {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        console.log('Puppeteerブラウザを初期化しました');
    }
    return browser;
}

// ウィンドウを作成
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.loadFile('index.html');
    
    // 開発ツールを開く（オプション）
    // mainWindow.webContents.openDevTools();

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// IPC: DOM要素をキャプチャ
ipcMain.handle('capture-element', async (event, payload) => {
    try {
        const { html, css, width, height, selector } = payload;

        if (!html) {
            throw new Error('HTMLコンテンツが必要です');
        }

        await initPuppeteer();
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
            if (!element) {
                await page.close();
                throw new Error('指定された要素が見つかりません');
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

        const base64Image = screenshot.toString('base64');
        return {
            success: true,
            image: `data:image/png;base64,${base64Image}`
        };

    } catch (error) {
        console.error('キャプチャエラー:', error);
        throw new Error('キャプチャに失敗しました: ' + error.message);
    }
});

// IPC: 複数フレームを一括キャプチャ
ipcMain.handle('capture-frames', async (event, frames) => {
    try {
        if (!frames || !Array.isArray(frames)) {
            throw new Error('framesパラメータが必要です');
        }

        await initPuppeteer();
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

        return {
            success: true,
            frames: results
        };

    } catch (error) {
        console.error('一括キャプチャエラー:', error);
        throw new Error('一括キャプチャに失敗しました: ' + error.message);
    }
});

// アプリケーションイベント
app.on('ready', createWindow);

app.on('window-all-closed', async () => {
    // Puppeteerをクリーンアップ
    if (browser) {
        await browser.close();
    }
    
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

// アプリ終了時にクリーンアップ
app.on('quit', async () => {
    if (browser) {
        await browser.close();
    }
});
