// Dashboard.js - BoldVoice Recorder Dashboard
console.log('Dashboard loaded');

let recordingsData = [];
let chartInstance = null;
let targetAccent = 'en_uk'; // デフォルト

// セキュリティ: HTMLエスケープ関数（XSS対策）
function escapeHtml(unsafe) {
  if (typeof unsafe !== 'string') {
    return '';
  }
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ページ読み込み時に実行
document.addEventListener('DOMContentLoaded', async () => {
  await loadTargetAccent();
  await loadRecordings();
  setupEventListeners();
  renderDashboard();
});

// 目標アクセント設定とフィルター設定を読み込み
async function loadTargetAccent() {
  try {
    const result = await chrome.storage.local.get(['targetAccent', 'languageFilter', 'periodFilter']);
    targetAccent = result.targetAccent || 'en_uk';
    document.getElementById('targetAccent').value = targetAccent;

    // フィルター設定も復元
    if (result.languageFilter !== undefined) {
      document.getElementById('languageFilter').value = result.languageFilter;
    }
    if (result.periodFilter !== undefined) {
      document.getElementById('periodFilter').value = result.periodFilter;
    }

    console.log('Settings loaded:', { targetAccent, languageFilter: result.languageFilter, periodFilter: result.periodFilter });
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

// 目標アクセント設定を保存
async function saveTargetAccent(accent) {
  try {
    await chrome.storage.local.set({ targetAccent: accent });
    targetAccent = accent;
    console.log('Target accent saved:', accent);

    // 保存完了メッセージを表示
    const saved = document.getElementById('targetSaved');
    saved.style.opacity = '1';
    setTimeout(() => { saved.style.opacity = '0'; }, 2000);

    // ダッシュボードを再描画
    renderDashboard();
  } catch (error) {
    console.error('Failed to save target accent:', error);
  }
}

// 録音履歴をストレージから読み込み
async function loadRecordings() {
  try {
    const result = await chrome.storage.local.get(['recordingHistory']);
    recordingsData = result.recordingHistory || [];
    console.log('Loaded recordings:', recordingsData.length);
  } catch (error) {
    console.error('Failed to load recordings:', error);
    recordingsData = [];
  }
}

// イベントリスナー設定
function setupEventListeners() {
  document.getElementById('targetAccent').addEventListener('change', (e) => {
    saveTargetAccent(e.target.value);
  });
  document.getElementById('languageFilter').addEventListener('change', async (e) => {
    await chrome.storage.local.set({ languageFilter: e.target.value });
    renderDashboard();
  });
  document.getElementById('periodFilter').addEventListener('change', async (e) => {
    await chrome.storage.local.set({ periodFilter: e.target.value });
    renderDashboard();
  });
}

// ダッシュボード全体を描画
function renderDashboard() {
  const filteredData = getFilteredData();
  renderStats(filteredData);
  renderChart(filteredData);
  renderHistoryTable(filteredData);
}

// フィルター適用
function getFilteredData() {
  const languageFilter = document.getElementById('languageFilter').value;
  const periodFilter = document.getElementById('periodFilter').value;

  let filtered = [...recordingsData];

  // 言語フィルター
  if (languageFilter) {
    filtered = filtered.filter(r => r.language === languageFilter);
  }

  // 期間フィルター
  if (periodFilter) {
    const days = parseInt(periodFilter);
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    filtered = filtered.filter(r => r.timestamp >= cutoff);
  }

  return filtered;
}

// 統計情報を描画
function renderStats(data) {
  const total = data.length;

  // 目標アクセントの録音のみを抽出（録音言語がターゲットと一致するもの）
  const targetRecordings = data.filter(r => r.language === targetAccent);
  const scores = targetRecordings.map(r => r.score).filter(s => s > 0);

  // ターゲット言語のデータがない場合
  if (targetRecordings.length === 0) {
    document.getElementById('totalRecordings').textContent = total;
    document.getElementById('avgScore').textContent = '該当なし';
    document.getElementById('bestScore').textContent = '該当なし';
    document.getElementById('recentImprovement').textContent = '-';
    updateLanguageFilter(recordingsData);
    return;
  }

  const avgScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;

  const bestScore = scores.length > 0
    ? Math.max(...scores)
    : 0;

  // 直近の改善率計算（ターゲット言語の最初の5件と最後の5件を比較）
  let improvement = '-';
  if (targetRecordings.length >= 10) {
    const recent = targetRecordings.slice(-5).map(r => r.score).filter(s => s > 0);
    const old = targetRecordings.slice(0, 5).map(r => r.score).filter(s => s > 0);

    if (recent.length > 0 && old.length > 0) {
      const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
      const oldAvg = old.reduce((a, b) => a + b, 0) / old.length;
      const diff = recentAvg - oldAvg;
      improvement = diff > 0 ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`;
    }
  }

  document.getElementById('totalRecordings').textContent = total;
  document.getElementById('avgScore').textContent = `${avgScore}%`;
  document.getElementById('bestScore').textContent = `${bestScore}%`;
  document.getElementById('recentImprovement').textContent = improvement;

  // 言語フィルターのオプションを更新
  updateLanguageFilter(recordingsData);
}

// 言語フィルターのオプションを更新
function updateLanguageFilter(data) {
  const select = document.getElementById('languageFilter');
  const currentValue = select.value;

  // ユニークな言語を取得
  const languages = [...new Set(data.map(r => r.language))].sort();

  // オプションを再構築
  select.innerHTML = '<option value="">すべて</option>';
  languages.forEach(lang => {
    const option = document.createElement('option');
    option.value = lang;
    option.textContent = lang.toUpperCase();
    select.appendChild(option);
  });

  // 以前の選択を復元
  select.value = currentValue;
}

// グラフを描画
function renderChart(data) {
  const ctx = document.getElementById('scoreChart');
  const chartContainer = ctx.parentElement;

  // 古いチャートを破棄
  if (chartInstance) {
    chartInstance.destroy();
  }

  // 既存の空メッセージを削除
  const existingMsg = chartContainer.querySelector('.chart-empty-message');
  if (existingMsg) {
    existingMsg.remove();
  }

  if (data.length === 0) {
    ctx.style.display = 'none';
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'chart-empty-message';
    emptyMsg.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; color: #999;">
        <div style="font-size: 48px; margin-bottom: 16px;">📊</div>
        <div style="font-size: 16px;">録音データがありません</div>
      </div>
    `;
    chartContainer.appendChild(emptyMsg);
    return;
  }

  // データを日付順にソート
  const sorted = [...data].sort((a, b) => a.timestamp - b.timestamp);

  // 目標アクセントの録音のみを抽出（録音言語がターゲットと一致するもの）
  const targetRecordings = sorted.filter(r => r.language === targetAccent && r.score > 0);

  if (targetRecordings.length === 0) {
    ctx.style.display = 'none';
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'chart-empty-message';
    emptyMsg.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; color: #999;">
        <div style="font-size: 48px; margin-bottom: 16px;">📈</div>
        <div style="font-size: 16px; margin-bottom: 8px;">ターゲット言語（${getAccentDisplayName(targetAccent)}）のデータがありません</div>
        <div style="font-size: 14px; color: #bbb;">この言語で録音を開始すると、グラフが表示されます</div>
      </div>
    `;
    chartContainer.appendChild(emptyMsg);
    return;
  }

  ctx.style.display = 'block';

  const labels = targetRecordings.map(r => {
    const date = new Date(r.timestamp);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${year}/${month}/${day}`;
  });

  const scores = targetRecordings.map(r => r.score);

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: `${getAccentDisplayName(targetAccent)} スコア (%)`,
        data: scores,
        borderColor: '#667eea',
        backgroundColor: 'rgba(102, 126, 234, 0.1)',
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: '#667eea',
        pointBorderColor: '#fff',
        pointBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          padding: 12,
          titleFont: {
            size: 14
          },
          bodyFont: {
            size: 13
          },
          callbacks: {
            title: (context) => {
              const recording = targetRecordings[context[0].dataIndex];
              const date = new Date(recording.timestamp);
              const hours = String(date.getHours()).padStart(2, '0');
              const minutes = String(date.getMinutes()).padStart(2, '0');
              return `${context[0].label} ${hours}:${minutes}`;
            },
            label: (context) => `スコア: ${context.parsed.y}%`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: {
            callback: (value) => value + '%'
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.05)'
          }
        },
        x: {
          grid: {
            display: false
          }
        }
      }
    }
  });
}

// 履歴テーブルを描画
function renderHistoryTable(data) {
  const container = document.getElementById('historyTableContainer');

  if (data.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <div class="empty-state-text">録音データがありません</div>
        <div class="empty-state-subtext">BoldVoiceで録音を開始すると、ここに履歴が表示されます</div>
      </div>
    `;
    return;
  }

  // 新しい順にソート
  const sorted = [...data].sort((a, b) => b.timestamp - a.timestamp);

  const tableHTML = `
    <table>
      <thead>
        <tr>
          <th>日時</th>
          <th>言語</th>
          <th>スコア</th>
          <th>ファイル名</th>
        </tr>
      </thead>
      <tbody>
        ${sorted.map(r => {
          const date = new Date(r.timestamp);
          const dateStr = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

          // 常に最高スコアを表示（r.scoreは既に最高スコア）
          // セキュリティ: 数値として検証（background.jsで既に検証済みだが念のため）
          let displayScore = (typeof r.score === 'number' && r.score >= 0 && r.score <= 100) ? r.score : 0;
          // 録音言語がターゲットと一致する場合のみハイライト
          let isTargetAccent = r.language === targetAccent;

          // ターゲットアクセントのみ色付け、それ以外はグレー
          let scoreDisplay;
          if (isTargetAccent && displayScore > 0) {
            const scoreClass = displayScore >= 80 ? 'score-high' : displayScore >= 60 ? 'score-medium' : 'score-low';
            // 数値は安全だが、念のためMath.floor()で整数化
            scoreDisplay = `<span class="score-badge ${scoreClass}">${Math.floor(displayScore)}%</span>`;
          } else if (displayScore > 0) {
            scoreDisplay = `<span style="color: #999;">${Math.floor(displayScore)}%</span>`;
          } else {
            scoreDisplay = '<span style="color: #999;">-</span>';
          }

          return `
            <tr>
              <td>${escapeHtml(dateStr)}</td>
              <td>${escapeHtml(r.language).toUpperCase()}</td>
              <td>${scoreDisplay}</td>
              <td style="font-family: monospace; font-size: 12px; color: #666;">${escapeHtml(r.filename)}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;

  container.innerHTML = tableHTML;
}

// アクセントコードから表示名を取得
function getAccentDisplayName(code) {
  const names = {
    'en_us': 'American English',
    'en_uk': 'British English',
    'en': 'English',
    'fr': 'French',
    'es': 'Spanish',
    'de': 'German',
    'it': 'Italian',
    'pt': 'Portuguese',
    'zh': 'Chinese',
    'ja': 'Japanese',
    'ko': 'Korean'
  };
  return names[code] || code;
}
