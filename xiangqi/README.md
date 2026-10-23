# 連線象棋

繁體中文象棋網頁，支援同機雙人及 PeerJS 點對點房間連線。

## GitHub Pages 發布

1. 將此資料夾的 `index.html` 放入 GitHub 儲存庫的 `xiangqi/` 目錄。
2. 在 Repository → Settings → Pages，選擇部署來源（通常是 Deploy from a branch），選擇 `main` 與 `/(root)`。
3. 網站根目錄已部署時，可從 `https://<你的帳號>.github.io/<儲存庫名稱>/xiangqi/` 開啟；若 Pages 使用專案自訂路徑，請依實際設定調整。
4. 建立房間後把 5 碼房號傳給對手。雙方都需要網路與可用的 PeerJS 公共訊號服務。

## 注意

- 此版本使用 PeerJS 公共訊號服務與 WebRTC；網路、防火牆或服務可用性可能影響連線。
- 遊戲為前端示範，沒有伺服器端防作弊驗證。正式公開服務建議加入權威伺服器、完整將軍/將死判定與重新連線處理。
