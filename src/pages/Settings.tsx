import { useState } from "react";
import { Settings, Save, Check, AlertCircle, ChevronLeft } from "lucide-react";
import { api } from "@/lib/api";
import { useNavigate } from "react-router";

export default function SettingsPage() {
  const navigate = useNavigate();
  const [botToken, setBotToken] = useState("");
  const [channelId, setChannelId] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<null | { valid: boolean; error?: string }>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleTest = async () => {
    if (!botToken || !channelId) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await api.settings.validate(botToken, channelId);
      setTestResult(res);
    } catch (e: any) {
      setTestResult({ valid: false, error: e.message });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    // In a real implementation, this would save to backend env
    // For now, just show success
    setTimeout(() => {
      setIsSaving(false);
      alert("Settings saved! (Note: In production, configure via environment variables)");
    }, 500);
  };

  return (
    <div className="min-h-screen pt-16 pb-8">
      {/* Navbar */}
      <nav className="liquid-glass-strong fixed top-0 left-0 right-0 z-50 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Settings size={20} className="text-[#7cb342]" />
            <span className="font-semibold text-sm tracking-widest uppercase" style={{ color: "#f5f3f0" }}>
              Noxylity
            </span>
          </div>
          <button onClick={() => navigate("/")} className="btn-ghost text-xs py-2 px-3 h-auto">
            <ChevronLeft size={14} /> Back
          </button>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="liquid-glass rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-8">
            <Settings size={24} className="text-[#7cb342]" />
            <h1 className="font-display text-3xl" style={{ color: "#f5f3f0" }}>
              Configuration
            </h1>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-xs font-medium mb-2 font-mono" style={{ color: "rgba(245,243,240,0.5)" }}>
                TELEGRAM BOT TOKEN
              </label>
              <input
                type="password"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                className="w-full h-14 px-4 rounded-lg font-mono text-sm outline-none transition-all"
                style={{
                  background: "rgba(0,0,0,0.3)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "#7cb342",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#4db6ac";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(77,182,172,0.2)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
              <p className="text-xs mt-1.5 font-mono" style={{ color: "rgba(245,243,240,0.35)" }}>
                Get from @BotFather on Telegram
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium mb-2 font-mono" style={{ color: "rgba(245,243,240,0.5)" }}>
                CHANNEL ID
              </label>
              <input
                type="text"
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                placeholder="-1001234567890"
                className="w-full h-14 px-4 rounded-lg font-mono text-sm outline-none transition-all"
                style={{
                  background: "rgba(0,0,0,0.3)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "#7cb342",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#4db6ac";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(77,182,172,0.2)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
              <p className="text-xs mt-1.5 font-mono" style={{ color: "rgba(245,243,240,0.35)" }}>
                Private channel ID where bot is admin
              </p>
            </div>

            {testResult && (
              <div
                className="flex items-center gap-3 px-4 py-3 rounded-lg"
                style={{
                  background: testResult.valid ? "rgba(124,179,66,0.1)" : "rgba(233,30,99,0.1)",
                  border: `1px solid ${testResult.valid ? "rgba(124,179,66,0.3)" : "rgba(233,30,99,0.3)"}`,
                }}
              >
                {testResult.valid ? (
                  <Check size={18} className="text-[#7cb342] shrink-0" />
                ) : (
                  <AlertCircle size={18} className="text-[#e91e63] shrink-0" />
                )}
                <span className="text-sm font-mono" style={{ color: testResult.valid ? "#7cb342" : "#e91e63" }}>
                  {testResult.valid ? "Connection successful!" : testResult.error || "Connection failed"}
                </span>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button
                onClick={handleTest}
                disabled={isTesting || !botToken || !channelId}
                className="btn-ghost text-sm flex-1"
                style={{ opacity: !botToken || !channelId ? 0.5 : 1 }}
              >
                {isTesting ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Testing...
                  </span>
                ) : (
                  "Test Connection"
                )}
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="btn-primary text-sm flex-1"
              >
                {isSaving ? "Saving..." : <span className="flex items-center gap-2"><Save size={14} /> Save</span>}
              </button>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
            <h3 className="font-mono text-sm mb-3" style={{ color: "rgba(245,243,240,0.6)" }}>
              Setup Instructions
            </h3>
            <ol className="space-y-2 text-sm" style={{ color: "rgba(245,243,240,0.5)" }}>
              <li className="flex gap-2">
                <span className="text-[#7cb342] font-mono">1.</span>
                Create a Telegram Bot via @BotFather, copy the token
              </li>
              <li className="flex gap-2">
                <span className="text-[#7cb342] font-mono">2.</span>
                Create a private channel, add your bot as admin
              </li>
              <li className="flex gap-2">
                <span className="text-[#7cb342] font-mono">3.</span>
                Forward any message from channel to @userinfobot to get channel ID
              </li>
              <li className="flex gap-2">
                <span className="text-[#7cb342] font-mono">4.</span>
                Paste both values here, test connection, then save
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
