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

      const { language } = extractTopLanguageFromPage() || { language: "unknown" };
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
 * Bold Voiceの結果画面から、言語＋パーセンテージを拾って
 * 一番高いものを返す想定の関数
 *
 * 注意: この実装はダミーです。実際のBold VoiceのDOM構造を
 * 開発者ツールで確認して、適切なセレクタに置き換える必要があります。
 */
function extractTopLanguageFromPage() {
  // TODO: 実際のBold VoiceのDOM構造に合わせて実装する
  // 例: <div class="language-score">
  //        <span class="language-name">English</span>
  //        <span class="language-percent">97%</span>
  //      </div>

  const nodes = document.querySelectorAll(".language-score");
  if (!nodes.length) {
    return null;
  }

  let best = null;
  nodes.forEach(node => {
    const langEl = node.querySelector(".language-name");
    const percentEl = node.querySelector(".language-percent");
    if (!langEl || !percentEl) return;

    const langName = langEl.textContent.trim();
    const percentText = percentEl.textContent.trim().replace("%", "");
    const percent = parseFloat(percentText);

    if (isNaN(percent)) return;

    if (!best || percent > best.percent) {
      best = {
        language: normalizeLanguageName(langName),
        percent
      };
    }
  });

  return best;
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
 * ここもBold Voiceの実際のボタンに合わせて書き換えが必要
 */
function setupTriggers() {
  // TODO: 実際のBold VoiceのDOM構造に合わせて実装する

  // 例: 録音ボタン
  const recordBtn = document.querySelector(".record-button-selector"); // 要書き換え
  if (recordBtn) {
    recordBtn.addEventListener("click", () => {
      // Bold Voiceのボタンが「開始」と「停止」を兼ねているなら、
      // 状態を見てトグルする必要がある
      if (!mediaRecorder || mediaRecorder.state !== "recording") {
        startRecording();
      } else {
        stopRecording();
      }
    });
  }

  // もしくは、結果パネルが出たら自動で停止する方式なら MutationObserver を使う
  const target = document.body;
  const observer = new MutationObserver(() => {
    const resultPanel = document.querySelector(".result-panel-selector"); // 要書き換え
    if (resultPanel && mediaRecorder && mediaRecorder.state === "recording") {
      stopRecording();
    }
  });
  observer.observe(target, { childList: true, subtree: true });
}

// ページ読み込み時にトリガーをセットアップ
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    setupTriggers();
  });
} else {
  setupTriggers();
}
