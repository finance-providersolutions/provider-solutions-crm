import {
  CircleCheck,
  Info,
  LoaderCircle,
  OctagonX,
  TriangleAlert,
} from 'lucide-react';
import { Toaster as Sonner } from 'sonner';
import { useTheme } from '@/context/ThemeContext';

const Toaster = ({ ...props }) => {
  const { theme = 'dark' } = useTheme() || {};

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: <CircleCheck className="h-4 w-4" />,
        info: <Info className="h-4 w-4" />,
        warning: <TriangleAlert className="h-4 w-4" />,
        error: <OctagonX className="h-4 w-4" />,
        loading: <LoaderCircle className="h-4 w-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-surface group-[.toaster]:text-text group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-text-dim',
          actionButton: 'group-[.toast]:bg-accent group-[.toast]:text-accent-foreground',
          cancelButton: 'group-[.toast]:bg-surface2 group-[.toast]:text-text-dim',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
