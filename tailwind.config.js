/** @type {import('tailwindcss').Config} */
export default {
	content: [
		"./index.html",
		"./src/**/*.{js,ts,jsx,tsx}",
	],
	theme: {
		extend: {
			fontFamily: {
				playfair: ['"Playfair Display"', "serif"],
				inter: ["Inter", "system-ui", "sans-serif"],
			},
			colors: {
				// Design system tokens from BSHM-PMS overview
				primary: "#F5C518",
				"primary-foreground": "#1C1C1E",
				background: "#F4F4F2",
				foreground: "#1C1C1E",
				border: "#E6E6E1",
				muted: "#6B7280",
				"muted-foreground": "#6B7280",
				secondary: "#FFFFFF",
				"secondary-foreground": "#1C1C1E",
				ring: "#F5C518",
				destructive: "#EF4444",
				"destructive-foreground": "#FFFFFF",
				success: "#22C55E",
				"success-foreground": "#FFFFFF",
				warning: "#F97316",
				"warning-foreground": "#FFFFFF",
				info: "#3B82F6",
				"info-foreground": "#FFFFFF",
				reserved: "#8B5CF6",
				"reserved-foreground": "#FFFFFF",
				"surface-hover": "rgba(0, 0, 0, 0.05)",
			},
		},
	},
	plugins: [],
}