// Version check
console.log('BoldVoice Recorder content.js loaded - Version 2.4 (RMSベース無音検出)');

let mediaRecorder = null;
let recordedChunks = [];
let currentStream = null;
let hasStoppedRecording = false; // 重複停止を防ぐフラグ（グローバル化）
let periodicCheckInterval = null; // 定期チェックのインターバルID（グローバル化）
let loadingIndicator = null; // ローディング表示用の要素

// ローディングインジケーターを表示
function showLoadingIndicator() {
  // 既に表示されている場合は何もしない
  if (loadingIndicator && document.body.contains(loadingIndicator)) {
    return;
  }

  loadingIndicator = document.createElement('div');
  loadingIndicator.id = 'boldvoice-recorder-loading';
  loadingIndicator.innerHTML = `
    <div style="
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 999999;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 16px 24px;
      border-radius: 12px;
      box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 12px;
      animation: slideIn 0.3s ease-out;
    ">
      <div style="
        width: 20px;
        height: 20px;
        border: 3px solid rgba(255, 255, 255, 0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      "></div>
      <span>録音を処理中...</span>
    </div>
    <style>
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      @keyframes slideIn {
        from {
          transform: translateX(400px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    </style>
  `;

  document.body.appendChild(loadingIndicator);
  console.log('[UI] Loading indicator shown');
}

// ローディングインジケーターを非表示
function hideLoadingIndicator() {
  if (loadingIndicator && document.body.contains(loadingIndicator)) {
    loadingIndicator.style.animation = 'slideOut 0.3s ease-out';

    // アニメーション用のスタイルを追加
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideOut {
        from {
          transform: translateX(0);
          opacity: 1;
        }
        to {
          transform: translateX(400px);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);

    setTimeout(() => {
      if (loadingIndicator && document.body.contains(loadingIndicator)) {
        document.body.removeChild(loadingIndicator);
        loadingIndicator = null;
      }
      style.remove();
      console.log('[UI] Loading indicator hidden');
    }, 300);
  }
}

// 完了メッセージを表示
function showSuccessMessage() {
  // ローディング表示がある場合は先に消す
  if (loadingIndicator && document.body.contains(loadingIndicator)) {
    document.body.removeChild(loadingIndicator);
    loadingIndicator = null;
  }

  const successIndicator = document.createElement('div');
  successIndicator.innerHTML = `
    <div style="
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 999999;
      background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
      color: white;
      padding: 16px 24px;
      border-radius: 12px;
      box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 12px;
      animation: slideIn 0.3s ease-out;
    ">
      <div style="
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
      ">✓</div>
      <span>ダウンロード完了しました</span>
    </div>
    <style>
      @keyframes slideIn {
        from {
          transform: translateX(400px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    </style>
  `;

  document.body.appendChild(successIndicator);
  console.log('[UI] Success message shown');

  // 2.5秒後に自動的に消す
  setTimeout(() => {
    if (document.body.contains(successIndicator)) {
      successIndicator.style.animation = 'slideOut 0.3s ease-out';

      const style = document.createElement('style');
      style.textContent = `
        @keyframes slideOut {
          from {
            transform: translateX(0);
            opacity: 1;
          }
          to {
            transform: translateX(400px);
            opacity: 0;
          }
        }
      `;
      document.head.appendChild(style);

      setTimeout(() => {
        if (document.body.contains(successIndicator)) {
          document.body.removeChild(successIndicator);
        }
        style.remove();
        console.log('[UI] Success message hidden');
      }, 300);
    }
  }, 2500);
}

async function startRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    return;
  }

  try {
    // 新しい録音セッション開始時にフラグをリセット
    hasStoppedRecording = false;

    // 既存の定期チェックがあればクリア
    if (periodicCheckInterval) {
      clearInterval(periodicCheckInterval);
    }

    // 定期チェックを再開
    periodicCheckInterval = setInterval(checkForResults, 1000);
    console.log('[INFO] Recording session started, periodic check enabled');

    currentStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(currentStream);

    recordedChunks = [];

    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };

    mediaRecorder.onstop = async () => {
      try {
        const blob = new Blob(recordedChunks, { type: "audio/webm" });

        // ローディング表示を開始
        showLoadingIndicator();

        // 無音トリミング処理
        console.log('[Recording] Processing silence trimming...');
        const trimmedBlob = await trimSilence(blob);

        const blobUrl = URL.createObjectURL(trimmedBlob);

        const allLanguages = extractAllLanguagesFromPage();
        const topResult = allLanguages.length > 0
          ? allLanguages.reduce((best, current) => (!best || current.percent > best.percent) ? current : best, null)
          : { language: "unknown", percent: 0 };
        const { language, percent } = topResult;

        const now = new Date();
        const dateStr = [
          now.getFullYear(),
          String(now.getMonth() + 1).padStart(2, "0"),
          String(now.getDate()).padStart(2, "0")
        ].join("");

        // 拡張機能コンテキストが有効か確認
        if (!chrome.runtime?.id) {
          console.error('[ERROR] Extension context invalidated - please reload the page');
          URL.revokeObjectURL(blobUrl);
          hideLoadingIndicator();
          return;
        }

        chrome.runtime.sendMessage({
          type: "saveRecording",
          blobUrl,
          language,
          percent,
          allLanguages,
          dateStr
        }, (res) => {
          if (!res || !res.ok) {
            console.error("Failed to save recording", res && res.error);
            // エラー時はローディングを消すだけ
            hideLoadingIndicator();
          } else {
            // 成功時は完了メッセージを表示
            showSuccessMessage();
          }
          // blobUrlのrevokeは、ダウンロード完了後でも可
          setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        });

        if (currentStream) {
          currentStream.getTracks().forEach(t => t.stop());
          currentStream = null;
        }
      } catch (error) {
        console.error('[ERROR] Failed to process recording:', error);
        hideLoadingIndicator();
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
 * 結果ページ判定のロジック（グローバル関数化）
 */
function checkForResults() {
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
      periodicCheckInterval = null;
    }
  }
}

/**
 * Bold Voice Accent Oracleの結果画面から、すべての言語＋パーセンテージを取得
 *
 * 実際のDOM構造（2025-11-16時点）:
 * - 言語名: <div class="flex flex-1 text-text-primary-dark text-base leading-[130%] font-bold">Japanese</div>
 * - スコア: <div class="text-text-primary-dark text-base leading-[130%] font-bold">50%</div>
 * - 2位以降の言語: class="flex flex-1 text-[#11D1A7] text-base leading-[130%] font-bold"
 */
function extractAllLanguagesFromPage() {
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

  // すべての言語スコアを返す（スコア降順でソート）
  return languageScores.sort((a, b) => b.percent - a.percent);
}

/**
 * Bold Voice上の表示を保存用のフォルダ名に変換
 * 例: "American English" → "en_us"
 *
 * セキュリティ: 安全な文字（a-z, 0-9, _）のみを許可し、
 * パストラバーサルやOS依存の危険な文字を除外
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

  // フォールバック: 安全な文字のみ許可（a-z, 0-9, アンダースコア）
  // 危険な文字 (/, \, :, *, ?, ", <, >, |, ..) を除外
  const sanitized = name.replace(/[^a-z0-9_]/gi, "_").toLowerCase();

  // 空文字列や無効な結果の場合はunknownを返す
  return sanitized || "unknown";
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
  // MutationObserver: DOM変更を検出（2回判定パターン用）
  const observer = new MutationObserver(checkForResults);
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

// 録音中にページを離れようとすると警告を表示
window.addEventListener("beforeunload", (e) => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    // 標準的な警告メッセージを表示（ブラウザが自動的に表示）
    e.preventDefault();
    e.returnValue = ""; // Chrome requires returnValue to be set
    console.log("[WARNING] Recording in progress - page unload prevented");
    return "録音中です。ページを離れると録音が失われます。";
  }
});

/**
 * 無音トリミング機能
 * 録音データから無音部分を自動検出して除去
 */

/**
 * 複数の音声区間を検出
 * @param {AudioBuffer} audioBuffer - 解析する音声バッファ
 * @param {number} threshold - 無音判定の閾値（0-1、デフォルト0.01）
 * @param {number} minSilenceDuration - 無音と判定する最小継続時間（秒、デフォルト1.0）
 * @returns {Array<{start: number, end: number}>} - 検出された音声区間の配列
 */
function detectMultipleVoiceRegions(audioBuffer, threshold = 0.01, minSilenceDuration = 1.0) {
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const minSilenceSamples = Math.floor(minSilenceDuration * sampleRate);

  // 前後の余白を短くする（0.1秒）
  const paddingSamples = Math.floor(0.1 * sampleRate);

  const regions = [];
  let inVoice = false;
  let regionStart = 0;
  let silenceCount = 0;

  for (let i = 0; i < channelData.length; i++) {
    const amplitude = Math.abs(channelData[i]);

    if (amplitude > threshold) {
      // 音声検出
      if (!inVoice) {
        // 新しい音声区間の開始（0.1秒前から）
        regionStart = Math.max(0, i - paddingSamples);
        inVoice = true;
      }
      silenceCount = 0;
    } else {
      // 無音検出
      silenceCount++;

      if (inVoice && silenceCount >= minSilenceSamples) {
        // 音声区間の終了（0.1秒後まで）
        const regionEnd = Math.min(channelData.length, i - silenceCount + paddingSamples);

        // 最小長さ（0.5秒）以上の区間のみ追加
        if ((regionEnd - regionStart) / sampleRate >= 0.5) {
          regions.push({ start: regionStart, end: regionEnd });
        }

        inVoice = false;
      }
    }
  }

  // 最後の区間が未終了の場合、末尾の無音を削除
  if (inVoice) {
    // 末尾の無音検出には高い閾値を使用（背景ノイズを無視）
    const trailingThreshold = 0.02;

    // 末尾から逆順にスキャンして、音声が実際に終わる位置を探す
    let actualEnd = channelData.length - 1;
    let trailingSilence = 0;

    for (let i = channelData.length - 1; i >= regionStart; i--) {
      const amplitude = Math.abs(channelData[i]);
      if (amplitude > trailingThreshold) {
        // 音声を検出したら、そこから少し後ろ（0.1秒）まで含める
        actualEnd = Math.min(channelData.length, i + paddingSamples);
        break;
      }
      trailingSilence++;
    }

    // 最小長さ（0.5秒）以上の区間のみ追加
    if ((actualEnd - regionStart) / sampleRate >= 0.5) {
      regions.push({ start: regionStart, end: actualEnd });
      console.log(`[Trim] Last region trailing silence trimmed: ${(trailingSilence / sampleRate).toFixed(2)}s removed`);
    }
  }

  console.log(`[Trim] Detected ${regions.length} voice region(s):`);
  regions.forEach((region, i) => {
    const duration = (region.end - region.start) / sampleRate;
    console.log(`  Region ${i + 1}: ${region.start} - ${region.end} (${duration.toFixed(2)}s)`);
  });

  return regions;
}

/**
 * AudioBufferをトリミング
 * @param {AudioBuffer} audioBuffer - 元のAudioBuffer
 * @param {number} startSample - 開始サンプル位置
 * @param {number} endSample - 終了サンプル位置
 * @returns {AudioBuffer} - トリミング後のAudioBuffer
 */
function trimAudioBuffer(audioBuffer, startSample, endSample) {
  const length = endSample - startSample;
  const numberOfChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;

  // 新しいAudioBufferを作成
  const audioContext = new AudioContext();
  const trimmedBuffer = audioContext.createBuffer(numberOfChannels, length, sampleRate);

  // 各チャンネルのデータをコピー
  for (let channel = 0; channel < numberOfChannels; channel++) {
    const sourceData = audioBuffer.getChannelData(channel);
    const targetData = trimmedBuffer.getChannelData(channel);

    for (let i = 0; i < length; i++) {
      targetData[i] = sourceData[startSample + i];
    }
  }

  return trimmedBuffer;
}

/**
 * 複数の音声区間を適度な間隔で結合
 * @param {AudioBuffer} audioBuffer - 元のAudioBuffer
 * @param {Array<{start: number, end: number}>} regions - 音声区間の配列
 * @param {number} gapDuration - 区間間の間隔（秒、デフォルト2.0）
 * @returns {AudioBuffer} - 結合後のAudioBuffer
 */
function mergeAudioRegionsWithGap(audioBuffer, regions, gapDuration = 2.0) {
  const numberOfChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const gapSamples = Math.floor(gapDuration * sampleRate);

  // 合計の長さを計算
  let totalLength = 0;
  regions.forEach((region, i) => {
    totalLength += (region.end - region.start);
    if (i < regions.length - 1) {
      totalLength += gapSamples; // 区間間の間隔
    }
  });

  // 新しいAudioBufferを作成
  const audioContext = new AudioContext();
  const mergedBuffer = audioContext.createBuffer(numberOfChannels, totalLength, sampleRate);

  // 各チャンネルのデータを結合
  for (let channel = 0; channel < numberOfChannels; channel++) {
    const sourceData = audioBuffer.getChannelData(channel);
    const targetData = mergedBuffer.getChannelData(channel);

    let writePosition = 0;

    regions.forEach((region, i) => {
      const regionLength = region.end - region.start;

      // 音声区間をコピー
      for (let j = 0; j < regionLength; j++) {
        targetData[writePosition + j] = sourceData[region.start + j];
      }

      writePosition += regionLength;

      // 最後の区間以外は間隔（無音）を追加
      if (i < regions.length - 1) {
        // gapSamplesの無音（0）はデフォルトで0なので明示的に書く必要はないが、念のため
        for (let j = 0; j < gapSamples; j++) {
          targetData[writePosition + j] = 0;
        }
        writePosition += gapSamples;
      }
    });
  }

  console.log(`[Trim] Merged ${regions.length} regions with ${gapDuration}s gaps, total: ${mergedBuffer.duration.toFixed(2)}s`);

  return mergedBuffer;
}

/**
 * AudioBufferをWebMにエンコード
 * @param {AudioBuffer} audioBuffer - エンコードするAudioBuffer
 * @returns {Promise<Blob>} - WebM形式のBlob
 */
async function encodeToWebM(audioBuffer) {
  return new Promise((resolve, reject) => {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;

    // AudioContextで再生用のソースを作成
    const offlineContext = new OfflineAudioContext(numberOfChannels, length, sampleRate);
    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineContext.destination);
    source.start(0);

    // MediaStreamDestinationを使って録音
    // （OfflineAudioContextからは直接MediaStreamが取得できないため、
    //  AudioContextを使用する必要がある）
    const audioContext = new AudioContext();
    const mediaStreamDestination = audioContext.createMediaStreamDestination();
    const sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(mediaStreamDestination);

    const mediaRecorder = new MediaRecorder(mediaStreamDestination.stream, {
      mimeType: 'audio/webm'
    });

    const chunks = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      resolve(blob);
    };

    mediaRecorder.onerror = (e) => {
      reject(e);
    };

    // 録音開始
    mediaRecorder.start();
    sourceNode.start(0);

    // 録音終了（AudioBufferの長さ分待つ）
    setTimeout(() => {
      mediaRecorder.stop();
      sourceNode.stop();
      audioContext.close();
    }, (length / sampleRate) * 1000 + 100); // 少し余裕を持たせる
  });
}

/**
 * 長い無音区間を検出して短縮
 * @param {AudioBuffer} audioBuffer - 元のAudioBuffer
 * @param {number} threshold - 無音判定の閾値
 * @param {number} minSilenceToCompress - 短縮対象とする最小無音長（秒）
 * @param {number} targetSilenceDuration - 短縮後の無音長（秒）
 * @returns {AudioBuffer} - 無音短縮後のAudioBuffer
 */
function compressLongSilences(audioBuffer, threshold = 0.005, minSilenceToCompress = 1.0, targetSilenceDuration = 1.5) {
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const numberOfChannels = audioBuffer.numberOfChannels;

  const minSilenceSamples = Math.floor(minSilenceToCompress * sampleRate);
  const targetSilenceSamples = Math.floor(targetSilenceDuration * sampleRate);

  // RMSベースの無音検出パラメータ
  const windowSize = Math.floor(0.05 * sampleRate); // 50msウィンドウ
  const rmsThreshold = threshold; // RMS閾値
  const trailingRmsThreshold = 0.02; // 末尾検出用の高い閾値

  // RMSを計算する関数
  function calculateRMS(data, start, end) {
    let sumSquares = 0;
    const length = end - start;
    for (let i = start; i < end; i++) {
      sumSquares += data[i] * data[i];
    }
    return Math.sqrt(sumSquares / length);
  }

  // 先頭の無音を検出（RMSベース）
  let leadingEnd = 0;
  for (let i = 0; i < channelData.length; i += windowSize) {
    const end = Math.min(i + windowSize, channelData.length);
    const rms = calculateRMS(channelData, i, end);
    if (rms > rmsThreshold) {
      leadingEnd = i;
      break;
    }
  }

  // 末尾の無音を検出（RMSベース、高い閾値を使用）
  let trailingStart = channelData.length;
  for (let i = channelData.length - windowSize; i >= 0; i -= windowSize) {
    const start = Math.max(i, 0);
    const rms = calculateRMS(channelData, start, start + windowSize);
    if (rms > trailingRmsThreshold) {
      trailingStart = Math.min(channelData.length, start + windowSize + Math.floor(0.1 * sampleRate));
      break;
    }
  }

  // 先頭/末尾を除いた範囲で無音区間を検出（RMSベース）
  const rawSilenceRegions = [];
  let inSilence = false;
  let silenceStart = 0;

  for (let i = leadingEnd; i < trailingStart; i += windowSize) {
    const end = Math.min(i + windowSize, trailingStart);
    const rms = calculateRMS(channelData, i, end);

    if (rms <= rmsThreshold) {
      if (!inSilence) {
        silenceStart = i;
        inSilence = true;
      }
    } else {
      if (inSilence) {
        const silenceLength = i - silenceStart;
        if (silenceLength >= minSilenceSamples) {
          rawSilenceRegions.push({ start: silenceStart, end: i, length: silenceLength });
        }
        inSilence = false;
      }
    }
  }

  // 最後に無音が続いている場合（trailingStartまで）
  if (inSilence && silenceStart < trailingStart) {
    const silenceLength = trailingStart - silenceStart;
    if (silenceLength >= minSilenceSamples) {
      rawSilenceRegions.push({ start: silenceStart, end: trailingStart, length: silenceLength });
    }
  }

  // 近い無音区間を結合（10秒以内の間隔）
  const mergeGapThreshold = 10.0 * sampleRate; // 10秒
  const silenceRegions = [];

  if (rawSilenceRegions.length > 0) {
    let currentRegion = { ...rawSilenceRegions[0] };

    for (let i = 1; i < rawSilenceRegions.length; i++) {
      const nextRegion = rawSilenceRegions[i];
      const gap = nextRegion.start - currentRegion.end;

      if (gap <= mergeGapThreshold) {
        // 結合: 現在の区間を次の区間の終わりまで拡張
        currentRegion.end = nextRegion.end;
        currentRegion.length = currentRegion.end - currentRegion.start;
      } else {
        // 結合しない: 現在の区間を保存して次へ
        silenceRegions.push(currentRegion);
        currentRegion = { ...nextRegion };
      }
    }

    // 最後の区間を追加
    silenceRegions.push(currentRegion);
  }

  console.log(`[Trim] Leading silence: ${(leadingEnd / sampleRate).toFixed(2)}s`);
  console.log(`[Trim] Trailing silence: ${((channelData.length - trailingStart) / sampleRate).toFixed(2)}s`);
  console.log(`[Trim] Found ${silenceRegions.length} long silence region(s) to compress`);

  // 全ての無音区間を詳細表示
  silenceRegions.forEach((region, i) => {
    const duration = region.length / sampleRate;
    const position = region.start / sampleRate;
    console.log(`[Trim]   Silence ${i + 1}: at ${position.toFixed(2)}s, duration ${duration.toFixed(2)}s`);
  });

  // 新しいバッファのサイズを計算
  let newLength = trailingStart - leadingEnd;
  silenceRegions.forEach(region => {
    if (region.start >= leadingEnd && region.end <= trailingStart) {
      const reduction = region.length - targetSilenceSamples;
      if (reduction > 0) {
        newLength -= reduction;
        console.log(`[Trim]   Silence at ${(region.start / sampleRate).toFixed(2)}s: ${(region.length / sampleRate).toFixed(2)}s -> ${targetSilenceDuration}s`);
      }
    }
  });

  // 新しいバッファを作成
  const audioContext = new AudioContext();
  const compressedBuffer = audioContext.createBuffer(numberOfChannels, newLength, sampleRate);

  for (let channel = 0; channel < numberOfChannels; channel++) {
    const sourceData = audioBuffer.getChannelData(channel);
    const targetData = compressedBuffer.getChannelData(channel);

    let writePos = 0;
    let readPos = leadingEnd;

    // 無音区間を範囲内のものだけにフィルタ
    const validSilenceRegions = silenceRegions.filter(r =>
      r.start >= leadingEnd && r.end <= trailingStart
    );

    let currentSilenceIndex = 0;

    while (readPos < trailingStart) {
      // 次の無音区間の開始位置を確認
      const nextSilence = currentSilenceIndex < validSilenceRegions.length
        ? validSilenceRegions[currentSilenceIndex]
        : null;

      if (nextSilence && readPos === nextSilence.start) {
        // 無音区間を短縮してコピー
        for (let i = 0; i < targetSilenceSamples && writePos < newLength; i++) {
          targetData[writePos++] = 0;
        }
        readPos = nextSilence.end;
        currentSilenceIndex++;
      } else {
        // 通常の音声部分をコピー
        targetData[writePos++] = sourceData[readPos++];
      }
    }
  }

  return compressedBuffer;
}

/**
 * 無音部分をトリミングする（長い無音を検出して短縮）
 * @param {Blob} blob - 元の録音Blob
 * @returns {Promise<Blob>} - トリミング後のBlob
 */
async function trimSilence(blob) {
  try {
    console.log('[Trim] Starting silence trimming...');
    const startTime = performance.now();

    // 1. BlobをArrayBufferに変換
    const arrayBuffer = await blob.arrayBuffer();

    // 2. AudioContextでデコード
    const audioContext = new AudioContext();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    console.log(`[Trim] Original duration: ${audioBuffer.duration.toFixed(2)}s`);

    // 3. 長い無音を検出して短縮（RMSベース: 1.0秒以上の無音を0.5秒に短縮）
    // RMS閾値0.01で小声も保護しながら、長い無音だけを短縮
    const compressedBuffer = compressLongSilences(audioBuffer, 0.01, 1.0, 0.5);

    console.log(`[Trim] Trimmed duration: ${compressedBuffer.duration.toFixed(2)}s`);

    // 4. 再エンコード
    const trimmedBlob = await encodeToWebM(compressedBuffer);

    const endTime = performance.now();
    console.log(`[Trim] Trimming completed in ${((endTime - startTime) / 1000).toFixed(2)}s`);

    return trimmedBlob;
  } catch (error) {
    console.error('[Trim] Error during trimming, using original blob:', error);
    // エラーが発生した場合は元のBlobを返す
    return blob;
  }
}
