import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        base: {
          bg: "#101114",       // 背景：濃いグレー
          card: "#1a1b1f",     // カード：ダークグレー
          border: "#2a2b30",
          hover: "#212227",
        },
        ink: {
          DEFAULT: "#f2f1ed",  // 文字：白
          muted: "#9a9a9f",    // 補助文字：ライトグレー
        },
        accent: {
          DEFAULT: "#c9a45c",  // アクセント：ゴールド
          soft: "#8a7452",
        },
        signal: {
          important: "#e5484d", // 重要ニュース：赤
          update: "#4a9eff",    // 更新情報：青
          new: "#4ac97c",       // 新規ツール：緑
        },
      },
      fontFamily: {
        sans: ["Inter", "Hiragino Sans", "Noto Sans JP", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
