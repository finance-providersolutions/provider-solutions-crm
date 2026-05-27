/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Brand tokens (from src/styles/tokens.css) — authoritative
        bg:              'var(--bg)',
        grid:            'var(--grid)',
        surface:         'var(--surface)',
        surface2:        'var(--surface2)',
        'surface-well':  'var(--surface-well)',
        border:          'var(--border)',
        accent:          'var(--accent)',
        'accent-foreground': 'var(--bg)',  /* shadcn primitives reference text-accent-foreground */
        'accent-dim':    'var(--accent-dim)',
        accent2:         'var(--accent2)',
        'accent-bright': 'var(--accent-bright)',
        text:            'var(--text)',
        'text-dim':      'var(--text-dim)',
        'text-muted':    'var(--text-muted)',
        income:          'var(--g)',
        danger:          'var(--r)',
        warning:         'var(--warning)',
        gp:              'var(--gp)',
        // Headline profit-value teal — see --profit in tokens.css.
        profit:          'var(--profit)',

        // shadcn/ui token aliases (HSL triplets in tokens.css)
        background:       'hsl(var(--background))',
        foreground:       'hsl(var(--foreground))',
        card: {
          DEFAULT:        'hsl(var(--card))',
          foreground:     'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT:        'hsl(var(--popover))',
          foreground:     'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT:        'hsl(var(--primary))',
          foreground:     'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT:        'hsl(var(--secondary))',
          foreground:     'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT:        'hsl(var(--muted))',
          foreground:     'hsl(var(--muted-foreground))',
        },
        destructive: {
          DEFAULT:        'hsl(var(--destructive))',
          foreground:     'hsl(var(--destructive-foreground))',
        },
        input:            'hsl(var(--input))',
        ring:             'hsl(var(--ring))',
      },
      fontFamily: {
        display: ['"DM Serif Display"', 'serif'],
        sans:    ['"DM Sans"', 'sans-serif'],
        mono:    ['"DM Mono"', 'monospace'],
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        lg:      'var(--radius)',
        md:      'calc(var(--radius) - 2px)',
        sm:      'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
};
