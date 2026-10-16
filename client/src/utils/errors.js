/** Turn an axios/API error into a human-readable message. */
export function getErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  const apiError = err?.response?.data?.error;
  if (apiError) {
    if (Array.isArray(apiError.details) && apiError.details.length) {
      return apiError.details.map((d) => d.message).join(' ');
    }
    return apiError.message || fallback;
  }
  if (err?.code === 'ECONNABORTED') return 'The server took too long to respond.';
  if (err?.request && !err.response) return 'Cannot reach the server. Check that the API is running.';
  return err?.message || fallback;
}
