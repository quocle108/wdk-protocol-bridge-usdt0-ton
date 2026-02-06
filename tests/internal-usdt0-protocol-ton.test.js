import { beforeEach, describe, expect, jest, test } from '@jest/globals'
import { WalletAccountTon } from '@tetherto/wdk-wallet-ton'

const getMessageFeeMock = jest.fn()
const transferMock = jest.fn()
const createOftBridgeConfigMock = jest.fn((oft) => ({ ...oft, mocked: true }))
const internalMock = jest.fn((params) => params)
const toBocMock = jest.fn().mockReturnValue(new Uint8Array([1, 2, 3, 4, 5]))
const cellFromBocMock = jest.fn().mockReturnValue(['dummy-cell-body'])
const RECIPIENT_ADDRESS_RAW = '0:a460aebce0d3a4becad8ccf9d6d4861296c503bd'
const TOKEN = '0xb113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe'

jest.unstable_mockModule('@wdk-ton-packages/ui-bridge-oft', () => ({
  createOftBridgeConfig: createOftBridgeConfigMock,
}))

jest.unstable_mockModule('@wdk-ton-packages/ui-bridge-oft/ton', () => ({
  OftBridgeApiFactory__ton: jest.fn().mockImplementation(() => ({
    create: jest.fn().mockImplementation(() => ({
      getMessageFee: getMessageFeeMock,
      transfer: transferMock,
    })),
  })),
}))

jest.unstable_mockModule('../src/data/oft-token-config.js', () => ({
  default: {
    [TOKEN]: {
      deployments: {
        arbitrum: 'some-arbitrum-address',
      },
      sharedDecimals: 6,
    },
  },
}))

jest.unstable_mockModule('@ton/ton', () => ({
  internal: internalMock,
  Cell: {
    fromBoc: cellFromBocMock,
  },
  toNano: jest.fn((val) => BigInt(Math.round(val * 1e9))),
}))

jest.unstable_mockModule('@wdk-ton-packages/ui-ton', () => ({
  parseTonAddress: jest.fn().mockReturnValue({
    toRawString: jest.fn().mockReturnValue(RECIPIENT_ADDRESS_RAW),
  }),
}))

const { default: InternalUsdt0ProtocolTon } = await import('../src/internal-usdt0-protocol-ton.js')

describe('InternalUsdt0ProtocolTon', () => {
  const SEED = 'cook voyage document eight skate token alien guide drink uncle term abuse'
  const USER_ADDRESS = 'UQAMM7wsXH_0T7aLFJvyD1RS_KBSt6AqGV8c4i_2PUMscnoY'
  const JETTON_WALLET_ADDRESS = 'EQCwF0KDuyziRE1vgSuOf7NIIwboT0d5bH3CsuDQKmhB8yIc'
  const AMOUNT = 100000n

  const DUMMY_BRIDGE_MESSAGE = {
    to: JETTON_WALLET_ADDRESS,
    value: 800000000n,
    body: 'dummy-cell-body',
  }

  let account
  let protocol

  beforeEach(() => {
    jest.clearAllMocks()

    account = new WalletAccountTon(SEED, "44'/607'/0'")
    const MOCK_TRANSFER = {
      hash: () => Buffer.from('a'.repeat(64), 'hex')
    }
    account.getAddress = jest.fn().mockResolvedValue(USER_ADDRESS)
    account._getJettonWalletAddress = jest.fn().mockResolvedValue(JETTON_WALLET_ADDRESS)
    account._getTransfer = jest.fn().mockResolvedValue(MOCK_TRANSFER)
    account._getTransferFee = jest.fn().mockResolvedValue(50000n)
    account._contract = { send: jest.fn() }
    account._tonClient = 'dummy-ton-client'

    protocol = new InternalUsdt0ProtocolTon(account)
    account._mockTransfer = MOCK_TRANSFER
  })

  describe('bridge', () => {
    beforeEach(() => {
      getMessageFeeMock.mockResolvedValue({ nativeFee: 12345n })
      transferMock.mockResolvedValue({
        unwrap: jest.fn().mockResolvedValue({
          messages: [{ payload: { toBoc: toBocMock } }],
        }),
      })
    })

    test('should successfully perform a bridge operation', async () => {
      const result = await protocol.bridge({
        targetChain: 'arbitrum',
        recipient: '0xa460aebce0d3a4becad8ccf9d6d4861296c503bd',
        token: TOKEN,
        amount: AMOUNT,
      })

      expect(internalMock).toHaveBeenCalledWith(DUMMY_BRIDGE_MESSAGE)

      expect(account._getTransfer).toHaveBeenCalledWith(DUMMY_BRIDGE_MESSAGE)
      expect(account._getTransferFee).toHaveBeenCalledWith(account._mockTransfer)
      expect(account._contract.send).toHaveBeenCalledWith(account._mockTransfer)

      
      expect(result).toEqual({
        hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        fee: 50000n,
        bridgeFee: 100n,
      })
    })

    test('should throw if the bridge fee exceeds the bridge max fee configuration', async () => {
      const protocolWithMaxFee = new InternalUsdt0ProtocolTon(account, {
        bridgeMaxFee: 50099n,
      })

      await expect(protocolWithMaxFee.bridge({
        targetChain: 'arbitrum',
        recipient: '0xa460aebce0d3a4becad8ccf9d6d4861296c503bd',
        token: TOKEN,
        amount: AMOUNT,
      })).rejects.toThrow('The bridge operation exceeds the bridge max fee.')
    })

    test('should throw if the account is read-only', async () => {
      const readOnlyAccount = { _tonClient: 'dummy-ton-client' }
      const protocolWithReadOnly = new InternalUsdt0ProtocolTon(readOnlyAccount)

      await expect(protocolWithReadOnly.bridge({}))
        .rejects.toThrow("The 'bridge(options)' method requires the protocol to be initialized with a non read-only account.")
    })

    test('should throw if the account is not connected to a provider', async () => {
      account._tonClient = undefined
      const protocolWithNoClient = new InternalUsdt0ProtocolTon(account)

      await expect(protocolWithNoClient.bridge({}))
        .rejects.toThrow('The wallet must be connected to ton center in order to perform bridge operations.')
    })
  })

  describe('quoteBridge', () => {
    beforeEach(() => {
      getMessageFeeMock.mockResolvedValue({ nativeFee: 12345n })
      transferMock.mockResolvedValue({
        unwrap: jest.fn().mockResolvedValue({
          messages: [{ payload: { toBoc: toBocMock } }],
        }),
      })
    })

    test('should successfully quote a bridge operation', async () => {
      const result = await protocol.quoteBridge({
        targetChain: 'arbitrum',
        recipient: '0xa460aebce0d3a4becad8ccf9d6d4861296c503bd',
        token: TOKEN,
        amount: AMOUNT,
      })

      expect(internalMock).toHaveBeenCalledWith(DUMMY_BRIDGE_MESSAGE)

      expect(account._getTransfer).toHaveBeenCalledWith(DUMMY_BRIDGE_MESSAGE)
      expect(account._getTransferFee).toHaveBeenCalledWith(account._mockTransfer)
      
      expect(account._contract.send).not.toHaveBeenCalled()

      expect(result).toEqual({
        fee: 50000n,
        bridgeFee: 100n,
      })
    })

    test('should throw if the account is not connected to a provider', async () => {
      account._tonClient = undefined
      const protocolWithNoClient = new InternalUsdt0ProtocolTon(account)

      await expect(protocolWithNoClient.quoteBridge({}))
        .rejects.toThrow('The wallet must be connected to ton center in order to quote bridge operations.')
    })
  })
})

