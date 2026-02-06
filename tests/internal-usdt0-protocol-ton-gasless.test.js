import { beforeEach, describe, expect, jest, test } from '@jest/globals'
import { WalletAccountTonGasless } from '@tetherto/wdk-wallet-ton-gasless'

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

const { default: InternalUsdt0ProtocolTonGasless } = await import('../src/internal-usdt0-protocol-ton-gasless.js')

describe('InternalUsdt0ProtocolTonGasless', () => {
  const SEED = 'cook voyage document eight skate token alien guide drink uncle term abuse'
  const USER_ADDRESS = 'UQ...'
  const JETTON_WALLET_ADDRESS = 'EQ...'
  const AMOUNT = 100000n
  const GASLESS_FEE = 75000n

  let gaslessAccount
  let innerTonAccount
  let protocol

  beforeEach(() => {
    jest.clearAllMocks()

    gaslessAccount = new WalletAccountTonGasless(SEED, "44'/607'/0'", {
      tonApiClient: {},
    })

    innerTonAccount = {
      getAddress: jest.fn().mockResolvedValue(USER_ADDRESS),
      _getJettonWalletAddress: jest.fn().mockResolvedValue(JETTON_WALLET_ADDRESS),
      _tonClient: 'dummy-ton-client',
    }
    gaslessAccount._tonAccount = innerTonAccount

    gaslessAccount._getGaslessTokenTransferRawParams = jest.fn().mockResolvedValue({ commission: GASLESS_FEE })
    gaslessAccount._sendGaslessTokenTransfer = jest.fn().mockReturnValue('dummy-gasless-hash'),

    protocol = new InternalUsdt0ProtocolTonGasless(gaslessAccount)
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

    test('should successfully perform a gasless bridge operation', async () => {
      const result = await protocol.bridge({
        targetChain: 'arbitrum',
        recipient: '0xa460aebce0d3a4becad8ccf9d6d4861296c503bd',
        token: TOKEN,
        amount: AMOUNT,
      })

      expect(gaslessAccount._getGaslessTokenTransferRawParams).toHaveBeenCalled()
      expect(gaslessAccount._sendGaslessTokenTransfer).toHaveBeenCalled()

      expect(result).toEqual({
        hash: 'dummy-gasless-hash',
        fee: GASLESS_FEE,
        bridgeFee: 100n,
      })
    })

    test('should throw if the bridge fee exceeds the bridge max fee configuration', async () => {
      const protocolWithMaxFee = new InternalUsdt0ProtocolTonGasless(gaslessAccount, {
        bridgeMaxFee: 75099n,
      })

      await expect(protocolWithMaxFee.bridge({
        targetChain: 'arbitrum',
        recipient: '0xa460aebce0d3a4becad8ccf9d6d4861296c503bd',
        token: TOKEN,
        amount: AMOUNT,
      })).rejects.toThrow('The bridge operation exceeds the bridge max fee.')
    })

    test('should throw if the account is read-only', async () => {
      const readOnlyAccount = { _tonAccount: {} }
      const protocolWithReadOnly = new InternalUsdt0ProtocolTonGasless(readOnlyAccount)

      await expect(protocolWithReadOnly.bridge({}))
        .rejects.toThrow("The 'bridge(options)' method requires the protocol to be initialized with a non read-only account.")
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

    test('should successfully quote a gasless bridge operation', async () => {
      const result = await protocol.quoteBridge({
        targetChain: 'arbitrum',
        recipient: '0xa460aebce0d3a4becad8ccf9d6d4861296c503bd',
        token: TOKEN,
        amount: AMOUNT,
      })

      expect(gaslessAccount._getGaslessTokenTransferRawParams).toHaveBeenCalled()
      
      expect(gaslessAccount._sendGaslessTokenTransfer).not.toHaveBeenCalled()

      expect(result).toEqual({
        fee: GASLESS_FEE,
        bridgeFee: 100n,
      })
    })
  })
})

