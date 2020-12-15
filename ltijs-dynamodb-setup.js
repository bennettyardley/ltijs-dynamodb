const dynamoose = require("dynamoose");
const Schema = dynamoose.Schema

ddb = new dynamoose.aws.sdk.DynamoDB({
    "accessKeyId": "[KEY]",
    "secretAccessKey": "[SECRET]",
    "region": '[REGION]'
});

dynamoose.aws.ddb.set(ddb)


async function ObjectId() {
  var timestamp = (new Date().getTime() / 1000 | 0).toString(16);
  return timestamp + 'xxxxxxxxxxxxxxxx'.replace(/[x]/g, function() {
      return (Math.random() * 16 | 0).toString(16);
  }).toLowerCase();
}

function setup() {
    return new Promise(async (resolve, reject) => {
        const idTokenSchema = new Schema({
        _id: {
            type: String,
            default: ObjectId(),
            hashKey: true
        },
        iss: String,
        user: String,
        userInfo: String,
        platformInfo: String,
        clientId: String,
        platformId: String,
        deploymentId: String,
        createdAt: { type: Date, default: Date.now() }
        })

        const contextTokenSchema = new Schema({
        contextId: {
            type: String,
            hashKey: true
        },
        user: {
            type: String,
            rangeKey: true
        },
        roles: { 
            type: Array, 
            schema: [{
            type: String
            }]
        },
        path: String,
        targetLinkUri: String,
        context: String, 
        resource: String, 
        custom: String, 
        launchPresentation: String, 
        messageType: String,
        version: String,
        deepLinkingSettings: String, 
        lis: String, 
        endpoint: String, 
        namesRoles: String, 
        createdAt: { type: Date, default: Date.now() }
        })

        const platformSchema = new Schema({
        platformUrl: {
            type: String,
            hashKey: true
        },
        platformName: String,
        clientId: {
            type: String,
            rangeKey: true
        },
        authEndpoint: String,
        accesstokenEndpoint: String,
        kid: String,
        authConfig: String
        })

        const platformStatusSchema = new Schema({
        id: {
            type: String,
            hashKey: true
        },
        active: { type: Boolean, default: false }
        })

        const keySchema = new Schema({
        kid: {
            type: String,
            hashKey: true
        },
        platformUrl: String,
        clientId: String,
        iv: String,
        data: String
        })

        const accessTokenSchema = new Schema({
        _id: {
            type: String,
            default: ObjectId(),
            hashKey: true
        },
        platformUrl: String,
        clientId: String,
        scopes: String,
        iv: String,
        data: String,
        createdAt: { type: Date, default: Date.now() }
        })

        const nonceSchema = new Schema({
        nonce: {
            type: String,
            hashKey: true
        },
        createdAt: { type: Date, default: Date.now() }
        })

        const stateSchema = new Schema({
        state: {
            type: String,
            hashKey: true
        },
        query: String,
        createdAt: { type: Date, default: Date.now() }
        })

        const idtoken = dynamoose.model('idtoken', idTokenSchema, {
        "create": true,
        "waitForActive": {
            "enabled": true,
        },
        "expires": {ttl: 3600 * 24, attribute: 'ttl'}
        })
        const contexttoken = dynamoose.model('contexttoken', contextTokenSchema, {
        "create": true,
        "waitForActive": {
            "enabled": true,
        },
        "expires": {ttl: 3600 * 24, attribute: 'ttl'}
        })
        const platform = dynamoose.model('platform', platformSchema, {
        "create": true,
        "waitForActive": {
            "enabled": true,
        },
        "expires": null
        })
        const platformStatus = dynamoose.model('platformStatus', platformStatusSchema, {
        "create": true,
        "waitForActive": {
            "enabled": true,
        },
        "expires": null
        })
        const privatekey = dynamoose.model('privatekey', keySchema, {
        "create": true,
        "waitForActive": {
            "enabled": true,
        },
        "expires": null
        })
        const publickey = dynamoose.model('publickey', keySchema, {
        "create": true,
        "waitForActive": {
            "enabled": true,
        },
        "expires": null
        })
        const accesstoken = dynamoose.model('accesstoken', accessTokenSchema, {
        "create": true,
        "waitForActive": {
            "enabled": true,
        },
        "expires": {ttl: 3600 * 24, attribute: 'ttl'}
        })
        const nonce = dynamoose.model('nonce', nonceSchema, {
        "create": true,
        "waitForActive": {
            "enabled": true,
        },
        "expires": {ttl: 10, attribute: 'ttl'}
        })
        const state = dynamoose.model('state', stateSchema, {
        "create": true,
        "waitForActive": {
            "enabled": true,
        },
        "expires": {ttl: 600, attribute: 'ttl'}
        })

    })
}

setup()