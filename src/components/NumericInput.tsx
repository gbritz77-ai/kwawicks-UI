import React, { useRef } from "react";
import { useNumericKeypad } from "./NumericKeypad";

// ── Props ──────────────────────────────────────────────────────────────────────

export interface NumericInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Show decimal key (default true — for prices). Pass false for whole-number qty fields. */
  allowDecimal?: boolean;
  /** Optional heading shown above the value display inside the keypad. */
  label?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** True on touch/mobile devices; false on desktop. */
const isTouchDevice = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(pointer: coarse)").matches;

/** Synthesise a minimal React ChangeEvent from a plain string value. */
function syntheticChange(val: string): React.ChangeEvent<HTMLInputElement> {
  return {
    target: { value: val } as HTMLInputElement,
    currentTarget: { value: val } as HTMLInputElement,
    nativeEvent: new Event("change"),
    bubbles: true,
    cancelable: false,
    defaultPrevented: false,
    eventPhase: 0,
    isTrusted: false,
    preventDefault: () => {},
    isDefaultPrevented: () => false,
    stopPropagation: () => {},
    isPropagationStopped: () => false,
    persist: () => {},
    timeStamp: Date.now(),
    type: "change",
  } as React.ChangeEvent<HTMLInputElement>;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function NumericInput({
  value,
  onChange,
  allowDecimal = true,
  label,
  style,
  onFocus,
  ...rest
}: NumericInputProps) {
  const { openKeypad } = useNumericKeypad();
  const ref = useRef<HTMLInputElement>(null);

  // ── Desktop: behave as a normal number input ───────────────────────────────
  if (!isTouchDevice()) {
    return (
      <input
        {...rest}
        ref={ref}
        type="number"
        inputMode="decimal"
        value={value}
        onChange={onChange}
        onFocus={onFocus}
        style={style}
      />
    );
  }

  // ── Mobile / tablet: custom keypad ─────────────────────────────────────────
  const activate = () => {
    // Immediately remove focus so the system keyboard never appears
    ref.current?.blur();

    openKeypad({
      value: String(value ?? ""),
      label,
      allowDecimal,
      onChange: val => onChange(syntheticChange(val)),
      onClose: () => {},
    });
  };

  return (
    <input
      {...rest}
      ref={ref}
      type="text"
      inputMode="none"   // tells Android/iOS: no virtual keyboard
      value={value}
      onChange={onChange} // kept so React doesn't warn about controlled input
      onFocus={activate}
      onClick={activate}
      readOnly           // prevents any direct typing; keypad drives the value
      style={{
        cursor: "pointer",
        caretColor: "transparent",
        ...style,
      }}
    />
  );
}
