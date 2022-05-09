import { Keplr } from '@keplr-wallet/types'
import { Window as KeplrWindow } from '@keplr-wallet/types/build/window'
import { KeyUtils } from '@/utils/KeyUtils'
import { WalletManager } from '@/config/wallet'

export class WalletUtils {
  public static async getKeplr (): Promise<Keplr | undefined> {
    const keplrWindow = window as KeplrWindow
    if (keplrWindow.keplr) {
      return keplrWindow.keplr
    }

    if (document.readyState === 'complete') {
      return keplrWindow.keplr
    }

    return new Promise((resolve) => {
      const documentStateChange = (event: Event) => {
        if (
          event.target &&
          (event.target as Document).readyState === 'complete'
        ) {
          resolve(keplrWindow.keplr)
          document.removeEventListener('readystatechange', documentStateChange)
        }
      }

      document.addEventListener('readystatechange', documentStateChange)
    })
  }

  public static isAuth (): boolean {
    return KeyUtils.isAddressValid(WalletManager.getWalletAddress()) && WalletManager.getWalletConnectMechanism() !== null
  }
}