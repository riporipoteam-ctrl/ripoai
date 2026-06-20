// Maps Firebase auth error codes to friendly messages.
export function friendlyAuthError(code: string): string {
  const map: Record<string, string> = {
    'auth/invalid-email': 'That email address looks invalid.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/user-not-found': 'No account found with that email.',
    'auth/wrong-password': 'Incorrect email or password.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/email-already-in-use': 'An account already exists with that email.',
    'auth/weak-password': 'Password should be at least 6 characters.',
    'auth/popup-closed-by-user': 'Sign-in popup closed before completing.',
    'auth/cancelled-popup-request': 'Sign-in was cancelled.',
    'auth/popup-blocked': 'Your browser blocked the sign-in popup.',
    'auth/network-request-failed': 'Network error — check your connection.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/operation-not-allowed':
      'This sign-in method is not enabled in Firebase yet.',
    'auth/unauthorized-domain':
      'This domain is not authorized in Firebase Auth settings.',
  }
  return map[code] ?? 'Something went wrong. Please try again.'
}
