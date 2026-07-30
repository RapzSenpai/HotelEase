const AUTH_ERROR_MAP = {
  "auth/invalid-credential": "The email or password you entered is incorrect.",
  "auth/user-not-found": "No account found with this email.",
  "auth/wrong-password": "The password you entered is incorrect.",
  "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
  "auth/invalid-email": "The email address is not valid.",
  "auth/network-request-failed": "Network error. Please check your connection and try again.",
  "auth/operation-not-allowed": "This sign-in method is not enabled.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/email-already-in-use": "An account with this email already exists.",
  "auth/weak-password": "Password is too weak. Use at least 6 characters.",
  "auth/requires-recent-login": "Please log in again to continue.",
  "auth/user-token-expired": "Your session has expired. Please log in again.",
  "auth/invalid-api-key": "Invalid API key. Please contact support.",
  "auth/app-deleted": "This Firebase app has been deleted.",
  "auth/invalid-continue-uri": "The continue URL is not valid.",
  "auth/missing-continue-uri": "A required URL parameter is missing.",
  "auth/cert-hash-mismatch": "Certificate hash mismatch.",
  "auth/redirect-cancelled-by-user": "The sign-in was cancelled.",
  "auth/popup-closed-by-user": "The sign-in popup was closed before completing.",
  "auth/no-auth-event": "No authentication event detected.",
  "auth/session-cookie-expired": "Your session has expired. Please log in again.",
  "auth/internal-error": "Something went wrong on our end. Please try again.",
  "auth/configuration-not-found": "Authentication configuration not found.",
  "auth/app-not-authorized": "This app is not authorized for this operation.",
  "auth/anonymous-auth-provider-not-enabled": "Anonymous sign-in is not enabled.",
  "auth/invalid-verification-code": "The verification code is invalid.",
  "auth/invalid-verification-id": "The verification ID is invalid.",
  "auth/missing-verification-id": "The verification ID is missing.",
  "auth/quota-exceeded": "Quota exceeded. Please try again later.",
  "auth/app-not-configured": "Firebase Authentication is not configured for this project.",
};

export function mapAuthError(err) {
  if (!err) return "An unexpected error occurred.";
  const code = err?.code || "";
  if (AUTH_ERROR_MAP[code]) return AUTH_ERROR_MAP[code];
  const message = err?.message || "";
  const match = message.match(/auth\/([a-zA-Z0-9_-]+)/);
  if (match && AUTH_ERROR_MAP[`auth/${match[1]}`]) {
    return AUTH_ERROR_MAP[`auth/${match[1]}`];
  }
  const stripped = message.replace(/^Firebase:\s*Error\s*\([^)]+\)\s*:\s*/, "");
  if (stripped !== message) return stripped || "Something went wrong. Please try again.";
  return message || "Something went wrong. Please try again.";
}

export default mapAuthError;