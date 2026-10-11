# Custom Task Template

> This file is the description shown in the Azure DevOps extension gallery (Marketplace or the
> on-premises *Local gallery*). Rewrite it for your task before publishing.

Uploads a file in chunks to an HTTP API and creates a version record for it.

## Inputs

| Input | Required | Description |
| --- | --- | --- |
| API base URL | yes | Base URL of the API. |
| API token | yes | Bearer token. Pass a secret pipeline variable, e.g. `$(MyApiToken)`. |
| Resource ID | yes | Identifier of the parent resource (for example a product). |
| Version | yes | Version string to create. Defaults to `$(Build.BuildNumber)`. |
| If the version already exists | yes | `Fail`, `Skip` (succeed with a warning) or `Update`. |
| Mark the version as active | no | Make the new version the active one. |
| Primary file | yes | File to upload, for example the installer `.zip`. |
| Secondary file | no | Optional second file, for example documentation. |
| Publish date | no | `yyyy-MM-dd`, defaults to today. |
| Changelog | no | One entry per line. |
| Upload chunk size (MB) | no | Default 10. |
| Working directory | no | Base for relative paths. Defaults to `$(System.DefaultWorkingDirectory)`. |

## Output variables

| Variable | Description |
| --- | --- |
| `createdVersionId` | Id of the version that was created, updated or found. Use it as `$(stepName.createdVersionId)` in later steps. |

## Example (YAML)

```yaml
- task: CustomTaskTemplate@1
  name: publish
  inputs:
    apiUrl: https://my-service.example.com
    apiToken: $(MyApiToken)
    resourceId: my-product
    versionString: $(Build.BuildNumber)
    primaryFilePath: $(Build.ArtifactStagingDirectory)/installer.zip
    secondaryFilePath: $(Build.ArtifactStagingDirectory)/docs.zip
    onExisting: fail
    markActive: true
    changelog: |
      Added feature X
      Fixed bug Y

- script: echo Created version $(publish.createdVersionId)
```
