import esbuild from 'esbuild';
import process from 'process';
import { createBuildOptions } from './build-options.mjs';

const prod = process.argv[2] === 'production';

const context = await esbuild.context(
	createBuildOptions({
		outfile: 'main.js',
		production: prod,
	}),
);

if (prod) {
	await context.rebuild();
	process.exit(0);
} else {
	await context.watch();
}
