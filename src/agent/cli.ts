#!/usr/bin/env node
/**
 * Terminal front door for the super-agent.
 *
 *   npx tsx src/agent/cli.ts            interactive
 *   npx tsx src/agent/cli.ts "task"     one shot
 *   npx tsx src/agent/cli.ts --approve "task"   allow file writes and commands
 *
 * Works without the web UI, which is the point: if the dashboard is down the
 * owner can still get work done from a phone SSH session.
 */
import readline from 'readline';
import { runAgent, agentStatus } from './loop.js';

async function main() {
  const argv = process.argv.slice(2);
  const approved = argv.includes('--approve') || process.env.AGENT_AUTO_APPROVE === 'true';
  const task = argv.filter((a) => !a.startsWith('--')).join(' ').trim();
  const status = agentStatus();

  if (!task) {
    console.log('HERMES JARVIS super-agent');
    console.log('providers:', status.usableProviders.join(', ') || 'NONE CONFIGURED');
    console.log('workspace:', process.env.AGENT_WORKSPACE_ROOT || process.cwd());
    console.log('writes/shell:', approved ? 'allowed' : 'read-only (pass --approve to enable)');
    console.log('type a task, or "exit"\n');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q: string) => new Promise<string>((resolve) => rl.question(q, resolve));
    while (true) {
      const line = (await ask('you › ')).trim();
      if (!line || ['exit', 'quit', 'q'].includes(line.toLowerCase())) break;
      const result = await runAgent({ task: line, approved, onStep: (s) => console.log(`  ↳ ${s.provider} step ${s.index}: ${s.toolCalls.map((c) => c.name).join(', ') || 'answer'}`) });
      console.log(`\njarvis › ${result.answer}\n`);
    }
    rl.close();
    return;
  }

  const result = await runAgent({
    task,
    approved,
    onStep: (s) => {
      const calls = s.toolCalls.map((c) => c.name).join(', ');
      console.log(`  ↳ ${s.provider}/${s.model} step ${s.index}${calls ? `: ${calls}` : ' (final)'}`);
    },
  });
  console.log('\n' + result.answer);
  process.exitCode = result.ok ? 0 : 1;
}

main().catch((err) => {
  console.error('fatal:', err?.message || err);
  process.exit(1);
});
