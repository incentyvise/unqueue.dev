import { Toaster as SonnerToaster } from "sonner";
import { useTheme } from "@/components/theme-provider";

export function Toaster() {
  const { theme } = useTheme();

  return (
    <SonnerToaster
      theme={theme}
      position="bottom-right"
      closeButton
      richColors
      duration={4500}
      toastOptions={{
        className: "font-sans text-xs",
      }}
    />
  );
}
