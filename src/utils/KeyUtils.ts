export class KeyUtils {
  // @TODO: Add to nolus.js > KeyUtils ?
  public static isPrivateKey (str: string): boolean {
    if (str.startsWith("0x")) {
      return true
    }

    if (str.length === 64) {
      try {
        return Buffer.from(str, "hex").length === 32
      } catch (e) {
        return false
      }
    }

    return false
  }
}