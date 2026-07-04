// src/utils/code-generator.ts

/**
 * Generates a unique prefixed code.
 * e.g. generateCode('ACC') → 'ACC-M5X2K-AB3D'
 */
export function generateCode(prefix: string): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}