// content.js からメッセージで Blob URL とメタ情報を受け取って保存する

// 拡張機能アイコンクリックでダッシュボードを開く
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({
    url: chrome.runtime.getURL('dashboard.html')
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "saveRecording") {
    handleSaveRecording(message).then(() => {
      sendResponse({ ok: true });
    }).catch(err => {
      console.error("saveRecording error", err);
      sendResponse({ ok: false, error: err.toString() });
    });
    return true; // async
  }
});

async function handleSaveRecording(message) {
  const { blobUrl, language, percent, allLanguages, dateStr, index } = message;

  const { parentFolder } = await chrome.storage.sync.get({
    parentFolder: "BoldVoiceRec"
  });

  // 言語ごとの連番管理
  const key = `counter_${language}`;
  const stored = await chrome.storage.local.get({ [key]: 0 });
  const count = (stored[key] || 0) + 1;
  await chrome.storage.local.set({ [key]: count });

  // 100件ごとのフォルダ名算出
  const groupStart = Math.floor((count - 1) / 100) * 100 + 1;
  const groupEnd = groupStart + 99;
  const groupName = `${String(groupStart).padStart(3, "0")}-${String(groupEnd).padStart(3, "0")}`;

  const indexStr = String(count).padStart(4, "0");

  // スコアを整数に変換（小数点がある場合は切り捨て）
  const percentStr = percent ? `_${Math.floor(percent)}percent` : '';
  const filename = `${language}_${dateStr}_${indexStr}${percentStr}.webm`;

  const fullPath = `${parentFolder}/${language}/${groupName}/${filename}`;

  await chrome.downloads.download({
    url: blobUrl,
    filename: fullPath,
    conflictAction: "uniquify"
  });

  // 録音履歴をストレージに保存（ダッシュボード用）
  await saveRecordingHistory({
    timestamp: Date.now(),
    language: language,
    score: percent || 0,
    allLanguages: allLanguages || [],
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
