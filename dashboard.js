// Dashboard.js - BoldVoice Recorder Dashboard
console.log('Dashboard loaded');

let recordingsData = [];
let chartInstance = null;
let targetAccent = 'en_uk'; // デフォルト

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

  // 目標アクセントのスコアのみを抽出
  const scores = data.map(r => {
    if (r.allLanguages && r.allLanguages.length > 0) {
      const targetLang = r.allLanguages.find(lang => lang.language === targetAccent);
      return targetLang ? targetLang.percent : 0;
    }
    // 古いデータ（allLanguagesがない場合）は従来の方法
    return r.language === targetAccent ? r.score : 0;
  }).filter(s => s > 0);

  const avgScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;

  const bestScore = scores.length > 0
    ? Math.max(...scores)
    : 0;

  // 直近の改善率計算（最初の5件と最後の5件を比較）
  let improvement = '-';
  if (data.length >= 10) {
    const recent = data.slice(-5).map(r => r.score).filter(s => s > 0);
    const old = data.slice(0, 5).map(r => r.score).filter(s => s > 0);

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

  // 古いチャートを破棄
  if (chartInstance) {
    chartInstance.destroy();
  }

  if (data.length === 0) {
    ctx.style.display = 'none';
    return;
  }

  ctx.style.display = 'block';

  // データを日付順にソート
  const sorted = [...data].sort((a, b) => a.timestamp - b.timestamp);

  // 目標アクセントのスコアがあるデータのみ抽出
  const withScores = sorted.map(r => {
    let targetScore = 0;
    if (r.allLanguages && r.allLanguages.length > 0) {
      const targetLang = r.allLanguages.find(lang => lang.language === targetAccent);
      targetScore = targetLang ? targetLang.percent : 0;
    } else if (r.language === targetAccent) {
      // 古いデータ（allLanguagesがない場合）
      targetScore = r.score;
    }
    return { ...r, targetScore };
  }).filter(r => r.targetScore > 0);

  if (withScores.length === 0) {
    ctx.style.display = 'none';
    return;
  }

  const labels = withScores.map(r => {
    const date = new Date(r.timestamp);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}/${month}/${day} ${hours}:${minutes}`;
  });

  const scores = withScores.map(r => r.targetScore);

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

          // ターゲットアクセントのスコアを取得
          let displayScore = r.score;
          let isTargetAccent = r.language === targetAccent;

          // 新しいデータ形式の場合
          if (r.allLanguages && r.allLanguages.length > 0) {
            const targetLang = r.allLanguages.find(lang => lang.language === targetAccent);
            if (targetLang) {
              displayScore = targetLang.percent;
              isTargetAccent = true;
            } else {
              isTargetAccent = false;
            }
          }

          // ターゲットアクセントのみ色付け、それ以外はグレー
          let scoreDisplay;
          if (isTargetAccent && displayScore > 0) {
            const scoreClass = displayScore >= 80 ? 'score-high' : displayScore >= 60 ? 'score-medium' : 'score-low';
            scoreDisplay = `<span class="score-badge ${scoreClass}">${displayScore}%</span>`;
          } else if (displayScore > 0) {
            scoreDisplay = `<span style="color: #999;">${displayScore}%</span>`;
          } else {
            scoreDisplay = '<span style="color: #999;">-</span>';
          }

          return `
            <tr>
              <td>${dateStr}</td>
              <td>${r.language.toUpperCase()}</td>
              <td>${scoreDisplay}</td>
              <td style="font-family: monospace; font-size: 12px; color: #666;">${r.filename}</td>
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
