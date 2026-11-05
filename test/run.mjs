// Single-process test entrypoint.
//
// `node --test` spawns a child process per file. Restricted Windows sessions can
// deny that spawn (EPERM), so import the test modules directly instead. Node's
// test runner still reports each test and sets a non-zero exit code on failure.
import './unit.test.js'
import './auth.test.js'
import './embed.test.js'
import './mail-route.test.js'
import './verification.test.js'
import './unsubscribe.test.js'
