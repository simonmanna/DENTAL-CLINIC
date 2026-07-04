// src/components/ui/sonner.tsx
import { useTheme } from "next-themes"
import { Toaster as Sonner, toast } from "sonner"
// ✅ Fixed: Use correct lucide-react icon names
import { 
  CheckCircle as CircleCheckIcon,  // 👈 Was: CircleCheckIcon
  Info,                            // 👈 Was: InfoIcon  
  AlertTriangle as TriangleAlertIcon,  // 👈 Was: TriangleAlertIcon
  XCircle as OctagonXIcon,         // 👈 Was: OctagonXIcon
  Loader2 
} from "lucide-react"

type ToasterProps = React.ComponentProps<typeof Sonner>

// src/components/ui/sonner.tsx

// ... existing imports

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      // 1. Move icons HERE (top-level prop)
      icons={{
        success: <CircleCheckIcon className="h-4 w-4" />,
        error: <OctagonXIcon className="h-4 w-4" />,
        warning: <TriangleAlertIcon className="h-4 w-4" />,
        info: <Info className="h-4 w-4" />,
        loading: <Loader2 className="h-4 w-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success: "border-green-500 text-green-600",
          error: "border-red-500 text-red-600",
          warning: "border-amber-500 text-amber-600",
          info: "border-blue-500 text-blue-600",
        },
        // 2. REMOVE icons from here
      }}
      {...props}
    />
  )
}

export { Toaster, toast }
