import {
	copyArtifact,
	enableHotReload,
	getLocalDeployment,
} from './local-deployment.mjs';

const { manifest, targetDirectory } = await getLocalDeployment();

const releaseFiles = ['main.js', 'manifest.json', 'styles.css'];
for (const fileName of releaseFiles) {
	await copyArtifact(targetDirectory, fileName);
}
await enableHotReload(targetDirectory);

console.log(`Deployed ${manifest.name} ${manifest.version} to:`);
console.log(targetDirectory);
console.log('Enabled Obsidian Hot Reload with .hotreload.');
