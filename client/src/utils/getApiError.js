/** Extract a user-facing message from an Axios error */
export function getApiError(error) {
  const data = error?.response?.data;
  if (!data) return error?.message || "Something went wrong";

  if (data.errors?.fieldErrors) {
    const fields = Object.values(data.errors.fieldErrors).flat();
    if (fields.length) return fields.join(", ");
  }
  if (data.errors?.formErrors?.length) {
    return data.errors.formErrors.join(", ");
  }

  if (Array.isArray(data.errors)) {
    return data.errors.map((e) => e.message || e).join(", ");
  }

  return data.message || "Request failed";
}
