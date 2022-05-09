import { ActionContext, ActionTree } from 'vuex'
import { RootState } from '@/store'

import { AssetBalance, State } from './state'
import { Mutations } from './mutations'
import { WalletActionTypes } from '@/store/modules/wallet/action-types'
import { WalletUtils } from '@/utils/WalletUtils'
import { Window as KeplrWindow } from '@keplr-wallet/types/build/window'
import { NolusClient } from '@/client/NolusClient'
import KeplrEmbedChainInfo, { IBCAssets, WalletConnectMechanism, WalletManager } from '@/config/wallet'
import { nolusLedgerWallet, nolusOfflineSigner } from '@/wallet/NolusWalletFactory'
import router from '@/router'
import { WalletMutationTypes } from '@/store/modules/wallet/mutation-types'
import { BECH32_PREFIX_ACC_ADDR, COIN_MINIMAL_DENOM } from '@/constants/chain'
import { LedgerSigner } from '@cosmjs/ledger-amino'
import TransportWebUSB from '@ledgerhq/hw-transport-webusb'
import { makeCosmoshubPath } from '@cosmjs/amino'
import { KeyUtils } from '@/utils/KeyUtils'
import { DirectSecp256k1Wallet } from '@cosmjs/proto-signing'
import { fromHex, toHex } from '@cosmjs/encoding'
import OpenLogin from '@toruslabs/openlogin'
import { Getters } from '@/store/modules/wallet/getters'
import { CurrencyUtils } from '@/utils/CurrencyUtils'
import { DeliverTxResponse, IndexedTx } from '@cosmjs/stargate'
import { EnvNetworks } from '@/config/envNetworks'
import { EncryptionUtils } from '@/utils/EncryptionUtils'
import { makeIBCMinimalDenom } from '@/utils/AssetUtils'
import { RouteNames } from '@/router/RouterNames'

type AugmentedActionContext = {
  commit<K extends keyof Mutations> (
    key: K,
    payload: Parameters<Mutations[K]>[1],
  ): ReturnType<Mutations[K]>
  getters<K extends keyof Getters> (
    key: K,
    payload: Parameters<Getters[K]>[1],
  ): ReturnType<Getters[K]>
} & Omit<ActionContext<State, RootState>, 'commit'>

export interface Actions {
  [WalletActionTypes.CONNECT_KEPLR] ({ commit }: AugmentedActionContext): void,

  [WalletActionTypes.CONNECT_LEDGER] ({ commit }: AugmentedActionContext): void,

  [WalletActionTypes.CONNECT_VIA_MNEMONIC] ({
    commit,
    getters,
    dispatch
  }: AugmentedActionContext, payload: { mnemonic: string }): void,

  [WalletActionTypes.LOGIN_VIA_TORUS] ({ commit }: AugmentedActionContext): void,

  [WalletActionTypes.TORUS_LOGOUT] ({
    commit,
    getters
  }: AugmentedActionContext): void,

  [WalletActionTypes.STORE_PRIVATE_KEY] ({
    commit,
    getters,
    dispatch
  }: AugmentedActionContext, payload: { password: string }): void,

  [WalletActionTypes.LOAD_PRIVATE_KEY_AND_SIGN] ({
    commit,
    getters,
    dispatch
  }: AugmentedActionContext, payload: { password: string }): void,

  [WalletActionTypes.UPDATE_BALANCES] ({ commit }: AugmentedActionContext): void,

  [WalletActionTypes.SEARCH_TX] ({
    commit,
    getters
  }: AugmentedActionContext): Promise<readonly IndexedTx[]>,

  [WalletActionTypes.TRANSFER_TOKENS] ({
    commit,
    getters,
    dispatch
  }: AugmentedActionContext, payload: {
    receiverAddress: string,
    amount: string | undefined,
    feeAmount: string
  }): Promise<DeliverTxResponse | undefined>
}

export const actions: ActionTree<State, RootState> & Actions = {
  async [WalletActionTypes.CONNECT_KEPLR] ({
    commit,
    dispatch
  }) {
    await WalletUtils.getKeplr()
    const keplrWindow = window as KeplrWindow

    if (!keplrWindow.getOfflineSigner || !keplrWindow.keplr) {
      throw new Error('Keplr wallet is not installed.')
    } else if (!keplrWindow.keplr.experimentalSuggestChain) {
      throw new Error('Keplr version is not latest. Please upgrade your Keplr wallet')
    } else {
      let chainId = ''
      try {
        chainId = await NolusClient.getInstance().getChainId()
        const envNetwork = new EnvNetworks()
        const networkConfig = envNetwork.loadNetworkConfig()

        await keplrWindow.keplr?.experimentalSuggestChain(KeplrEmbedChainInfo(envNetwork.getStoredNetworkName() || '', chainId, networkConfig?.tendermintRpc as string, networkConfig?.api as string))
      } catch (e) {
        throw new Error('Failed to fetch suggest chain.')
      }
      await keplrWindow.keplr?.enable(chainId)
      if (keplrWindow.getOfflineSigner) {
        const offlineSigner = keplrWindow.getOfflineSigner(chainId)
        const nolusWalletOfflineSigner = await nolusOfflineSigner(offlineSigner)
        await nolusWalletOfflineSigner.useAccount()
        commit(WalletMutationTypes.SIGN_WALLET, { wallet: nolusWalletOfflineSigner })
        dispatch(WalletActionTypes.UPDATE_BALANCES, { walletAddress: nolusWalletOfflineSigner.address }) // check this
        WalletManager.saveWalletConnectMechanism(WalletConnectMechanism.EXTENSION)
        WalletManager.storeWalletAddress(nolusWalletOfflineSigner.address || '')
        router.push({ name: RouteNames.DASHBOARD })
      }
    }
  },
  async [WalletActionTypes.CONNECT_LEDGER] ({ commit }) {
    let breakLoop = false
    let ledgerWallet = {} as any
    // 20 sec timeout to let the user unlock his hardware
    const to = setTimeout(() => (breakLoop = true), 20000)
    const accountNumbers = [0]
    const paths = accountNumbers.map(makeCosmoshubPath)
    while (!ledgerWallet && !breakLoop) {
      try {
        const transport = await TransportWebUSB.create()
        ledgerWallet = await nolusLedgerWallet(new LedgerSigner(transport, {
          prefix: BECH32_PREFIX_ACC_ADDR,
          hdPaths: paths
        }))
        await ledgerWallet.useAccount()
        commit(WalletMutationTypes.SIGN_WALLET, { wallet: ledgerWallet })
        // await dispatch('updateBalances', { walletAddress: ledgerWallet.address })
        WalletManager.saveWalletConnectMechanism(WalletConnectMechanism.LEDGER)
      } catch (e) {
        console.log('break!')
        console.log(e)
        breakLoop = true
      }
    }
    clearTimeout(to)
  },
  async [WalletActionTypes.CONNECT_VIA_MNEMONIC] ({
    commit,
    getters,
    dispatch
  }, payload: { mnemonic: string }) {
    console.log('mnemonic: ' + payload.mnemonic)
    const accountNumbers = [0]
    const path = accountNumbers.map(makeCosmoshubPath)[0]
    // const mnemonic = 'industry helmet coach enforce laundry excuse core argue poem master sugar demand'
    const privateKey = await KeyUtils.getPrivateKeyFromMnemonic(payload.mnemonic, path)
    const directSecrWallet = await DirectSecp256k1Wallet.fromKey(privateKey, BECH32_PREFIX_ACC_ADDR)
    const nolusWalletOfflineSigner = await nolusOfflineSigner(directSecrWallet)
    await nolusWalletOfflineSigner.useAccount()
    commit(WalletMutationTypes.SIGN_WALLET, { wallet: nolusWalletOfflineSigner })
    commit(WalletMutationTypes.SET_PRIVATE_KEY, { privateKey: toHex(privateKey) })
    WalletManager.saveWalletConnectMechanism(WalletConnectMechanism.MNEMONIC)
    WalletManager.storeWalletAddress(nolusWalletOfflineSigner.address || '')
    await dispatch(WalletActionTypes.UPDATE_BALANCES)
  },
  async [WalletActionTypes.LOGIN_VIA_TORUS] ({ commit }) {
    const openlogin = new OpenLogin({
      clientId: 'BNV7ajBdHUgKnfDImRy6j3ld-KK2RLB6I7SMtGLeJCtw7iqpU1cl8C4tSh8JN3hV0W_n2PwXqVTGdQ1JMh4AbwA',
      network: 'testnet' // valid values (testnet or mainnet)
    })
    commit(WalletMutationTypes.TORUS_LOGIN, openlogin)
    await openlogin.init()

    if (!openlogin.privKey) {
      console.log('1private key: ', openlogin.privKey)
      await openlogin.login()
    } else {
      const bufferedPrivateKey = Buffer.from(openlogin.privKey.trim().replace('0x', ''), 'hex')
      const directSecrWallet = await DirectSecp256k1Wallet.fromKey(bufferedPrivateKey, BECH32_PREFIX_ACC_ADDR)
      const nolusWalletOfflineSigner = await nolusOfflineSigner(directSecrWallet)
      await nolusWalletOfflineSigner.useAccount()
      commit(WalletMutationTypes.SIGN_WALLET, { wallet: nolusWalletOfflineSigner })
      commit(WalletMutationTypes.SET_PRIVATE_KEY, { privateKey: toHex(bufferedPrivateKey) })
      // await context.dispatch('updateBalances', { walletAddress: nolusWalletOfflineSigner.address })
      WalletManager.saveWalletConnectMechanism(WalletConnectMechanism.TORUS)
    }
  },
  async [WalletActionTypes.TORUS_LOGOUT] ({
    commit,
    getters
  }) {
    console.log('')
    // if (use getters) {
    //   const openlogin = (context.state.torusClient as OpenLogin)
    //   await openlogin.logout()
    // }
  },
  async [WalletActionTypes.STORE_PRIVATE_KEY] ({
    commit,
    getters,
    dispatch
  }, payload: { password: string }) {
    console.log('')
    if (payload.password !== '' && getters.getPrivateKey !== '') {
      const pubKey = toHex(getters.getNolusWallet.pubKey || new Uint8Array(0))
      const encryptedPbKey = EncryptionUtils.encryptEncryptionKey(pubKey, payload.password)
      const encryptedPk = EncryptionUtils.encryptPrivateKey(
        getters.getPrivateKey,
        pubKey,
        payload.password)

      WalletManager.storeEncryptedPubKey(encryptedPbKey)
      WalletManager.storeEncryptedPk(encryptedPk)
      commit(WalletMutationTypes.SET_PRIVATE_KEY, { privateKey: '' })
    }
  },
  async [WalletActionTypes.LOAD_PRIVATE_KEY_AND_SIGN] ({
    commit,
    getters,
    dispatch
  }, payload: { password: string }) {
    if (getters.getPrivateKey === '' && payload.password !== '') {
      const encryptedPubKey = WalletManager.getEncryptedPubKey()
      const encryptedPk = WalletManager.getPrivateKey()
      const decryptedPubKey = EncryptionUtils.decryptEncryptionKey(encryptedPubKey, payload.password)
      const decryptedPrivateKey = EncryptionUtils.decryptPrivateKey(encryptedPk, decryptedPubKey, payload.password)
      const directSecrWallet = await DirectSecp256k1Wallet.fromKey(fromHex(decryptedPrivateKey), BECH32_PREFIX_ACC_ADDR)
      const nolusWalletOfflineSigner = await nolusOfflineSigner(directSecrWallet)
      await nolusWalletOfflineSigner.useAccount()

      commit(WalletMutationTypes.SIGN_WALLET, { wallet: nolusWalletOfflineSigner })
      commit(WalletMutationTypes.SET_PRIVATE_KEY, { privateKey: '' })
      await dispatch(WalletActionTypes.UPDATE_BALANCES)
    }
  },
  async [WalletActionTypes.UPDATE_BALANCES] ({ commit }) {
    const walletAddress = WalletManager.getWalletAddress() || ''
    if (!WalletUtils.isAuth()) {
      WalletManager.eraseWalletInfo()
      router.push(RouteNames.AUTH)
      return
    }

    const ibcBalances = [] as AssetBalance[]
    const nolusBalance = await NolusClient.getInstance()
      .getBalance(walletAddress,
        COIN_MINIMAL_DENOM)
    ibcBalances.push({
      udenom: COIN_MINIMAL_DENOM,
      balance: CurrencyUtils.convertCosmosCoinToKeplCoin(nolusBalance)
    })

    for (const asset of IBCAssets) {
      const ibcDenom = makeIBCMinimalDenom(asset.sourceChannelId, asset.coinMinimalDenom)
      const balance = await NolusClient.getInstance()
        .getBalance(walletAddress,
          ibcDenom)

      ibcBalances.push({
        udenom: asset.coinMinimalDenom,
        balance: CurrencyUtils.convertCosmosCoinToKeplCoin(balance)
      })
    }
    commit(WalletMutationTypes.UPDATE_BALANCES, { balances: ibcBalances })
  },
  async [WalletActionTypes.SEARCH_TX] ({
    commit,
    getters
  }): Promise<readonly IndexedTx[]> {
    const cosmWasmClient = await NolusClient.getInstance().getCosmWasmClient()
    return cosmWasmClient.searchTx({ sentFromOrTo: WalletManager.getWalletAddress() || '' })
  },
  async [WalletActionTypes.TRANSFER_TOKENS] ({
    commit,
    getters,
    dispatch
  }, payload: {
    receiverAddress: string,
    amount: string | undefined,
    feeAmount: string
  }): Promise<DeliverTxResponse | undefined> {
    const wallet = getters.getNolusWallet
    console.log('payload: ', payload)
    if (!payload.amount) {
      return
    }
    const DEFAULT_FEE = {
      // TODO 0.0025unolus
      amount: [{
        denom: 'unolus',
        amount: payload.feeAmount
      }],
      gas: '100000'
    }
    const txResponse = await wallet.sendTokens(
      wallet.address as string,
      payload.receiverAddress,
      [{
        denom: 'unolus',
        amount: payload.amount
      }],
      DEFAULT_FEE
    )

    await dispatch(WalletActionTypes.UPDATE_BALANCES)
    return txResponse
  }
}