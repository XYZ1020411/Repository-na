# HolidayPredictor｜台灣即時放假預測與通知網

React + TypeScript + Vite + Tailwind CSS + Express starter.

## 本機啟動
1. 安裝 Node.js 20+
2. `npm install`
3. 複製 `.env.example` 為 `.env`，填入中央氣象署 API 金鑰（可選）
4. `npm run dev`

前端使用 Vite，API 預設為 `http://localhost:8787`。

## 資料與安全提醒
目前風雨數字是示範值，並非即時觀測；風險百分比不是官方機率模型。未取得可驗證的政府公告時會顯示「待確認」，不會推定為正常上班上課。後端氣象資料欄位映射尚需依中央氣象署最新 API 文件驗證後完成。

官方來源：
- 中央氣象署：https://www.cwa.gov.tw/
- 行政院人事行政總處：https://www.dgpa.gov.tw/
- 全國法規資料庫：https://law.moj.gov.tw/
