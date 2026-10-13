import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#081A30',
          50: '#F0F4F8',
          100: '#D9E3EF',
          200: '#A8BFD9',
          300: '#6F93BD',
          400: '#3D6A9A',
          500: '#081A30',
          600: '#061426',
          700: '#04101F',
          800: '#030B16',
          900: '#02070E',
        },
        accent: {
          DEFAULT: '#0C6B45',
          50: '#E8F6EF',
          100: '#C5E8D6',
          200: '#8BD1AE',
          300: '#4FB885',
          400: '#1F9560',
          500: '#0C6B45',
          600: '#0A5638',
          700: '#08412B',
          800: '#052C1D',
          900: '#031710',
        },
        brass: {
          DEFAULT: '#B89A4F',
          soft: '#D4BC78',
          deep: '#8A7033',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      fontFamily: {
        sans: ['var(--font-manrope)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['var(--font-fraunces)', 'ui-serif', 'Georgia', 'serif'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        panel: '0 1px 2px rgba(8, 26, 48, 0.06), 0 10px 28px rgba(8, 26, 48, 0.07)',
        lift: '0 8px 30px rgba(8, 26, 48, 0.12)',
        seal: '0 0 0 1px rgba(184, 154, 79, 0.4), 0 8px 24px rgba(8, 26, 48, 0.12)',
      },
      transitionTimingFunction: {
        agency: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
