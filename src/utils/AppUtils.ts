import type { API, ARCHIVE_NODE, Endpoint, Node, SquiRouterNetworks } from '@/types/NetworkConfig'
import type { News } from '@/types/News'
import {
  DOWNPAYMENT_RANGE_URL,
  FREE_INTEREST_ADDRESS_URL,
  isDev,
  isServe,
  languages,
  NETWORKS,
  NEWS_URL,
  NEWS_WALLETS_PATH,
  OPEAN_LEASE_FEE_URL,
  SquidRouter,
  SWAP_FEE_URL
} from '@/config/env'
import { EnvNetworkUtils } from '.'
import { Tendermint34Client } from '@cosmjs/tendermint-rpc'

export class AppUtils {
  public static LANGUAGE = 'language'
  public static BANNER = 'banner'

  static downpaymentRange: Promise<{
    [key: string]: {
      min: number
      max: number
    }
  }>

  static freeInterestAdress: Promise<{
    interest_paid_to: string[]
  }>

  static news: Promise<News>

  static swapFee: Promise<{
    [key: string]: number
  }>

  static openLeaseFee: Promise<{
    [key: string]: number
  }>

  static rpc: {
    [key: string]: {
      [key: string]: Promise<API>
    }
  } = {}

  static archive_node: {
    [key: string]: Promise<ARCHIVE_NODE>
  } = {}

  static squidrouter: {
    [key: string]: Promise<SquiRouterNetworks>
  } = {}

  static isDev() {
    return isDev()
  }

  static isServe() {
    return isServe()
  }

  public static setLang(lang: string) {
    localStorage.setItem(this.LANGUAGE, lang)
  }

  static getLang() {
    const theme = localStorage.getItem(this.LANGUAGE)
    const items = Object.keys(languages)
    if (items.includes(theme as string)) {
      return languages[theme as keyof typeof languages]
    }
    return languages.en
  }

  public static setBannerInvisible(key: string) {
    localStorage.setItem(`${this.BANNER}-${key}`, '1')
  }

  static getBanner(key: string) {
    return !Number(localStorage.getItem(`${this.BANNER}-${key}`))
  }

  static async fetchEndpoints(network: string) {
    const net = AppUtils.rpc?.[EnvNetworkUtils.getStoredNetworkName()]?.[network]

    if (net) {
      return net
    }

    if (!AppUtils.rpc[EnvNetworkUtils.getStoredNetworkName()]) {
      AppUtils.rpc[EnvNetworkUtils.getStoredNetworkName()] = {}
    }

    const networkData = AppUtils.fetch(network)
    AppUtils.rpc[EnvNetworkUtils.getStoredNetworkName()][network] = networkData
    return networkData
  }

  static async getArchiveNodes() {
    const node = AppUtils.archive_node?.[EnvNetworkUtils.getStoredNetworkName()]

    if (node) {
      return node
    }
    const archive = AppUtils.fetchArchiveNodes()
    AppUtils.archive_node[EnvNetworkUtils.getStoredNetworkName()] = archive

    return archive
  }

  static async getDownpaymentRange() {
    const downpaymentRange = AppUtils.downpaymentRange

    if (downpaymentRange) {
      return downpaymentRange
    }

    AppUtils.downpaymentRange = AppUtils.fetchDownpaymentRange()
    return AppUtils.downpaymentRange
  }

  static async getSwapFee() {
    const swapFee = AppUtils.swapFee

    if (swapFee) {
      return swapFee
    }

    AppUtils.swapFee = AppUtils.fetchSwapFee()
    return AppUtils.swapFee
  }

  static async getOpenLeaseFee() {
    const openLeaseFee = AppUtils.openLeaseFee

    if (openLeaseFee) {
      return openLeaseFee
    }

    AppUtils.openLeaseFee = AppUtils.fetchOpenLeaseFee()
    return AppUtils.openLeaseFee
  }

  static async getFreeInterestAddress() {
    const freeInterestAdress = AppUtils.freeInterestAdress

    if (freeInterestAdress) {
      return freeInterestAdress
    }

    AppUtils.freeInterestAdress = AppUtils.fetchFreeInterestAddress()
    return AppUtils.freeInterestAdress
  }

  static async getSquitRouteNetworks() {
    const net = AppUtils.squidrouter?.[EnvNetworkUtils.getStoredNetworkName()]

    if (net) {
      return net
    }

    const networkData = AppUtils.fetchSquitRouteNetworks()
    AppUtils.squidrouter[EnvNetworkUtils.getStoredNetworkName()] = networkData
    return networkData
  }

  static async getNews() {
    if (this.news) {
      return this.news
    }

    const news = AppUtils.fetchNews()
    this.news = news
    return news
  }

  static async getUrl(url: string | Promise<string>) {
    switch (url.constructor) {
      case Promise: {
        return url
      }
      default: {
        return url
      }
    }
  }

  static async getSingleNewAddresses(url = '') {
    try {
      if (!url.trim()) return []

      const data = await fetch(`${NEWS_WALLETS_PATH}${url}`)
      const json = (await data.json()) as { addresses: string[] }

      return json.addresses
    } catch (error) {
      return []
    }
  }

  private static async fetchArchiveNodes(): Promise<ARCHIVE_NODE> {
    const config = NETWORKS[EnvNetworkUtils.getStoredNetworkName()]
    const data = await fetch(config.endpoints)
    const json = (await data.json()) as Endpoint

    const archive = {
      archive_node_rpc: json.archive_node_rpc,
      archive_node_api: json.archive_node_api
    }

    return archive
  }

  private static async fetch(network: string) {
    const config = NETWORKS[EnvNetworkUtils.getStoredNetworkName()]
    const data = await fetch(config.endpoints)
    const json = (await data.json()) as Endpoint
    const status = await AppUtils.fetchStatus((json[network] as Node).primary.rpc, json.downtime)

    if (status) {
      return (json[network] as Node).primary
    }

    const networkData = AppUtils.fetchFallback(json[network] as Node, json.downtime)
    return networkData
  }

  private static async fetchFallback(node: Node, downtime: number): Promise<API> {
    const item = (node as Node).fallback.shift()

    if (!item) {
      return node.primary
    }

    const status = await AppUtils.fetchStatus(item.rpc, downtime)

    if (status) {
      return item
    }

    return AppUtils.fetchFallback(node as Node, downtime)
  }

  private static async fetchStatus(rpc: string, dtime: number) {
    try {
      const client = await Tendermint34Client.connect(rpc)
      const status = await client.status()
      const date = status.syncInfo.latestBlockTime
      const now = new Date().getTime()
      const downtime = dtime * 1000

      if (now - date.getTime() <= downtime) {
        client.disconnect()
        return true
      }
    } catch (error) {
      return false
    }

    return false
  }

  private static async fetchDownpaymentRange() {
    const data = await fetch(DOWNPAYMENT_RANGE_URL)
    const json = (await data.json()) as {
      [key: string]: {
        min: number
        max: number
      }
    }

    return json
  }

  private static async fetchSwapFee() {
    const data = await fetch(SWAP_FEE_URL)
    const json = (await data.json()) as {
      [key: string]: number
    }

    return json
  }

  private static async fetchOpenLeaseFee() {
    const data = await fetch(OPEAN_LEASE_FEE_URL)
    const json = (await data.json()) as {
      [key: string]: number
    }

    return json
  }

  private static async fetchFreeInterestAddress() {
    const data = await fetch(FREE_INTEREST_ADDRESS_URL)
    const json = (await data.json()) as {
      interest_paid_to: string[]
    }

    return json
  }

  private static async fetchSquitRouteNetworks() {
    const url = (await SquidRouter.networks[
      EnvNetworkUtils.getStoredNetworkName() as keyof typeof SquidRouter.networks
    ]) as string
    const data = await fetch(url)
    const json = (await data.json()) as SquiRouterNetworks

    return json
  }

  private static async fetchNews() {
    const url = await NEWS_URL
    const data = await fetch(url)
    const json = (await data.json()) as News
    const n: News = {}

    for (const k in json) {
      if (AppUtils.getBanner(k)) {
        n[k] = json[k]
      }
    }

    return n
  }
}
