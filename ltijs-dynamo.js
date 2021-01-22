const dynamoose = require("dynamoose");
const crypto = require('crypto')
const { idtoken, contexttoken, platform, platformStatus, privatekey, publickey, accesstoken, nonce, state } = require('./models/ltijsModels');

/**
 * @description Collection of static methods to manipulate the database.
 */
class Database {

  /**
   * @description Configuration setup
   * @param {String} key - AWS Access Key
   * @param {String} secret - AWS Access Secret Key
   * @param {String} region - AWS Region
   */
  constructor (key, secret, region) {

    this.ddb = new dynamoose.aws.sdk.DynamoDB({
      "accessKeyId": key,
      "secretAccessKey": secret,
      "region": region
    });

    this.deploy = false 

  }

  /**
   * @description Opens connection to database
   */
  async setup () {
    dynamoose.aws.ddb.set(this.ddb)
    this.deploy = true
    return true
  }

  // Closes connection to the database
  async Close () {
    this.deploy = false
    return true
  }

  /**
     * @description Get item or entire database.
     * @param {String} ENCRYPTIONKEY - Encryptionkey of the database, false if none
     * @param {String} collection - The collection to be accessed inside the database.
     * @param {Object} [query] - Query for the item you are looking for in the format {type: "type1"}.
     */
  async Get (ENCRYPTIONKEY, collection, query) {
    if (!this.deploy) throw new Error('PROVIDER_NOT_DEPLOYED')
    if (!collection) throw new Error('MISSING_COLLECTION')

    //Query database
    let result = await this.getResult(query, collection)

    //Change stringified JSON to JSON object
    let resCount = 0
    for (let res of result) {
      for (let itm in res) {
        if( res[itm].toString().includes('{')) {
          let value = JSON.parse(res[itm])
          let key = itm
          delete result[resCount][key]
          result[resCount][key] = value
        }
      }
      resCount++
    }

    //Decrypt data
    if (ENCRYPTIONKEY) {
      for (const i in result) {
        const temp = result[i]
        result[i] = JSON.parse(await this.Decrypt(result[i].data, result[i].iv, ENCRYPTIONKEY))
        if (temp.createdAt) {
          const createdAt = Date.parse(temp.createdAt)
          result[i].createdAt = createdAt
        }
      }
    }

    if (result.length === 0) return false
    return result
  }

  /**
     * @description Insert item in database.
     * @param {String} ENCRYPTIONKEY - Encryptionkey of the database, false if none.
     * @param {String} collection - The collection to be accessed inside the database.
     * @param {Object} item - The item Object you want to insert in the database.
     * @param {Object} [index] - Key that should be used as index in case of Encrypted document.
     */
  async Insert (ENCRYPTIONKEY, collection, item, index) {
    if (!this.deploy) throw new Error('PROVIDER_NOT_DEPLOYED')
    if (!collection || !item || (ENCRYPTIONKEY && !index)) throw new Error('MISSING_PARAMS')

    //Set collection
    let CollectionModel
    if (collection === 'idtoken') {CollectionModel = idtoken}
    else if (collection === 'contexttoken') {CollectionModel = contexttoken}
    else if (collection === 'platform') {CollectionModel = platform}
    else if (collection === 'platformStatus') {CollectionModel = platformStatus}
    else if (collection === 'privatekey') {CollectionModel = privatekey}
    else if (collection === 'publickey') {CollectionModel = publickey}
    else if (collection === 'accesstoken') {CollectionModel = accesstoken}
    else if (collection === 'nonce') {CollectionModel = nonce}
    else if (collection === 'state') {CollectionModel = state}
    else throw new Error('MISSING_COLLECTION')

    //Encrypt data
    let newDocData = item
    if (ENCRYPTIONKEY) {
      const encrypted = await this.Encrypt(JSON.stringify(item), ENCRYPTIONKEY)
      newDocData = {
        ...index,
        iv: encrypted.iv,
        data: encrypted.data
      }
    }

    //Stringify JSON object
    for (let itm in newDocData) {
      if( newDocData[itm] !== undefined && newDocData[itm] !== null && newDocData[itm].constructor == Object ) {
        let value = JSON.stringify(newDocData[itm])
        let key = itm
        delete newDocData[itm]
        newDocData[key] = value
      }
    }

    //Insert
    const newDoc = new CollectionModel(newDocData)
    await newDoc.save()
    return true
  }

  /**
   * @description Replace item in database. Creates a new document if it does not exist.
   * @param {String} ENCRYPTIONKEY - Encryptionkey of the database, false if none.
   * @param {String} collection - The collection to be accessed inside the database.
   * @param {Object} query - Query for the item you are looking for in the format {type: "type1"}.
   * @param {Object} item - The item Object you want to insert in the database.
   * @param {Object} [index] - Key that should be used as index in case of Encrypted document.
   */
  async Replace (ENCRYPTIONKEY, collection, query, item, index) {
    if (!this.deploy) throw new Error('PROVIDER_NOT_DEPLOYED')
    if (!collection || !item || (ENCRYPTIONKEY && !index)) throw new Error('MISSING_PARAMS')

    //Query database to prepare for replacement
    let result = await this.getResult(query, collection)

    //Encrypt data
    let newDocData = item
    if (ENCRYPTIONKEY) {
      const encrypted = await this.Encrypt(JSON.stringify(item), ENCRYPTIONKEY)
      newDocData = {
        ...index,
        iv: encrypted.iv,
        data: encrypted.data
      }
    }

    //Stringify JSON object
    for (let itm in newDocData) {
      if( newDocData[itm] !== undefined && newDocData[itm] !== null && newDocData[itm].constructor == Object ) {
        let value = JSON.stringify(newDocData[itm])
        let key = itm
        delete newDocData[itm]
        newDocData[key] = value
      }
    }

    //Create a new document because it doesn't exist
    if (result.length === 0) {
      await this.Insert (false, collection, newDocData)
      return true
    }

    //Modify an existing document
    else {

      //Find changes in the document
      let changes = {}
      var isEmptyObject = function(obj) {
        var name;
        for (name in obj) {
          return false;
        }
        return true;
      };
      var diff = function(obj1, obj2) {
        var reser = {};
        var change;
        for (var key in obj1) {
          if (typeof obj2[key] == 'object' && typeof obj1[key] == 'object') {
            change = diff(obj1[key], obj2[key]);
            if (isEmptyObject(change) === false) {
              reser[key] = change;
            }
          }
          else if (obj2[key] != obj1[key]) {
            reser[key] = obj2[key];
          }
        }
        return reser;
      };
      changes = await diff(newDocData, result[0])
      let newerDocData = {}
      for (let change in changes) {
        newerDocData[change] = newDocData[change]
      }

      //If there are no changes
      if (Object.keys(newerDocData).length === 0) {
        return true
      }

      //Update the document with the changes
      else {
        await this.updateOne(result, collection, newerDocData)
        return true
      }
    }
  }

  /**
     * @description Assign value to item in database
     * @param {String} ENCRYPTIONKEY - Encryptionkey of the database, false if none.
     * @param {String} collection - The collection to be accessed inside the database.
     * @param {Object} query - The entry you want to modify in the format {type: "type1"}.
     * @param {Object} modification - The modification you want to make in the format {type: "type2"}.
     */
  async Modify (ENCRYPTIONKEY, collection, query, modification) {
    if (!this.deploy) throw new Error('PROVIDER_NOT_DEPLOYED')
    if (!collection || !query || !modification) throw new Error('MISSING_PARAMS')

    //Query database to prepare for modification
    let result = await this.getResult(query, collection)

    //Encrypt data
    let newMod = modification
    if (ENCRYPTIONKEY) {
      if (result) {
        result = JSON.parse(await this.Decrypt(result.data, result.iv, ENCRYPTIONKEY))
        result[Object.keys(item)[0]] = Object.values(item)[0]
        newMod = await this.Encrypt(JSON.stringify(result), ENCRYPTIONKEY)
      }
    }

    //Stringify JSON object
    for (let itm in newMod) {
      if( newMod[itm] !== undefined && newMod[itm] !== null && newMod[itm].constructor == Object ) {
        let value = JSON.stringify(newMod[itm])
        let key = itm
        delete newMod[itm]
        newMod[key] = value
      }
    }

    //Find changes in the document
    let changes = {}
    var isEmptyObject = function(obj) {
      var name;
      for (name in obj) {
        return false;
      }
      return true;
    };
    var diff = function(obj1, obj2) {
      var reser = {};
      var change;
      for (var key in obj1) {
        if (typeof obj2[key] == 'object' && typeof obj1[key] == 'object') {
          change = diff(obj1[key], obj2[key]);
          if (isEmptyObject(change) === false) {
            reser[key] = change;
          }
        }
        else if (obj2[key] != obj1[key]) {
          reser[key] = obj2[key];
        }
      }
      return reser;
    };
    changes = await diff(newMod, result[0])
    let newerDocData = {}
    for (let change in changes) {
      newerDocData[change] = newMod[change]
    }

    //If no changes
    if (Object.keys(newerDocData).length === 0) {
      return true
    }

    //Modify document with changes
    else {
      await this.updateOne(result, collection, newerDocData)
      return true
    }
  }

  /**
     * @description Delete item in database
     * @param {String} collection - The collection to be accessed inside the database.
     * @param {Object} query - The entry you want to delete in the format {type: "type1"}.
     */
  async Delete (collection, query) {
    if (!this.deploy) throw new Error('PROVIDER_NOT_DEPLOYED')
    if (!collection || !query) throw new Error('MISSING_PARAMS')

    //Delete from collection matching query
    if (collection === 'idtoken') {try {await idtoken.delete(query)} catch (e) {}}
    else if (collection === 'contexttoken') {try {await contexttoken.delete(query)} catch (e) {}}
    else if (collection === 'platform') {try {await platform.delete(query)} catch (e) {}}
    else if (collection === 'platformStatus') {try {await platformStatus.delete(query)} catch (e) {}}
    else if (collection === 'privatekey') {try {await privatekey.delete(query)} catch (e) {}}
    else if (collection === 'publickey') {try {await publickey.delete(query)} catch (e) {}}
    else if (collection === 'accesstoken') {try {await accesstoken.delete(query)} catch (e) {}}
    else if (collection === 'nonce') {try {await nonce.delete(query)} catch (e) {}}
    else if (collection === 'state') {try {await state.delete(query)} catch (e) {}}
    else throw new Error('MISSING_COLLECTION')
    return true
  }

  /**
   * @description Encrypts data.
   * @param {String} data - Data to be encrypted
   * @param {String} secret - Secret used in the encryption
   */
  async Encrypt (data, secret) {
    const hash = crypto.createHash('sha256')
    hash.update(secret)
    const key = hash.digest().slice(0, 32)
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
    let encrypted = cipher.update(data)
    encrypted = Buffer.concat([encrypted, cipher.final()])
    return { iv: iv.toString('hex'), data: encrypted.toString('hex') }
  }

  /**
   * @description Decrypts data.
   * @param {String} data - Data to be decrypted
   * @param {String} _iv - Encryption iv
   * @param {String} secret - Secret used in the encryption
   */
  async Decrypt (data, _iv, secret) {
    const hash = crypto.createHash('sha256')
    hash.update(secret)
    const key = hash.digest().slice(0, 32)
    const iv = Buffer.from(_iv, 'hex')
    const encryptedText = Buffer.from(data, 'hex')
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), iv)
    let decrypted = decipher.update(encryptedText)
    decrypted = Buffer.concat([decrypted, decipher.final()])
    return decrypted.toString()
  }

  /**
     * @description Queries item in database
     * @param {Object} query - The entry you want to query in the format {type: "type1"}.
     * @param {String} collection - The collection to be accessed inside the database.
     */
  async getResult(query, collection) {
    return new Promise(async (resolve, reject) => {
    if (collection === 'idtoken') {
      if (query) {
      if (Object.keys(query).length === 1) {
        await idtoken.scan(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      else if (Object.keys(query).length === 2) {
        await idtoken.scan()
        .where(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .and()
        .where(Object.entries(query)[1][0])
        .eq(Object.entries(query)[1][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      else if (Object.keys(query).length === 3) {
        await idtoken.scan()
        .where(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .and()
        .where(Object.entries(query)[1][0])
        .eq(Object.entries(query)[1][1])
        .and()
        .where(Object.entries(query)[2][0])
        .eq(Object.entries(query)[2][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      else if (Object.keys(query).length === 4) {
        await idtoken.scan()
        .where(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .and()
        .where(Object.entries(query)[1][0])
        .eq(Object.entries(query)[1][1])
        .and()
        .where(Object.entries(query)[2][0])
        .eq(Object.entries(query)[2][1])
        .and()
        .where(Object.entries(query)[3][0])
        .eq(Object.entries(query)[3][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      else if (Object.keys(query).length === 5) {
        await idtoken.scan()
        .where(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .and()
        .where(Object.entries(query)[1][0])
        .eq(Object.entries(query)[1][1])
        .and()
        .where(Object.entries(query)[2][0])
        .eq(Object.entries(query)[2][1])
        .and()
        .where(Object.entries(query)[3][0])
        .eq(Object.entries(query)[3][1])
        .and()
        .where(Object.entries(query)[4][0])
        .eq(Object.entries(query)[4][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      }
      else {
        await idtoken.scan()
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
    }
    else if (collection === 'contexttoken') {
      if (query) {
      if (Object.keys(query).length === 1) {
        await contexttoken.scan(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      else if (Object.keys(query).length === 2) {
        await contexttoken.scan()
        .where(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .and()
        .where(Object.entries(query)[1][0])
        .eq(Object.entries(query)[1][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      else if (Object.keys(query).length === 3) {
        await contexttoken.scan()
        .where(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .and()
        .where(Object.entries(query)[1][0])
        .eq(Object.entries(query)[1][1])
        .and()
        .where(Object.entries(query)[2][0])
        .eq(Object.entries(query)[2][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      else if (Object.keys(query).length === 4) {
        await contexttoken.scan()
        .where(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .and()
        .where(Object.entries(query)[1][0])
        .eq(Object.entries(query)[1][1])
        .and()
        .where(Object.entries(query)[2][0])
        .eq(Object.entries(query)[2][1])
        .and()
        .where(Object.entries(query)[3][0])
        .eq(Object.entries(query)[3][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      else if (Object.keys(query).length === 5) {
        await contexttoken.scan()
        .where(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .and()
        .where(Object.entries(query)[1][0])
        .eq(Object.entries(query)[1][1])
        .and()
        .where(Object.entries(query)[2][0])
        .eq(Object.entries(query)[2][1])
        .and()
        .where(Object.entries(query)[3][0])
        .eq(Object.entries(query)[3][1])
        .and()
        .where(Object.entries(query)[4][0])
        .eq(Object.entries(query)[4][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      }
      else {
        await contexttoken.scan()
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
    }
    else if (collection === 'platform') {
      if (query) {
      if (Object.keys(query).length === 1) {
        await platform.scan(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      else if (Object.keys(query).length === 2) {
        await platform.scan()
        .where(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .and()
        .where(Object.entries(query)[1][0])
        .eq(Object.entries(query)[1][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      else if (Object.keys(query).length === 3) {
        await platform.scan()
        .where(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .and()
        .where(Object.entries(query)[1][0])
        .eq(Object.entries(query)[1][1])
        .and()
        .where(Object.entries(query)[2][0])
        .eq(Object.entries(query)[2][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      else if (Object.keys(query).length === 4) {
        await platform.scan()
        .where(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .and()
        .where(Object.entries(query)[1][0])
        .eq(Object.entries(query)[1][1])
        .and()
        .where(Object.entries(query)[2][0])
        .eq(Object.entries(query)[2][1])
        .and()
        .where(Object.entries(query)[3][0])
        .eq(Object.entries(query)[3][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      else if (Object.keys(query).length === 5) {
        await platform.scan()
        .where(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .and()
        .where(Object.entries(query)[1][0])
        .eq(Object.entries(query)[1][1])
        .and()
        .where(Object.entries(query)[2][0])
        .eq(Object.entries(query)[2][1])
        .and()
        .where(Object.entries(query)[3][0])
        .eq(Object.entries(query)[3][1])
        .and()
        .where(Object.entries(query)[4][0])
        .eq(Object.entries(query)[4][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      }
      else {
        await platform.scan()
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
    }
    else if (collection === 'platformStatus') {
      if (query) {
      if (Object.keys(query).length === 1) {
        await platformStatus.scan(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      else if (Object.keys(query).length === 2) {
        await platformStatus.scan()
        .where(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .and()
        .where(Object.entries(query)[1][0])
        .eq(Object.entries(query)[1][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      else if (Object.keys(query).length === 3) {
        await platformStatus.scan()
        .where(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .and()
        .where(Object.entries(query)[1][0])
        .eq(Object.entries(query)[1][1])
        .and()
        .where(Object.entries(query)[2][0])
        .eq(Object.entries(query)[2][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      else if (Object.keys(query).length === 4) {
        await platformStatus.scan()
        .where(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .and()
        .where(Object.entries(query)[1][0])
        .eq(Object.entries(query)[1][1])
        .and()
        .where(Object.entries(query)[2][0])
        .eq(Object.entries(query)[2][1])
        .and()
        .where(Object.entries(query)[3][0])
        .eq(Object.entries(query)[3][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      else if (Object.keys(query).length === 5) {
        await platformStatus.scan()
        .where(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .and()
        .where(Object.entries(query)[1][0])
        .eq(Object.entries(query)[1][1])
        .and()
        .where(Object.entries(query)[2][0])
        .eq(Object.entries(query)[2][1])
        .and()
        .where(Object.entries(query)[3][0])
        .eq(Object.entries(query)[3][1])
        .and()
        .where(Object.entries(query)[4][0])
        .eq(Object.entries(query)[4][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      }
      else {
        await platformStatus.scan()
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
    }
    else if (collection === 'privatekey') {
      if (query) {
      if (Object.keys(query).length === 1) {
        await privatekey.scan(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      else if (Object.keys(query).length === 2) {
        await privatekey.scan()
        .where(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .and()
        .where(Object.entries(query)[1][0])
        .eq(Object.entries(query)[1][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      else if (Object.keys(query).length === 3) {
        await privatekey.scan()
        .where(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .and()
        .where(Object.entries(query)[1][0])
        .eq(Object.entries(query)[1][1])
        .and()
        .where(Object.entries(query)[2][0])
        .eq(Object.entries(query)[2][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      else if (Object.keys(query).length === 4) {
        await privatekey.scan()
        .where(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .and()
        .where(Object.entries(query)[1][0])
        .eq(Object.entries(query)[1][1])
        .and()
        .where(Object.entries(query)[2][0])
        .eq(Object.entries(query)[2][1])
        .and()
        .where(Object.entries(query)[3][0])
        .eq(Object.entries(query)[3][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      else if (Object.keys(query).length === 5) {
        await privatekey.scan()
        .where(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .and()
        .where(Object.entries(query)[1][0])
        .eq(Object.entries(query)[1][1])
        .and()
        .where(Object.entries(query)[2][0])
        .eq(Object.entries(query)[2][1])
        .and()
        .where(Object.entries(query)[3][0])
        .eq(Object.entries(query)[3][1])
        .and()
        .where(Object.entries(query)[4][0])
        .eq(Object.entries(query)[4][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      }
      else {
        await privatekey.scan()
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
    }
    else if (collection === 'publickey') {
      if (query) {
      if (Object.keys(query).length === 1) {
        await publickey.scan(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      else if (Object.keys(query).length === 2) {
        await publickey.scan()
        .where(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .and()
        .where(Object.entries(query)[1][0])
        .eq(Object.entries(query)[1][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      else if (Object.keys(query).length === 3) {
        await publickey.scan()
        .where(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .and()
        .where(Object.entries(query)[1][0])
        .eq(Object.entries(query)[1][1])
        .and()
        .where(Object.entries(query)[2][0])
        .eq(Object.entries(query)[2][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      else if (Object.keys(query).length === 4) {
        await publickey.scan()
        .where(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .and()
        .where(Object.entries(query)[1][0])
        .eq(Object.entries(query)[1][1])
        .and()
        .where(Object.entries(query)[2][0])
        .eq(Object.entries(query)[2][1])
        .and()
        .where(Object.entries(query)[3][0])
        .eq(Object.entries(query)[3][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      else if (Object.keys(query).length === 5) {
        await publickey.scan()
        .where(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .and()
        .where(Object.entries(query)[1][0])
        .eq(Object.entries(query)[1][1])
        .and()
        .where(Object.entries(query)[2][0])
        .eq(Object.entries(query)[2][1])
        .and()
        .where(Object.entries(query)[3][0])
        .eq(Object.entries(query)[3][1])
        .and()
        .where(Object.entries(query)[4][0])
        .eq(Object.entries(query)[4][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      }
      else {
        await publickey.scan()
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
    }
    else if (collection === 'accesstoken') {
      if (query) {
      if (Object.keys(query).length === 1) {
        await accesstoken.scan(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      else if (Object.keys(query).length === 2) {
        await accesstoken.scan()
        .where(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .and()
        .where(Object.entries(query)[1][0])
        .eq(Object.entries(query)[1][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      else if (Object.keys(query).length === 3) {
        await accesstoken.scan()
        .where(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .and()
        .where(Object.entries(query)[1][0])
        .eq(Object.entries(query)[1][1])
        .and()
        .where(Object.entries(query)[2][0])
        .eq(Object.entries(query)[2][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      else if (Object.keys(query).length === 4) {
        await accesstoken.scan()
        .where(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .and()
        .where(Object.entries(query)[1][0])
        .eq(Object.entries(query)[1][1])
        .and()
        .where(Object.entries(query)[2][0])
        .eq(Object.entries(query)[2][1])
        .and()
        .where(Object.entries(query)[3][0])
        .eq(Object.entries(query)[3][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      else if (Object.keys(query).length === 5) {
        await accesstoken.scan()
        .where(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .and()
        .where(Object.entries(query)[1][0])
        .eq(Object.entries(query)[1][1])
        .and()
        .where(Object.entries(query)[2][0])
        .eq(Object.entries(query)[2][1])
        .and()
        .where(Object.entries(query)[3][0])
        .eq(Object.entries(query)[3][1])
        .and()
        .where(Object.entries(query)[4][0])
        .eq(Object.entries(query)[4][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      }
      else {
        await accesstoken.scan()
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
    }
    else if (collection === 'nonce') {
      if (query) {
      if (Object.keys(query).length === 1) {
        await nonce.scan(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      else if (Object.keys(query).length === 2) {
        await nonce.scan()
        .where(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .and()
        .where(Object.entries(query)[1][0])
        .eq(Object.entries(query)[1][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      else if (Object.keys(query).length === 3) {
        await nonce.scan()
        .where(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .and()
        .where(Object.entries(query)[1][0])
        .eq(Object.entries(query)[1][1])
        .and()
        .where(Object.entries(query)[2][0])
        .eq(Object.entries(query)[2][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      else if (Object.keys(query).length === 4) {
        await nonce.scan()
        .where(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .and()
        .where(Object.entries(query)[1][0])
        .eq(Object.entries(query)[1][1])
        .and()
        .where(Object.entries(query)[2][0])
        .eq(Object.entries(query)[2][1])
        .and()
        .where(Object.entries(query)[3][0])
        .eq(Object.entries(query)[3][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      else if (Object.keys(query).length === 5) {
        await nonce.scan()
        .where(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .and()
        .where(Object.entries(query)[1][0])
        .eq(Object.entries(query)[1][1])
        .and()
        .where(Object.entries(query)[2][0])
        .eq(Object.entries(query)[2][1])
        .and()
        .where(Object.entries(query)[3][0])
        .eq(Object.entries(query)[3][1])
        .and()
        .where(Object.entries(query)[4][0])
        .eq(Object.entries(query)[4][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      }
      else {
        await nonce.scan()
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
    }
    else if (collection === 'state') {
      if (query) {
      if (Object.keys(query).length === 1) {
        await state.scan(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      else if (Object.keys(query).length === 2) {
        await state.scan()
        .where(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .and()
        .where(Object.entries(query)[1][0])
        .eq(Object.entries(query)[1][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      else if (Object.keys(query).length === 3) {
        await state.scan()
        .where(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .and()
        .where(Object.entries(query)[1][0])
        .eq(Object.entries(query)[1][1])
        .and()
        .where(Object.entries(query)[2][0])
        .eq(Object.entries(query)[2][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      else if (Object.keys(query).length === 4) {
        await state.scan()
        .where(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .and()
        .where(Object.entries(query)[1][0])
        .eq(Object.entries(query)[1][1])
        .and()
        .where(Object.entries(query)[2][0])
        .eq(Object.entries(query)[2][1])
        .and()
        .where(Object.entries(query)[3][0])
        .eq(Object.entries(query)[3][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      else if (Object.keys(query).length === 5) {
        await state.scan()
        .where(Object.entries(query)[0][0])
        .eq(Object.entries(query)[0][1])
        .and()
        .where(Object.entries(query)[1][0])
        .eq(Object.entries(query)[1][1])
        .and()
        .where(Object.entries(query)[2][0])
        .eq(Object.entries(query)[2][1])
        .and()
        .where(Object.entries(query)[3][0])
        .eq(Object.entries(query)[3][1])
        .and()
        .where(Object.entries(query)[4][0])
        .eq(Object.entries(query)[4][1])
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
      }
      else {
        await state.scan()
        .exec(function (err, data) {
          if (!data) {
            resolve ([])
          } else {
              resolve (data.toJSON())
          }
        })
      }
    }
    else throw new Error('MISSING_COLLECTION')
    })
  }

  /**
   * @description Updates an item in database
   * @param {Object} result - The item that should be updated.
   * @param {String} collection - The collection to be accessed inside the database.
   * @param {Object} newMod - The update that should be added.
   */
  async updateOne(result, collection, newMod) {
    return new Promise(async (resolve, reject) => {
      if (collection === 'idtoken') {
        let key = {}
        for (let i of Object.entries(result[0])) {
          for (let j of i) {
            if (j.toString().includes("_id")) {
              key[i[0]] = i[1]
            }
          }
        }
        await idtoken.update(key, newMod)
      }
      else if (collection === 'contexttoken') {
        let key = {}
        for (let i of Object.entries(result[0])) {
          for (let j of i) {
            if (j.toString().includes("contextId")) {
              key[i[0]] = i[1]
            }
            else if (j.toString().includes('user')) {
              key[i[0]] = i[1]
            }
          }
        }
        await contexttoken.update(key, newMod)
      }
      else if (collection === 'platform') {
        let key = {}
        for (let i of Object.entries(result[0])) {
          for (let j of i) {
            if (j.toString().includes("platformUrl")) {
              key[i[0]] = i[1]
            }
            else if (j.toString().includes("clientId")) {
              key[i[0]] = i[1]
            }
          }
        }
        await platform.update(key, newMod)
      }
      else if (collection === 'platformStatus') {
        let key = {}
        for (let i of Object.entries(result[0])) {
          for (let j of i) {
            if (j.toString().includes("id")) {
              key[i[0]] = i[1]
            }
          }
        }
        await platformStatus.update(key, newMod)    
      }
      else if (collection === 'privatekey') {
        let key = {}
        for (let i of Object.entries(result[0])) {
          for (let j of i) {
            if (j.toString().includes("kid")) {
              key[i[0]] = i[1]
            }
          }
        }
        await privatekey.update(key, newMod)
      }
      else if (collection === 'publickey') {
        let key = {}
        for (let i of Object.entries(result[0])) {
          for (let j of i) {
            if (j.toString().includes("kid")) {
              key[i[0]] = i[1]
            }
          }
        }
        await publickey.update(key, newMod)
      }
      else if (collection === 'accesstoken') {
        let key = {}
        for (let i of Object.entries(result[0])) {
          for (let j of i) {
            if (j.toString().includes("_id")) {
              key[i[0]] = i[1]
            }
          }
        }
        await accesstoken.update(key, newMod)
      }
      else if (collection === 'nonce') {
        let key = {}
        for (let i of Object.entries(result[0])) {
          for (let j of i) {
            if (j.toString().includes("nonce")) {
              key[i[0]] = i[1]
            }
          }
        }
        await nonce.update(key, newMod)
      }
      else if (collection === 'state') {
        let key = {}
        for (let i of Object.entries(result[0])) {
          for (let j of i) {
            if (j.toString().includes("state")) {
              key[i[0]] = i[1]
            }
          }
        }
        await state.update(key, newMod)
      }
    })
  }
}

module.exports = Database
