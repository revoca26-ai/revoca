import config from '../config/config.js'
import crypto from 'crypto'

const encryptionKey = config.ENCRYPTION_KEY // 64-byte hex string
const algorithm = 'aes-256-gcm' // AES-256-GCM is a symmetric encryption algorithm industry standard

export function encryptOAuthToken(token: string): string {
    // check for the length of the encryption key
    if (encryptionKey.length !== 64) {
        throw new Error('Encryption key must be 64 characters long')
    }
    // create a random initialization vector 12 bytes
    const iv = crypto.randomBytes(12)
    // convert the encryption key to a binary
    const keyBuffer = Buffer.from(encryptionKey, 'hex')
    // create the cipher object
    const cipher = crypto.createCipheriv(algorithm, keyBuffer, iv)
    // encrypt the token
    let encrypted = cipher.update(token, 'utf8', 'hex')
    encrypted += cipher.final('hex') // final hex string flush the system 
    // get the authentication tag
    const authTag = cipher.getAuthTag()
    // return the encrypted token
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

export function decryptOAuthToken(encryptedToken: string): string {
    // check for the length of the encryption key
    if (encryptionKey.length !== 64) {
        throw new Error('Encryption key must be 64 bytes')
    }
    // split the encrypted token into parts
    const encryptionElements: string[] = encryptedToken.split(':')
    if (encryptionElements.length !== 3) {
        throw new Error('Invalid encrypted token')
    }
    // extract the initialization vector, ciphertext, and authentication tag
    const iv = Buffer.from(encryptionElements[0], 'hex')
    const authTag = Buffer.from(encryptionElements[1], 'hex')
    const encryptedText = encryptionElements[2] // already in hex format

    // get key buffer
    const keyBuffer = Buffer.from(encryptionKey, 'hex')
    // create the decipher object
    const decipher = crypto.createDecipheriv(algorithm, keyBuffer, iv)
    decipher.setAuthTag(authTag)
    // decrypt the ciphertext
    let decryptedToken = decipher.update(encryptedText, 'hex', 'utf8')
    decryptedToken += decipher.final('utf8')
    // return the decrypted token
    return decryptedToken
    
}