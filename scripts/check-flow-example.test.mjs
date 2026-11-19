import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { generateKeyPair, exportJWK, jwtVerify, SignJWT } from 'jose';
import { flowSchemaHash, validateFlowSchemaValue } from '@finamx/bridge-protocol';
import { verifyFlowStepInvocation } from '@finamx/extension-sdk';
import { completeHoldings } from '../plugins/openplatform/skills/openplatform-ext-init/examples/complete-holdings.ts';

test('holdings example pins its declared schemas and completes with an audience-bound assertion', async (t) => {
  const file = '../plugins/openplatform/skills/openplatform-ext-init/examples/holdings-manifest.json';
  const manifest = JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
  const version = manifest.versions[0];
  const { subscribes: [request], publishes: [output] } = version.surfaces.topics;
  assert.equal(request.replyTopicType, output.topicType);
  const bind = async ({ topicType, schema }) => ({
    topicType, schemaVersion: version.version, schemaHash: await flowSchemaHash(schema),
  });
  const expected = {
    executionOwner: 'platform',
    hostId: 'com.acme.host',
    principal: 'uh_test',
    activationId: 'activation-1',
    generation: 1,
    programRevision: 'a'.repeat(64),
    extensionId: manifest.extensionId,
    extensionVersion: version.version,
    invocationId: 'run-1:step-1:1',
  };
  const callbackUrl = 'https://platform.example.com/api/v2/flow/complete';
  const issuer = 'finamx-platform';
  const ownerKey = await generateKeyPair('ES256');
  const senderKey = await generateKeyPair('ES256', { extractable: true });
  const kid = 'extension-test';
  const invocation = {
    ...expected,
    protocol: 'finamx.flow.invocation.v2',
    runId: 'run-1',
    stepId: 'step-1',
    call: 1,
    request: await bind(request),
    outputs: { [output.topicType]: await bind(output) },
    completion: { url: callbackUrl, audience: callbackUrl },
  };
  const invocationToken = await new SignJWT({ invocation })
    .setProtectedHeader({ alg: 'ES256', typ: invocation.protocol, kid: 'owner-test' })
    .setIssuer(issuer).setSubject(expected.extensionId).setAudience(`extension:${expected.extensionId}`)
    .setIssuedAt().setExpirationTime('2m').setJti('invocation-test').sign(ownerKey.privateKey);
  const delivery = {
    protocol: invocation.protocol, invocationId: expected.invocationId, invocationToken,
    executionContextRef: 'ref_12345678-1234-4234-8234-123456789abc', inputRefs: {},
  };
  assert.equal((await validateFlowSchemaValue('step.input', invocation.request, request.schema, delivery)).ok, true);
  const outputPin = invocation.outputs[output.topicType];
  const snapshot = { asOf: '2026-11-19T10:00:00Z', items: [{ isin: 'XS0000000001', weight: 0.5 }] };
  assert.equal((await validateFlowSchemaValue('step.output', outputPin, output.schema, snapshot)).ok, true);
  assert.equal((await validateFlowSchemaValue('step.output', outputPin, output.schema, { items: [] })).ok, false);

  const context = await verifyFlowStepInvocation(invocationToken, {
    expected,
    trust: { executionOwner: expected.executionOwner, hostId: expected.hostId, issuer,
      key: ownerKey.publicKey, callbackUrl, callbackAudience: callbackUrl },
  });
  const transport = t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(String(url), callbackUrl);
    const [scheme, assertion] = new Headers(init.headers).get('authorization').split(' ');
    assert.equal(scheme, 'Bearer');
    const { protectedHeader } = await jwtVerify(assertion, senderKey.publicKey, {
      audience: callbackUrl, issuer: expected.extensionId, subject: expected.extensionId,
    });
    assert.equal(protectedHeader.kid, kid);
    const { protocol, invocationId, outcome } = JSON.parse(init.body);
    assert.equal(protocol, 'finamx.flow.completion.v2');
    assert.equal(invocationId, expected.invocationId);
    assert.deepEqual(outcome, { status: 'done', outputs: { [output.topicType]: { ref: delivery.executionContextRef } } });
    return Response.json({ protocol, ok: true, invocationId });
  });
  const privateJwk = await exportJWK(senderKey.privateKey);
  assert.deepEqual(await completeHoldings(context, output.topicType, delivery.executionContextRef, { privateJwk, kid }),
    { ok: true, invocationId: expected.invocationId });
  assert.equal(transport.mock.callCount(), 1);
});
