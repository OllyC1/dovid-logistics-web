export const NEW_PASSWORD_MIN_LENGTH = 12;
export const NEW_PASSWORD_MAX_LENGTH = 128;
export const NEW_PASSWORD_HINT =
  "Use 12 or more characters with uppercase and lowercase letters, a number and a symbol. Do not use spaces.";

export function isStrongNewPassword(password: string) {
  return (
    password.length >= NEW_PASSWORD_MIN_LENGTH &&
    password.length <= NEW_PASSWORD_MAX_LENGTH &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9\s]/.test(password) &&
    !/\s/.test(password)
  );
}
