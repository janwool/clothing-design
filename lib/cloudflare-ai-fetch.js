let localDispatcher;

function certificateError(error) {
  return ['ERR_TLS_CERT_ALTNAME_INVALID', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN']
    .includes(error?.cause?.code || error?.code);
}

function getLocalDispatcher() {
  if (localDispatcher) return localDispatcher;
  // Only used by local Node development if the machine's DNS returns an
  // unrelated certificate for api.cloudflare.com. Production uses AI.run.
  const nodeRequire = eval('require');
  const dns = nodeRequire('node:dns');
  const { Agent } = nodeRequire('undici');
  const resolver = new dns.Resolver();
  resolver.setServers(['1.1.1.1']);
  localDispatcher = new Agent({
    connect: {
      lookup(hostname, _options, callback) {
        resolver.resolve4(hostname, (error, addresses) => {
          callback(error, addresses?.map(address => ({ address, family: 4 })));
        });
      }
    }
  });
  return localDispatcher;
}

async function fetchCloudflareAi(url, options) {
  try {
    return await fetch(url, options);
  } catch (error) {
    if (!certificateError(error) || new URL(url).hostname !== 'api.cloudflare.com' || globalThis.__WORKER_ENV__) {
      throw error;
    }
    console.warn('Cloudflare AI: local DNS returned an invalid certificate; retrying with Cloudflare DNS.');
    const nodeRequire = eval('require');
    return nodeRequire('undici').fetch(url, { ...options, dispatcher: getLocalDispatcher() });
  }
}

module.exports = { fetchCloudflareAi };
