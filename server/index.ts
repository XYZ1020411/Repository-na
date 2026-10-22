import 'dotenv/config';
import express from 'express';
import cors from 'cors';
const app=express();app.use(cors());app.use(express.json());
app.get('/api/health',(_req,res)=>res.json({ok:true,service:'HolidayPredictor API',liveDataConfigured:Boolean(process.env.CWA_API_KEY)}));
app.get('/api/weather',(_req,res)=>{if(!process.env.CWA_API_KEY){res.status(503).json({error:'CWA_API_KEY_REQUIRED',message:'尚未設定中央氣象署 API 金鑰；目前畫面數據為示範資料。'});return;}res.status(501).json({error:'CWA_SCHEMA_MAPPING_REQUIRED',message:'已設定金鑰，但尚需依最新官方 API 文件驗證欄位映射；不會將未驗證資料冒充即時觀測。'});});
const port=Number(process.env.PORT||8787);app.listen(port,()=>console.log(`HolidayPredictor API listening on ${port}`));
