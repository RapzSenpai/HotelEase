import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";

/**
 * Comma-separated tag editor with removable chips and one-click presets,
 * used for a room's amenities and facilities.
 *
 * Moved out of AdminRoomManagementPage verbatim — it was already a standalone
 * component there. The preset lists stay with the form that supplies them, so
 * this takes `presets` as a prop.
 */
export default function RoomTagInput({ label, value, onChange, presets, placeholder }) {
  const [input, setInput] = useState("");
  const tags = value ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];

  function addTag(tag) {
    const trimmed = tag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange(tags.concat(trimmed).join(", "));
    }
    setInput("");
  }

  function removeTag(tag) {
    onChange(tags.filter((t) => t !== tag).join(", "));
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(input);
    }
    if (e.key === "Backspace" && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  const availablePresets = presets.filter((p) => !tags.includes(p));

  return (
    <div className="space-y-2">
      <Label>{label}</Label>

      {/* Selected tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs font-medium text-primary"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="ml-0.5 rounded-full hover:bg-primary/20 p-0.5"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Preset chips */}
      {availablePresets.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {availablePresets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => addTag(preset)}
              className="rounded-full border border-dashed border-border/60 px-2.5 py-0.5 text-[10px] font-medium text-foreground/40 hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-colors"
            >
              + {preset}
            </button>
          ))}
        </div>
      )}

      {/* Custom input */}
      <Input
        placeholder={placeholder || `Type and press Enter...`}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
