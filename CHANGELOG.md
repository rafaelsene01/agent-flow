## [1.2.3](https://github.com/rafaelsene01/agent-flow/compare/v1.2.2...v1.2.3) (2026-06-15)


### Bug Fixes

* update development script to use turbopack and adjust modal component styles for improved layout ([84fce41](https://github.com/rafaelsene01/agent-flow/commit/84fce418f87c44dd0790167b4d49b0eefaa8cd17))

## [1.2.2](https://github.com/rafaelsene01/agent-flow/compare/v1.2.1...v1.2.2) (2026-06-13)


### Bug Fixes

* **postinstall:** use cwd web instead of --prefix to avoid infinite recursion on global install ([b5e3535](https://github.com/rafaelsene01/agent-flow/commit/b5e3535194a43c4ce7d0f94f32ca9b037e9bd75d))

## [1.2.1](https://github.com/rafaelsene01/agent-flow/compare/v1.2.0...v1.2.1) (2026-06-13)


### Bug Fixes

* **postinstall:** skip web install when web/ dir does not exist (global npm install) ([7d9e6e8](https://github.com/rafaelsene01/agent-flow/commit/7d9e6e83bbc0adf460a731dcd47504c414cc90e4))

# [1.2.0](https://github.com/rafaelsene01/agent-flow/compare/v1.1.0...v1.2.0) (2026-06-13)


### Bug Fixes

* **ci:** trigger release pipeline ([b2f1606](https://github.com/rafaelsene01/agent-flow/commit/b2f160602fb6a08c1c6f9bea83bc0ea5b4226673))


### Features

* **ui:** enhance card component with spinning border animation and update postinstall script for conditional npm install ([8bd565e](https://github.com/rafaelsene01/agent-flow/commit/8bd565e764cbdfa3a0c55883177450d677d38642))

# [1.1.0](https://github.com/rafaelsene01/agent-flow/compare/v1.0.5...v1.1.0) (2026-06-13)


### Bug Fixes

* **ci:** regenerate lockfile after removing [@emnapi](https://github.com/emnapi) root deps ([2ac194f](https://github.com/rafaelsene01/agent-flow/commit/2ac194f07f0d7182157f0c5b3ea22aea4c6c28dc))


### Features

* **api:** implement error handling and logging for GitHub rate limits; add new routes for worktree management and TLC features ([040b35b](https://github.com/rafaelsene01/agent-flow/commit/040b35bc0ac421e830dcb46e9ffb5e670582436e))
* **ui:** enhance card component with spinning border animation and update postinstall script for conditional npm install ([8bd565e](https://github.com/rafaelsene01/agent-flow/commit/8bd565e764cbdfa3a0c55883177450d677d38642))
* **web:** migrate app shell ([53bc33f](https://github.com/rafaelsene01/agent-flow/commit/53bc33f19af57e148c1a5b1e5a024ef329fa1497))
* **web:** migrate board+column ([a9a04cc](https://github.com/rafaelsene01/agent-flow/commit/a9a04cce066fd6c93c364dd9e745e7808e10e95b))
* **web:** migrate card ([b5537c4](https://github.com/rafaelsene01/agent-flow/commit/b5537c4ed093c32a59a3729bee7ec1094e3e9537))
* **web:** migrate card modal ([c926e52](https://github.com/rafaelsene01/agent-flow/commit/c926e522a600b4f50694c8336cb2e37ee696af22))
* **web:** migrate create branch modal ([c467cc5](https://github.com/rafaelsene01/agent-flow/commit/c467cc56712d531fe7c9df69fba1fffd59f6b4d9))
* **web:** migrate edit board modal ([cd5bfeb](https://github.com/rafaelsene01/agent-flow/commit/cd5bfebcde273bfe38ce4da94e7f48797999104e))
* **web:** migrate header to tailwind+shadcn ([67d9c85](https://github.com/rafaelsene01/agent-flow/commit/67d9c85fa4c1bbe1c645cbaf7b7c8f2bbf48e151))
* **web:** migrate init board modal ([919d793](https://github.com/rafaelsene01/agent-flow/commit/919d793a735d7eb6e4943e12a3cfcbf75e269bb7))
* **web:** migrate settings modal ([d0b9a68](https://github.com/rafaelsene01/agent-flow/commit/d0b9a6804373937623687f1c2eba1a00fbd22303))
* **web:** migrate tlc file modal ([3d12ba2](https://github.com/rafaelsene01/agent-flow/commit/3d12ba291ce943537716e31760bd8d7302ab4946))
* **web:** next/font + class-based dark mode ([6c77792](https://github.com/rafaelsene01/agent-flow/commit/6c7779288b12e2e54e1e2af927846fe31f1b8451))

# [1.1.0](https://github.com/rafaelsene01/agent-flow/compare/v1.0.5...v1.1.0) (2026-06-13)


### Bug Fixes

* **ci:** regenerate lockfile after removing [@emnapi](https://github.com/emnapi) root deps ([2ac194f](https://github.com/rafaelsene01/agent-flow/commit/2ac194f07f0d7182157f0c5b3ea22aea4c6c28dc))


### Features

* **api:** implement error handling and logging for GitHub rate limits; add new routes for worktree management and TLC features ([040b35b](https://github.com/rafaelsene01/agent-flow/commit/040b35bc0ac421e830dcb46e9ffb5e670582436e))
* **web:** migrate app shell ([53bc33f](https://github.com/rafaelsene01/agent-flow/commit/53bc33f19af57e148c1a5b1e5a024ef329fa1497))
* **web:** migrate board+column ([a9a04cc](https://github.com/rafaelsene01/agent-flow/commit/a9a04cce066fd6c93c364dd9e745e7808e10e95b))
* **web:** migrate card ([b5537c4](https://github.com/rafaelsene01/agent-flow/commit/b5537c4ed093c32a59a3729bee7ec1094e3e9537))
* **web:** migrate card modal ([c926e52](https://github.com/rafaelsene01/agent-flow/commit/c926e522a600b4f50694c8336cb2e37ee696af22))
* **web:** migrate create branch modal ([c467cc5](https://github.com/rafaelsene01/agent-flow/commit/c467cc56712d531fe7c9df69fba1fffd59f6b4d9))
* **web:** migrate edit board modal ([cd5bfeb](https://github.com/rafaelsene01/agent-flow/commit/cd5bfebcde273bfe38ce4da94e7f48797999104e))
* **web:** migrate header to tailwind+shadcn ([67d9c85](https://github.com/rafaelsene01/agent-flow/commit/67d9c85fa4c1bbe1c645cbaf7b7c8f2bbf48e151))
* **web:** migrate init board modal ([919d793](https://github.com/rafaelsene01/agent-flow/commit/919d793a735d7eb6e4943e12a3cfcbf75e269bb7))
* **web:** migrate settings modal ([d0b9a68](https://github.com/rafaelsene01/agent-flow/commit/d0b9a6804373937623687f1c2eba1a00fbd22303))
* **web:** migrate tlc file modal ([3d12ba2](https://github.com/rafaelsene01/agent-flow/commit/3d12ba291ce943537716e31760bd8d7302ab4946))
* **web:** next/font + class-based dark mode ([6c77792](https://github.com/rafaelsene01/agent-flow/commit/6c7779288b12e2e54e1e2af927846fe31f1b8451))

# [1.1.0](https://github.com/rafaelsene01/agent-flow/compare/v1.0.5...v1.1.0) (2026-06-13)


### Features

* **api:** implement error handling and logging for GitHub rate limits; add new routes for worktree management and TLC features ([040b35b](https://github.com/rafaelsene01/agent-flow/commit/040b35bc0ac421e830dcb46e9ffb5e670582436e))
* **web:** migrate app shell ([53bc33f](https://github.com/rafaelsene01/agent-flow/commit/53bc33f19af57e148c1a5b1e5a024ef329fa1497))
* **web:** migrate board+column ([a9a04cc](https://github.com/rafaelsene01/agent-flow/commit/a9a04cce066fd6c93c364dd9e745e7808e10e95b))
* **web:** migrate card ([b5537c4](https://github.com/rafaelsene01/agent-flow/commit/b5537c4ed093c32a59a3729bee7ec1094e3e9537))
* **web:** migrate card modal ([c926e52](https://github.com/rafaelsene01/agent-flow/commit/c926e522a600b4f50694c8336cb2e37ee696af22))
* **web:** migrate create branch modal ([c467cc5](https://github.com/rafaelsene01/agent-flow/commit/c467cc56712d531fe7c9df69fba1fffd59f6b4d9))
* **web:** migrate edit board modal ([cd5bfeb](https://github.com/rafaelsene01/agent-flow/commit/cd5bfebcde273bfe38ce4da94e7f48797999104e))
* **web:** migrate header to tailwind+shadcn ([67d9c85](https://github.com/rafaelsene01/agent-flow/commit/67d9c85fa4c1bbe1c645cbaf7b7c8f2bbf48e151))
* **web:** migrate init board modal ([919d793](https://github.com/rafaelsene01/agent-flow/commit/919d793a735d7eb6e4943e12a3cfcbf75e269bb7))
* **web:** migrate settings modal ([d0b9a68](https://github.com/rafaelsene01/agent-flow/commit/d0b9a6804373937623687f1c2eba1a00fbd22303))
* **web:** migrate tlc file modal ([3d12ba2](https://github.com/rafaelsene01/agent-flow/commit/3d12ba291ce943537716e31760bd8d7302ab4946))
* **web:** next/font + class-based dark mode ([6c77792](https://github.com/rafaelsene01/agent-flow/commit/6c7779288b12e2e54e1e2af927846fe31f1b8451))
