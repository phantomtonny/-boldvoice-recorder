// Version check
console.log('BoldVoice Recorder content.js loaded - Version 3.0 (並行録音対応版)');

// Session management for parallel recording support
let nextSessionId = 1;
const sessions = {}; // id -> { recorder, stream, chunks }
let currentSessionId = null; // Currently active recording session

async function startRecording() {
  // 既に録音中のセッションがある場合は継続
  if (currentSessionId && sessions[currentSessionId]) {
    const currentSession = sessions[currentSessionId];
    if (currentSession.recorder && currentSession.recorder.state === "recording") {
      console.log(`Session ${currentSessionId} is already recording, continuing...`);
      return currentSessionId;
    }
  }

  const id = nextSessionId++;
  console.log(`Starting new recording session ${id}`);

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    const chunks = [];

    sessions[id] = { recorder, stream, chunks };
    currentSessionId = id;

    recorder.ondataavailable = e => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    recorder.onstop = async () => {
      const session = sessions[id];
      if (!session) {
        console.warn(`Session ${id} not found in onstop handler`);
        return;
      }

      console.log(`Processing recording for session ${id}`);
      const blob = new Blob(session.chunks, { type: "audio/webm" });
      const blobUrl = URL.createObjectURL(blob);

      const { language } = extractTopLanguageFromPage() || { language: "unknown" };
      const now = new Date();
      const dateStr = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0")
      ].join("");

      chrome.runtime.sendMessage({
        type: "saveRecording",
        sessionId: id,
        blobUrl,
        language,
        dateStr
      }, (res) => {
        if (!res || !res.ok) {
          console.error(`Failed to save recording for session ${id}`, res && res.error);
        } else {
          console.log(`Recording saved successfully for session ${id}`);
        }
        // blobUrlのrevokeは、ダウンロード完了後でも可
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      });

      // Clean up the session
      if (session.stream) {
        session.stream.getTracks().forEach(t => t.stop());
      }
      delete sessions[id];

      // Clear current session if it was this one
      if (currentSessionId === id) {
        currentSessionId = null;
      }
    };

    recorder.start();
    console.log(`Recording started for session ${id}`);
    return id;
  } catch (error) {
    console.error(`Failed to start recording for session ${nextSessionId - 1}:`, error);
    // Clean up the failed session
    delete sessions[nextSessionId - 1];
    if (currentSessionId === nextSessionId - 1) {
      currentSessionId = null;
    }
    return null;
  }
}

function stopRecording(sessionId = null) {
  // If no sessionId provided, stop the current session
  const id = sessionId || currentSessionId;

  if (!id) {
    console.log("No active session to stop");
    return;
  }

  const session = sessions[id];
  if (!session) {
    console.warn(`Session ${id} not found`);
    return;
  }

  if (session.recorder && session.recorder.state === "recording") {
    session.recorder.stop();
    console.log(`Recording stopped for session ${id}`);
  } else {
    console.log(`Session ${id} is not recording`);
  }
}

// Stop all active sessions (useful for cleanup)
function stopAllRecordings() {
  console.log("Stopping all active recordings...");
  Object.keys(sessions).forEach(id => {
    stopRecording(parseInt(id));
  });
}

/**
 * Bold Voice Accent Oracleの結果画面から、言語＋パーセンテージを拾って
 * 一番高いものを返す関数
 *
 * 実際のDOM構造（2025-11-16時点）:
 * - 言語名: <div class="flex flex-1 text-text-primary-dark text-base leading-[130%] font-bold">Japanese</div>
 * - スコア: <div class="text-text-primary-dark text-base leading-[130%] font-bold">50%</div>
 * - 2位以降の言語: class="flex flex-1 text-[#11D1A7] text-base leading-[130%] font-bold"
 */
function extractTopLanguageFromPage() {
  // 結果ページのすべての言語名と％のペアを取得
  const languageScores = [];

  // Primary language (text-text-primary-dark)
  const primaryLangElements = document.querySelectorAll('div.text-text-primary-dark.text-base.leading-\\[130\\%\\].font-bold');

  // 言語名と％を分離
  primaryLangElements.forEach(el => {
    const text = el.textContent.trim();

    // パーセンテージの要素
    if (text.includes('%')) {
      const percent = parseFloat(text.replace('%', ''));
      if (!isNaN(percent)) {
        // 前の要素から言語名を取得
        const parent = el.parentElement;
        if (parent) {
          const langEl = parent.querySelector('div.flex.flex-1.text-text-primary-dark.text-base.leading-\\[130\\%\\].font-bold');
          if (langEl && !langEl.textContent.includes('%')) {
            languageScores.push({
              language: normalizeLanguageName(langEl.textContent.trim()),
              percent: percent
            });
          }
        }
      }
    }
  });

  // Secondary languages (color #11D1A7)
  const secondaryLangElements = document.querySelectorAll('div.text-\\[\\#11D1A7\\].text-base.leading-\\[130\\%\\].font-bold');
  secondaryLangElements.forEach(el => {
    const text = el.textContent.trim();

    if (text.includes('%')) {
      const percent = parseFloat(text.replace('%', ''));
      if (!isNaN(percent)) {
        const parent = el.parentElement;
        if (parent) {
          const langEl = parent.querySelector('div.flex.flex-1.text-\\[\\#11D1A7\\].text-base.leading-\\[130\\%\\].font-bold');
          if (langEl && !langEl.textContent.includes('%')) {
            languageScores.push({
              language: normalizeLanguageName(langEl.textContent.trim()),
              percent: percent
            });
          }
        }
      }
    }
  });

  // スコアが最も高いものを返す
  if (languageScores.length === 0) {
    return null;
  }

  return languageScores.reduce((best, current) => {
    return (!best || current.percent > best.percent) ? current : best;
  }, null);
}

/**
 * Bold Voice上の表示を保存用のフォルダ名に変換
 * 例: "American English" → "en_us"
 */
function normalizeLanguageName(name) {
  const lower = name.toLowerCase();
  if (lower.includes("english")) {
    if (lower.includes("american")) return "en_us";
    if (lower.includes("british")) return "en_uk";
    return "en";
  }
  if (lower.includes("french")) return "fr";
  if (lower.includes("spanish")) return "es";
  if (lower.includes("german")) return "de";
  if (lower.includes("italian")) return "it";
  if (lower.includes("portuguese")) return "pt";
  if (lower.includes("chinese")) return "zh";
  if (lower.includes("japanese")) return "ja";
  if (lower.includes("korean")) return "ko";
  // 必要に応じて追加
  return name.replace(/\s+/g, "_").toLowerCase();
}

/**
 * 録音開始/終了のトリガー
 *
 * 注意: imp/003.mdは結果ページのHTMLであり、録音ボタンは含まれていません。
 * 録音ボタンは別のページ（録音開始画面）にあると推測されます。
 *
 * 実装方法の提案:
 * 1. Bold Voiceの録音開始ページで開発者ツールを開く
 * 2. 録音ボタンの要素を特定し、そのclass名やaria-labelを確認
 * 3. 以下のセレクタを適切なものに置き換える
 *
 * または、結果ページが表示されたら自動で停止する方式を採用する
 */
function setupTriggers() {
  // 方式1: 録音ボタンを監視
  // 実際のDOM構造（2025-11-16時点）:
  // <div class="z-20 cursor-pointer select-none flex transition-all yellow-100
  //      justify-center items-center rounded-full size-[90px] bg-action-button-dark">
  //   <svg>マイクアイコン</svg>
  // </div>

  // MutationObserverで動的に追加される録音ボタンを監視
  const observeRecordButton = new MutationObserver(() => {
    const recordBtn = document.querySelector('div.bg-action-button-dark.rounded-full.cursor-pointer');
    if (recordBtn && !recordBtn.dataset.listenerAttached) {
      console.log('Recording button found, attaching listener');
      recordBtn.dataset.listenerAttached = 'true';

      recordBtn.addEventListener("click", () => {
        // Start new recording session
        startRecording();
      });
    }
  });

  observeRecordButton.observe(document.body, {
    childList: true,
    subtree: true
  });

  // 初回チェック
  const initialBtn = document.querySelector('div.bg-action-button-dark.rounded-full.cursor-pointer');
  if (initialBtn && !initialBtn.dataset.listenerAttached) {
    console.log('Recording button found (initial), attaching listener');
    initialBtn.dataset.listenerAttached = 'true';

    initialBtn.addEventListener("click", () => {
      startRecording();
    });
  }

  // 方式2: 最終結果ページが表示されたら録音を停止
  // 「Download BoldVoice」が表示されたら最終結果と判断
  const observer = new MutationObserver(() => {
    // 現在録音中のセッションがない場合はスキップ
    if (!currentSessionId || !sessions[currentSessionId]) {
      return;
    }

    const currentSession = sessions[currentSessionId];
    if (!currentSession.recorder || currentSession.recorder.state !== "recording") {
      return;
    }

    // 最終結果ページの判定：「Download BoldVoice」テキストの存在
    // パフォーマンスのため、特定の範囲のみ検索
    const downloadSection = document.querySelector('.info-section, [class*="download"], [class*="Download"]');
    if (downloadSection && downloadSection.textContent.includes('Download BoldVoice')) {
      console.log(`Final results page detected for session ${currentSessionId}, stopping recording`);
      stopRecording(currentSessionId);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// ページ読み込み時にトリガーをセットアップ
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    setupTriggers();
  });
} else {
  setupTriggers();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  stopAllRecordings();
});