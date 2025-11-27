# Changelog

All notable changes to BoldVoice Recorder will be documented in this file.

## [0.2.7] - 2025-11-27

### Added
- **並行録音対応**: セッション管理システムで複数の録音を同時に処理可能
- セッションごとの録音中インジケーター表示

### Changed
- BoldVoice最新UI対応（グラデーションボタンに対応）
- 録音ボタンセレクタを更新: `div.cursor-pointer.rounded-full.size-[90px]`
- 結果ページ判定ロジックを改善
  - 新判定: "Did we get it right?", "Try it Again", "View Past Results"
  - 旧判定（削除）: "Download BoldVoice", "Get BoldVoice"

### Fixed
- 録音セッション間の競合問題を完全に解決
- 結果ページでの録音自動停止が正常に動作するように修正

## [0.2.4] - 2025-11-XX

### Added
- 録音中インジケーター表示機能
- 処理中ローディング表示
- 完了メッセージ表示

### Changed
- 無音トリミング機能の改善（RMSベース）

## Earlier Versions

詳細は Git コミット履歴を参照してください。
