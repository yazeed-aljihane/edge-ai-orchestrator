import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const cases = [
  ['development', 'true', true],
  ['production', 'true', false],
  ['development', 'false', false],
];
for (const [mode, flag, expected] of cases) {
  const script = `
    import assert from 'node:assert/strict';
    const { authenticate, localDevelopment } = await import('./dist/security.js');
    assert.equal(localDevelopment, ${expected});
    function check(headers, address = '127.0.0.1') {
      let status = 200, passed = false;
      authenticate({ headers, socket: {remoteAddress: address} },
        { status(value) {status=value; return this;}, json() {} }, () => {passed=true;});
      return {status, passed};
    }
    const local = {host:'127.0.0.1:5174','x-rime-client':'local-ui',origin:'http://127.0.0.1:5174','sec-fetch-site':'same-origin'};
    if (localDevelopment) {
      assert.equal(check(local).passed, true);
      assert.equal(check({...local, origin:'https://evil.example'}).status,403);
      assert.equal(check({...local, origin:'null'}).status,403);
      assert.equal(check({...local, host:'evil.example:5174'}).status,403);
      assert.equal(check({...local, 'x-rime-client':undefined}).status,403);
      assert.equal(check({...local, 'sec-fetch-site':'cross-site'}).status,403);
      assert.equal(check(local, '192.168.1.10').status,403);
    } else {
      assert.equal(check(local).status,401);
      assert.equal(check({...local, authorization:'Bearer '+process.env.OPERATOR_API_TOKEN}).passed,true);
    }
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    env: {...process.env, NODE_ENV:mode, LOCAL_DEV_AUTH:flag,
      EDGE_API_TOKEN:'test-edge-key-'.repeat(4), OPERATOR_API_TOKEN:'test-operator-key-'.repeat(4)},
    encoding:'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
}
console.log('Local origin checks and production authentication passed.');
