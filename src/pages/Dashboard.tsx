import { useState, useEffect, useRef, useCallback } from "react";
import {
  Terminal, Upload, Play, Square, Trash2, ChevronDown,
  ChevronRight, FileCode, Clock, Folder,
  LogOut, Activity, Box
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useWebSocket } from "@/hooks/useWebSocket";
import type { LogEntry } from "@/hooks/useWebSocket";

interface Project {
  id: string;
  name: string;
  originalName: string;
  mainFile: string;
  status: string;
  createdAt: string;
  hasRequirements: boolean;
  generatedFiles?: { filename: string; size: number; messageId?: number; fileId?: string }[];
}

// ── Terminal Component ──────────────────────────────────
function TerminalConsole({
  logs,
  status,
  waitingInput,
  onSendInput,
  onStop,
  onClear,
  projectName,
}: {
  logs: LogEntry[];
  status: string;
  waitingInput: boolean;
  onSendInput: (input: string) => void;
  onStop: () => void;
  onClear: () => void;
  projectName: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      setAutoScroll(scrollHeight - scrollTop - clientHeight < 50);
    }
  };

  return (
    <div className="terminal-surface rounded-xl overflow-hidden flex flex-col h-full relative crt-overlay">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "rgba(124,179,66,0.2)" }}>
        <div className="flex items-center gap-3">
          <Terminal size={16} className="text-[#7cb342]" />
          <span className="font-mono text-sm" style={{ color: "#f5f3f0" }}>{projectName}</span>
          <span className={`status-dot ${status === "running" ? "status-running" : status === "waiting_input" ? "status-waiting" : status === "error" ? "status-error" : "status-stopped"}`} />
          <span className="font-mono text-xs uppercase" style={{ color: "rgba(245,243,240,0.5)" }}>
            {status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onClear} className="btn-icon" title="Clear logs">
            <Trash2 size={14} />
          </button>
          {status === "running" || status === "waiting_input" ? (
            <button onClick={onStop} className="btn-danger text-xs px-3 py-1.5 h-auto">
              <Square size={12} /> Stop
            </button>
          ) : null}
        </div>
      </div>

      {/* Log Output */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 font-mono text-xs min-h-0"
        style={{ background: "#0d1117", lineHeight: 1.6 }}
      >
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-full" style={{ color: "rgba(124,179,66,0.3)" }}>
            <span>Waiting for execution output...</span>
          </div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="flex gap-2">
              <span className="shrink-0" style={{ color: "rgba(245,243,240,0.3)" }}>
                [{log.timestamp}]
              </span>
              <span className={`log-${log.type}`}>{log.message}</span>
            </div>
          ))
        )}
        <span className="animate-cursor inline-block w-2 h-4 bg-[#7cb342] ml-1" />
      </div>

      {/* Input Section */}
      {waitingInput && (
        <div className="px-4 py-3 border-t" style={{ borderColor: "rgba(255,167,38,0.3)", background: "rgba(255,167,38,0.05)" }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="font-mono text-xs" style={{ color: "#ffa726" }}>Waiting for input...</span>
            <span className="text-xs px-2 py-0.5 rounded-full font-mono" style={{ background: "rgba(255,167,38,0.15)", color: "#ffa726", fontSize: "10px" }}>
              30s timeout
            </span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && inputValue.trim()) {
                  onSendInput(inputValue.trim());
                  setInputValue("");
                }
              }}
              placeholder="Enter response..."
              className="flex-1 h-9 px-3 rounded-lg font-mono text-sm outline-none"
              style={{
                background: "rgba(0,0,0,0.5)",
                border: "1px solid rgba(255,167,38,0.4)",
                color: "#ffa726",
              }}
              autoFocus
            />
            <button
              onClick={() => {
                if (inputValue.trim()) {
                  onSendInput(inputValue.trim());
                  setInputValue("");
                }
              }}
              className="px-4 py-1.5 rounded-lg font-mono text-xs font-semibold"
              style={{ background: "#ffa726", color: "#1a1a1a" }}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Project Card ────────────────────────────────────────
function ProjectCard({
  project,
  isSelected,
  onSelect,
  onRun,
  onStop,
  onDelete,
}: {
  project: Project;
  isSelected: boolean;
  onSelect: () => void;
  onRun: () => void;
  onStop: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isRunning = project.status === "running" || project.status === "waiting_input";

  return (
    <div
      className="liquid-glass rounded-xl overflow-hidden transition-all duration-300"
      style={{
        borderColor: isSelected ? "rgba(124,179,66,0.4)" : undefined,
        boxShadow: isSelected ? "0 0 20px rgba(124,179,66,0.1)" : undefined,
      }}
    >
      <div
        className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors"
        onClick={onSelect}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="btn-icon shrink-0"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <span className={`status-dot shrink-0 ${isRunning ? "status-running" : project.status === "error" ? "status-error" : "status-stopped"}`} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm truncate" style={{ color: "#f5f3f0" }}>
              {project.name}
            </span>
            <span className="text-xs font-mono px-2 py-0.5 rounded shrink-0" style={{ background: "rgba(255,255,255,0.08)", color: "rgba(245,243,240,0.5)" }}>
              {project.mainFile || "main.py"}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs flex items-center gap-1" style={{ color: "rgba(245,243,240,0.35)" }}>
              <Clock size={10} />
              {new Date(project.createdAt).toLocaleDateString()}
            </span>
            {project.hasRequirements && (
              <span className="text-xs flex items-center gap-1" style={{ color: "rgba(124,179,66,0.6)" }}>
                <FileCode size={10} /> requirements.txt
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isRunning ? (
            <button onClick={(e) => { e.stopPropagation(); onStop(); }} className="btn-danger text-xs px-3 py-1.5 h-auto">
              <Square size={12} />
            </button>
          ) : (
            <button onClick={(e) => { e.stopPropagation(); onRun(); }} className="btn-primary text-xs px-3 py-1.5 h-auto">
              <Play size={12} />
            </button>
          )}
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="btn-icon hover:text-[#e91e63]">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Expanded */}
      {expanded && project.generatedFiles && project.generatedFiles.length > 0 && (
        <div className="px-4 pb-3 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <p className="text-xs font-mono mt-2 mb-1.5" style={{ color: "rgba(245,243,240,0.5)" }}>Generated Files</p>
          <div className="flex flex-wrap gap-2">
            {project.generatedFiles.map((f) => (
              <div
                key={f.filename}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                style={{ background: "rgba(124,179,66,0.1)", border: "1px solid rgba(124,179,66,0.2)" }}
              >
                <FileCode size={12} className="text-[#7cb342]" />
                <span className="font-mono text-xs" style={{ color: "#7cb342" }}>{f.filename}</span>
                <span className="text-xs" style={{ color: "rgba(245,243,240,0.4)" }}>
                  {(f.size / 1024).toFixed(1)}KB
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Upload Zone ─────────────────────────────────────────
function UploadZone({ onUpload }: { onUpload: () => void }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.name.endsWith(".zip")) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", file.name.replace(".zip", ""));
    try {
      await api.projects.create(formData);
      onUpload();
    } catch (e: any) {
      alert(e.message || "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div
      className={`drop-zone flex flex-col items-center justify-center py-10 px-6 cursor-pointer transition-all ${isDragOver ? "drag-over" : ""}`}
      onClick={() => fileInputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      {isUploading ? (
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#7cb342] border-t-transparent rounded-full animate-spin" />
          <span className="font-mono text-sm" style={{ color: "#7cb342" }}>Uploading...</span>
        </div>
      ) : (
        <>
          <Upload size={32} className="mb-3" style={{ color: "rgba(124,179,66,0.6)" }} />
          <p className="font-mono text-sm text-center" style={{ color: "rgba(245,243,240,0.6)" }}>
            Drop ZIP archive or click to browse
          </p>
          <p className="text-xs mt-1" style={{ color: "rgba(245,243,240,0.35)" }}>
            Python projects (.zip)
          </p>
        </>
      )}
    </div>
  );
}

// ── Navbar ──────────────────────────────────────────────
function Navbar() {
  const { logout } = useAuth();
  return (
    <nav className="liquid-glass-strong fixed top-0 left-0 right-0 z-50 px-6 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Terminal size={20} className="text-[#7cb342]" />
          <span className="font-semibold text-sm tracking-widest uppercase" style={{ color: "#f5f3f0" }}>
            Noxylity
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full" style={{ background: "rgba(124,179,66,0.1)" }}>
            <span className="status-dot status-running" />
            <span className="text-xs font-mono" style={{ color: "#7cb342" }}>Online</span>
          </div>
          <button onClick={logout} className="btn-ghost text-xs py-2 px-3 h-auto">
            <LogOut size={14} /> Logout
          </button>
        </div>
      </div>
    </nav>
  );
}

// ── Main Dashboard ──────────────────────────────────────
export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  const {
    logs, status, waitingInput,
    sendInput, clearLogs,
  } = useWebSocket(selectedProject?.id || null);

  const fetchProjects = useCallback(async () => {
    try {
      const data = await api.projects.list();
      setProjects(data.projects || []);
    } catch {
      // handled by api client
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
    const interval = setInterval(fetchProjects, 10000);
    return () => clearInterval(interval);
  }, [fetchProjects]);

  const handleRun = async (project: Project) => {
    try {
      await api.projects.run(project.id, project.mainFile || "main.py");
      setSelectedProject(project);
      fetchProjects();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleStop = async (project: Project) => {
    try {
      await api.projects.stop(project.id);
      fetchProjects();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleDelete = async (project: Project) => {
    if (!confirm(`Delete project "${project.name}"?`)) return;
    try {
      await api.projects.delete(project.id);
      if (selectedProject?.id === project.id) {
        setSelectedProject(null);
      }
      fetchProjects();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const runningCount = projects.filter(p => p.status === "running" || p.status === "waiting_input").length;
  const totalFiles = projects.reduce((acc, p) => acc + (p.generatedFiles?.length || 0), 0);

  return (
    <div className="min-h-screen pt-16 pb-8">
      <Navbar />

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Hero */}
        <div
          className="relative rounded-2xl overflow-hidden mb-8 h-64 flex items-end"
          style={{
            backgroundImage: "url(/image_hero_bark.jpg)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
          <div className="relative z-10 p-8 w-full">
            <h1 className="font-display text-4xl mb-4" style={{ color: "#f5f3f0" }}>
              Project Control Center
            </h1>
            <div className="flex gap-4">
              <div className="liquid-glass px-4 py-2 rounded-lg flex items-center gap-3">
                <Box size={16} className="text-[#7cb342]" />
                <div>
                  <p className="text-lg font-mono font-semibold" style={{ color: "#7cb342" }}>{projects.length}</p>
                  <p className="text-xs" style={{ color: "rgba(245,243,240,0.5)" }}>Projects</p>
                </div>
              </div>
              <div className="liquid-glass px-4 py-2 rounded-lg flex items-center gap-3">
                <Activity size={16} className="text-[#4db6ac]" />
                <div>
                  <p className="text-lg font-mono font-semibold" style={{ color: "#4db6ac" }}>{runningCount}</p>
                  <p className="text-xs" style={{ color: "rgba(245,243,240,0.5)" }}>Active</p>
                </div>
              </div>
              <div className="liquid-glass px-4 py-2 rounded-lg flex items-center gap-3">
                <Folder size={16} className="text-[#ffa726]" />
                <div>
                  <p className="text-lg font-mono font-semibold" style={{ color: "#ffa726" }}>{totalFiles}</p>
                  <p className="text-xs" style={{ color: "rgba(245,243,240,0.5)" }}>Files</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Upload */}
        <div className="mb-8">
          <UploadZone onUpload={fetchProjects} />
        </div>

        {/* Content */}
        <div className="flex gap-6">
          {/* Project List */}
          <div className="w-1/3 min-w-0">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl" style={{ color: "#f5f3f0" }}>
                Active Projects
              </h2>
              <span className="text-xs font-mono px-2 py-1 rounded-full" style={{ background: "rgba(124,179,66,0.15)", color: "#7cb342" }}>
                {projects.length}
              </span>
            </div>

            {loading ? (
              <div className="text-center py-12" style={{ color: "rgba(245,243,240,0.5)" }}>
                <div className="w-6 h-6 border-2 border-[#7cb342] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="font-mono text-sm">Loading projects...</p>
              </div>
            ) : projects.length === 0 ? (
              <div className="text-center py-12 liquid-glass rounded-xl">
                <Upload size={32} className="mx-auto mb-3" style={{ color: "rgba(245,243,240,0.3)" }} />
                <p className="font-mono text-sm" style={{ color: "rgba(245,243,240,0.5)" }}>
                  No projects yet. Upload a ZIP to begin.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {projects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    isSelected={selectedProject?.id === project.id}
                    onSelect={() => setSelectedProject(project)}
                    onRun={() => handleRun(project)}
                    onStop={() => handleStop(project)}
                    onDelete={() => handleDelete(project)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Terminal */}
          <div className="flex-1 min-w-0">
            {selectedProject ? (
              <TerminalConsole
                logs={logs}
                status={status || selectedProject.status}
                waitingInput={waitingInput}
                onSendInput={sendInput}
                onStop={() => handleStop(selectedProject)}
                onClear={clearLogs}
                projectName={selectedProject.name}
              />
            ) : (
              <div className="liquid-glass rounded-xl flex flex-col items-center justify-center h-full min-h-96">
                <Terminal size={48} style={{ color: "rgba(245,243,240,0.15)" }} />
                <p className="mt-4 font-mono text-sm" style={{ color: "rgba(245,243,240,0.4)" }}>
                  Select a project to view its console
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
