import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// Predefined palette for medical/inventory categories
const COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#84cc16", // lime
  "#22c55e", // green
  "#10b981", // emerald
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#0ea5e9", // sky
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#a855f7", // purple
  "#d946ef", // fuchsia
  "#ec4899", // pink
  "#f43f5e", // rose
  "#6b7280", // gray
  "#000000", // black
];

interface ColorPickerProps {
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function ColorPicker({ value, onChange, disabled }: ColorPickerProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-[100px] justify-start text-left font-normal",
            !value && "text-muted-foreground"
          )}
          disabled={disabled}
        >
          <div className="flex items-center gap-2">
            {value ? (
              <div
                className="h-4 w-4 rounded-full border"
                style={{ backgroundColor: value }}
              />
            ) : (
              <div className="h-4 w-4 rounded-full border bg-muted" />
            )}
            <span className="truncate">{value || "Pick color"}</span>
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-3">
        <div className="space-y-3">
          <div className="text-sm font-medium">Select Color</div>
          <div className="grid grid-cols-6 gap-2">
            {COLORS.map((color) => (
              <button
                key={color}
                className={cn(
                  "h-8 w-8 rounded-full border-2 transition-all",
                  value === color ? "border-primary scale-110" : "border-transparent hover:scale-105"
                )}
                style={{ backgroundColor: color }}
                onClick={() => {
                  onChange(color);
                  setOpen(false);
                }}
                type="button"
              >
                {value === color && (
                  <Check className="h-4 w-4 text-white mx-auto drop-shadow-md" />
                )}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-2 border-t">
            <span className="text-xs text-muted-foreground">Custom:</span>
            <input
              type="color"
              value={value || "#000000"}
              onChange={(e) => onChange(e.target.value)}
              className="h-8 w-8 rounded cursor-pointer border-0 p-0"
            />
            <span className="text-xs text-muted-foreground ml-auto">
              Click to use custom color
            </span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}