param(
    [Parameter(Mandatory = $true)]
    [string]$DocPath,

    [Parameter(Mandatory = $true)]
    [string]$Repo,

    [Parameter(Mandatory = $true)]
    [string]$ProjectOwner,

    [Parameter(Mandatory = $true)]
    [int]$ProjectNumber,

    [Parameter(Mandatory = $true)]
    [string]$ProjectId,

    [Parameter(Mandatory = $true)]
    [string]$SprintOption,

    [Parameter(Mandatory = $true)]
    [string]$ModuleDefault,

    [switch]$SkipExistingProjectItems
)

$ErrorActionPreference = "Stop"

$normalizedDocPath = $DocPath -replace "\\", "/"

$fieldsJson = gh project field-list $ProjectNumber --owner $ProjectOwner --format json | ConvertFrom-Json
$fieldMap = @{}
foreach ($field in $fieldsJson.fields) {
    $fieldMap[$field.name] = $field
}

function Get-OptionId {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FieldName,
        [Parameter(Mandatory = $true)]
        [string]$OptionName
    )

    $field = $fieldMap[$FieldName]
    if (-not $field) {
        throw "Missing field: $FieldName"
    }

    $option = $field.options | Where-Object { $_.name -eq $OptionName } | Select-Object -First 1
    if (-not $option) {
        throw "Missing option '$OptionName' in field '$FieldName'"
    }

    return $option.id
}

function Get-ModuleValue {
    param(
        [string]$BacklogId,
        [string]$Area,
        [string]$DefaultModule
    )

    if ($Area -eq "Security") {
        return "Security"
    }

    if ($Area -eq "Reporting") {
        return "Reporting"
    }

    if ($Area -eq "AI") {
        return "Minutes"
    }

    if ($BacklogId -eq "PB-043") {
        return "Governance"
    }

    return $DefaultModule
}

function Get-RiskValue {
    param(
        [string]$Area
    )

    if ($Area -eq "Security") {
        return "High"
    }

    if ($Area -eq "AI") {
        return "High"
    }

    return "Medium"
}

$content = Get-Content $DocPath -Raw -Encoding UTF8
$sections = [regex]::Matches($content, '(?ms)^## Issue \d+\s*\r?\n(.*?)(?=^---\s*$|\z)')

foreach ($sectionMatch in $sections) {
    $section = $sectionMatch.Groups[1].Value.Trim()

    $title = [regex]::Match($section, '\*\*Title:\*\* `([^`]+)`').Groups[1].Value.Trim()
    $backlogId = [regex]::Match($section, '\*\*Backlog ID:\*\* `([^`]+)`').Groups[1].Value.Trim()
    $priority = [regex]::Match($section, '\*\*Priority:\*\* `([^`]+)`').Groups[1].Value.Trim()
    $owner = [regex]::Match($section, '\*\*Owner:\*\* `([^`]+)`').Groups[1].Value.Trim()
    $area = [regex]::Match($section, '\*\*Area:\*\* `([^`]+)`').Groups[1].Value.Trim()
    $release = [regex]::Match($section, '\*\*Release:\*\* `([^`]+)`').Groups[1].Value.Trim()
    $labelLine = [regex]::Match($section, '\*\*Labels:\*\* (.+)').Groups[1].Value.Trim()
    $labels = [regex]::Matches($labelLine, '`([^`]+)`') | ForEach-Object { $_.Groups[1].Value }

    $goal = [regex]::Match($section, '(?ms)### Goal\s*(.*?)\s*### Scope').Groups[1].Value.Trim()
    $scope = [regex]::Match($section, '(?ms)### Scope\s*(.*?)\s*### Out of Scope').Groups[1].Value.Trim()
    $outOfScope = [regex]::Match($section, '(?ms)### Out of Scope\s*(.*?)\s*### Acceptance Criteria').Groups[1].Value.Trim()
    $acceptance = [regex]::Match($section, '(?ms)### Acceptance Criteria\s*(.*)$').Groups[1].Value.Trim()

    $body = @"
## Goal

$goal

## Scope

$scope

## Out of Scope

$outOfScope

## Acceptance Criteria

$acceptance

## References

- Backlog ID: $backlogId
- Source document: $normalizedDocPath
"@

    $searchQuery = '"' + $backlogId + '" in:title'
    $existing = gh issue list --repo $Repo --search $searchQuery --limit 1 --json number,title,url | ConvertFrom-Json

    if ($existing.Count -gt 0) {
        $issueUrl = $existing[0].url
        gh issue edit $issueUrl --repo $Repo --title $title --body $body --milestone $release | Out-Null
    } else {
        $labelArgs = @()
        foreach ($label in $labels) {
            $labelArgs += @("--label", $label)
        }

        $issueUrl = gh issue create --repo $Repo --title $title --body $body --milestone $release @labelArgs
    }

    $item = $null
    try {
        $item = gh project item-add $ProjectNumber --owner $ProjectOwner --url $issueUrl --format json | ConvertFrom-Json
    } catch {
        if (-not $SkipExistingProjectItems) {
            throw
        }
    }

    if (-not $item) {
        Write-Output "Skipped existing project item: $title -> $issueUrl"
        continue
    }

    $itemId = $item.id
    $module = Get-ModuleValue -BacklogId $backlogId -Area $area -DefaultModule $ModuleDefault
    $risk = Get-RiskValue -Area $area

    gh project item-edit --id $itemId --project-id $ProjectId --field-id $fieldMap["Priority"].id --single-select-option-id (Get-OptionId -FieldName "Priority" -OptionName $priority) | Out-Null
    gh project item-edit --id $itemId --project-id $ProjectId --field-id $fieldMap["Owner"].id --single-select-option-id (Get-OptionId -FieldName "Owner" -OptionName $owner) | Out-Null
    gh project item-edit --id $itemId --project-id $ProjectId --field-id $fieldMap["Area"].id --single-select-option-id (Get-OptionId -FieldName "Area" -OptionName $area) | Out-Null
    gh project item-edit --id $itemId --project-id $ProjectId --field-id $fieldMap["Sprint"].id --single-select-option-id (Get-OptionId -FieldName "Sprint" -OptionName $SprintOption) | Out-Null
    gh project item-edit --id $itemId --project-id $ProjectId --field-id $fieldMap["Release"].id --single-select-option-id (Get-OptionId -FieldName "Release" -OptionName $release) | Out-Null
    gh project item-edit --id $itemId --project-id $ProjectId --field-id $fieldMap["Module"].id --single-select-option-id (Get-OptionId -FieldName "Module" -OptionName $module) | Out-Null
    gh project item-edit --id $itemId --project-id $ProjectId --field-id $fieldMap["Risk"].id --single-select-option-id (Get-OptionId -FieldName "Risk" -OptionName $risk) | Out-Null
    gh project item-edit --id $itemId --project-id $ProjectId --field-id $fieldMap["Work Type"].id --single-select-option-id (Get-OptionId -FieldName "Work Type" -OptionName "Task") | Out-Null

    Write-Output "Imported: $title -> $issueUrl"
}
