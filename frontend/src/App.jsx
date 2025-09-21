import { useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";

function b64ToUrl(b64, mime = "image/png") {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  } catch (e) {
    console.error("Error converting base64 to URL:", e);
    return "";
  }
}

export default function App() {
  const [prompt, setPrompt] = useState("");

  const [files, setFiles] = useState([]);
  const [apiKey, setApiKey] = useState(""); // Ô nhập API key
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState("");
  const [images, setImages] = useState([]);
  const [text, setText] = useState("");

  async function handleGenerate() {
    if (!prompt.trim()) {
      setLog("❌ Vui lòng nhập prompt");
      return;
    }

    setBusy(true);
    setImages([]);
    setText("");
    setLog("Đang gửi...");

    const fd = new FormData();
    fd.append("prompt", prompt);

    if (files.length > 0) {
      fd.append("image", files[0]); 
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); 

      const headers = {};
      if (apiKey.trim()) headers["x-api-key"] = apiKey.trim();

      const r = await fetch(`${API_BASE}/generate`, {
        method: "POST",
        body: fd,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!r.ok) {
        const errorText = await r.text();
        throw new Error(`HTTP ${r.status}: ${errorText || "Request failed"}`);
      }

      const data = await r.json();

      
      if (!data.success) {
        throw new Error(`${data.error || "GENERATION_FAILED"}: ${data.message || ""}`);
      }

      if (data.type === "image" && data.data) {
        const url = b64ToUrl(data.data, data.mime || "image/png");
        setImages([url]);
        setText("");
        setLog(data.mockUsed ? " Đang dùng ảnh mock (thiếu key/hết quota)" : " Trả về ảnh");
      } else if (data.type === "text") {
        setText(data.text || "");
        setImages([]);
        setLog("Trả về text");
      } else {
        setLog(" Không nhận được kết quả hợp lệ từ server.");
      }
    } catch (e) {
      if (e.name === "AbortError") {
        setLog("Yêu cầu bị hủy do timeout");
      } else {
        setLog(`Lỗi: ${e.message || String(e)}`);
      }
      console.error("Fetch error:", e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-5xl mx-auto p-6 grid gap-6">
        <h1 className="text-2xl font-bold text-center">Gemini Image Editor</h1>

        <section className="bg-white p-4 rounded-2xl shadow grid gap-3">
          <label className="text-sm font-medium">API Key (tùy chọn)</label>
          <input
            type="password"
            className="border rounded px-3 py-2 outline-none focus:ring"
            placeholder="Dán API key của bạn vào đây..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            disabled={busy}
          />

          <label className="text-sm font-medium mt-2">Prompt</label>
          <textarea
            className="border rounded px-3 py-2 outline-none focus:ring min-h-[90px]"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Nhập mô tả chỉnh sửa ảnh..."
            disabled={busy}
          />

          <div className="grid gap-2">
  <label className="text-sm font-medium">Ảnh đầu vào (tùy chọn)</label>

  <input
    type="file"
    accept="image/*"
    multiple
    onChange={(e) => setFiles(e.target.files ? Array.from(e.target.files) : [])}
    disabled={busy}
    className="block w-fit border rounded px-3 py-1 text-sm cursor-pointer"
  />

  {files.length > 0 && (
    <div className="flex flex-wrap gap-3 mt-2">
      {files.map((f, i) => {
        const url = URL.createObjectURL(f);
        return (
          <div key={i} className="w-24">
            <img
              src={url}
              alt={f.name}
              className="w-24 h-24 object-cover rounded border"
            />
            <p className="text-xs text-center mt-1 truncate">{f.name}</p>
          </div>
        );
      })}
    </div>
  )}
</div>


          <button
            onClick={handleGenerate}
            disabled={busy}
            className="w-fit px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50"
          >
            {busy ? "Đang chạy..." : "Generate"}
          </button>
          <pre className="text-xs text-slate-600 whitespace-pre-wrap">{log}</pre>
        </section>

        <section className="bg-white p-4 rounded-2xl shadow grid gap-3">
          <h2 className="text-sm font-medium">Kết quả</h2>
          {!images.length && !text && (
            <div className="text-sm text-slate-500">Chưa có kết quả.</div>
          )}
          {images.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {images.map((url, i) => (
                <figure key={i} className="rounded-xl overflow-hidden border">
                  <img src={url} alt={`out-${i}`} className="w-full" />
                  <figcaption className="p-2 text-xs flex justify-between">
                    <span>Ảnh #{i + 1}</span>
                    <a
                      className="underline"
                      href={url}
                      download={`gemini-output-${i + 1}.png`}
                    >
                      Tải xuống
                    </a>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
          {text && (
            <pre className="p-3 border rounded-xl text-sm whitespace-pre-wrap">
              {text}
            </pre>
          )}
        </section>
      </div>
    </div>
  );
}
