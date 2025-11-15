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
    const newFolderName = parentFolderInput.value.trim() || "BoldVoiceRec";

    // 無効な文字をチェック（ファイルシステムで使えない文字）
    const invalidChars = /[<>:"/\\|?*]/;
    if (invalidChars.test(newFolderName)) {
      showMessage("フォルダ名に使用できない文字が含まれています", false);
      return;
    }

    await chrome.storage.sync.set({
      parentFolder: newFolderName
    });

    showMessage("設定を保存しました", true);
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
