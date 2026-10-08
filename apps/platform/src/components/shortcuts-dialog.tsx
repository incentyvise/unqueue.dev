import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/kbd";

const SECTIONS: Array<{ title: string; items: Array<{ keys: string[]; label: string }> }> = [
  {
    title: "Global",
    items: [
      { keys: ["⌘", "K"], label: "Command palette" },
      { keys: ["?"], label: "Show keyboard shortcuts" },
      { keys: ["g", "o"], label: "Go to overview" },
      { keys: ["g", "q"], label: "Go to queues" },
      { keys: ["g", "s"], label: "Go to stats" },
      { keys: ["g", "b"], label: "Go to bookmarks" },
    ],
  },
  {
    title: "Queue page",
    items: [
      { keys: ["/"], label: "Search jobs" },
      { keys: ["j"], label: "Next job" },
      { keys: ["k"], label: "Previous job" },
      { keys: ["↵"], label: "Open focused job" },
      { keys: ["x"], label: "Select focused job" },
      { keys: ["n"], label: "Add a job" },
      { keys: ["1"], label: "Latest tab" },
      { keys: ["2"], label: "Failed tab" },
      { keys: ["3"], label: "Errors tab" },
      { keys: ["4"], label: "Active tab" },
      { keys: ["5"], label: "Waiting tab" },
      { keys: ["Esc"], label: "Clear search / selection" },
    ],
  },
  {
    title: "Job panel",
    items: [
      { keys: ["r"], label: "Retry job" },
      { keys: ["e"], label: "Edit & replay" },
      { keys: ["c"], label: "Copy job link" },
    ],
  },
];

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Move faster without leaving the keyboard.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 sm:grid-cols-2">
          {SECTIONS.map((section) => (
            <div key={section.title} className="space-y-2">
              <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {section.title}
              </h3>
              <ul className="space-y-1.5">
                {section.items.map((item) => (
                  <li
                    key={item.label}
                    className="flex items-center justify-between gap-3 text-xs"
                  >
                    <span>{item.label}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {item.keys.map((key) => (
                        <Kbd key={key}>{key}</Kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
