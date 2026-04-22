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

@description('Optional custom domain (e.g. np.metzger.dk) to bind to a Container App in this env. When set, a managed certificate is created here so the Container App ingress can SNI-bind to it. Leave empty to skip.')
param customDomain string = ''

var hasCustomDomain = !empty(customDomain)
var normalizedCustomDomain = toLower(customDomain)
var customDomainCertName = replace(normalizedCustomDomain, '.', '-')

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

resource customDomainCert 'Microsoft.App/managedEnvironments/managedCertificates@2024-03-01' = if (hasCustomDomain) {
  parent: environment
  name: customDomainCertName
  location: location
  tags: tags
  properties: {
    subjectName: normalizedCustomDomain
    domainControlValidation: 'CNAME'
  }
}

output id string = environment.id
output name string = environment.name
output defaultDomain string = environment.properties.defaultDomain
output customDomain string = hasCustomDomain ? normalizedCustomDomain : ''
output customDomainCertificateId string = hasCustomDomain ? customDomainCert.id : ''
