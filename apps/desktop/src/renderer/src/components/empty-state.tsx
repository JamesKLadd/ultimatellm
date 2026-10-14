import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 pb-16 text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
        <Icon className="size-6" />
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
