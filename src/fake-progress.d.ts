declare module 'fake-progress' {
	interface FakeProgressOptions {
		timeConstant?: number;
		autoStart?: boolean;
		start?: number;
		end?: number;
		parent?: FakeProgress;
		parentStart?: number;
		parentEnd?: number;
	}

	export default class FakeProgress {
		constructor(options?: FakeProgressOptions);

		progress: number;

		start(): void;
		stop(): void;
		end(): void;
		setProgress(progress: number): void;
		createSubProgress(options?: FakeProgressOptions): FakeProgress;
	}
}
