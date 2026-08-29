import { fromDataSuffix } from "@celo/attribution-tags";
import { createPublicClient, decodeFunctionData, getAddress, http, parseAbi, parseUnits, type Address, type Hash, type Hex } from "viem";
import { celo } from "viem/chains";

export const PAYLANE_TAG = "celo_003382274302";
export const USAT = getAddress("0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771");
const transferAbi = parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]);
const client = createPublicClient({ chain: celo, transport: http("https://forno.celo.org", { timeout: 15_000, retryCount: 2 }) });

export type ExpectedPayment = { recipient: Address; amount: string };
export type VerifiedPayment = { hash: Hash; payer: Address; recipient: Address; amount: string; blockNumber: bigint };

export function inspectTaggedTransfer(input: { token: Address; sender: Address; data: Hex }, expected: ExpectedPayment): Omit<VerifiedPayment, "hash" | "blockNumber"> {
  if (input.token.toLowerCase() !== USAT.toLowerCase()) throw new Error("The transaction is not a USA₮ transfer.");
  if (!fromDataSuffix(input.data)?.codes.includes(PAYLANE_TAG)) throw new Error("The Paylane attribution tag is missing.");
  const decoded = decodeFunctionData({ abi: transferAbi, data: input.data });
  if (decoded.functionName !== "transfer") throw new Error("The transaction is not an ERC-20 transfer.");
  const [recipient, amount] = decoded.args;
  const normalizedRecipient = getAddress(recipient);
  if (normalizedRecipient.toLowerCase() !== expected.recipient.toLowerCase()) throw new Error("The payment recipient does not match this order.");
  if (amount !== parseUnits(expected.amount, 6)) throw new Error("The payment amount does not match this order.");
  if (input.sender.toLowerCase() === expected.recipient.toLowerCase()) throw new Error("Self-payments are not accepted.");
  return { payer: getAddress(input.sender), recipient: normalizedRecipient, amount: expected.amount };
}

export async function verifyTaggedPayment(hash: Hash, expected: ExpectedPayment): Promise<VerifiedPayment> {
  const [transaction, receipt, currentBlock] = await Promise.all([
    client.getTransaction({ hash }),
    client.getTransactionReceipt({ hash }),
    client.getBlockNumber(),
  ]);
  if (receipt.status !== "success") throw new Error("The payment transaction reverted.");
  if (currentBlock < receipt.blockNumber + 1n) throw new Error("Wait for one more Celo confirmation and try again.");
  const inspected = inspectTaggedTransfer({ token: getAddress(transaction.to ?? "0x0000000000000000000000000000000000000000"), sender: transaction.from, data: transaction.input }, expected);
  return { hash, blockNumber: receipt.blockNumber, ...inspected };
}
