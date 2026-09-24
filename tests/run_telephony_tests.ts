import { runTelephonyTestSuite } from '../src/utils/telephonyTestRunner';

async function main() {
  console.log('================================================================');
  console.log('HERMES JARVIS - MANDATORY TELEPHONY AUTOMATED TEST SUITE');
  console.log('================================================================');
  console.log('Running 20 automated tests covering Sections A to V...\n');

  const suite = await runTelephonyTestSuite();

  for (const t of suite.results) {
    const symbol = t.passed ? '✅ [PASS]' : '❌ [FAIL]';
    console.log(`${symbol} Test ${t.id}: ${t.name} (${t.executionTimeMs}ms)`);
    console.log(`   Output: ${t.actualOutput}`);
    if (t.error) {
      console.log(`   Error:  ${t.error}`);
    }
  }

  console.log('\n----------------------------------------------------------------');
  console.log(`SUMMARY: Total: ${suite.total} | Passed: ${suite.passed} | Failed: ${suite.failed}`);
  console.log(`Duration: ${suite.durationMs}ms`);
  console.log('----------------------------------------------------------------');

  if (suite.failed > 0) {
    console.error(`FAILED: ${suite.failed} test(s) failed.`);
    process.exit(1);
  } else {
    console.log('SUCCESS: All 20 mandatory telephony tests PASSED!');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal error running telephony test suite:', err);
  process.exit(1);
});
