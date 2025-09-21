import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = express();

// CẤU HÌNH
const PORT = process.env.PORT || 3001;
const ORIGIN = process.env.CORS_ORIGIN || '*'; 
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'gemini-2.5-flash-image-preview';
// MOCK ẢNH KHI KHÔNG CÓ KEY HOẶC LỖI
const ALLOW_FALLBACK = process.env.ALLOW_FALLBACK === '1';
const MAX_FILE_MB = Number(process.env.MAX_FILE_MB || 10);

const DUMMY_PNG_B64 =
  process.env.DUMMY_IMAGE_BASE64 ||
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';

// MULTER - upload file memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024 },
});

app.use(cors({ origin: ORIGIN }));

app.get('/health', (_req, res) =>
  res.json({ ok: true, model: DEFAULT_MODEL, allowFallback: ALLOW_FALLBACK })
);

//helpers
const partText = (text) => ({ text });
const partInlineImage = (file) => ({
  inlineData: { mimeType: file.mimetype || 'image/png', data: file.buffer.toString('base64') },
});

async function callGemini(apiKey, model, parts) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const modelClient = genAI.getGenerativeModel({ model });

  const response = await modelClient.generateContent({
    contents: [{ role: 'user', parts }],
  });

  const candidates = response?.response?.candidates ?? [];
  let textOut = '';

  for (const c of candidates) {
    for (const p of c?.content?.parts ?? []) {
      if (p?.inlineData?.data) {
        return { type: 'image', mime: p.inlineData.mimeType || 'image/png', data: p.inlineData.data };
      }
      if (typeof p?.text === 'string') textOut += p.text;
    }
  }
  if (textOut) return { type: 'text', text: textOut };
  throw new Error('NO_OUTPUT');
}

app.post('/generate', upload.single('image'), async (req, res) => {
  const t0 = Date.now();

  const prompt = (req.body?.prompt || '').toString();
  const userModel = (req.body?.model || '').toString().trim();
  const apiKey =
    (req.headers['x-api-key'] || req.body?.apiKey || process.env.GEMINI_API_KEY || '').toString().trim();

  if (!prompt && !req.file) {
    return res.status(400).json({ success: false, error: 'EMPTY_INPUT', message: 'Thiếu prompt hoặc ảnh.' });
  }

  if (!apiKey) {
    if (ALLOW_FALLBACK) {
      return res.json({
        success: true,
        type: 'image',
        data: DUMMY_PNG_B64,
        mime: 'image/png',
        mockUsed: true,
        reason: 'MISSING_API_KEY',
        durationMs: Date.now() - t0,
      });
    }
    return res
      .status(401)
      .json({ success: false, error: 'NO_API_KEY', message: 'Thiếu API key (header x-api-key hoặc GEMINI_API_KEY).' });
  }

  const model = userModel || DEFAULT_MODEL;
  const parts = [];
  if (prompt) parts.push(partText(prompt));
  if (req.file) parts.push(partInlineImage(req.file));

  try {
    const out = await callGemini(apiKey, model, parts);
    return res.json({ success: true, model, durationMs: Date.now() - t0, ...out });
  } catch (err) {
    const msg = String(err?.message || err);
    const isQuota =
      err?.status === 429 ||
      /quota|exhausted|rate|RESOURCE_EXHAUSTED|insufficient/i.test(msg);

    if (ALLOW_FALLBACK && (isQuota || msg.includes('NO_OUTPUT') || /permission|not\s+found/i.test(msg))) {
      return res.json({
        success: true,
        type: 'image',
        data: DUMMY_PNG_B64,
        mime: 'image/png',
        mockUsed: true,
        reason: 'FALLBACK:' + msg,
        model,
        durationMs: Date.now() - t0,
      });
    }

    return res
      .status(isQuota ? 429 : 500)
      .json({ success: false, error: 'GENERATION_FAILED', message: msg, model });
  }
});

const server = app
  .listen(PORT, () => console.log(`[server] listening at http://localhost:${PORT}`))
  .on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[server] Port ${PORT} đang bận. Khắc phục nhanh (Windows):`);
      console.error(`  netstat -ano | findstr :${PORT}`);
      console.error(`  taskkill /PID <PID> /F`);
      console.error(`Hoặc chạy lại: set PORT=3002 && node server.js`);
    } else {
      console.error('[server] lỗi khởi động:', err);
    }
  });

export default server;
