import { useState, useEffect } from "react";

export default function App() {
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState([]);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState("");
  const [images, setImages] = useState([]);

  // Load API key từ localStorage
  useEffect(() => {
    const savedApiKey = localStorage.getItem("gemini_api_key");
    if (savedApiKey) {
      setApiKey(savedApiKey);
    }
  }, []);

  // Lưu API key
  useEffect(() => {
    if (apiKey.trim()) {
      localStorage.setItem("gemini_api_key", apiKey.trim());
    }
  }, [apiKey]);

  const handleFileChange = (e) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles) return;

    const validFiles = Array.from(selectedFiles).filter((file) => {
      if (file.size > 10 * 1024 * 1024) {
        setLog("File quá lớn (max 10MB)");
        return false;
      }
      if (!file.type.startsWith("image/")) {
        setLog("Chỉ chấp nhận file ảnh");
        return false;
      }
      return true;
    });

    setFiles(validFiles.slice(0, 3));
    setLog(`Đã chọn ${validFiles.length} ảnh`);
  };

  const removeFile = (index) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  async function handleGenerate() {
    if (!prompt.trim()) {
      setLog("Vui lòng nhập mô tả chỉnh sửa");
      return;
    }
    if (!apiKey.trim()) {
      setLog("Cần API key từ Google AI Studio");
      return;
    }
    if (files.length === 0) {
      setLog("Vui lòng chọn ít nhất 1 ảnh");
      return;
    }

    setBusy(true);
    setImages([]);

    try {
      setLog("Đang xử lý...");

      // Convert files to base64
      const convertFileToBase64 = (file) => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      };

      const imageParts = await Promise.all(
        files.map(async (file) => ({
          inlineData: {
            mimeType: file.type,
            data: await convertFileToBase64(file),
          },
        }))
      );

      const requestData = {
        contents: [
          {
            role: "user",
            parts: [{ text: `Edit and transform this image: ${prompt}` }, ...imageParts],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 8192,
        },
      };

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${apiKey.trim()}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestData),
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error("Quota API đã hết. Vui lòng thử lại sau hoặc tạo API key mới.");
        }
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();

      if (data.candidates?.[0]?.content?.parts) {
        const parts = data.candidates[0].content.parts;

        // Check xem có ảnh không
        const imageResults = parts
          .filter((part) => part.inlineData?.data)
          .map((part) => {
            const b64 = part.inlineData.data;
            const mime = part.inlineData.mimeType || "image/png";
            return URL.createObjectURL(
              new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], {
                type: mime,
              })
            );
          });

        if (imageResults.length > 0) {
          setImages(imageResults);
          setLog(`✅ Nhận được ${imageResults.length} ảnh từ API`);
          return;
        }

        // Nếu không có ảnh thì check text
        const textResult = parts
          .filter((part) => part.text)
          .map((part) => part.text)
          .join("\n\n");

        if (textResult) {
          setLog(`📝 Kết quả: ${textResult.substring(0, 200)}...`);
        } else {
          setLog("⚠️ Không nhận được kết quả hợp lệ từ API");
        }
      } else {
        setLog("⚠️ API không trả về dữ liệu");
      }
    } catch (error) {
      console.error("Error:", error);
      setLog(`Lỗi: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Gemini Image Editor</h1>
          <p className="text-gray-600">Chỉnh sửa ảnh với AI</p>
        </header>

        {/* API Key */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">API Key</h2>
          <input
            type="password"
            className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Nhập Google Gemini API key..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            disabled={busy}
          />
          <p className="text-sm text-gray-500 mt-2">
            Lấy tại:{" "}
            <a
              href="https://makersuite.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Google AI Studio
            </a>
          </p>
        </div>

        {/* Prompt */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Mô tả chỉnh sửa</h2>
          <textarea
            className="w-full border rounded-lg px-4 py-3 h-24 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ví dụ: Chuyển thành phong cách anime, thay đổi background, thêm hiệu ứng..."
            disabled={busy}
          />
        </div>

        {/* Upload */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Ảnh đầu vào</h2>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileChange}
            disabled={busy}
            className="w-full border rounded-lg px-3 py-2 cursor-pointer"
          />

          {files.length > 0 && (
            <div className="mt-4 grid grid-cols-3 gap-4">
              {files.map((file, index) => {
                const url = URL.createObjectURL(file);
                return (
                  <div key={index} className="relative">
                    <img
                      src={url}
                      alt={file.name}
                      className="w-full h-64 object-cover rounded border"
                    />
                    <button
                      onClick={() => removeFile(index)}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs hover:bg-red-600"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Generate Button và Log */}
        <div className="bg-white p-6 rounded-lg shadow">
          <button
            onClick={handleGenerate}
            disabled={busy || !prompt.trim() || !apiKey.trim() || files.length === 0}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700"
          >
            {busy ? "Đang xử lý..." : "Chỉnh sửa ảnh"}
          </button>

          {log && (
            <div className="mt-4 p-3 bg-gray-100 rounded-lg">
              <p className="text-sm text-gray-700">{log}</p>
            </div>
          )}
        </div>

        {/* Kết quả */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Kết quả</h2>
          {!images.length ? (
            <div className="text-center py-12 text-gray-500">
              <p>Chưa có kết quả</p>
              <p className="text-sm mt-2">Upload ảnh và nhập mô tả để bắt đầu</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {images.map((url, i) => (
                <figure key={i} className="rounded-lg overflow-hidden border">
                  <img src={url} alt={`out-${i}`} className="w-full" />
                  <figcaption className="p-2 text-xs flex justify-between">
                    <span>Ảnh #{i + 1}</span>
                    <a href={url} download={`gemini-output-${i + 1}.png`} className="underline">
                      Tải xuống
                    </a>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
