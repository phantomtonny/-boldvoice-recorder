// content.js からメッセージで Blob URL とメタ情報を受け取って保存する

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
  const { blobUrl, language, percent, dateStr, index } = message;

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
}
