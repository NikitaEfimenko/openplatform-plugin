import {
  buildClientAssertion,
  completeStep,
  type VerifiedFlowInvocation,
} from '@finamx/extension-sdk';

type SigningKey = Pick<Parameters<typeof buildClientAssertion>[0], 'privateJwk' | 'kid'>;

// The worker gets this context from verifyFlowStepInvocation and this ref from artifact.write.
export function completeHoldings(
  context: VerifiedFlowInvocation,
  port: string,
  ref: string,
  key: SigningKey,
) {
  return completeStep(context, { status: 'done', outputs: { [port]: { ref } } }, {
    getAuthorization: async ({ audience, extensionId }) =>
      `Bearer ${await buildClientAssertion({ ...key, audience, extensionId })}`,
  });
}
