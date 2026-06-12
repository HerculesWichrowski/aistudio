"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export type ModelOption = { id: string; name: string; free?: boolean };

type ModelSelectProps = {
  value: string;
  onChange: (value: string) => void;
  models: ModelOption[];
  disabled?: boolean;
  title?: string;
  menuPlacement?: "up" | "down";
};

export default function ModelSelect({
  value,
  onChange,
  models,
  disabled,
  title = "Model",
  menuPlacement = "down",
}: ModelSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = models.find((model) => model.id === value);
  const displayText = selected?.name ?? value;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="model-select" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className="model-select-trigger"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        title={title}
        type="button"
      >
        <span className="model-select-label">{displayText}</span>
        <ChevronDown aria-hidden className={`model-select-icon ${open ? "open" : ""}`} size={12} />
      </button>
      {open && (
        <div
          className={`model-select-menu ${menuPlacement === "up" ? "up" : "down"}`}
          role="listbox"
        >
          {models.map((model) => (
            <button
              aria-selected={model.id === value}
              className={`model-select-option ${model.id === value ? "active" : ""}`}
              key={model.id}
              onClick={() => {
                onChange(model.id);
                setOpen(false);
              }}
              role="option"
              type="button"
            >
              {model.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
