import esbuild from 'esbuild';
import { watch } from 'node:fs';
import path from 'node:path';
import { createBuildOptions } from '../build-options.mjs';
import {
	copyArtifact,
	enableHotReload,
	getLocalDeployment,
	projectRoot,
} from './local-deployment.mjs';

const { manifest, targetDirectory } = await getLocalDeployment();

for (const fileName of ['manifest.json', 'styles.css']) {
	await copyArtifact(targetDirectory, fileName);
}
await enableHotReload(targetDirectory);

const context = await esbuild.context(
	createBuildOptions({
		outfile: path.join(targetDirectory, 'main.js'),
		production: false,
	}),
);
await context.watch();

const staticFileWatchers = ['manifest.json', 'styles.css'].map((fileName) =>
	watch(path.join(projectRoot, fileName), async () => {
		try {
			await copyArtifact(targetDirectory, fileName);
			console.log(`Synced ${fileName}`);
		} catch (error) {
			console.error(`Failed to sync ${fileName}:`, error);
		}
	}),
);

async function shutdown() {
	for (const watcher of staticFileWatchers) {
		watcher.close();
	}
	await context.dispose();
	process.exit(0);
}

process.on('SIGINT', () => {
	void shutdown();
});
process.on('SIGTERM', () => {
	void shutdown();
});

console.log(`Watching ${manifest.name} and deploying development builds to:`);
console.log(targetDirectory);
console.log('Enable the Obsidian Hot Reload plugin once to reload on every rebuild.');
