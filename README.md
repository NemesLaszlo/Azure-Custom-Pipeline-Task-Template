# Azure Custom Pipeline Task Template

A ready-to-copy template for building **custom Azure Pipelines tasks** (Azure DevOps Services and
Azure DevOps Server) in TypeScript, packaged as a VSIX extension.

It gives you a working task with validated inputs, secret handling, an HTTP client with chunked
file upload, unit tests on the official mock runner, build/package scripts and CI. Replace the
example logic with your own and you have a production-ready task.

- Runs on the **Node 20 and Node 24** agent handlers (the handlers currently recommended by Microsoft; Node 6/10/16 are deprecated).
- Uses `azure-pipelines-task-lib` 5.x and the global `fetch` built into Node, so there is no HTTP dependency to keep patched.
- Tested with mocha and `azure-pipelines-task-lib/mock-test`, exactly like Microsoft's own tasks.

## Repository layout

```
.
├── buildandreleasetask/        The task (one folder per task; the folder name is referenced by vss-extension.json)
│   ├── task.json               Task definition: id, inputs, output variables, execution handlers
│   ├── index.ts                Entry point: orchestrates the work and reports the result
│   ├── inputs.ts               Reads and validates every input in one place
│   ├── apiClient.ts            Small JSON/binary HTTP client (bearer auth, timeouts, good errors)
│   ├── fileUpload.ts           Chunked file upload built on the client
│   ├── icon.png                32x32 icon shown next to the task in the pipeline editor
│   ├── tests/                  mocha suite + one script per scenario (see Testing)
│   ├── package.json            Task dependencies and scripts (build, test)
│   └── tsconfig.json
├── images/extension-icon.png   128x128 icon shown in the extension gallery
├── overview.md                 Extension description shown in the gallery (edit per task)
├── vss-extension.json          Extension manifest: id, publisher, version, contributed tasks
├── scripts/                    package.js (build, test, prune, tfx), clean.js, make-icons.js
├── .github/workflows/ci.yml    Build + test on Node 20 and 24, package the VSIX as an artifact
├── .github/dependabot.yml      Monthly dependency updates
└── package.json                Root scripts that drive everything (see Quick start)
```

Compiled `*.js` files and `dist/*.vsix` are build output and are git-ignored. Only the `.ts` sources are committed.

## Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | 20 or 24 (24 recommended, see `.nvmrc`) | Match the handler you ship with. |
| npm | 9+ | Ships with Node. |
| tfx-cli | installed by `npm install` | Packages the VSIX. No global install needed. |
| An Azure DevOps organization or server | | To install and run the task. |
| A Marketplace publisher | only for Azure DevOps Services | Not needed for an on-premises server (see Publishing). |

## Quick start

1. On GitHub choose **Use this template** (or clone the repository) and open the new repo.
2. Install everything (root `npm install` also installs the task's dependencies):

   ```powershell
   npm install
   ```

3. Build, test and package:

   ```powershell
   npm run build      # tsc -> buildandreleasetask/*.js
   npm test           # mocha suite (first run downloads the Node runtime used by the mock runner)
   npm run package    # build + test + tfx -> dist/<publisher>.<id>-<version>.vsix
   ```

4. Upload `dist/*.vsix` to your server or publisher (see [Publishing](#publishing-and-installing)).

Other scripts: `npm run test:trace` shows the task's full output while testing, `npm run clean` removes build output,
`npm run package:rev` lets tfx bump the patch version of the extension while packaging.

## Making it your own

Work through this checklist when you create a task from the template:

1. **Rename the task folder** if you like (`buildandreleasetask` -> `mytask`) and update both the `files[].path` and `contributions[].properties.name` entries in `vss-extension.json`, plus the paths in `package.json`, `scripts/*.js`, `.gitignore` and `ci.yml`.
2. **`task.json`**
   - `id`: generate a **new GUID**. Every task needs its own; two tasks with the same id conflict on the server. `node -e "console.log(require('crypto').randomUUID())"` or `(New-Guid).Guid` in PowerShell 5+.
   - `name` (no spaces, used in YAML as `name@major`), `friendlyName`, `description`, `author`, `instanceNameFormat`, `helpMarkDown`.
   - `inputs`: declare what your task needs. Use the right type (`string`, `boolean`, `int`, `filePath`, `pickList`, `multiLine`, `connectedService:*`), group advanced options and write `helpMarkDown` for every input.
   - `outputVariables` and `restrictions.settableVariables.allowed` must list the same names.
   - `version`: start at `1.0.0`.
3. **`vss-extension.json`**: `id`, `name`, `description`, `publisher`, `version`, `repository.uri`, `tags`.
4. **Icons**: replace `images/extension-icon.png` (128x128) and `buildandreleasetask/icon.png` (32x32). The placeholders come from `scripts/make-icons.js`.
5. **`overview.md`**: describe your task for the gallery (inputs, outputs, YAML example).
6. **Code**: edit `inputs.ts` to match your inputs, then rewrite `run()` in `index.ts`. Keep `apiClient.ts` / `fileUpload.ts` if you talk to an HTTP API, delete them otherwise.
7. **Tests**: update `tests/fakes.ts` and the scenario scripts so they cover your inputs and failure modes.
8. **Docs**: replace this README with documentation for your task (keep the sections you find useful).

## How the task is built

### `task.json`

- **Execution handlers**: both `Node20_1` and `Node24` point at `index.js`. The agent picks the highest handler it supports, so new agents run Node 24 and older ones (for example on Azure DevOps Server 2022) run Node 20. Keep both unless you know every agent is new. To force Node 24 on an agent that has both, set the pipeline variable `AGENT_USE_NODE24=true`.
- **`minimumAgentVersion`** is deliberately not set. Setting it makes the server auto-upgrade older agents, which you may not want on-premises. If you ship *only* the `Node24` handler, set `"minimumAgentVersion": "4.265.1"`.
- **`restrictions`**: `commands.mode: restricted` limits which `##vso` logging commands the task may emit and `settableVariables.allowed` lists the variables it may set. This is Microsoft's recommendation for new tasks and needs agent 2.182.1 or newer.
- **Groups** (`files`, `advanced`) keep the classic editor tidy. Every input that uses `groupName` must reference a group declared in `groups`.
- **`pickList`** inputs replace free-text "yes/no" strings; the agent validates the value for you.
- **`filePath`** inputs are resolved by the agent relative to `$(System.DefaultWorkingDirectory)`; `inputs.ts` still resolves relative paths defensively.

### Source structure

| File | Responsibility |
| --- | --- |
| `inputs.ts` | Reads every input, validates it, converts types, masks secrets. Throws `Error` with a readable message. |
| `apiClient.ts` | `ApiClient` with `get/post/put/sendBinary`, bearer auth, per-request timeout and `ApiError` carrying status + body. Uses the global `fetch`. |
| `fileUpload.ts` | `uploadFileInChunks()`: validates the file, calls the initialise endpoint, streams chunks with `fs.promises`. |
| `index.ts` | Wires it together: inputs -> work -> `tl.setResult`. The `run().catch` at the bottom is the single place that turns an exception into a failed task. |

Conventions worth keeping:

- Always throw `Error` objects, never strings. `tl.setResult(Failed, err.message)` prints `undefined` for a thrown string.
- Call `tl.setSecret()` on any secret input right after reading it, and prefer secret pipeline variables (`$(MyToken)`) so the agent masks the value everywhere.
- Log progress with `console.log`, diagnostics with `tl.debug` (shown when `System.Debug` is `true`), problems with `tl.warning` / `tl.error`.
- Use `tl.setVariable(name, value, false, true)` for output variables and declare them in `task.json`.

## Running the task locally

The agent passes inputs as `INPUT_<NAME>` environment variables (upper case). You can do the same:

```powershell
npm run build
cd buildandreleasetask
$env:INPUT_APIURL = "https://my-service.example.com"
$env:INPUT_APITOKEN = "..."
$env:INPUT_RESOURCEID = "demo"
$env:INPUT_VERSIONSTRING = "1.0.0"
$env:INPUT_ONEXISTING = "fail"
$env:INPUT_PRIMARYFILEPATH = "C:\path\to\installer.zip"
$env:INPUT_CHUNKSIZEMB = "10"
$env:SYSTEM_DEBUG = "true"     # optional: show tl.debug output
node index.js
```

```bash
INPUT_APIURL=https://my-service.example.com INPUT_APITOKEN=... INPUT_RESOURCEID=demo \
INPUT_VERSIONSTRING=1.0.0 INPUT_ONEXISTING=fail INPUT_PRIMARYFILEPATH=./installer.zip \
INPUT_CHUNKSIZEMB=10 node index.js
```

`.vscode/launch.json` contains a *Run task locally* configuration with the same variables, and a *Debug tests* configuration.
Running locally creates a `.taskkey` file next to `index.js`; it is git-ignored.

## Testing

```powershell
npm test              # or: npm run test:trace  (prints the full task output)
```

- `tests/_suite.ts` is the mocha suite. Each `it()` runs one script from `tests/` in a separate process through `MockTestRunner` and asserts on `succeeded`, `errorIssues`, `warningIssues` and `stdout`.
- The scenario scripts (`success.ts`, `skip-existing.ts`, ...) use `TaskMockRunner` to set inputs and to replace `./apiClient` and `./fileUpload` with the fakes from `tests/fakes.ts`. Nothing touches the network or the file system.
- `registerMock()` matches the **exact** `require()` string used in `index.ts` (`'./apiClient'`), so keep those paths in sync.
- `MockTestRunner` runs the task with the Node version of the highest handler in `task.json` (Node 24). It downloads that runtime once into `~/azure-pipelines-task-lib/_download/`, so the first test run needs network access.

## Packaging

```powershell
npm run package          # dist/<publisher>.<extension-id>-<version>.vsix
npm run package:rev      # same, but tfx bumps the patch version in vss-extension.json
```

`scripts/package.js` builds, runs the tests, prunes dev dependencies from the task folder (the VSIX must contain
`node_modules`, but only the production ones), runs `tfx extension create` and restores the dev dependencies.
The CI workflow does the same and uploads the VSIX as a build artifact.

## Publishing and installing

### Azure DevOps Server (on-premises)

1. Open `https://<server>/<collection>/_settings/extensions` (Collection settings -> Extensions).
2. **Browse local extensions** -> **Manage extensions** -> **Upload extension** and choose the `.vsix`.
3. Back on the Local gallery page select the extension and **Install** it into the collection.
4. To ship an update, bump the versions (see below), upload the new `.vsix` and install it again.

### Azure DevOps Services (Marketplace)

1. Create a publisher at <https://marketplace.visualstudio.com/manage> and put its id into `vss-extension.json` -> `publisher`.
2. Upload the `.vsix` in the portal, or run:

   ```powershell
   npx tfx extension publish --manifest-globs vss-extension.json --share-with <your-organization> --token <marketplace-PAT>
   ```

3. Keep the extension **private** and share it with your organizations unless you want it public.
4. Install it from **Organization settings -> Extensions -> Shared with me**.

### Using the task in a pipeline

```yaml
- task: CustomTaskTemplate@1        # <name>@<Major> from task.json
  inputs:
    apiUrl: https://my-service.example.com
    apiToken: $(MyApiToken)         # secret variable
    resourceId: my-product
    versionString: $(Build.BuildNumber)
    primaryFilePath: $(Build.ArtifactStagingDirectory)/installer.zip
```

If your task name collides with a built-in task, reference it by GUID: `- task: 1081bded-8248-4860-8bc8-c11abbef37d1@1`.

## Versioning rules

- **Bump both versions on every release**: `task.json` -> `version` and `vss-extension.json` -> `version`. Agents cache a task by its version, so re-uploading the same version does *not* update anything.
- **Patch / minor**: fixes and backwards-compatible changes. Pipelines that reference `MyTask@1` pick them up automatically.
- **Major**: breaking changes to inputs or behaviour. Pipelines keep running the old major until someone switches them to `MyTask@2`. Do not bump the major for every release; the previous template did and ended up at `20.0.0`, which forced every pipeline to be touched.
- Several tasks in one extension each have their own `task.json` version; the extension version must still increase.

## Upgrading tasks built from the old template

If you have tasks created from the previous version of this template (`node-fetch`, `azure-pipelines-task-lib` 3.x, no tests), this is the migration path:

1. Copy `tsconfig.json`, `package.json`, `tests/` and the root files (`package.json`, `scripts/`, `.gitignore`, `.github/`) from this repository.
2. Drop `node-fetch`, `@types/node-fetch`, `@types/q` and `sync-request`; use `apiClient.ts` (global `fetch`) instead. The old `apiRequest()` and `uploadFile()` map 1:1 to `ApiClient` and `uploadFileInChunks()`.
3. Replace `throw "message"` with `throw new Error("message")` everywhere; otherwise failed tasks show `undefined` as the reason.
4. Move input reading into an `inputs.ts` and call `tl.setSecret()` on the PAT. Replace string "yes"/"no" inputs with `boolean` or `pickList`.
5. In `task.json` set a valid GUID `id` (the old template shipped `custom-id`), add the `Node24` handler next to `Node20_1`, add `groups` for any `groupName` you use, add `outputVariables` / `restrictions` if you set variables.
6. Stop committing `index.js`, `.taskkey` and `.vsix` files; build output is produced by `npm run build` / `npm run package`.
7. Add tests for the success path and each validation failure, then let CI run them on Node 20 and 24.

## Known limitations and tips

- The global `fetch` does not honour the agent proxy settings (`Agent.ProxyUrl`). If your agents sit behind a proxy, read `tl.getHttpProxyConfiguration()` and pass an `undici` `ProxyAgent` as the `dispatcher` in `apiClient.ts`.
- The VSIX size limit is 50 MB; keep `node_modules` lean (the package script already prunes dev dependencies).
- `showEnvironmentVariables` in `task.json` is `false`; set it to `true` only if your task needs an *Environment variables* section in the classic editor.
- Cancellation: the agent sends `SIGINT`/`SIGTERM`. Add `process.on('SIGTERM', ...)` in `index.ts` if your task has to clean something up.

## Resources

- [Add a custom pipelines task extension](https://learn.microsoft.com/en-us/azure/devops/extend/develop/add-build-task) (Microsoft Learn)
- [Task JSON schema](https://github.com/microsoft/azure-pipelines-task-lib/blob/master/tasks.schema.json) and [task-lib TypeScript API](https://github.com/microsoft/azure-pipelines-task-lib/blob/master/node/docs/azure-pipelines-task-lib.md)
- [Migrating tasks to the Node 24 handler](https://github.com/microsoft/azure-pipelines-tasks/blob/master/docs/migrateNode24.md) and [to Node 20](https://github.com/microsoft/azure-pipelines-tasks/blob/master/docs/migrateNode20.md)
- [Extension manifest reference](https://learn.microsoft.com/en-us/azure/devops/extend/develop/manifest)
- [tfx-cli](https://github.com/microsoft/tfs-cli)
- [Microsoft's own tasks](https://github.com/microsoft/azure-pipelines-tasks/tree/master/Tasks) as reference implementations
