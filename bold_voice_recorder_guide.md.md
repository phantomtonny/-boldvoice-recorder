**You:**

chromeの拡張機能を作りたい。

bold voiceっていうサイトがあるんだよ。アクセントを判定してくれるんだが、
声を入力しても、結果は残らないんだよね。

なので、その判定と同時に、録音を開始し、終了と共にファイルを保存するような
常駐型プラグインが欲しい。

指定フォルダを親フォルダとして、
最も高いパーセンテージが出た言語のフォルダに格納するようにしたい。
ファイル名は言語+yyyymmdd_0001～
フォルダは各言語、100毎に新規作成・保存（１～１００、１０１～２００、・・・）

ちょっと難しいか？

* * *

**ChatGPT:**

ざっくり言うと「まあまあ難しいけど、ちゃんと分解すれば普通に作れる」レベルだよ。

* * *

ざっくり仕様整理
--------

やりたいことをChrome拡張の観点で分解すると：

1. **Bold Voiceのページだけで動く常駐コンテンツスクリプト**
    
    * `boldvoice` のサイトを開いたら自動でスクリプトが注入される。
        
2. **録音の開始/終了トリガー**
    
    * ユーザーがBold Voiceで録音を始めたタイミングで、拡張側も録音開始
        
    * 判定が終わったタイミングで録音停止
        
3. **マイク音声の録音**
    
    * `getUserMedia + MediaRecorder` でユーザーの声を録音
        
    * Blobを背景スクリプトに送ってファイルとして保存
        
4. **Bold Voiceの結果画面から「言語＋パーセンテージ」をスクレイピング**
    
    * DOMを見て、`英語 98%` `米語 72%` みたいな要素から
        
    * 一番パーセンテージが高い言語を決定
        
5. **保存パスのルール**
    
    * 親フォルダ：ユーザーが拡張のオプションで指定（実際は Download フォルダの下に論理的に作る形になる）
        
    * 言語フォルダ：`en` `fr` など
        
    * 各言語ごとに、100ファイル単位でサブフォルダ
        
        * 1～100 → `001-100`
            
        * 101～200 → `101-200`
            
    * ファイル名：`言語 + yyyymmdd_0001.webm` みたいな感じ
        

* * *

まず知っておきたい制約
-----------

### 1. 好きなローカルフォルダには直接は書けない

普通のChrome拡張では：

* 任意のパスに勝手にファイルを書き込むことはできない
    
* **`chrome.downloads.download` で「ブラウザのダウンロードフォルダ以下」に保存**するのが現実的
    

なので、

* 拡張のオプションで「親フォルダ名」を設定  
    例：`BoldVoiceRec`
    
* 実際の保存場所は  
    `ダウンロードフォルダ / BoldVoiceRec / en / 001-100 / en20251114_0001.webm`
    

みたいなイメージにするのが現実的。

Windows上の完全な任意フォルダ（C:\foo\bar など）に自動保存したい場合は、  
**Native Messaging でローカルの補助プログラムを書く**必要が出てくるので、難度が一段上がる。

### 2. Bold VoiceのDOM構造は自分で要素を調べる必要あり

* 録音ボタンや結果表示部分の要素を `document.querySelector` で取る
    
* それに `click` イベントをフックしたり `MutationObserver` で変化を監視する  
    ここは実際に開発者ツールで要素を見ながらやることになる。
    

* * *

全体構成イメージ
--------

* `manifest.json` … MV3
    
* `background.js` … Service Worker（録音データを受け取り、ファイルとして保存）
    
* `content.js` … Bold Voiceのページに常駐して、
    
    * Start/Stop トリガー検出
        
    * 結果から言語とパーセンテージ取得
        
    * 録音の開始/停止制御
        
* `options.html / options.js` … 親フォルダ名などの設定（余裕があれば）
    

以下、最小構成のサンプルを出すね。

* * *

manifest.json の例
----------------

```json
{
  "manifest_version": 3,
  "name": "BoldVoice Recorder",
  "version": "0.1.0",
  "description": "Bold Voiceで判定すると同時に音声を録音して保存する拡張",
  "permissions": [
    "downloads",
    "storage",
    "scripting",
    "activeTab"
  ],
  "host_permissions": [
    "https://*.boldvoice.com/*",
    "https://boldvoice.com/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": [
        "https://*.boldvoice.com/*",
        "https://boldvoice.com/*"
      ],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "options_page": "options.html"
}
```

* * *

options.html / options.js（親フォルダ名の設定）
------------------------------------

### options.html

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>BoldVoice Recorder Options</title>
</head>
<body>
  <label>
    親フォルダ名 Download直下
    <input id="parentFolder" type="text" placeholder="BoldVoiceRec">
  </label>
  <button id="saveBtn">保存</button>

  <script src="options.js"></script>
</body>
</html>
```

### options.js

```js
document.addEventListener("DOMContentLoaded", async () => {
  const parentFolderInput = document.getElementById("parentFolder");
  const { parentFolder } = await chrome.storage.sync.get({
    parentFolder: "BoldVoiceRec"
  });
  parentFolderInput.value = parentFolder;

  document.getElementById("saveBtn").addEventListener("click", async () => {
    await chrome.storage.sync.set({
      parentFolder: parentFolderInput.value || "BoldVoiceRec"
    });
    alert("保存しました");
  });
});
```

* * *

background.js（録音データをファイルとして保存）
------------------------------

```js
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
  const { blobUrl, language, dateStr, index } = message;

  const { parentFolder } = await chrome.storage.sync.get({
    parentFolder: "BoldVoiceRec"
  });

  // 言語ごとの連番管理（indexはcontent側でも計算できるけど、ここでやってもいい）
  const key = `counter_${language}`;
  const stored = await chrome.storage.local.get({ [key]: 0 });
  const count = (stored[key] || 0) + 1;
  await chrome.storage.local.set({ [key]: count });

  // 100件ごとのフォルダ名算出
  const groupStart = Math.floor((count - 1) / 100) * 100 + 1;
  const groupEnd = groupStart + 99;
  const groupName = `${String(groupStart).padStart(3, "0")}-${String(groupEnd).padStart(3, "0")}`;

  const indexStr = String(count).padStart(4, "0");

  const filename = `${language}${dateStr}_${indexStr}.webm`;

  const fullPath = `${parentFolder}/${language}/${groupName}/${filename}`;

  await chrome.downloads.download({
    url: blobUrl,
    filename: fullPath,
    conflictAction: "uniquify"
  });
}
```

* * *

content.js（録音開始/終了と、言語判定の取得）
----------------------------

ここが一番サイト依存になる部分。  
以下は「雰囲気のサンプル」なので、実際にはBold VoiceのDOMを見ながら  
`querySelector` のセレクタを書き換える感じ。

```js
let mediaRecorder = null;
let recordedChunks = [];
let currentStream = null;

async function startRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    return;
  }

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
 */
function extractTopLanguageFromPage() {
  // ここは完全にダミー。実際は devtools でDOM構造を見て実装する
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
  // 必要に応じて追加
  return name.replace(/\s+/g, "_");
}

/**
 * 録音開始/終了のトリガー
 * ここもBold Voiceの実際のボタンに合わせて書き換えが必要
 */
function setupTriggers() {
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

document.addEventListener("DOMContentLoaded", () => {
  setupTriggers();
});
```

* * *

難易度のまとめ
-------

* **技術的には全部Chrome拡張の範囲で可能**
    
* ただし難しいポイントはここ：
    
    1. Bold VoiceのDOMを解析して、いい感じのトリガーや結果取得の方法を見つける
        
    2. Chrome拡張の制約的に「完全に任意のフォルダに保存」はできない  
        → Downloadフォルダ配下でうまくフォルダ構成を作る
        
    3. マイクの権限周りで、最初にブラウザが「マイク使うけどいい？」って聞いてくる
        

「Chrome拡張でHello Worldは書いたことある」くらいなら、  
**段階的に作っていけば現実的に到達できるレベル**だと思う。

もし次のステップ行くなら：

1. まずは「手動ボタン」で録音して、ファイル名ルールどおりに保存する拡張
    
2. そのあと Bold Voice のDOMを触って「自動で開始/終了」に持っていく
    

って順番でやるのが一番安全かな。

* * *

次にやりたいのはどこから？

* まずは「録音して保存だけする最小版」の完成を目指す？
    
* それともいきなり Bold Voice と連動する部分から攻める？