import React, { createContext, useCallback, useContext, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

type KeypadConfig = {
  value: string;
  label?: string;
  allowDecimal?: boolean;
  onChange: (val: string) => void;
  onClose: () => void;
};

type KeypadContextValue = {
  openKeypad: (cfg: KeypadConfig) => void;
};

// ── Context ────────────────────────────────────────────────────────────────────

const KeypadCtx = createContext<KeypadContextValue>({ openKeypad: () => {} });

export function useNumericKeypad() {
  return useContext(KeypadCtx);
}

// ── Provider + overlay ─────────────────────────────────────────────────────────

export function NumericKeypadProvider({ children }: { children: React.ReactNode }) {
  const [cfg, setCfg]         = useState<KeypadConfig | null>(null);
  const [display, setDisplay] = useState("");

  const openKeypad = useCallback((c: KeypadConfig) => {
    setCfg(c);
    setDisplay(String(c.value ?? ""));
  }, []);

  const close = () => {
    cfg?.onClose();
    setCfg(null);
    setDisplay("");
  };

  const press = (key: string) => {
    setDisplay(prev => {
      let next: string;
      if (key === "⌫") {
        next = prev.slice(0, -1);
      } else if (key === ".") {
        if (prev.includes(".") || cfg?.allowDecimal === false) return prev;
        next = prev === "" ? "0." : prev + ".";
      } else {
        // Prevent double leading zero
        next = prev === "0" ? key : prev + key;
      }
      cfg?.onChange(next);
      return next;
    });
  };

  const KEYS = ["7", "8", "9", "4", "5", "6", "1", "2", "3", ".", "0", "⌫"];

  return (
    <KeypadCtx.Provider value={{ openKeypad }}>
      {children}

      {/* Backdrop — tap to dismiss */}
      {cfg && (
        <div
          onClick={close}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9998,
            background: "rgba(0,0,0,0.35)",
          }}
        />
      )}

      {/* Bottom sheet */}
      <div
        style={{
          position: "fixed",
          bottom: 24,
          left: "50%",
          transform: cfg
            ? "translateX(-50%) translateY(0)"
            : "translateX(-50%) translateY(120%)",
          width: "min(360px, calc(100vw - 32px))",
          zIndex: 9999,
          background: "#fff",
          borderRadius: 20,
          boxShadow: "0 8px 40px rgba(0,0,0,0.22)",
          padding: "10px 16px 20px",
          transition: "transform 0.22s cubic-bezier(.4,0,.2,1)",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
        {/* Drag handle */}
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <div
            style={{
              display: "inline-block",
              width: 36,
              height: 4,
              background: "#d1d5db",
              borderRadius: 2,
            }}
          />
        </div>

        {/* Optional label */}
        {cfg?.label && (
          <div
            style={{
              fontSize: 12,
              color: "#6b7280",
              textAlign: "center",
              marginBottom: 4,
              fontWeight: 500,
            }}
          >
            {cfg.label}
          </div>
        )}

        {/* Current value display */}
        <div
          style={{
            textAlign: "right",
            fontSize: 30,
            fontWeight: 700,
            padding: "8px 14px",
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            marginBottom: 12,
            minHeight: 56,
            letterSpacing: 1,
            color: display !== "" ? "#111827" : "#9ca3af",
          }}
        >
          {display !== "" ? display : "0"}
        </div>

        {/* Key grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 8,
          }}
        >
          {KEYS.map(k => (
            <button
              key={k}
              // onPointerDown fires before blur — keeps focus away from input
              onPointerDown={e => {
                e.preventDefault();
                press(k);
              }}
              style={{
                padding: "16px 0",
                fontSize: k === "⌫" ? 22 : 24,
                fontWeight: 600,
                background: k === "⌫" ? "#fee2e2" : "#f3f4f6",
                color: k === "⌫" ? "#dc2626" : "#111827",
                border: "none",
                borderRadius: 10,
                cursor: "pointer",
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              {k}
            </button>
          ))}
        </div>

        {/* Done button */}
        <button
          onPointerDown={e => {
            e.preventDefault();
            close();
          }}
          style={{
            marginTop: 10,
            width: "100%",
            padding: "15px 0",
            fontSize: 16,
            fontWeight: 700,
            background: "#166534",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            cursor: "pointer",
            touchAction: "manipulation",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          Done ✓
        </button>
      </div>
    </KeypadCtx.Provider>
  );
}
