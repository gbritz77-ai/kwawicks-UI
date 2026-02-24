import React, { useEffect, useMemo, useRef } from "react";

export default function PinInput({
  value,
  onChange,
  disabled,
}: {
  value: string; // digits only
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  const digits = useMemo(() => {
    const arr = Array(6).fill("");
    for (let i = 0; i < Math.min(6, value.length); i++) arr[i] = value[i];
    return arr;
  }, [value]);

  useEffect(() => {
    // focus first empty on mount
    const idx = Math.min(value.length, 5);
    inputs.current[idx]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function focusIndex(i: number) {
    inputs.current[Math.max(0, Math.min(5, i))]?.focus();
  }

  function setAt(index: number, raw: string) {
    const clean = raw.replace(/\D/g, "");
    if (!clean) return;

    const nextChars = Array(6).fill("");
    for (let i = 0; i < Math.min(6, value.length); i++) nextChars[i] = value[i];

    nextChars[index] = clean[0];

    const combined = nextChars.join("").replace(/[^0-9]/g, "").slice(0, 6);
    onChange(combined);

    focusIndex(index + 1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>, index: number) {
    if (e.key !== "Backspace") return;

    e.preventDefault();

    // If current box has a digit, clear it. Otherwise go back one.
    const nextChars = Array(6).fill("");
    for (let i = 0; i < Math.min(6, value.length); i++) nextChars[i] = value[i];

    if (nextChars[index]) {
      nextChars[index] = "";
      onChange(nextChars.join("").replace(/[^0-9]/g, ""));
      return;
    }

    const prev = Math.max(index - 1, 0);
    nextChars[prev] = "";
    onChange(nextChars.join("").replace(/[^0-9]/g, ""));
    focusIndex(prev);
  }

  function onPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 0) return;

    onChange(pasted);
    focusIndex(pasted.length >= 6 ? 5 : pasted.length);
  }

  return (
    <div style={{ display: "flex", gap: 10 }}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            inputs.current[i] = el; // ✅ returns void
          }}
          value={d}
          onChange={(e) => setAt(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(e, i)}
          onPaste={onPaste}
          inputMode="numeric"
          pattern="\d*"
          maxLength={1}
          disabled={disabled}
          style={{
            width: 52,
            height: 52,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(2,6,23,0.55)",
            color: "#e5e7eb",
            fontSize: 22,
            fontWeight: 900,
            textAlign: "center",
            outline: "none",
          }}
        />
      ))}
    </div>
  );
}