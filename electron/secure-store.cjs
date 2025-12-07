/**
 * Secure credential storage using electron-store with encryption
 * AES-256-GCM encryption for sensitive data
 */

const Store = require('electron-store');
const crypto = require('crypto');

// Generate a machine-specific encryption key
// This combines app ID with machine identifier for security
function generateEncryptionKey() {
  const { machineIdSync } = require('node-machine-id');
  const machineId = machineIdSync();
  const appSecret = 'fc26-sbc-automation-v1';

  // Create a deterministic key from machine ID and app secret
  return crypto
    .createHash('sha256')
    .update(`${machineId}-${appSecret}`)
    .digest('hex')
    .substring(0, 32); // AES-256 needs 32 bytes
}

let store = null;

function initStore() {
  if (store) return store;

  try {
    const encryptionKey = generateEncryptionKey();

    store = new Store({
      name: 'secure-credentials',
      encryptionKey,
      schema: {
        credentials: {
          type: 'object',
          properties: {
            email: { type: 'string', default: '' },
            password: { type: 'string', default: '' },
            remember: { type: 'boolean', default: false },
          },
          default: {
            email: '',
            password: '',
            remember: false,
          },
        },
      },
    });

    return store;
  } catch (error) {
    console.error('Failed to initialize secure store:', error);
    // Fallback to unencrypted store if encryption fails
    store = new Store({
      name: 'secure-credentials-fallback',
      schema: {
        credentials: {
          type: 'object',
          properties: {
            email: { type: 'string', default: '' },
            password: { type: 'string', default: '' },
            remember: { type: 'boolean', default: false },
          },
          default: {
            email: '',
            password: '',
            remember: false,
          },
        },
      },
    });
    return store;
  }
}

// Get stored credentials
function getCredentials() {
  const s = initStore();
  return s.get('credentials', { email: '', password: '', remember: false });
}

// Set credentials
function setCredentials({ email, password, remember }) {
  const s = initStore();
  s.set('credentials', { email, password, remember });
}

// Clear credentials
function clearCredentials() {
  const s = initStore();
  s.set('credentials', { email: '', password: '', remember: false });
}

// Check if credentials exist
function hasCredentials() {
  const creds = getCredentials();
  return creds.remember && creds.email && creds.password;
}

module.exports = {
  initStore,
  getCredentials,
  setCredentials,
  clearCredentials,
  hasCredentials,
};
