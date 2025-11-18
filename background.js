// content.js からメッセージで Blob URL とメタ情報を受け取って保存する

// 拡張機能アイコンクリックでダッシュボードを開く
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({
    url: chrome.runtime.getURL('dashboard.html')
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // セキュリティ: メッセージ送信元の検証
  // 1. 同じ拡張からのメッセージか確認
  if (sender.id !== chrome.runtime.id) {
    console.warn("Message from unknown extension:", sender.id);
    sendResponse({ ok: false, error: "Unauthorized" });
    return;
  }

  // 2. content scriptからのメッセージの場合、URLがBoldVoiceか確認
  if (sender.url && !sender.url.startsWith('chrome-extension://')) {
    const url = new URL(sender.url);
    if (!url.hostname.includes('boldvoice.com')) {
      console.warn("Message from unauthorized domain:", url.hostname);
      sendResponse({ ok: false, error: "Unauthorized domain" });
      return;
    }
  }

  if (message.type === "saveRecording") {
    handleSaveRecording(message).then(() => {
      sendResponse({ ok: true });
    }).catch(err => {
      // セキュリティ: エラーの詳細を漏洩させない
      // 内部的にはログに記録するが、content scriptには一般的なメッセージのみ返す
      console.error("saveRecording error", err);
      sendResponse({ ok: false, error: "Failed to save recording" });
    });
    return true; // async
  }
});

async function handleSaveRecording(message) {
  const { blobUrl, language, percent, allLanguages, dateStr, index } = message;

  // セキュリティ: 入力パラメータのバリデーション
  // 1. 言語コードの検証（許可リストによるホワイトリスト方式）
  const validLanguages = ['en_us', 'en_uk', 'en', 'fr', 'es', 'de', 'it', 'pt', 'zh', 'ja', 'ko', 'unknown'];
  const sanitizedLanguage = validLanguages.includes(language) ? language : 'unknown';

  // 2. dateStrの形式検証（YYYYMMDDの8桁数字のみ）
  if (!/^\d{8}$/.test(dateStr)) {
    throw new Error('Invalid dateStr format: must be YYYYMMDD');
  }

  // 3. percentの検証（0-100の数値）
  const sanitizedPercent = (typeof percent === 'number' && percent >= 0 && percent <= 100) ? percent : 0;

  // 4. blobUrlの検証（blob:スキームのみ許可）
  if (!blobUrl || !blobUrl.startsWith('blob:')) {
    throw new Error('Invalid blobUrl: must start with blob:');
  }

  // 5. allLanguagesの検証（配列の各要素をサニタイズ）
  const sanitizedAllLanguages = Array.isArray(allLanguages)
    ? allLanguages
        .filter(item => item && typeof item === 'object')
        .map(item => ({
          language: validLanguages.includes(item.language) ? item.language : 'unknown',
          percent: (typeof item.percent === 'number' && item.percent >= 0 && item.percent <= 100)
            ? item.percent
            : 0
        }))
        .slice(0, 10) // 最大10件に制限（DoS対策）
    : [];

  let { parentFolder } = await chrome.storage.sync.get({
    parentFolder: "BoldVoiceRec"
  });

  // セキュリティ: 多層防御としてparentFolderも念のためサニタイズ
  // options.jsで既にバリデーションしているが、ストレージが直接改ざんされる可能性に備える
  parentFolder = (parentFolder || "BoldVoiceRec")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/\.\./g, "_") || "BoldVoiceRec";

  // 言語ごとの連番管理（サニタイズ済みの言語コードを使用）
  const key = `counter_${sanitizedLanguage}`;
  const stored = await chrome.storage.local.get({ [key]: 0 });
  const count = (stored[key] || 0) + 1;
  await chrome.storage.local.set({ [key]: count });

  // 100件ごとのフォルダ名算出
  const groupStart = Math.floor((count - 1) / 100) * 100 + 1;
  const groupEnd = groupStart + 99;
  const groupName = `${String(groupStart).padStart(3, "0")}-${String(groupEnd).padStart(3, "0")}`;

  const indexStr = String(count).padStart(4, "0");

  // スコアを整数に変換（小数点がある場合は切り捨て）
  const percentStr = sanitizedPercent ? `_${Math.floor(sanitizedPercent)}percent` : '';
  const filename = `${sanitizedLanguage}_${dateStr}_${indexStr}${percentStr}.webm`;

  const fullPath = `${parentFolder}/${sanitizedLanguage}/${groupName}/${filename}`;

  await chrome.downloads.download({
    url: blobUrl,
    filename: fullPath,
    conflictAction: "uniquify"
  });

  // 録音履歴をストレージに保存（ダッシュボード用）
  await saveRecordingHistory({
    timestamp: Date.now(),
    language: sanitizedLanguage,
    score: sanitizedPercent,
    allLanguages: sanitizedAllLanguages,
    filename: filename,
    dateStr: dateStr
  });
}

// 録音履歴をストレージに保存
async function saveRecordingHistory(entry) {
  try {
    const result = await chrome.storage.local.get(['recordingHistory']);
    const history = result.recordingHistory || [];

    // 新しいエントリを追加
    history.push(entry);

    // 最新1000件のみ保持（パフォーマンス対策）
    const trimmed = history.slice(-1000);

    await chrome.storage.local.set({ recordingHistory: trimmed });
    console.log('Recording history saved:', entry);
  } catch (error) {
    console.error('Failed to save recording history:', error);
  }
}
