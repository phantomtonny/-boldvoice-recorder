document.addEventListener("DOMContentLoaded", async () => {
  const parentFolderInput = document.getElementById("parentFolder");
  const saveBtn = document.getElementById("saveBtn");
  const messageDiv = document.getElementById("message");

  // 保存されている設定を読み込む
  const { parentFolder } = await chrome.storage.sync.get({
    parentFolder: "BoldVoiceRec"
  });
  parentFolderInput.value = parentFolder;

  // 保存ボタンのクリックイベント
  saveBtn.addEventListener("click", async () => {
    const input = parentFolderInput.value.trim();

    // 空の場合はデフォルト値
    if (!input) {
      await chrome.storage.sync.set({ parentFolder: "BoldVoiceRec" });
      showMessage("設定を保存しました（デフォルト値）", true);
      return;
    }

    // セキュリティ: フォルダ名のバリデーション
    // 1. パストラバーサル（..）を防止
    if (input.includes('..')) {
      showMessage("フォルダ名に「..」は使用できません", false);
      return;
    }

    // 2. 無効な文字をチェック（ファイルシステムで使えない文字）
    const invalidChars = /[<>:"/\\|?*]/;
    if (invalidChars.test(input)) {
      showMessage("フォルダ名に使用できない文字が含まれています", false);
      return;
    }

    // 3. 安全な文字のみを許可（英数字、ハイフン、アンダースコア）
    const sanitized = input.replace(/[^a-zA-Z0-9_-]/g, "_");

    // 4. サニタイズ後に空になった場合はデフォルト値
    const finalFolderName = sanitized || "BoldVoiceRec";

    await chrome.storage.sync.set({
      parentFolder: finalFolderName
    });

    // サニタイズで変更があった場合は警告
    if (sanitized !== input) {
      showMessage(`設定を保存しました（一部の文字を置換: ${finalFolderName}）`, true);
      parentFolderInput.value = finalFolderName;
    } else {
      showMessage("設定を保存しました", true);
    }
  });

  // Enterキーでも保存できるようにする
  parentFolderInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      saveBtn.click();
    }
  });
});

function showMessage(text, isSuccess) {
  const messageDiv = document.getElementById("message");
  messageDiv.textContent = text;
  messageDiv.className = "message";

  if (isSuccess) {
    messageDiv.classList.add("success");
  }

  messageDiv.style.display = "block";

  // 3秒後にメッセージを非表示
  setTimeout(() => {
    messageDiv.style.display = "none";
  }, 3000);
}
