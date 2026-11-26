/*
 * Optional Google Drive sync.
 * Leave googleClientId empty to keep the tracker 100% local (no network at all).
 * See README.md → "Google Drive sync" for how to create a client ID.
 * A client ID is not a secret; it is safe to commit.
 */
window.CC_CONFIG = {
  googleClientId: "",
};
