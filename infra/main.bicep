// Phase 3 — Subscription-scope deployment for NaturalizationPuzzle on Azure Container Apps.
// Creates the resource group and dispatches to per-resource modules.

targetScope = 'subscription'

@description('Azure region for all resources.')
param location string = 'westus2'

@description('Short environment name (e.g. prod, dev). Used in resource names and tags.')
@minLength(2)
@maxLength(10)
param environmentName string = 'prod'

@description('Container image reference (e.g. ghcr.io/henrik-me/naturalizationpuzzle:<sha>).')
param containerImage string = 'ghcr.io/henrik-me/naturalizationpuzzle:latest'

@description('GHCR username used to pull the private image.')
param ghcrUsername string = 'henrik-me'

@description('GHCR personal access token with read:packages scope.')
@secure()
param ghcrPullToken string

var resourceGroupName = 'rg-naturalizationpuzzle-${environmentName}'

var commonTags = {
  project: 'NaturalizationPuzzle'
  environment: environmentName
  managedBy: 'bicep'
}

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: commonTags
}

module logAnalytics 'modules/log-analytics.bicep' = {
  name: 'logAnalytics-deploy'
  scope: rg
  params: {
    name: 'log-natpuzzle-${environmentName}'
    location: location
    tags: commonTags
  }
}

module appInsights 'modules/app-insights.bicep' = {
  name: 'appInsights-deploy'
  scope: rg
  params: {
    name: 'appi-natpuzzle-${environmentName}'
    location: location
    tags: commonTags
    workspaceResourceId: logAnalytics.outputs.workspaceId
  }
}

module containerAppsEnv 'modules/containerapps-env.bicep' = {
  name: 'cae-deploy'
  scope: rg
  params: {
    name: 'cae-natpuzzle-${environmentName}'
    location: location
    tags: commonTags
    logAnalyticsCustomerId: logAnalytics.outputs.customerId
    logAnalyticsPrimaryKey: logAnalytics.outputs.primarySharedKey
  }
}

module containerApp 'modules/containerapp.bicep' = {
  name: 'ca-deploy'
  scope: rg
  params: {
    name: 'ca-natpuzzle-${environmentName}'
    location: location
    tags: commonTags
    environmentId: containerAppsEnv.outputs.id
    image: containerImage
    appInsightsConnectionString: appInsights.outputs.connectionString
    ghcrUsername: ghcrUsername
    ghcrPullToken: ghcrPullToken
  }
}

output resourceGroupName string = rg.name
output containerAppName string = containerApp.outputs.name
output containerAppFqdn string = containerApp.outputs.fqdn
output appInsightsName string = appInsights.outputs.name
