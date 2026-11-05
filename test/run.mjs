// Single-process test entrypoint.
//
// `node --test` spawns a child process per file. Restricted Windows sessions can
// deny that spawn (EPERM), so import the test modules directly instead. Node's
// test runner still reports each test and sets a non-zero exit code on failure.
// Must stay first: it points the server at an isolated temporary data directory
// before server/config.js is imported by any test below.
import './setup.mjs'
import './unit.test.js'
import './auth.test.js'
import './embed.test.js'
import './mail-route.test.js'
import './verification.test.js'
import './verification-flow.test.js'
import './verify-proof.test.js'
import './proof-consume.test.js'
import './unsubscribe.test.js'
import './webhook-policy.test.js'
import './webhook-signature.test.js'
import './public-key-policy.test.js'
import './campaign-csv.test.js'
