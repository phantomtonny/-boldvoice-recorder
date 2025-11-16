// Version check
console.log('BoldVoice Recorder content.js loaded - Version 2.0 (2回判定対応版)');

let mediaRecorder = null;
let recordedChunks = [];
let currentStream = null;

async function startRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    return;
  }

  try {
    currentStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(currentStream);

    recordedChunks = [];

    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(recordedChunks, { type: "audio/webm" });
      const blobUrl = URL.createObjectURL(blob);

      const result = extractTopLanguageFromPage() || { language: "unknown", percent: 0 };
      const { language, percent } = result;
      const now = new Date();
      const dateStr = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0")
      ].join("");

      chrome.runtime.sendMessage({
        type: "saveRecording",
        blobUrl,
        language,
        percent,
        dateStr
      }, (res) => {
        if (!res || !res.ok) {
          console.error("Failed to save recording", res && res.error);
        }
        // blobUrlのrevokeは、ダウンロード完了後でも可
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      });

      if (currentStream) {
        currentStream.getTracks().forEach(t => t.stop());
        currentStream = null;
      }
    };

    mediaRecorder.start();
    console.log("Recording started");
  } catch (error) {
    console.error("Failed to start recording:", error);
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    console.log("Recording stopped");
  }
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
        // 既に録音中の場合は何もしない（継続録音）
        if (!mediaRecorder || mediaRecorder.state !== "recording") {
          console.log('Starting recording (or continuing session)');
          startRecording();
        } else {
          console.log('Already recording, continuing...');
          // 録音は継続（停止しない）
        }
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
      if (!mediaRecorder || mediaRecorder.state !== "recording") {
        console.log('Starting recording (or continuing session)');
        startRecording();
      } else {
        console.log('Already recording, continuing...');
      }
    });
  }

  // 方式2: 最終結果ページが表示されたら録音を停止
  // 複数の方法で最終結果ページを判定
  let hasStoppedRecording = false; // 重複停止を防ぐフラグ

  // 結果ページ判定のロジックを共通化
  const checkForResults = () => {
    // 既に停止済みの場合はスキップ
    if (hasStoppedRecording || !mediaRecorder || mediaRecorder.state !== "recording") {
      return;
    }

    // 方法1: 「Download BoldVoice」テキストの存在
    const bodyText = document.body.textContent || '';
    const hasDownloadText = bodyText.includes('Download BoldVoice');

    // 方法2: パーセンテージとdownloadボタンの両方が存在
    const hasPercentage = /\d+%/.test(bodyText);
    const hasGetButton = bodyText.includes('Get BoldVoice') || bodyText.includes('Download');

    // デバッグログ
    if (hasPercentage) {
      console.log('[DEBUG] Results detected, checking for final page...');
      console.log('[DEBUG] Has Download text:', hasDownloadText);
      console.log('[DEBUG] Has Get Button:', hasGetButton);
    }

    // 最終結果ページの判定
    if (hasDownloadText || (hasPercentage && hasGetButton)) {
      console.log("Final results page detected, stopping recording");
      hasStoppedRecording = true;
      stopRecording();
      if (periodicCheckInterval) {
        clearInterval(periodicCheckInterval);
      }
    }
  };

  // MutationObserver: DOM変更を検出（2回判定パターン用）
  const observer = new MutationObserver(checkForResults);
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // 定期チェック: 既に表示されている結果ページを検出（1回判定パターン用）
  // MutationObserverは既存のDOMを検出できないため、定期チェックで補完
  const periodicCheckInterval = setInterval(checkForResults, 1000);
}

// ページ読み込み時にトリガーをセットアップ
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    setupTriggers();
  });
} else {
  setupTriggers();
}
