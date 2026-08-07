import { constants } from 'node:fs';
import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const projectRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
);

async function readJson(filePath) {
	return JSON.parse(await readFile(filePath, 'utf8'));
}

export async function fileExists(filePath) {
	try {
		await access(filePath, constants.F_OK);
		return true;
	} catch {
		return false;
	}
}

export async function getLocalDeployment() {
	const manifest = await readJson(path.join(projectRoot, 'manifest.json'));
	const configPath = path.join(projectRoot, 'local.config.json');
	const localConfig = (await fileExists(configPath))
		? await readJson(configPath)
		: {};
	const vaultPath = process.env.OBSIDIAN_VAULT_PATH ?? localConfig.vaultPath;

	if (typeof vaultPath !== 'string' || !path.isAbsolute(vaultPath)) {
		throw new Error(
			'Configure an absolute vaultPath in local.config.json or set OBSIDIAN_VAULT_PATH.',
		);
	}

	const obsidianDirectory = path.join(vaultPath, '.obsidian');
	if (!(await fileExists(obsidianDirectory))) {
		throw new Error(`Not an Obsidian vault: ${vaultPath}`);
	}

	const targetDirectory = path.join(
		obsidianDirectory,
		'plugins',
		manifest.id,
	);
	await mkdir(targetDirectory, { recursive: true });

	return { manifest, targetDirectory };
}

export async function copyArtifact(targetDirectory, fileName) {
	const sourcePath = path.join(projectRoot, fileName);
	if (!(await fileExists(sourcePath))) {
		throw new Error(`Missing build artifact: ${sourcePath}`);
	}

	await copyFile(sourcePath, path.join(targetDirectory, fileName));
}

export async function enableHotReload(targetDirectory) {
	await writeFile(path.join(targetDirectory, '.hotreload'), '');
}
