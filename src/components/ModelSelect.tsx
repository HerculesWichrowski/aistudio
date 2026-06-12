"use client";

import { ChevronDown } from "lucide-react";

export type ModelOption = { id: string; name: string; free?: boolean };

type ModelSelectProps = {
  value: string;
  onChange: (value: string) => void;
  models: ModelOption[];
  disabled?: boolean;
  title?: string;
};

function modelLabel(model: ModelOption) {
  return `${model.name}${model.free ? " · free" : ""}`;
}

export default function ModelSelect({
  value,
  onChange,
  models,
  disabled,
  title = "Model",
}: ModelSelectProps) {
  const selected = models.find((model) => model.id === value);
  const displayText = selected ? modelLabel(selected) : value;

  return (
    <label className="model-select">
      <select
        className="model-select-input"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        style={{ width: `${Math.max(displayText.length - 6, 2)}ch` }}
        title={title}
        value={value}
      >
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {modelLabel(model)}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden className="model-select-icon" size={12} />
    </label>
  );
}
