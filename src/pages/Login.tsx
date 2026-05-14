import { useState, useEffect, useRef, useCallback } from "react";
import { Terminal, Leaf } from "lucide-react";

interface Particle {
  x: number;
  y: number;
  size: number;
  speedY: number;
  speedX: number;
  angle: number;
  opacity: number;
  rotation: number;
}

export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);

  // Leaf particles animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const initParticles = () => {
      const particles: Particle[] = [];
      for (let i = 0; i < 40; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 15 + 8,
          speedY: Math.random() * 0.5 + 0.2,
          speedX: Math.random() * 0.3 + 0.1,
          angle: Math.random() * Math.PI * 2,
          opacity: Math.random() * 0.4 + 0.2,
          rotation: Math.random() * 360,
        });
      }
      particlesRef.current = particles;
    };
    initParticles();

    const leafImg = new Image();
    leafImg.src = "/leaf_particle.png";

    const update = () => {
      for (const p of particlesRef.current) {
        p.y -= p.speedY;
        p.angle += 0.02;
        p.x += Math.sin(p.angle) * p.speedX;
        p.rotation += 0.5;
        if (p.y < -30) p.y = canvas.height + 30;
        if (p.x < -30) p.x = canvas.width + 30;
        if (p.x > canvas.width + 30) p.x = -30;
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!leafImg.complete) return;
      for (const p of particlesRef.current) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = p.opacity;
        ctx.drawImage(leafImg, -p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      }
    };

    const animate = () => {
      update();
      draw();
      rafRef.current = requestAnimationFrame(animate);
    };

    if (leafImg.complete) {
      animate();
    } else {
      leafImg.onload = animate;
    }

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      setIsLoading(true);

      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        const data = await res.json();

        if (data.token) {
          localStorage.setItem("noxylity_token", data.token);
          window.location.href = "/";
        } else {
          throw new Error("Invalid response");
        }
      } catch {
        setError("Invalid password. Access denied.");
        setShake(true);
        setTimeout(() => setShake(false), 400);
      } finally {
        setIsLoading(false);
      }
    },
    [password]
  );

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden" style={{ background: "#2a2520" }}>
      {/* Leaf Particles Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 0 }}
      />

      {/* Content */}
      <div className="relative z-10 w-full max-w-5xl mx-auto px-6 flex items-center gap-16">
        {/* Left Side - Branding */}
        <div className="hidden lg:flex flex-col items-start gap-6 flex-1">
          <div className="flex items-center gap-3">
            <Terminal size={40} className="text-[#7cb342]" />
            <h1 className="font-display text-7xl font-400" style={{ color: "#f5f3f0" }}>
              Noxylity
            </h1>
          </div>
          <p className="text-lg" style={{ color: "rgba(245,243,240,0.6)" }}>
            Python hosting. Telegram storage. Zero database.
          </p>
          <div className="flex items-center gap-8 mt-4">
            <div className="flex items-center gap-2">
              <Leaf size={20} className="text-[#7cb342]" />
              <span className="text-sm" style={{ color: "rgba(245,243,240,0.6)" }}>Leaf</span>
            </div>
            <div className="flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4db6ac" strokeWidth="2">
                <circle cx="12" cy="12" r="1" />
                <circle cx="12" cy="12" r="5" />
                <circle cx="12" cy="12" r="9" />
              </svg>
              <span className="text-sm" style={{ color: "rgba(245,243,240,0.6)" }}>Water</span>
            </div>
            <div className="flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#78909c" strokeWidth="2">
                <ellipse cx="12" cy="12" rx="10" ry="7" />
              </svg>
              <span className="text-sm" style={{ color: "rgba(245,243,240,0.6)" }}>Stone</span>
            </div>
          </div>
        </div>

        {/* Right Side - Login Panel */}
        <div
          className={`liquid-glass rounded-2xl p-8 w-full max-w-md ${shake ? "animate-shake" : ""}`}
          style={{
            border: error ? "1px solid #e91e63" : "1px solid rgba(255,255,255,0.15)",
            boxShadow: error ? "0 0 20px rgba(233,30,99,0.2)" : undefined,
          }}
        >
          <div className="text-center mb-8">
            <h2 className="font-display text-3xl mb-2" style={{ color: "#f5f3f0" }}>
              Authentication Required
            </h2>
            <p className="text-sm" style={{ color: "rgba(245,243,240,0.5)" }}>
              Enter admin password to initialize session
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-medium mb-2 font-mono" style={{ color: "rgba(245,243,240,0.5)" }}>
                PASSWORD
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full h-12 px-4 rounded-lg font-mono text-sm outline-none transition-all"
                style={{
                  background: "rgba(0,0,0,0.3)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "#7cb342",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#7cb342";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(124,179,66,0.2)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>

            {error && (
              <div
                className="text-sm font-mono text-center py-2 px-3 rounded"
                style={{ background: "rgba(233,30,99,0.1)", color: "#e91e63", border: "1px solid rgba(233,30,99,0.3)" }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !password}
              className="btn-primary w-full h-12 text-sm font-mono tracking-wide"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Initializing...
                </span>
              ) : (
                "Initialize Session"
              )}
            </button>
          </form>

          {/* Leaf motif corner */}
          <Leaf
            size={80}
            className="absolute -bottom-4 -right-4 opacity-10 pointer-events-none"
            style={{ color: "#7cb342" }}
          />
        </div>
      </div>
    </div>
  );
}
