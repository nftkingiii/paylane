import { fromDataSuffix, toDataSuffix, verifyTx } from "@celo/attribution-tags";
import {
  concatHex,
  createPublicClient,
  createWalletClient,
  custom,
  encodeFunctionData,
  formatUnits,
  getAddress,
  http,
  parseUnits,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { celo } from "viem/chains";

export const CELO_CHAIN_ID = 42_220;
export const ATTRIBUTION_TAG = "celo_003382274302";
export const USAT_ADDRESS = getAddress("0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771");
export const USAT_DECIMALS = 6;
export const CELO_EXPLORER = "https://celoscan.io";

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
] as const;

export const celoPublicClient = createPublicClient({
  chain: celo,
  transport: http("https://forno.celo.org", { timeout: 12_000, retryCount: 1 }),
});

export type ConnectedWallet = {
  address: Address;
  balance: bigint;
  formattedBalance: string;
};

export type PaymentResult = {
  hash: Hash;
  blockNumber: bigint;
  attributionVerified: boolean;
};

function providerErrorCode(error: unknown): number | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? Number((error as { code: unknown }).code)
    : undefined;
}

async function ensureCeloNetwork(): Promise<void> {
  if (!window.ethereum) throw new Error("No browser wallet was found.");
  const current = await window.ethereum.request({ method: "eth_chainId" });
  if (current === "0xa4ec") return;

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0xa4ec" }],
    });
  } catch (error) {
    if (providerErrorCode(error) !== 4902) throw error;
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: "0xa4ec",
          chainName: "Celo",
          nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
          rpcUrls: ["https://forno.celo.org"],
          blockExplorerUrls: [CELO_EXPLORER],
        },
      ],
    });
  }
}

export async function connectWallet(): Promise<ConnectedWallet> {
  if (!window.ethereum) throw new Error("Install or open an EVM wallet that supports Celo.");
  await ensureCeloNetwork();
  const walletClient = createWalletClient({ chain: celo, transport: custom(window.ethereum) });
  const [address] = await walletClient.requestAddresses();
  if (!address) throw new Error("The wallet did not expose an account.");
  const balance = await celoPublicClient.readContract({
    address: USAT_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  });
  return { address, balance, formattedBalance: formatUnits(balance, USAT_DECIMALS) };
}

export function buildTaggedTransferData(recipient: Address, amount: bigint): Hex {
  const transferData = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [recipient, amount],
  });
  return concatHex([transferData, toDataSuffix(ATTRIBUTION_TAG)]);
}

export function hasPaylaneAttribution(data: Hex): boolean {
  return fromDataSuffix(data)?.codes.includes(ATTRIBUTION_TAG) ?? false;
}

export async function sendCollectionPayment(
  connected: ConnectedWallet,
  recipientInput: string,
  amountInput: string,
): Promise<PaymentResult> {
  if (!window.ethereum) throw new Error("The connected wallet is no longer available.");
  await ensureCeloNetwork();
  const recipient = getAddress(recipientInput);
  if (recipient.toLowerCase() === connected.address.toLowerCase()) {
    throw new Error("Self-payments are blocked. Use an independent payer wallet.");
  }

  const amount = parseUnits(amountInput, USAT_DECIMALS);
  const latestBalance = await celoPublicClient.readContract({
    address: USAT_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [connected.address],
  });
  if (latestBalance < amount) throw new Error("This wallet does not have enough USA₮ for the request.");

  const data = buildTaggedTransferData(recipient, amount);
  await celoPublicClient.call({ account: connected.address, to: USAT_ADDRESS, data });

  const walletClient = createWalletClient({ chain: celo, transport: custom(window.ethereum) });
  const hash = await walletClient.sendTransaction({
    account: connected.address,
    chain: celo,
    to: USAT_ADDRESS,
    data,
    value: 0n,
  });
  const receipt = await celoPublicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 60_000 });
  if (receipt.status !== "success") throw new Error("The payment transaction reverted.");
  const attribution = await verifyTx({ client: celoPublicClient, hash });

  return {
    hash,
    blockNumber: receipt.blockNumber,
    attributionVerified: attribution?.codes.includes(ATTRIBUTION_TAG) ?? false,
  };
}
