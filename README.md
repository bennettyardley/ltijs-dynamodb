# ltijs-dynamodb
Ltijs DynamoDB plugin

## Installation

* Run `npm install dynamoose` to install dependencies
* Add `ltijs-dynamo.js` to your root directory
* Create a models folder with `ltijsModels.js` in the folder
* Before your first run you will need to setup your tables in DynamoDB

### Setup Tables
1. Configure `ltijs-dynamodb-setup.js` (lines 5,6,7) with your [AWS Key/Region](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/SettingUp.DynamoWebService.html) 
2. Run `node ltijs-dynamodb-setup.js` to setup the table
3. After the script has finished your tables should be added to Dynamo

## Usage

1. Import ltijs-dynamo

2. [Configure plugin](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/SettingUp.DynamoWebService.html)
 * key - AWS Access Key
 * secret - AWS Access Secret Key.
 * region - AWS Region.

3. Set LTI database plugin


### Example
```
const path = require('path')

// Require Provider
const lti = require('ltijs').Provider

// (1) Import the ltijs-dynamo plugin
const Database = require('./ltijs-dynamo')

// (2) Configure ltijs-dynamo
const db = new Database('[KEY]', '[SECRET]', '[REGION]')

// Setup provider
lti.setup('LTIKEY', // Key used to sign cookies and tokens
  {
    plugin: db // (3) Passing db object to plugin field
  },
  { // Options
    appRoute: '/', loginRoute: '/login', // Optionally, specify some of the reserved routes
    cookies: {
      secure: false, // Set secure to true if the testing platform is in a different domain and https is being used
      sameSite: '' // Set sameSite to 'None' if the testing platform is in a different domain and https is being used
    },
    devMode: false // Set DevMode to true if the testing platform is in a different domain and https is not being used
  }
)

// Set lti launch callback
lti.onConnect((token, req, res) => {
  console.log(token)
  return res.send('It\'s alive!')
})

const setup = async () => {
  // Deploy server and open connection to the database
  await lti.deploy({ port: 3000 }) // Specifying port. Defaults to 3000

  // Register platform
  await lti.registerPlatform({
    url: 'https://platform.url',
    name: 'Platform Name',
    clientId: 'TOOLCLIENTID',
    authenticationEndpoint: 'https://platform.url/auth',
    accesstokenEndpoint: 'https://platform.url/token',
    authConfig: { method: 'JWK_SET', key: 'https://platform.url/keyset' }
  })
}

setup()
```
