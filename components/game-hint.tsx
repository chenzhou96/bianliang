'use client';
import {
  Children,
  isValidElement,
  useId,
  useState,
  type ReactNode,
} from 'react';
import { Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from './ui/tooltip';

export function actionText(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number')
        return String(child);
      return isValidElement<{ children?: ReactNode }>(child)
        ? actionText(child.props.children)
        : '';
    })
    .join('');
}

export function InfoHint({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <TooltipProvider>
      <Tooltip open={open} onOpenChange={setOpen} triggerId={id}>
        <TooltipTrigger
          className="info-hint"
          id={id}
          closeOnClick={false}
          aria-describedby={`${id}-help`}
          aria-label={label}
          onClick={() => setOpen(true)}
        >
          <Info size={17} aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent
          className="game-hint-popup"
          role="tooltip"
          id={`${id}-help`}
        >
          <strong>{label}</strong>
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
