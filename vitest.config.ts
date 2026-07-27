import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'

export default defineConfig({
	plugins: [vue()],
	resolve: {
		alias: {
			'@': path.resolve(__dirname, 'src'),
			'@electron': path.resolve(__dirname, 'electron')
		}
	},
	test: {
		environment: 'jsdom',
		globals: true,
		include: [
			'tests/unit/**/*.test.ts',
			'tests/components/**/*.spec.ts',
			'tests/engine/**/*.test.ts',
			'tests/scripts/**/*.test.ts'
		],
		setupFiles: ['./tests/setup-frontend.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'text-summary', 'html', 'lcov', 'json'],
			reportsDirectory: 'coverage/frontend',
			include: [
				'src/core/**/*.ts',
				'src/engine/**/*.ts',
				'src/store/**/*.ts',
				'src/network/**/*.ts',
				'src/engine/webgl/**/*.ts'
			],
			exclude: [
				'src/**/*.d.ts',
				'src/**/*.vue',
				'src/core/**/types.ts',
				'src/engine/**/types.ts',
				'src/**/*.test.ts',
				'src/**/*.spec.ts'
			],
			thresholds: {
				lines: 50,
				functions: 55,
				branches: 40,
				statements: 50
			}
		}
	}
})
