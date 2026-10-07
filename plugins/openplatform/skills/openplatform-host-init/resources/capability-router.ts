/**
 * 2.0: the domain decides what is allowed, the host serves what it declares.
 * Never invent sensitive answers for portfolio.* without a real backend; label stubs and refuse them in production.
 * Details: resources/host-served-methods.md
 */
import { createHostCapabilityRouter } from '@finamx/host-bridge';
import type { HostDomain } from '@finamx/host-bridge';

export function makeHostRouter(opts: {
  userId: string;
  hostDomain: HostDomain; // fetched once at session init; empty domain allows nothing
  platformBase?: string;
  sessionJwt?: string;
  quote: (symbol: string) => Promise<unknown>;
}) {
  return createHostCapabilityRouter({
    userId: opts.userId,
    hostDomain: opts.hostDomain,
    platformBase: opts.platformBase,
    sessionJwt: opts.sessionJwt,
    methods: {
      'market.quote': async ({ params }) => opts.quote(String(params.symbol)),
    },
    auditLog: (entry) => {
      console.info('[capability-audit]', entry);
    },
  });
}
