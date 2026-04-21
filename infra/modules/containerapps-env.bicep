@description('Name of the Container Apps managed environment.')
param name string

@description('Azure region.')
param location string

@description('Resource tags.')
param tags object

@description('Customer ID (workspace ID GUID) of the Log Analytics workspace.')
param logAnalyticsCustomerId string

@description('Primary shared key of the Log Analytics workspace.')
@secure()
param logAnalyticsPrimaryKey string

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsCustomerId
        sharedKey: logAnalyticsPrimaryKey
      }
    }
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
    zoneRedundant: false
  }
}

output id string = environment.id
output name string = environment.name
output defaultDomain string = environment.properties.defaultDomain
