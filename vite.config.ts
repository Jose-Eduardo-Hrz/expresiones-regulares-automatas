/// <reference types="vitest/config" />
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter({ fallback: '200.html' })
		})
	],
	build: {
		// Cytoscape.js ocupa por sí solo cerca de 500 kB minificado.
		chunkSizeWarningLimit: 800
	},
	test: {
		include: ['tests/**/*.test.ts'],
		environment: 'node'
	}
});
